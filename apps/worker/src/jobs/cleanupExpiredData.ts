import { prisma } from "@medread/db";

// Purges every prescription past its expiresAt — there's no "anonymous"
// subset anymore, nothing on the public reader side has an owner to manage
// its own retention. This is the only cleanup mechanism there is.
export async function cleanupExpiredData() {
  const expired = await prisma.prescription.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, originalFileUrl: true, exportedPdfUrl: true, exportedJpegUrl: true },
  });

  for (const p of expired) {
    // TODO: delete original file + exports from S3 using stored keys/URLs
    // (originalFileUrl, exportedPdfUrl, exportedJpegUrl)
  }

  const { count } = await prisma.prescription.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  console.log(`Cleaned up ${count} expired prescription(s)`);
  return count;
}