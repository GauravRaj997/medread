import jwt from "jsonwebtoken";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET!;
const SESSION_EXPIRY = "12h";

export function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
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
