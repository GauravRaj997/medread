import { NextResponse } from "next/server";
import { prisma } from "@medread/db";

// Lists uploads flagged for review — either structurally suspicious
// (blank page, not-a-prescription) or low OCR confidence.
export async function GET() {
  const uploads = await prisma.prescription.findMany({
    where: { flaggedForReview: true, reviewedByAdmin: false },
    orderBy: { createdAt: "desc" },
    include: { medicines: true },
  });
  return NextResponse.json({ uploads });
}