import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@medread/db";

// --- Normalization: this is what stops "User@mail.com" vs "user@mail.com"
// from becoming two different accounts, and formats phone numbers consistently.
function normalizeTarget(channel: "email" | "phone", value: string): string {
  if (channel === "email") return value.trim().toLowerCase();
  // Strip everything except digits and a leading +. Assumes the client
  // already collects a country code; adjust if you add a country picker.
  return value.replace(/[^\d+]/g, "");
}

const requestSchema = z.object({
  channel: z.enum(["email", "phone"]),
  value: z.string().min(3),
});

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_REQUESTS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_MINUTES = 60;

function generateOtp(): string {
  // Cryptographically random, not Math.random() — this is a security-relevant code.
  const num = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return num.toString().padStart(OTP_LENGTH, "0");
}

function hashOtp(code: string): string {
  // OTPs are short-lived and single-use, so a fast hash is fine here —
  // this is not a password. sha256 + a server secret as pepper.
  const pepper = process.env.OTP_HASH_SECRET || "dev-only-fallback-secret";
  return crypto.createHash("sha256").update(code + pepper).digest("hex");
}

export async function POST(req: NextRequest) {
  const body = requestSchema.parse(await req.json());
  const target = normalizeTarget(body.channel, body.value);

  // --- Rate limiting: stop OTP-spam abuse before generating anything ---
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const recentRequestCount = await prisma.otpCode.count({
    where: { target, channel: body.channel, createdAt: { gte: windowStart } },
  });

  if (recentRequestCount >= MAX_OTP_REQUESTS_PER_WINDOW) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many OTP requests. Please try again later." },
      { status: 429 }
    );
  }

  // --- Generate, hash, and store the code ---
  const code = generateOtp();
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.otpCode.create({
    data: { target, channel: body.channel, codeHash, expiresAt },
  });

  // --- Send it ---
  if (body.channel === "email") {
    await sendEmailOtp(target, code);
  } else {
    await sendSmsOtp(target, code);
  }

  return NextResponse.json({ ok: true, message: `OTP sent to ${body.channel}` });
}

// --- Provider stubs. Swap the body of these two functions for your real
// SES/SendGrid and Twilio/MSG91 integration — everything above this line
// (rate limiting, hashing, storage) stays exactly the same either way. ---

async function sendEmailOtp(email: string, code: string) {
  // TODO: call SES/SendGrid here. Example shape:
  // await sesClient.send(new SendEmailCommand({ ... }));
  console.log(`[DEV ONLY] Email OTP for ${email}: ${code}`);
}

async function sendSmsOtp(phone: string, code: string) {
  // TODO: call Twilio/MSG91 here. Example shape:
  // await twilioClient.messages.create({ to: phone, body: `Your code: ${code}` });
  console.log(`[DEV ONLY] SMS OTP for ${phone}: ${code}`);
}