// Standard Levenshtein edit distance — no external dependency needed for this.
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

// Converts edit distance into a 0-1 similarity score so it's comparable
// to the OCR confidence scores already flowing through the pipeline.
function similarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

export interface FuzzyMatchResult {
  match: string | null;
  similarityScore: number;
}

// Finds the closest known drug name to a piece of OCR'd text. Only accepts
// a match above `threshold` — below that, it's more likely to be noise than
// a real near-miss, so we leave it unmatched rather than guess wrong.
export function findClosestMedicine(
  ocrText: string,
  knownMedicines: string[],
  threshold = 0.6
): FuzzyMatchResult {
  // Compare against just the first word/token of the OCR line, since real
  // lines often have dosage/frequency text trailing the drug name.
  const candidate = ocrText.trim().split(/\s+/).slice(0, 2).join(" ");

  let best = { match: "", score: -1 };

  for (const drug of knownMedicines) {
    const score = similarity(candidate.toLowerCase(), drug.toLowerCase());
    if (score > best.score) {
      best = { match: drug, score };
    }
  }

  if (best.score < threshold) {
    return { match: null, similarityScore: best.score };
  }

  return { match: best.match, similarityScore: best.score };
}