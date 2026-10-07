import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import PDFDocument from "pdfkit";
import type { ReportType } from "../../question-engine/types.ts";
import { normalizeLf, sha256Text } from "../../report-contracts/delivery-validator.ts";
import type { JsonObject } from "../../question-engine/types.ts";
import type { ReportArtifact, ReportEvidencePacketV3_1, SynthesisAudit, SynthesisBundle } from "../../report-contracts/types.ts";
import { validateCanonicalArtifact } from "../reports/validation.ts";
import { validatePwqe6ReportDraft, validatePwqe6ArtifactLineage } from "../reports/pwqe6-validation.ts";
import { loadPwqe5SourcePackage } from "../reports/pwqe6-source.ts";
import type { Pwqe6ReportArtifact } from "../reports/types.ts";
import { sha256 } from "../security/index.ts";
import type { PdfExternalVerification, PdfLayoutMetrics, PdfVerificationBoundary, VerifiedPdf } from "./types.ts";

const execFileAsync = promisify(execFile);
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 58;
const CONTENT_BOTTOM = PAGE_HEIGHT - 54;
const MAX_PAGES = 80;

function popplerCommand(environmentName: "PDFTOTEXT_PATH" | "PDFINFO_PATH" | "PDFTOPPM_PATH", fallback: string): string {
  return process.env[environmentName]?.trim() || fallback;
}

const REPORT_NAMES: Readonly<Record<ReportType, string>> = {
  MAP: "Patternwork Mapping Summary",
  IFS: "Patternwork IFS Report",
  PV: "Patternwork Polyvagal Report",
  ATT: "Patternwork Attachment Report",
  SYNTHESIS: "Patternwork Synthesis Report",
};

const FILENAMES: Readonly<Record<ReportType, string>> = {
  MAP: "patternwork-mapping-summary.pdf",
  IFS: "patternwork-ifs-report.pdf",
  PV: "patternwork-polyvagal-report.pdf",
  ATT: "patternwork-attachment-report.pdf",
  SYNTHESIS: "patternwork-synthesis-report.pdf",
};

interface RenderedPdf {
  readonly bytes: Buffer;
  readonly layout: PdfLayoutMetrics;
}

