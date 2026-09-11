// Shared types used by both apps/web and apps/worker

export type PrescriptionStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "NEEDS_REVIEW"
  | "COMPLETED"
  | "FAILED";

export interface ExtractedMedicine {
  rawText: string;
  matchedName?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  confidence?: number;
}

export interface ExtractedPrescription {
  patientName?: string;
  doctorName?: string;
  doctorRegNo?: string;
  clinicName?: string;
  diagnosis?: string;
  prescriptionDate?: string;
  medicines: ExtractedMedicine[];
  overallConfidence: number;
}

// Job payload the worker consumes off the queue. No userId — every
// prescription is unowned on the public reader side.
export interface OcrJobPayload {
  prescriptionId: string;
  fileUrl: string;
}