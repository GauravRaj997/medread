import jwt from "jsonwebtoken";

// Single hardcoded admin — credentials live in env vars, not a database.
// No User table, no signup flow: whoever holds these env values IS the admin.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!; // plain compare is fine here —
// this is a single operator credential you set yourself, not user-facing signup.
// If you want it hashed instead, swap this for a bcrypt.compare call.

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET!;
const SESSION_EXPIRY = "12h";

export function verifyAdminCredentials(email: string, password: string): boolean {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
}

export function createAdminSessionToken(): string {
  return jwt.sign({ admin: true }, SESSION_SECRET, { expiresIn: SESSION_EXPIRY });
}

export function verifyAdminSessionToken(token: string): boolean {
  try {
    const payload = jwt.verify(token, SESSION_SECRET) as { admin: boolean };
    return payload.admin === true;
  } catch {
    return false;
  }
}