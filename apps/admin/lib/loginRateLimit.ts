import crypto from "crypto";
import { prisma } from "@medread/db";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export async function allowAdminLogin(ip: string): Promise<boolean> {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    throw new Error("IP_HASH_SALT is not configured.");
  }

  const ipHash = crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const attempts = await prisma.adminLoginEvent.count({
    where: { ipHash, createdAt: { gte: windowStart } },
  });

  if (attempts >= MAX_ATTEMPTS) {
    return false;
  }

  await prisma.adminLoginEvent.create({ data: { ipHash } });
  return true;
}
