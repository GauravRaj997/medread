import type { ExtractedMedicine } from "@medread/types";
import { KNOWN_MEDICINES } from "../lib/drugDatabase";
import { findClosestMedicine } from "../lib/fuzzyMatch";

// Also tries to pull dosage/frequency/duration out of the same line, since
// OCR output usually has them right next to the drug name
// e.g. "Dolo 650 1-0-1 x 5 days"
function extractDosageDetails(line: string) {
  const dosageMatch = line.match(/\d+\s?(mg|ml|mcg)/i);
  const frequencyMatch = line.match(/\b\d-\d-\d\b|\bonce daily\b|\btwice daily\b|\bthrice daily\b/i);
  const durationMatch = line.match(/\d+\s?(day|days|week|weeks)/i);

  return {
    dosage: dosageMatch?.[0],
    frequency: frequencyMatch?.[0],
    duration: durationMatch?.[0],
  };
}

export async function matchMedicineNames(
  medicines: ExtractedMedicine[]
): Promise<ExtractedMedicine[]> {
  return medicines.map((m) => {
    const { match, similarityScore } = findClosestMedicine(m.rawText, KNOWN_MEDICINES);
    const details = extractDosageDetails(m.rawText);

    return {
      ...m,
      // Falls back to the raw OCR text if no confident match was found —
      // better to show the user what OCR actually saw than to hide it.
      matchedName: match ?? m.rawText,
      dosage: details.dosage,
      frequency: details.frequency,
      duration: details.duration,
      // Blend OCR confidence with match confidence — a low score on either
      // one should flag this medicine line for the user to double check.
      confidence: m.confidence != null ? Math.min(m.confidence, similarityScore) : similarityScore,
    };
  });
}