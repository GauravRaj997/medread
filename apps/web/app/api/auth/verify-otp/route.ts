import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "@medread/db";

function normalizeTarget(channel: "email" | "phone", value: string): string {
  if (channel === "email") return value.trim().toLowerCase();
  return value.replace(/[^\d+]/g, "");
}

function hashOtp(code: string): string {
  const pepper = process.env.OTP_HASH_SECRET || "dev-only-fallback-secret";
  return crypto.createHash("sha256").update(code + pepper).digest("hex");
}

const requestSchema = z.object({
  channel: z.enum(["email", "phone"]),
  value: z.string().min(3),
  code: z.string().length(6),
});

const MAX_VERIFY_ATTEMPTS = 5;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";

export async function POST(req: NextRequest) {
  const body = requestSchema.parse(await req.json());
  const target = normalizeTarget(body.channel, body.value);
  const codeHash = hashOtp(body.code);

  // --- Find the most recent, unconsumed code for this target ---
  const otpRecord = await prisma.otpCode.findFirst({
    where: { target, channel: body.channel, consumed: false },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return NextResponse.json(
      { error: "NO_CODE_FOUND", message: "No active code for this target. Request a new one." },
      { status: 400 }
    );
  }

  if (otpRecord.attempts >= MAX_VERIFY_ATTEMPTS) {
    return NextResponse.json(
      { error: "TOO_MANY_ATTEMPTS", message: "Too many incorrect attempts. Request a new code." },
      { status: 429 }
    );
  }

  if (otpRecord.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "CODE_EXPIRED", message: "This code has expired. Request a new one." },
      { status: 400 }
    );
  }

  if (otpRecord.codeHash !== codeHash) {
    // Wrong code — increment attempts so they can't brute-force it
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json(
      { error: "INVALID_CODE", message: "Incorrect code." },
      { status: 400 }
    );
  }

  // --- Correct code: mark it consumed so it can never be reused ---
  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { consumed: true },
  });

  // --- Find or create the user. The DB's @unique constraint on email/phone
  // (schema.prisma) is the final backstop against duplicates even if two
  // requests race each other. ---
  const whereClause = body.channel === "email" ? { email: target } : { phone: target };

  let user = await prisma.user.findUnique({ where: whereClause });

  if (!user) {
    try {
      user = await prisma.user.create({
        data: {
          ...(body.channel === "email"
            ? { email: target, emailVerified: true }
            : { phone: target, phoneVerified: true }),
        },
      });
    } catch (err: any) {
      // P2002 = Prisma's unique constraint violation code.
      // Can happen if two verify requests for the same new target race each other.
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: "ALREADY_REGISTERED", message: "This email/phone is already in use." },
          { status: 409 }
        );
      }
      throw err;
    }
  } else {
    // Existing user verifying via their other channel for the first time
    const updateData =
      body.channel === "email" ? { emailVerified: true } : { phoneVerified: true };
    user = await prisma.user.update({ where: { id: user.id }, data: updateData });
  }

  // --- Issue tokens. Permissions are baked into the access token so
  // middleware.ts can check them without a DB call on every request. ---
  const tokenPayload = {
    userId: user.id,
    role: user.role,
    permissions: user.permissions,
  };

  const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
  const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });

  const response = NextResponse.json({ ok: true, userId: user.id, role: user.role });

  response.cookies.set("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 15 * 60,
    path: "/",
  });
  response.cookies.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}