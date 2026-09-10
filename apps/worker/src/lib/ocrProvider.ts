import { ImageAnnotatorClient } from "@google-cloud/vision";

const client = new ImageAnnotatorClient({
  // Uses GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account
  // JSON file, OR explicit credentials — see .env.example note below.
});

export interface OcrResult {
  rawText: string;
  confidence: number; // 0-1, averaged across detected text blocks
}

// Runs Google Cloud Vision's document text detection — better suited to
// dense/handwritten text than the basic text detection endpoint.
export async function runOcr(fileBuffer: Buffer): Promise<OcrResult> {
  const [result] = await client.documentTextDetection({
    image: { content: fileBuffer },
  });

  const fullText = result.fullTextAnnotation?.text ?? "";

  // Average the per-word confidence scores Vision returns, so low-quality
  // scans/handwriting produce a low overall score we can flag for review.
  const pages = result.fullTextAnnotation?.pages ?? [];
  let totalConfidence = 0;
  let wordCount = 0;

  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          if (typeof word.confidence === "number") {
            totalConfidence += word.confidence;
            wordCount += 1;
          }
        }
      }
    }
  }

  const confidence = wordCount > 0 ? totalConfidence / wordCount : 0;

  return { rawText: fullText, confidence };
}