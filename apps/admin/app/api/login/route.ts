import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSessionToken, isAdminEmail } from "@/lib/adminAuth";
import { verifyAdminPassword } from "@/lib/adminCredentials";
import { getClientIp } from "@/lib/getClientIp";
import { allowAdminLogin } from "@/lib/loginRateLimit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = loginSchema.parse(await req.json());

  const allowed = await allowAdminLogin(getClientIp(req));
  if (!allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  if (!isAdminEmail(body.email) || !verifyAdminPassword(body.password)) {
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
