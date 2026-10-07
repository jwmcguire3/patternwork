import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, ReportType } from "../../lib/question-engine/types.ts";
import { canonicalJson, sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import type { ReportArtifact, SynthesisAudit, SynthesisBundle } from "../../lib/report-contracts/types.ts";
import { renderAndVerifyCanonicalPdf } from "../../lib/server/pdf/index.ts";
import { buildGenerationPrompt, loadReportPrompt } from "../../lib/server/reports/prompts.ts";
import { buildValidatedSynthesisBundle } from "../../lib/server/reports/synthesis.ts";
import type { AggregatedOpenRouterUsage, GeneratedCanonicalArtifact, PreparedReportInputs, Pwqe6ReportArtifact } from "../../lib/server/reports/types.ts";
import type { Pwrp71ReportArtifact } from "../../lib/server/reports/pwrp71-validation.ts";
import { validateCanonicalArtifact } from "../../lib/server/reports/validation.ts";
import { PrismaReportWorkflowPersistence } from "../../lib/server/reports/dependencies.ts";
import { prisma } from "../../lib/prisma.ts";
import type { PreparedPdfArtifact } from "../../lib/server/reports/types.ts";
import { classifyCliInput } from "./input.ts";
import { codexCompatibleOutputSchema, LocalCodexProcessBoundary, type CodexProcessBoundary } from "./process.ts";

const emptyUsage: AggregatedOpenRouterUsage = { generationId: "codex-local", generationIds: ["codex-local"], model: "codex-local", attempts: 1, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, costMicros: 0, currency: "USD" };

export interface RunCliInput { readonly inputPath: string; readonly outputDirectory: string; readonly workspaceRoot?: string; readonly processBoundary?: CodexProcessBoundary; readonly persistAssessmentId?: string }

function safeName(type: ReportType): string { return type.toLowerCase(); }
function markdown(artifact: ReportArtifact | SynthesisAudit | Pwqe6ReportArtifact | Pwrp71ReportArtifact): string { return artifact.artifact_type === "synthesis_audit" ? artifact.reader_markdown : artifact.report_markdown; }

async function generateOne(reportType: ReportType, generationInput: JsonObject, prepared: PreparedReportInputs, outputDirectory: string, workspaceRoot: string, boundary: CodexProcessBoundary, bundle?: SynthesisBundle): Promise<GeneratedCanonicalArtifact> {
  const loaded = await loadReportPrompt(reportType, workspaceRoot);
  const base = safeName(reportType);
  const schemaPath = path.resolve(outputDirectory, `${base}.output.schema.json`);
  const responsePath = path.resolve(outputDirectory, `${base}.codex-response.json`);
  await writeFile(schemaPath, `${JSON.stringify(codexCompatibleOutputSchema(loaded.schema), null, 2)}\n`, "utf8");
  await boundary.execute({ prompt: `${loaded.system}\n\n${buildGenerationPrompt(reportType, generationInput)}`, schemaPath, outputPath: responsePath, cwd: workspaceRoot });
  const value: unknown = JSON.parse(await readFile(responsePath, "utf8"));
  const validation = await validateCanonicalArtifact(reportType, value, prepared.packets, workspaceRoot, bundle);
  await writeFile(path.resolve(outputDirectory, `${base}.validation.json`), `${JSON.stringify({ ok: validation.ok, issues: validation.issues }, null, 2)}\n`, "utf8");
  if (!validation.ok) throw new Error(`Codex ${reportType} output failed canonical validation: ${JSON.stringify(validation.issues)}`);
  return { reportType, artifact: validation.value, usage: emptyUsage };
}

export async function runReportCli(input: RunCliInput): Promise<{ readonly reportTypes: readonly ReportType[]; readonly persisted: boolean }> {
  const workspaceRoot = path.resolve(input.workspaceRoot ?? process.cwd());
  const outputDirectory = path.resolve(input.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  const raw: unknown = JSON.parse(await readFile(path.resolve(input.inputPath), "utf8"));
  const classified = await classifyCliInput(raw, workspaceRoot);
  const boundary = input.processBoundary ?? new LocalCodexProcessBoundary();
  let prepared: PreparedReportInputs;
  let work: Array<{ reportType: ReportType; generationInput: JsonObject; bundle?: SynthesisBundle }>;
  if (classified.mode === "synthesis_bundle") {
    const manifest = classified.bundle.snapshot_manifest as JsonObject;
    const sources = classified.bundle.sources as JsonObject;
    const packets = ["ifs", "pv", "attachment"].map((key) => ((sources[key] as JsonObject).packet)) as unknown as PreparedReportInputs["packets"];
    prepared = { snapshot: { databaseId: "local", assessmentSessionId: "local", snapshotId: String(manifest.snapshot_id), snapshotRevision: String(manifest.snapshot_revision), completedPass: 2, evidenceSha256: String(manifest.evidence_sha256), scopeSha256: String(manifest.scope_sha256) }, packets };
    work = [{ reportType: "SYNTHESIS", generationInput: { bundle: classified.bundle } as unknown as JsonObject, bundle: classified.bundle }];
  } else {
    prepared = classified.prepared;
    work = prepared.snapshot.completedPass === 1 ? [{ reportType: "MAP", generationInput: { packets: prepared.packets } as unknown as JsonObject }] : (["IFS", "PV", "ATT"] as const).map((reportType) => ({ reportType, generationInput: { packet: prepared.packets.find((packet) => packet.report_type === reportType)! } as unknown as JsonObject }));
  }
  const generated: GeneratedCanonicalArtifact[] = [];
  for (const item of work) generated.push(await generateOne(item.reportType, item.generationInput, prepared, outputDirectory, workspaceRoot, boundary, item.bundle));
  if (classified.mode === "packets" && prepared.snapshot.completedPass === 2) {
    const bundle = buildValidatedSynthesisBundle(prepared, generated);
    await writeFile(path.resolve(outputDirectory, "synthesis-bundle.canonical.json"), `${canonicalJson(bundle)}\n`, "utf8");
    generated.push(await generateOne("SYNTHESIS", { bundle } as unknown as JsonObject, prepared, outputDirectory, workspaceRoot, boundary, bundle));
  }
  const manifestReports = [];
  const preparedPdfs: PreparedPdfArtifact[] = [];
  for (const item of generated) {
    const base = safeName(item.reportType);
    const canonicalPath = path.resolve(outputDirectory, `${base}.canonical.json`);
    const markdownPath = path.resolve(outputDirectory, `${base}.md`);
    const pdfPath = path.resolve(outputDirectory, `${base}.pdf`);
    await writeFile(canonicalPath, `${canonicalJson(item.artifact)}\n`, "utf8");
    await writeFile(markdownPath, `${markdown(item.artifact)}\n`, "utf8");
    const pwrp71 = item.artifact.artifact_type === "pwrp71_report";
    const acceptedLayers = Object.fromEntries(generated
      .filter((candidate) => candidate.reportType !== "SYNTHESIS" && candidate.artifact.artifact_type === "pwrp71_report")
      .map((candidate) => [candidate.reportType, candidate.artifact.draft as JsonObject]));
    const pdf = await renderAndVerifyCanonicalPdf({
      reportType: item.reportType,
      artifact: item.artifact,
      packets: prepared.packets,
      routerPacket: prepared.routerPacket,
      acceptedLayers,
      snapshotId: prepared.snapshot.snapshotId,
      contractVersion: pwrp71 ? "v7.1" : prepared.contractVersion,
      workspaceRoot,
    });
    await writeFile(pdfPath, pdf.bytes);
    preparedPdfs.push({ reportType: item.reportType, filename: pdf.filename, bytesBase64: pdf.bytes.toString("base64"), sha256: pdf.sha256, sourceMarkdownSha256: pdf.sourceMarkdownSha256, pageCount: pdf.pageCount, pngPageCount: pdf.pngPageCount });
    manifestReports.push({ reportType: item.reportType, canonical: path.basename(canonicalPath), markdown: path.basename(markdownPath), pdf: path.basename(pdfPath), canonicalDigest: item.artifact.artifact_type === "synthesis_audit" ? (item.artifact.digests as JsonObject).audit_sha256 : (item.artifact.digests as JsonObject).artifact_sha256, pdfSha256: pdf.sha256, pageCount: pdf.pageCount, verifiedPngPages: pdf.pngPageCount });
  }
  let persisted = false;
  if (input.persistAssessmentId) {
    const snapshot = await prisma.patternworkV31AssessmentSnapshot.findFirst({ where: { assessmentSessionId: input.persistAssessmentId, snapshotId: prepared.snapshot.snapshotId, completedPass: prepared.snapshot.completedPass } });
    if (!snapshot) throw new Error("--persist-assessment did not resolve a matching immutable snapshot; no artifacts were persisted.");
    const boundPrepared: PreparedReportInputs = { ...prepared, snapshot: { ...prepared.snapshot, databaseId: snapshot.id, assessmentSessionId: input.persistAssessmentId } };
    const workflowInput = { assessmentSessionId: input.persistAssessmentId, snapshotId: snapshot.snapshotId, completedPass: prepared.snapshot.completedPass, invocationKey: `codex-local:${sha256Canonical(generated.map((item) => item.artifact)).slice(0, 32)}` } as const;
    const persistence = new PrismaReportWorkflowPersistence();
    await persistence.initializeRuns(workflowInput, boundPrepared);
    await persistence.releaseAtomically(workflowInput, generated, preparedPdfs);
    persisted = true;
  }
  await writeFile(path.resolve(outputDirectory, "manifest.json"), `${JSON.stringify({ version: 1, localOnly: !persisted, persisted, reports: manifestReports }, null, 2)}\n`, "utf8");
  return { reportTypes: generated.map((item) => item.reportType), persisted };
}
