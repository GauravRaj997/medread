import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminCredentials, createAdminSessionToken } from "@/lib/adminAuth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// No rate limiting shown here, but add one — this endpoint is a direct
// target for brute-forcing the one admin credential that controls everything.
export async function POST(req: NextRequest) {
  const body = loginSchema.parse(await req.json());

  if (!verifyAdminCredentials(body.email, body.password)) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const token = createAdminSessionToken();
  const response = NextResponse.json({ ok: true });

  response.cookies.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 12 * 60 * 60,
    path: "/",
  });

  return response;
}