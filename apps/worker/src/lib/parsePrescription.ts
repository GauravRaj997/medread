import type { ExtractedPrescription, ExtractedMedicine } from "@medread/types";

// Structural markers a real prescription is likely to have. This is a
// heuristic gate, not a certainty — it flags for review, it doesn't
// silently reject. A false positive here just means a human checks it.
const PRESCRIPTION_MARKERS = [
  /\bRx\b/i,
  /reg(?:istration)?\.?\s*no\.?/i,
  /dr\.?\s+[a-z]/i,
  /clinic|hospital|medical center/i,
  /\bdate\b/i,
];

export function looksLikePrescription(rawText: string): boolean {
  const matchCount = PRESCRIPTION_MARKERS.filter((re) => re.test(rawText)).length;
  // Require at least 2 markers — a bare medicine list rarely has more than one
  return matchCount >= 2;
}

// Very simple line-based parser. Real handwriting OCR output is messy, so
// this is intentionally conservative — it extracts what it can confidently
// find and leaves the rest for the user to fill in during review.
export function parsePrescriptionText(rawText: string, ocrConfidence: number): ExtractedPrescription {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);

  const doctorLine = lines.find((l) => /dr\.?\s+/i.test(l));
  const regNoLine = lines.find((l) => /reg(?:istration)?\.?\s*no\.?/i.test(l));
  const dateLine = lines.find((l) => /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/.test(l));
  const clinicLine = lines.find((l) => /clinic|hospital|medical center/i.test(l));

  // Medicine lines: heuristic — lines containing a dosage-like pattern (mg/ml/tab)
  const medicineLines = lines.filter((l) => /\d+\s?(mg|ml|mcg|tab|cap)/i.test(l));

  const medicines: ExtractedMedicine[] = medicineLines.map((line) => ({
    rawText: line,
    confidence: ocrConfidence,
  }));

  return {
    doctorName: doctorLine,
    doctorRegNo: regNoLine,
    clinicName: clinicLine,
    prescriptionDate: dateLine,
    medicines,
    overallConfidence: ocrConfidence,
  };
}