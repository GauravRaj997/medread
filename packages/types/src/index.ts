export type PrescriptionStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "COMPLETED"
  | "NEEDS_REVIEW"
  | "FAILED";

export interface OcrJobPayload {
  prescriptionId: string;
  fileKey: string;
}

export interface ExtractedMedicine {
  rawText: string;
  matchedName?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  confidence?: number | null;
}

export interface ExtractedPrescription {
  doctorName?: string;
  doctorRegNo?: string;
  clinicName?: string;
  prescriptionDate?: string;
  medicines: ExtractedMedicine[];
  overallConfidence: number;
}
