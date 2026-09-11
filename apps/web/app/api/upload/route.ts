import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@medread/db";
import { Queue } from "bullmq";
import type { OcrJobPayload } from "@medread/types";
import { getClientIp } from "@/lib/getClientIp";
import { hashIp } from "@/lib/hashIp";
import { allowUpload } from "@/lib/uploadRateLimit";
import { validateFile, computeFileHash } from "@/lib/fileValidation";
import { uploadToS3 } from "@/lib/s3";

const ocrQueue = new Queue<OcrJobPayload>("ocr-processing", {
  connection: { url: process.env.REDIS_URL },
});

// How long a result sticks around before the worker's cleanup job purges it.
// Since nothing is tied to an account, this is the ONLY retention mechanism
// for every prescription now — not just an "anonymous" subset like before.
const RESULT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  const allowed = await allowUpload(ipHash);
  if (!allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many uploads from this IP. Please try again later." },
      { status: 429 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "NO_FILE", message: "No file provided." }, { status: 400 });
  }

  const validation = validateFile(file);
  if (!validation.valid) {
    return NextResponse.json({ error: "INVALID_FILE", message: validation.error }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = await computeFileHash(buffer);

  // TODO: run malware scan on `buffer` before upload (ClamAV or a scanning API)
  // TODO: if file.type is image/jpeg or image/png, convert to PDF here (pdf-lib)

  const s3Key = await uploadToS3(buffer, file.type);

  const prescription = await prisma.prescription.create({
    data: {
      originalFileUrl: s3Key,
      fileHash,
      status: "UPLOADED",
      expiresAt: new Date(Date.now() + RESULT_RETENTION_MS),
    },
  });

  await ocrQueue.add("process", {
    prescriptionId: prescription.id,
    fileUrl: s3Key,
  });

  return NextResponse.json({
    ok: true,
    prescriptionId: prescription.id,
    status: "PROCESSING",
    expiresAt: prescription.expiresAt,
  });
}