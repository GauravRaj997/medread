import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@medread/db";

const patchSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
});

// Approve = admin confirms it's fine, clears the flag (result stays as-is).
// Reject = admin confirms it's abuse/garbage — marks status REJECTED so it
// won't be treated as a valid result if the person comes back to check it.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = patchSchema.parse(await req.json());

  const updated = await prisma.prescription.update({
    where: { id },
    data: {
      reviewedByAdmin: true,
      flaggedForReview: body.action === "APPROVE" ? false : undefined,
      status: body.action === "REJECT" ? "REJECTED" : undefined,
    },
  });

  await prisma.auditLog.create({
    data: { action: `UPLOAD_${body.action}D`, targetId: id },
  });

  return NextResponse.json({ ok: true, prescription: updated });
}
