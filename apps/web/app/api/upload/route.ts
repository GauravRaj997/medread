import { NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import { prisma } from "@medread/db";
import type { OcrJobPayload } from "@medread/types";
import { computeFileHash, hasValidFileSignature, validateFile } from "@/lib/fileValidation";
import { getClientIp } from "@/lib/getClientIp";
import { hashIp } from "@/lib/hashIp";
import { uploadToS3 } from "@/lib/s3";
import { allowUpload } from "@/lib/uploadRateLimit";

export const runtime = "nodejs";

const ocrQueue = new Queue<OcrJobPayload>("ocr-processing", {
  connection: { url: process.env.REDIS_URL },
});

function retentionDate(): Date {
  const hours = Number(process.env.PRESCRIPTION_RETENTION_HOURS ?? 24);
  return new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const consent = formData.get("consent");
  const file = formData.get("file");

  if (consent !== "true") {
    return NextResponse.json(
      { error: "CONSENT_REQUIRED", message: "Please acknowledge the medical disclaimer before uploading." },
      { status: 400 }
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "NO_FILE", message: "Choose a prescription to upload." },
      { status: 400 }
    );
  }

  const validation = validateFile(file);
  if (!validation.valid) {
    return NextResponse.json({ error: "INVALID_FILE", message: validation.error }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasValidFileSignature(buffer, file.type)) {
    return NextResponse.json(
      { error: "INVALID_FILE", message: "The uploaded file does not match its stated format." },
      { status: 400 }
    );
  }

  const permitted = await allowUpload(hashIp(getClientIp(request)));
  if (!permitted) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many uploads in a short period. Please try again later." },
      { status: 429 }
    );
  }

  const fileHash = computeFileHash(buffer);
  const fileKey = await uploadToS3(buffer, file.type);

  const prescription = await prisma.prescription.create({
    data: {
      originalFileKey: fileKey,
      originalMimeType: file.type,
      fileHash,
      expiresAt: retentionDate(),
    },
  });

  await ocrQueue.add("process", { prescriptionId: prescription.id, fileKey });

  return NextResponse.json({ prescriptionId: prescription.id, status: "PROCESSING" }, { status: 202 });
}
