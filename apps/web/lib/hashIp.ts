import crypto from "crypto";

export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    throw new Error("IP_HASH_SALT is not configured.");
  }

  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
