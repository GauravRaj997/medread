import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@medread/db";
import { getSignedFileUrl } from "@/lib/s3";

// Public by design — no ownership check, no session. The prescriptionId
// itself is the access control: it's a long, unguessable cuid, functioning
// like an unlisted link. Anyone who has it can view/download that one result.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const prescription = await prisma.prescription.findUnique({
    where: { id },
    include: { medicines: true },
  });

  if (!prescription) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (prescription.expiresAt <= new Date()) {
    return NextResponse.json({ error: "EXPIRED" }, { status: 410 });
  }

  // Don't leak internal-only fields (flagReason, reviewedByAdmin) to the
  // public result page — those are for apps/admin's eyes only.
  const {
    flagReason,
    reviewedByAdmin,
    fileHash,
    ...publicFields
  } = prescription;

  // Generate short-lived signed download URLs only once the result is ready.
  const pdfUrl = prescription.exportedPdfUrl
    ? await getSignedFileUrl(prescription.exportedPdfUrl)
    : null;
  const jpegUrl = prescription.exportedJpegUrl
    ? await getSignedFileUrl(prescription.exportedJpegUrl)
    : null;

  return NextResponse.json({
    prescription: { ...publicFields, pdfUrl, jpegUrl },
  });
}
