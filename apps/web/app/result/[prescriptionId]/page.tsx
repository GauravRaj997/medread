import { prisma } from "@medread/db";
import { getSignedFileUrl } from "@/lib/s3";
import { notFound } from "next/navigation";

const STATUS_MESSAGES: Record<string, string> = {
  UPLOADED: "Your file is queued for processing...",
  PROCESSING: "Reading your prescription...",
  NEEDS_REVIEW: "This upload needs a quick manual check. Please wait — this can take a bit longer.",
  COMPLETED: "Done! Your decoded prescription is ready below.",
  FAILED: "Something went wrong processing this file. Please try uploading again.",
  REJECTED: "This file doesn't appear to be a valid prescription. Please double-check and try again.",
};

// Poll-friendly: the page itself just renders current state on each load.
// Pair this with client-side polling (fetch this page's data every few
// seconds) for a "live updating" feel — that part's a frontend concern
// once we get to wiring up actual UI/interactivity here.
export default async function ResultPage({ params }: { params: { prescriptionId: string } }) {
  const prescription = await prisma.prescription.findUnique({
    where: { id: params.prescriptionId },
    include: { medicines: true },
  });

  if (!prescription) {
    notFound();
  }

  const pdfUrl = prescription.exportedPdfUrl
    ? await getSignedFileUrl(prescription.exportedPdfUrl)
    : null;
  const jpegUrl = prescription.exportedJpegUrl
    ? await getSignedFileUrl(prescription.exportedJpegUrl)
    : null;

  return (
    <main style={{ padding: 24, maxWidth: 600 }}>
      <h1>Your Prescription</h1>
      <p>{STATUS_MESSAGES[prescription.status]}</p>

      {prescription.status === "COMPLETED" && (
        <>
          <section style={{ marginTop: 24 }}>
            <h2>Details</h2>
            <p><strong>Doctor:</strong> {prescription.doctorName ?? "Not detected"}</p>
            <p><strong>Clinic:</strong> {prescription.clinicName ?? "Not detected"}</p>
            <p><strong>Diagnosis:</strong> {prescription.diagnosis ?? "Not detected"}</p>
          </section>

          <section style={{ marginTop: 16 }}>
            <h2>Medicines</h2>
            <ul>
              {prescription.medicines.map((m) => (
                <li key={m.id}>
                  {m.matchedName ?? m.rawText}
                  {m.dosage && ` — ${m.dosage}`}
                  {m.frequency && `, ${m.frequency}`}
                  {m.duration && `, ${m.duration}`}
                </li>
              ))}
            </ul>
          </section>

          <section style={{ marginTop: 24, display: "flex", gap: 12 }}>
            {pdfUrl && <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Download PDF</a>}
            {jpegUrl && <a href={jpegUrl} target="_blank" rel="noopener noreferrer">Download JPEG</a>}
          </section>

          <p style={{ marginTop: 24, fontSize: 12, color: "#888" }}>
            This is an AI-generated interpretation. Please confirm with your doctor or pharmacist
            before acting on it. This result will be automatically deleted after {" "}
            {prescription.expiresAt.toLocaleString()}.
          </p>
        </>
      )}
    </main>
  );
}