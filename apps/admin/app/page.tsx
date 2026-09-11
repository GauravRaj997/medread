import Link from "next/link";
import { prisma } from "@medread/db";

export default async function AdminHomePage() {
  const [unresolvedMessages, flaggedUploads] = await Promise.all([
    prisma.contactMessage.count({ where: { resolved: false } }),
    prisma.prescription.count({ where: { flaggedForReview: true, reviewedByAdmin: false } }),
  ]);

  return (
    <main style={{ padding: 24 }}>
      <h1>MedRead Admin</h1>
      <nav style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <Link href="/messages">Support Messages ({unresolvedMessages} unread)</Link>
        <Link href="/uploads">Upload Review ({flaggedUploads} pending)</Link>
      </nav>
    </main>
  );
}