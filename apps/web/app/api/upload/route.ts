import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@medread/db";
import { Queue } from "bullmq";
import type { OcrJobPayload } from "@medread/types";
import { getClientIp } from "@/lib/getClientIp";
import { hasTrialRemaining, recordTrialUsage, anonymousExpiryDate } from "@/lib/anonymousTrial";
import { getSessionFromRequest } from "@/lib/session";
import { validateFile, computeFileHash } from "@/lib/fileValidation";
import { uploadToS3 } from "@/lib/s3";

const ocrQueue = new Queue<OcrJobPayload>("ocr-processing", {
  connection: { url: process.env.REDIS_URL },
});

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  let userId: string | null = null;
  let isAnonymous = false;

  if (session) {
    userId = session.userId;
  } else {
    const ip = getClientIp(req);
    const allowed = await hasTrialRemaining(ip);

    if (!allowed) {
      return NextResponse.json(
        { error: "FREE_TRIAL_USED", message: "You've used your free upload. Please log in to continue." },
        { status: 401 }
      );
    }

    await recordTrialUsage(ip);
    isAnonymous = true;
  }

  // --- Parse the uploaded file ---
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

  // --- Duplicate detection (only meaningful for logged-in users — anonymous
  // uploads have no history to compare against) ---
  if (userId) {
    const existing = await prisma.prescription.findFirst({
      where: { userId, fileHash },
    });

    if (existing) {
      return NextResponse.json({
        ok: true,
        prescriptionId: existing.id,
        status: existing.status,
        duplicate: true,
        message: "You've already uploaded this file.",
      });
    }
  }

  // TODO: run malware scan on `buffer` before upload (ClamAV or a scanning API)
  // TODO: if file.type is image/jpeg or image/png, convert to PDF here (pdf-lib)
  //       — or pass the image straight to the OCR provider, which handles both

  const s3Key = await uploadToS3(buffer, file.type);

  const prescription = await prisma.prescription.create({
    data: {
      userId,
      isAnonymous,
      expiresAt: isAnonymous ? anonymousExpiryDate() : null,
      originalFileUrl: s3Key,
      fileHash,
      status: "UPLOADED",
    },
  });

  await ocrQueue.add("process", {
    prescriptionId: prescription.id,
    fileUrl: s3Key,
    userId: userId ?? "anonymous",
  });

  return NextResponse.json({
    ok: true,
    prescriptionId: prescription.id,
    status: "PROCESSING",
    isAnonymous,
  });
}