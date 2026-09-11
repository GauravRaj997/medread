import { prisma } from "@medread/db";
import type { OcrJobPayload } from "@medread/types";
import { downloadFromS3 } from "../lib/s3Download";
import { runOcr } from "../lib/ocrProvider";
import { looksLikePrescription, parsePrescriptionText } from "../lib/parsePrescription";
import { checkContentQuality } from "../lib/contentQualityCheck";
import { matchMedicineNames } from "./matchMedicineNames";
import { generatePdfBuffer, generateJpegBuffer } from "../lib/generateExport";
import { uploadExportToS3 } from "../lib/s3Upload";

const MIN_CONFIDENCE_TO_AUTO_COMPLETE = 0.75;

function parsePrescriptionDate(value?: string): Date | null {
  if (!value) return null;

  const numeric = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
  if (!numeric) return null;

  const day = Number(numeric[1]);
  const month = Number(numeric[2]);
  const year = Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

export async function processOCR(payload: OcrJobPayload) {
  const { prescriptionId, fileUrl } = payload;

  await prisma.prescription.update({
    where: { id: prescriptionId },
    data: { status: "PROCESSING" },
  });

  try {
    const fileBuffer = await downloadFromS3(fileUrl);
    const { rawText, confidence } = await runOcr(fileBuffer);

    const qualityCheck = checkContentQuality(rawText);
    if (!qualityCheck.valid) {
      await prisma.prescription.update({
        where: { id: prescriptionId },
        data: {
          rawOcrText: rawText,
          status: "NEEDS_REVIEW",
          flaggedForReview: true,
          flagReason: qualityCheck.reason,
          confidenceScore: confidence,
        },
      });
      return;
    }

    if (!looksLikePrescription(rawText)) {
      await prisma.prescription.update({
        where: { id: prescriptionId },
        data: {
          rawOcrText: rawText,
          status: "NEEDS_REVIEW",
          flaggedForReview: true,
          flagReason: "NOT_A_PRESCRIPTION",
          confidenceScore: confidence,
        },
      });
      return;
    }

    const extracted = parsePrescriptionText(rawText, confidence);
    extracted.medicines = await matchMedicineNames(extracted.medicines);

    const needsReview = extracted.overallConfidence < MIN_CONFIDENCE_TO_AUTO_COMPLETE;

    const updated = await prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        rawOcrText: rawText,
        doctorName: extracted.doctorName,
        doctorRegNo: extracted.doctorRegNo,
        clinicName: extracted.clinicName,
        prescriptionDate: parsePrescriptionDate(extracted.prescriptionDate),
        confidenceScore: extracted.overallConfidence,
        status: needsReview ? "NEEDS_REVIEW" : "COMPLETED",
        flaggedForReview: needsReview,
        flagReason: needsReview ? "LOW_CONFIDENCE" : undefined,
        medicines: {
          create: extracted.medicines.map((m) => ({
            rawText: m.rawText,
            matchedName: m.matchedName,
            dosage: m.dosage,
            frequency: m.frequency,
            duration: m.duration,
            instructions: m.instructions,
            confidence: m.confidence,
          })),
        },
      },
      include: { medicines: true },
    });

    // Only generate downloadable exports once it's actually COMPLETED —
    // a NEEDS_REVIEW result shouldn't produce a "final" file yet.
    if (!needsReview) {
      const [pdfBuffer, jpegBuffer] = await Promise.all([
        generatePdfBuffer(updated),
        generateJpegBuffer(updated),
      ]);

      const [pdfKey, jpegKey] = await Promise.all([
        uploadExportToS3(pdfBuffer, "application/pdf"),
        uploadExportToS3(jpegBuffer, "image/jpeg"),
      ]);

      await prisma.prescription.update({
        where: { id: prescriptionId },
        data: { exportedPdfUrl: pdfKey, exportedJpegUrl: jpegKey },
      });
    }
  } catch (err) {
    await prisma.prescription.update({
      where: { id: prescriptionId },
      data: { status: "FAILED" },
    });
    throw err;
  }
}
