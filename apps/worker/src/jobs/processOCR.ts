import { prisma } from "@medread/db";
import type { OcrJobPayload } from "@medread/types";
import { downloadFromS3 } from "../lib/s3Download";
import { runOcr } from "../lib/ocrProvider";
import { looksLikePrescription, parsePrescriptionText } from "../lib/parsePrescription";
import { matchMedicineNames } from "./matchMedicineNames";

const MIN_CONFIDENCE_TO_AUTO_COMPLETE = 0.75;

export async function processOCR(payload: OcrJobPayload) {
  const { prescriptionId, fileUrl } = payload;

  await prisma.prescription.update({
    where: { id: prescriptionId },
    data: { status: "PROCESSING" },
  });

  try {
    const fileBuffer = await downloadFromS3(fileUrl);
    const { rawText, confidence } = await runOcr(fileBuffer);

    // Structural check: is this actually a prescription, or just a medicine list?
    if (!looksLikePrescription(rawText)) {
      await prisma.prescription.update({
        where: { id: prescriptionId },
        data: {
          rawOcrText: rawText,
          status: "NEEDS_REVIEW",
          flaggedForReview: true,
          confidenceScore: confidence,
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
        confidenceScore: extracted.overallConfidence,
        status: needsReview ? "NEEDS_REVIEW" : "COMPLETED",
        flaggedForReview: needsReview,
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