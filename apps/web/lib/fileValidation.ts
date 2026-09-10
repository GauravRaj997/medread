import crypto from "crypto";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function validateFile(file: File): { valid: true } | { valid: false; error: string } {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { valid: false, error: "Please upload a JPG, PNG, or PDF file." };
  }

  if (file.size === 0) {
    return { valid: false, error: "The selected file is empty." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "The file must be 10 MB or smaller." };
  }

  return { valid: true };
}

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function hasValidFileSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") {
    return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  }

  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }

  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  return false;
}
