import { prisma } from "@medread/db";
import type { OcrJobPayload } from "@medread/types";
import { downloadFromS3 } from "../lib/s3Download";
import { runOcr } from "../lib/ocrProvider";
import { looksLikePrescription, parsePrescriptionText } from "../lib/parsePrescription";
import { matchMedicineNames } from "./matchMedicineNames";

const MIN_CONFIDENCE_TO_AUTO_COMPLETE = 0.75;

export async function processOCR(payload: OcrJobPayload) {
  const { prescriptionId, fileKey } = payload;

  await prisma.prescription.update({
    where: { id: prescriptionId },
    data: { status: "PROCESSING" },
  });

  try {
    const fileBuffer = await downloadFromS3(fileKey);
    const { rawText, confidence } = await runOcr(fileBuffer);

    const normalizedText = rawText.trim();
    const reviewReason =
      normalizedText.length === 0
        ? "No readable text was found in the uploaded file."
        : !looksLikePrescription(normalizedText)
          ? "The uploaded document does not look like a prescription."
          : null;

    // Structural screening never discards a file silently. It routes blank,
    // ordinary-text, and ambiguous documents to the admin review queue.
    if (reviewReason) {
      await prisma.prescription.update({
        where: { id: prescriptionId },
        data: {
          rawOcrText: rawText,
          status: "NEEDS_REVIEW",
          flaggedForReview: true,
          confidenceScore: confidence,
          reviewReason,
        },
      });
      return; // don't attempt structured extraction on something that may not even be a prescription
    }

    const extracted = parsePrescriptionText(rawText, confidence);
    extracted.medicines = await matchMedicineNames(extracted.medicines);

    const needsReview = extracted.overallConfidence < MIN_CONFIDENCE_TO_AUTO_COMPLETE;

    await prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        rawOcrText: rawText,
        doctorName: extracted.doctorName,
        doctorRegNo: extracted.doctorRegNo,
        clinicName: extracted.clinicName,
        prescriptionDate: extracted.prescriptionDate,
        confidenceScore: extracted.overallConfidence,
        status: needsReview ? "NEEDS_REVIEW" : "COMPLETED",
        flaggedForReview: needsReview,
        reviewReason: needsReview ? "OCR confidence was too low for an automatic result." : null,
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
    });
  } catch (err) {
    await prisma.prescription.update({
      where: { id: prescriptionId },
      data: { status: "FAILED" },
    });
    throw err;
  }
}
