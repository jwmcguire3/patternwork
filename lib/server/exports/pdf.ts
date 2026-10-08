import PDFDocument from "pdfkit";
import { sha256 } from "@/lib/server/security";
import { PopplerPdfVerificationBoundary, verifyExtractedText } from "@/lib/server/pdf/renderer";
import type { PdfVerificationBoundary } from "@/lib/server/pdf/types";
import type { Pwre1Envelope } from "./types.ts";

export interface RenderedResponseExportPdf {
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly contentSha256: string;
  readonly sourceText: string;
}

function responseExportText(envelope: Pwre1Envelope): string {
  const lines = [
    "Patternwork response export",
    `Content SHA-256: ${envelope.contentSha256}`,
    `Completed pass: ${envelope.content.snapshot.completedPass}`,
    `Completion status: ${envelope.content.snapshot.completionMode}`,
    `Completed at: ${envelope.content.snapshot.completedAt}`,
    `Frozen at: ${envelope.content.snapshot.frozenAt}`,
  ];
  for (const response of envelope.content.responses) {
    lines.push("", `Question ${response.administrationSequence}: ${response.bankItem.title}`, response.bankItem.prompt);
    lines.push(`Status: ${response.completion.state}`, `Answered at: ${response.completion.answeredAt ?? "Not answered"}`, `Skipped at: ${response.completion.skippedAt ?? "Not skipped"}`, `Last saved at: ${response.completion.lastSavedAt}`);
    for (const group of response.answerGroups) lines.push(`${group.fieldLabel}: ${group.selections.join("; ")}`);
    if (response.responseOrder.length > 0) lines.push(`Your order: ${response.responseOrder.map((selection, index) => `${index + 1}. ${selection}`).join("; ")}`);
    lines.push("Your private note:", response.privateNote ?? "No private note saved.");
  }
  return lines.join("\n");
}

export function renderResponseExportPdf(envelope: Pwre1Envelope): Promise<RenderedResponseExportPdf> {
  const sourceText = responseExportText(envelope);
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "LETTER",
      margins: { top: 54, right: 54, bottom: 54, left: 54 },
      bufferPages: true,
      compress: false,
      info: { Title: "Patternwork response export", Author: "Patternwork", Subject: `PWRE-1 ${envelope.contentSha256}` },
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => {
      const bytes = Buffer.concat(chunks);
      resolve({ bytes, sha256: sha256(bytes), contentSha256: envelope.contentSha256, sourceText });
    });
    document.font("Helvetica-Bold").fontSize(20).fillColor("#18212f").text("Patternwork response export");
    document.moveDown(0.4).font("Helvetica").fontSize(8).fillColor("#526273").text(`PWRE-1 content SHA-256: ${envelope.contentSha256}`);
    document.moveDown().fontSize(10.5).fillColor("#263442");
    for (const line of sourceText.split("\n").slice(2)) {
      if (!line) document.moveDown(0.6);
      else if (/^Question \d+:/u.test(line)) document.moveDown(0.5).font("Helvetica-Bold").fontSize(13).fillColor("#24364b").text(line).font("Helvetica").fontSize(10.5).fillColor("#263442");
      else document.text(line, { lineGap: 3 });
    }
    const range = document.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      document.switchToPage(page);
      document.font("Helvetica").fontSize(8).fillColor("#718096").text(`${page + 1} / ${range.count}`, 54, 760, { width: 504, align: "right", lineBreak: false });
    }
    document.end();
  });
}

export async function renderAndVerifyResponseExportPdf(envelope: Pwre1Envelope, verification: PdfVerificationBoundary = new PopplerPdfVerificationBoundary()): Promise<RenderedResponseExportPdf> {
  const rendered = await renderResponseExportPdf(envelope);
  const checked = await verification.verify(rendered.bytes);
  if (checked.pageCount < 1 || checked.pngPages.length !== checked.pageCount || checked.pngPages.some((png) => png.byteLength < 100 || png.subarray(1, 4).toString("ascii") !== "PNG")) {
    throw new Error("Response export PDF raster verification failed.");
  }
  verifyExtractedText(rendered.sourceText, checked.extractedText);
  return rendered;
}
