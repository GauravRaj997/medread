export type ContentFlagReason = "BLANK_PAGE" | "GIBBERISH_TEXT" | "NOT_A_PRESCRIPTION";

export interface ContentQualityResult {
  valid: boolean;
  reason?: ContentFlagReason;
}

const MIN_MEANINGFUL_CHARS = 15;
const MIN_WORD_COUNT_FOR_GIBBERISH_CHECK = 8;
const MIN_CLEAN_WORD_RATIO = 0.4;

// Catches an upload that produced essentially no text — a blank page, a
// solid-color scan, a photo of something that isn't a document at all.
export function isBlankPage(rawText: string): boolean {
  const meaningfulChars = rawText.replace(/\s/g, "");
  return meaningfulChars.length < MIN_MEANINGFUL_CHARS;
}

// Catches OCR noise — scan artifacts, watermarks, or a non-text image that
// still produced SOME characters, just not real words. A real document
// (in any reasonable font) should mostly tokenize into clean alphabetic
// words; scan noise tends to produce a lot of junk tokens (stray symbols,
// single characters, broken fragments).
export function isGibberish(rawText: string): boolean {
  const words = rawText.trim().split(/\s+/).filter(Boolean);

  if (words.length < MIN_WORD_COUNT_FOR_GIBBERISH_CHECK) {
    // Too few words to judge reliably either way — let other checks
    // (like isBlankPage, or the prescription-structure check) decide.
    return false;
  }

  const cleanWords = words.filter((w) => /^[A-Za-z]{2,}$/.test(w));
  const cleanRatio = cleanWords.length / words.length;

  return cleanRatio < MIN_CLEAN_WORD_RATIO;
}

// Runs both checks in the order that produces the most useful flag reason.
// Called BEFORE the "is this structurally a prescription" check in
// parsePrescription.ts — a blank/gibberish page shouldn't even get that far.
export function checkContentQuality(rawText: string): ContentQualityResult {
  if (isBlankPage(rawText)) {
    return { valid: false, reason: "BLANK_PAGE" };
  }

  if (isGibberish(rawText)) {
    return { valid: false, reason: "GIBBERISH_TEXT" };
  }

  return { valid: true };
}