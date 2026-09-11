import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@medread/db";
import { getClientIp } from "@/lib/getClientIp";
import { hashIp } from "@/lib/hashIp";

const contactSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email(),
  subject: z.string().max(200).optional(),
  message: z.string().min(10).max(2000),
});

const MAX_MESSAGES_PER_HOUR = 5;
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = contactSchema.parse(await req.json());

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  const windowStart = new Date(Date.now() - WINDOW_MS);
  const recentCount = await prisma.contactRateEvent.count({
    where: { ipHash, createdAt: { gte: windowStart } },
  });

  if (recentCount >= MAX_MESSAGES_PER_HOUR) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many messages sent. Please try again later." },
      { status: 429 }
    );
  }

  await prisma.contactRateEvent.create({ data: { ipHash } });

  await prisma.contactMessage.create({
    data: {
      name: body.name,
      email: body.email,
      subject: body.subject,
      message: body.message,
    },
  });

  return NextResponse.json({ ok: true, message: "Your message has been sent." });
}