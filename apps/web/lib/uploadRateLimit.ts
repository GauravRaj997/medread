import { prisma } from "@medread/db";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_UPLOADS_PER_HOUR = 20;

export async function allowUpload(ipHash: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const attempts = await prisma.uploadRateEvent.count({
    where: { ipHash, createdAt: { gte: windowStart } },
  });

  if (attempts >= MAX_UPLOADS_PER_HOUR) {
    return false;
  }

  await prisma.uploadRateEvent.create({ data: { ipHash } });
  return true;
}
