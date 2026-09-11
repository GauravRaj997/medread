import crypto from "crypto";

// Format: <random hexadecimal salt>:<scrypt hexadecimal digest>.
// Keeping only the derived password in the environment avoids a reusable
// plaintext administrator password living in deployment configuration.
const PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ?? "";

export function verifyAdminPassword(password: string): boolean {
  const [salt, expected] = PASSWORD_HASH.split(":");
  if (!salt || !expected || !/^[a-f0-9]+$/i.test(expected)) {
    return false;
  }

  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  const actual = Buffer.from(derived, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}