function stripInlineMarkdown(value: string): string {
  return value
    .replaceAll(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replaceAll(/[`*_~]/gu, "")
    .replaceAll(/<[^>]+>/gu, "")
    .trim();
}

export function markdownToPlainText(markdown: string): string {
  return normalizeLf(markdown)
    .split("\n")
    .map((line) => stripInlineMarkdown(line.replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/u, "")))
    .filter(Boolean)
    .join("\n");
}

function normalizedWords(value: string): string[] {
  return value.normalize("NFKC").replaceAll(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase().split(/\s+/u).filter(Boolean);
}

export function verifyExtractedText(sourceMarkdown: string, extractedText: string): void {
  const expected = normalizedWords(markdownToPlainText(sourceMarkdown));
  const actual = normalizedWords(extractedText);
  if (expected.length === 0) throw new Error("PDF source Markdown contains no extractable reader text.");
  const actualCounts = new Map<string, number>();
  for (const word of actual) actualCounts.set(word, (actualCounts.get(word) ?? 0) + 1);
  let matched = 0;
  for (const word of expected) {
    const remaining = actualCounts.get(word) ?? 0;
    if (remaining > 0) {
      matched += 1;
      actualCounts.set(word, remaining - 1);
    }
  }
  if (matched / expected.length < 0.97) throw new Error(`PDF extracted-text coverage was ${(matched / expected.length * 100).toFixed(1)}%; expected at least 97%.`);
}

export function renderMarkdownPdf(markdown: string, title: string): Promise<RenderedPdf> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: MARGIN, bottom: 54, left: MARGIN, right: MARGIN }, bufferPages: true, compress: false, info: { Title: title, Author: "Patternwork", Subject: "Validated Patternwork assessment report" } });
    const chunks: Buffer[] = [];
    let renderedLineCount = 0;
    let finalPageCount = 0;
    let minimumRemainingPoints = CONTENT_BOTTOM - MARGIN;
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve({
      bytes: Buffer.concat(chunks),
      layout: { pageCount: finalPageCount, renderedLineCount, bottomMarginPoints: PAGE_HEIGHT - CONTENT_BOTTOM, minimumRemainingPoints },
    }));

    const pageHeader = () => {
      doc.save().font("Helvetica").fontSize(8).fillColor("#64748b").text("PATTERNWORK", MARGIN, 28, { width: PAGE_WIDTH - MARGIN * 2, characterSpacing: 1.5 });
      doc.restore();
    };
    doc.on("pageAdded", pageHeader);
    pageHeader();
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#18212f").text(title, { lineGap: 4 });
    doc.moveDown(0.35).font("Helvetica").fontSize(9).fillColor("#64748b").text("A descriptive, non-diagnostic reflection generated from your completed assessment.");
    doc.moveDown(1.15);

    const ensureSpace = (height: number) => {
      if (doc.y + height > CONTENT_BOTTOM) doc.addPage();
    };
    const notePosition = () => {
      if (doc.y > CONTENT_BOTTOM + 0.1) throw new Error("PDF layout overflowed the configured content boundary.");
      minimumRemainingPoints = Math.min(minimumRemainingPoints, CONTENT_BOTTOM - doc.y);
    };

    for (const rawLine of normalizeLf(markdown).split("\n")) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        ensureSpace(8);
        doc.moveDown(0.35);
        notePosition();
        continue;
      }
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/u);
      const bullet = line.match(/^\s*[-*+]\s+(.+)$/u);
      const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)$/u);
      const quote = line.match(/^\s*>\s?(.*)$/u);
      const text = stripInlineMarkdown(heading?.[2] ?? bullet?.[1] ?? numbered?.[2] ?? quote?.[1] ?? line);
      if (!text) continue;
      if (heading) {
        const level = heading[1].length;
        const fontSize = level === 1 ? 18 : level === 2 ? 14 : 11.5;
        ensureSpace(fontSize * 2.2);
        doc.moveDown(level === 1 ? 0.9 : 0.6).font("Helvetica-Bold").fontSize(fontSize).fillColor("#24364b").text(text, { lineGap: 3 });
      } else if (bullet || numbered) {
        ensureSpace(30);
        const marker = bullet ? "-" : `${numbered![1]}.`;
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#315f66").text(marker, MARGIN + 8, doc.y, { width: 18, continued: false });
        doc.font("Helvetica").fontSize(10.5).fillColor("#263442").text(text, MARGIN + 30, doc.y - doc.currentLineHeight(), { width: PAGE_WIDTH - MARGIN * 2 - 30, lineGap: 3 });
      } else {
        ensureSpace(24);
        doc.font(quote ? "Helvetica-Oblique" : "Helvetica").fontSize(10.5).fillColor(quote ? "#526273" : "#263442").text(text, quote ? MARGIN + 18 : MARGIN, doc.y, { width: PAGE_WIDTH - MARGIN * 2 - (quote ? 18 : 0), lineGap: 3, align: "left" });
      }
      renderedLineCount += 1;
      notePosition();
    }

    const range = doc.bufferedPageRange();
    finalPageCount = range.count;
    if (range.count > MAX_PAGES) return reject(new Error(`PDF exceeded the ${MAX_PAGES}-page safety limit.`));
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      doc.save().font("Helvetica").fontSize(8).fillColor("#718096").text(`${index + 1} / ${range.count}`, MARGIN, CONTENT_BOTTOM - 24, { width: PAGE_WIDTH - MARGIN * 2, align: "right", lineBreak: false }).restore();
    }
    doc.end();
  });
}

export class PopplerPdfVerificationBoundary implements PdfVerificationBoundary {
  async verify(pdf: Buffer): Promise<PdfExternalVerification> {
    const directory = await mkdtemp(path.join(tmpdir(), "patternwork-pdf-"));
    const pdfPath = path.join(directory, "report.pdf");
    const textPath = path.join(directory, "report.txt");
    const pngPrefix = path.join(directory, "page");
    try {
      await writeFile(pdfPath, pdf);
      await execFileAsync(popplerCommand("PDFTOTEXT_PATH", "pdftotext"), ["-layout", pdfPath, textPath], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      const { stdout } = await execFileAsync(popplerCommand("PDFINFO_PATH", "pdfinfo"), [pdfPath], { windowsHide: true });
      const pageMatch = stdout.match(/^Pages:\s+(\d+)\s*$/mu);
      if (!pageMatch) throw new Error("pdfinfo did not report a page count.");
      await execFileAsync(popplerCommand("PDFTOPPM_PATH", "pdftoppm"), ["-png", "-r", "110", pdfPath, pngPrefix], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      const names = (await readdir(directory)).filter((name) => /^page-\d+\.png$/u.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return { extractedText: await readFile(textPath, "utf8"), pageCount: Number(pageMatch[1]), pngPages: await Promise.all(names.map((name) => readFile(path.join(directory, name)))) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export interface RenderCanonicalPdfInput {
  readonly reportType: ReportType;
  readonly artifact: ReportArtifact | SynthesisAudit | Pwqe6ReportArtifact;
  readonly packets?: readonly ReportEvidencePacketV3_1[];
  readonly routerPacket?: JsonObject;
  readonly bundle?: SynthesisBundle;
  readonly snapshotId?: string;
  readonly contractVersion?: "v3.1" | "v6";
  readonly workspaceRoot?: string;
  readonly verification?: PdfVerificationBoundary;
}

export async function renderAndVerifyCanonicalPdf(input: RenderCanonicalPdfInput): Promise<VerifiedPdf> {
  if (input.contractVersion === "v6") {
    const packet = input.routerPacket;
    if (!packet || !input.snapshotId || input.artifact.artifact_type !== "pwqe6_report") throw new Error("PWQE6 PDF rendering requires a validated packet, snapshot, and PWQE6 artifact.");
    const source = await loadPwqe5SourcePackage(input.workspaceRoot);
    const validation = validatePwqe6ReportDraft({ value: input.artifact.draft, reportType: input.reportType, snapshotId: input.snapshotId, packet, source, qualificationManifestSha256: input.artifact.qualification_manifest_sha256 });
    const lineageIssues = validatePwqe6ArtifactLineage(input.artifact, packet, input.snapshotId);
    if (!validation.ok || lineageIssues.length || validation.value.digests.artifact_sha256 !== input.artifact.digests.artifact_sha256) {
      throw new Error(`PWQE6 artifact is not validator-clean: ${JSON.stringify(validation.ok ? lineageIssues : validation.issues)}`);
    }
  } else {
    const validation = await validateCanonicalArtifact(input.reportType, input.artifact as ReportArtifact | SynthesisAudit, (input.packets ?? []) as ReportEvidencePacketV3_1[], input.workspaceRoot, input.bundle);
    if (!validation.ok) throw new Error(`Canonical artifact is not validator-clean: ${JSON.stringify(validation.issues)}`);
  }
  const markdown = input.artifact.artifact_type === "synthesis_audit" ? input.artifact.reader_markdown : input.artifact.report_markdown;
  const rendered = await renderMarkdownPdf(markdown, REPORT_NAMES[input.reportType]);
  const checked = await (input.verification ?? new PopplerPdfVerificationBoundary()).verify(rendered.bytes);
  if (checked.pageCount !== rendered.layout.pageCount || checked.pageCount < 1 || checked.pageCount > MAX_PAGES) throw new Error("PDF page-count verification failed.");
  if (checked.pngPages.length !== checked.pageCount || checked.pngPages.some((png) => png.byteLength < 100 || png.subarray(1, 4).toString("ascii") !== "PNG")) throw new Error("PDF rendered-PNG verification failed.");
  verifyExtractedText(markdown, checked.extractedText);
  return {
    reportType: input.reportType,
    filename: FILENAMES[input.reportType],
    bytes: rendered.bytes,
    sha256: sha256(rendered.bytes),
    sourceMarkdownSha256: sha256Text(normalizeLf(markdown)),
    extractedText: checked.extractedText,
    pageCount: checked.pageCount,
    pngPageCount: checked.pngPages.length,
    layout: rendered.layout,
  };
}
