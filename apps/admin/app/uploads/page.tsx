import { prisma } from "@medread/db";
import { revalidatePath } from "next/cache";

async function reviewUpload(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const action = formData.get("action") as "APPROVE" | "REJECT";

  await prisma.prescription.update({
    where: { id },
    data: {
      reviewedByAdmin: true,
      status: action === "REJECT" ? "REJECTED" : undefined,
    },
  });

  revalidatePath("/uploads");
}

export default async function UploadsReviewPage() {
  const uploads = await prisma.prescription.findMany({
    where: { flaggedForReview: true, reviewedByAdmin: false },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main style={{ padding: 24 }}>
      <h1>Upload Review Queue</h1>
      {uploads.length === 0 && <p>Nothing pending review.</p>}
      {uploads.map((p) => (
        <div key={p.id} style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12 }}>
          <p><strong>Flag reason:</strong> {p.flagReason ?? "unspecified"}</p>
          <p><strong>Status:</strong> {p.status} | <strong>Confidence:</strong> {p.confidenceScore ?? "n/a"}</p>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: 8 }}>
            {p.rawOcrText?.slice(0, 500) ?? "(no OCR text)"}
          </pre>
          <form action={reviewUpload} style={{ display: "flex", gap: 8 }}>
            <input type="hidden" name="id" value={p.id} />
            <button type="submit" name="action" value="APPROVE">Approve</button>
            <button type="submit" name="action" value="REJECT">Reject</button>
          </form>
        </div>
      ))}
    </main>
  );
}