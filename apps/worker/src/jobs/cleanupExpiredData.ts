import { prisma } from "@medread/db";
import { deleteS3Objects } from "../lib/s3Upload";

// Purges every prescription past its expiresAt — there's no "anonymous"
// subset anymore, nothing on the public reader side has an owner to manage
// its own retention. This is the only cleanup mechanism there is.
export async function cleanupExpiredData() {
  const expired = await prisma.prescription.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, originalFileUrl: true, exportedPdfUrl: true, exportedJpegUrl: true },
  });

  let count = 0;
  for (const prescription of expired) {
    // Preserve the database row if storage deletion fails. That makes the
    // next cleanup run retry instead of orphaning a sensitive medical file.
    await deleteS3Objects([
      prescription.originalFileUrl,
      prescription.exportedPdfUrl,
      prescription.exportedJpegUrl,
    ]);
    await prisma.prescription.delete({ where: { id: prescription.id } });
    count += 1;
  }

  console.log(`Cleaned up ${count} expired prescription(s)`);
  return count;
}
