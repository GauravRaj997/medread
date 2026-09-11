import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import type { Medicine, Prescription } from "@prisma/client";

const DISCLAIMER =
  "This is an AI-generated interpretation of a handwritten prescription. " +
  "Please confirm all details with your doctor or pharmacist before acting on it.";

function buildContentLines(prescription: Prescription & { medicines: Medicine[] }): string[] {
  const lines: string[] = [];

  lines.push("MedRead — Decoded Prescription");
  lines.push("");
  if (prescription.doctorName) lines.push(`Doctor: ${prescription.doctorName}`);
  if (prescription.clinicName) lines.push(`Clinic: ${prescription.clinicName}`);
  if (prescription.diagnosis) lines.push(`Diagnosis: ${prescription.diagnosis}`);
  if (prescription.prescriptionDate) lines.push(`Date: ${prescription.prescriptionDate.toDateString()}`);
  lines.push("");
  lines.push("Medicines:");

  for (const m of prescription.medicines) {
    const parts = [m.matchedName ?? m.rawText, m.dosage, m.frequency, m.duration].filter(Boolean);
    lines.push(`  • ${parts.join(" — ")}`);
  }

  lines.push("");
  lines.push("---");
  lines.push(DISCLAIMER);

  return lines;
}

// Text-based PDF — no need to rasterize the original scan, we're rendering
// the structured/corrected data, which is the whole point of this app.
export async function generatePdfBuffer(
  prescription: Prescription & { medicines: Medicine[] }
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;
  const lineHeight = 18;
  let y = 800;

  for (const line of buildContentLines(prescription)) {
    if (y < 50) {
      // Overflow to a new page rather than truncating silently
      const nextPage = doc.addPage([595, 842]);
      y = 800;
      nextPage.drawText(line, { x: 50, y, size: fontSize, font, color: rgb(0, 0, 0) });
    } else {
      page.drawText(line, { x: 50, y, size: fontSize, font, color: rgb(0, 0, 0) });
    }
    y -= lineHeight;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// JPEG via SVG->raster (sharp), rather than pulling in a separate PDF
// rasterizer just for this — keeps the dependency list smaller.
export async function generateJpegBuffer(
  prescription: Prescription & { medicines: Medicine[] }
): Promise<Buffer> {
  const lines = buildContentLines(prescription);
  const lineHeight = 24;
  const width = 800;
  const height = Math.max(600, lines.length * lineHeight + 80);

  const escapedLines = lines.map((line) =>
    line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  );

  const svgLines = escapedLines
    .map((line, i) => `<text x="40" y="${60 + i * lineHeight}" font-size="18" font-family="Helvetica">${line}</text>`)
    .join("\n");

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      ${svgLines}
    </svg>
  `;

  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}
