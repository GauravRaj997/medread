import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@medread/db";

export async function GET() {
  const messages = await prisma.contactMessage.findMany({
    orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ messages });
}

const patchSchema = z.object({
  id: z.string(),
  resolved: z.boolean().optional(),
  adminNote: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const body = patchSchema.parse(await req.json());
  const { id, ...updates } = body;

  const updated = await prisma.contactMessage.update({ where: { id }, data: updates });

  await prisma.auditLog.create({
    data: { action: "RESOLVED_CONTACT_MESSAGE", targetId: id },
  });

  return NextResponse.json({ ok: true, message: updated });
}