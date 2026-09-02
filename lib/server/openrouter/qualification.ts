import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, ReportType, ValidationIssue } from "../../question-engine/types.ts";
import { validateReportEvidencePacket } from "../../question-engine/packet-validator.ts";
import { loadSourceManifest, verifyPatternworkSourceIntegrity } from "../../question-engine/source-integrity.ts";
import { canonicalJson, sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import type { ReportArtifact, ReportEvidencePacketV3_1, SynthesisAudit, SynthesisBundle } from "../../report-contracts/types.ts";
import { buildValidatedSynthesisBundle } from "../reports/synthesis.ts";
import { buildGenerationPrompt, loadReportPrompt } from "../reports/prompts.ts";
import { validateCanonicalArtifact } from "../reports/validation.ts";
import type { GeneratedCanonicalArtifact, PreparedReportInputs } from "../reports/types.ts";
import {
  QUALIFICATION_MODEL_ORDER,
  UNQUALIFIED_MOCK_MODEL_POLICY,
  assertCallWithinCostCap,
  type QualifiedModelTier,
  type ReviewedQualificationManifest,
} from "./policy.ts";
import type { OpenRouterGenerationRequest, OpenRouterTransport } from "./types.ts";

export const QUALIFICATION_RUNS_PER_CANDIDATE = 3 as const;
export const QUALIFICATION_REPORT_ORDER = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const satisfies readonly ReportType[];
export const QUALIFICATION_RUN_FILE = "qualification-run.json";

export interface QualificationFixtureInput {
  readonly input: JsonObject;
  readonly packets: readonly ReportEvidencePacketV3_1[];
  readonly bundle?: SynthesisBundle;
}

export interface QualificationFixture {
  readonly id: "A" | "B" | "C";
  readonly sourcePacketSha256: string;
  readonly inputs: Partial<Readonly<Record<Exclude<ReportType, "SYNTHESIS">, QualificationFixtureInput>>>;
}

export interface QualificationFixtureSet {
  readonly fixtureSetSha256: string;
  readonly sourceManifestSha256: string;
  readonly fixtures: readonly [QualificationFixture, QualificationFixture, QualificationFixture];
}

export interface QualificationFixtureBoundary {
  load(workspaceRoot?: string): Promise<QualificationFixtureSet>;
  buildSynthesisInput(
    fixture: QualificationFixture,
    layers: Readonly<Record<"IFS" | "PV" | "ATT", ReportArtifact>>,
  ): Promise<QualificationFixtureInput>;
}

export interface QualificationGateBoundary {
  validate(
    reportType: ReportType,
    output: JsonObject,
    input: QualificationFixtureInput,
    workspaceRoot?: string,
  ): Promise<{ readonly ok: true; readonly artifact: ReportArtifact | SynthesisAudit } | { readonly ok: false; readonly issues: readonly ValidationIssue[] }>;
}

export interface QualificationFilesystemBoundary {
  loadRun(outputDirectory: string): Promise<QualificationRunManifest | undefined>;
  saveRun(outputDirectory: string, manifest: QualificationRunManifest): Promise<void>;
  saveArtifact(outputDirectory: string, relativePath: string, artifact: JsonObject): Promise<void>;
  loadArtifact(outputDirectory: string, relativePath: string): Promise<JsonObject>;
  saveReviewFiles(outputDirectory: string, pending: PendingQualificationResult): Promise<void>;
  saveReviewedManifest(outputDirectory: string, manifest: ReviewedQualificationManifest): Promise<void>;
}

export interface QualificationRunRecord {
  readonly key: string;
  readonly reportType: ReportType;
  readonly candidate: QualifiedModelTier["name"];
  readonly fixtureId: "A" | "B" | "C";
  readonly repetition: 1;
  readonly status: "started" | "completed";
  readonly inputSha256: string;
  readonly sourcePacketSha256: string;
  readonly requestedModel: string;
  readonly requestedReasoningEffort: string;
  readonly provider?: "openrouter";
  readonly actualModel?: string;
  readonly generationId?: string;
  readonly requestId?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly totalTokens?: number;
  readonly costMicros?: number;
  readonly currency?: "USD";
  readonly machinePassed?: boolean;
  readonly issues?: readonly ValidationIssue[];
  readonly artifactPath?: string;
  readonly artifactSha256?: string;
}

export interface QualificationSelection {
  readonly reportType: ReportType;
  readonly candidate: QualifiedModelTier["name"];
  readonly model: string;
  readonly reasoningEffort: string;
  readonly runKeys: readonly [string, string, string];
}

export interface QualificationRunManifest {
  readonly manifestVersion: "1";
  readonly status: "running" | "machine_failed" | "pending_review";
  readonly contractId: "PWQE3-CONTRACT-2";
  readonly integrityContractId: "PWQE3-INTEGRITY-1";
  readonly promptRelease: "4.1.0";
  readonly fixtureSetSha256: string;
  readonly sourceManifestSha256: string;
  readonly candidateOrderSha256: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly costCapMicros: number;
  readonly totalCostMicros: number;
  readonly runs: readonly QualificationRunRecord[];
  readonly selections: Partial<Readonly<Record<ReportType, QualificationSelection>>>;
  readonly failure?: string;
}

export interface DraftQualificationPin {
  readonly tier: QualifiedModelTier["name"];
  readonly model: string;
  readonly reasoningEffort: string;
  readonly escalationTier: QualifiedModelTier["name"];
  readonly escalationModel: string;
  readonly escalationReasoningEffort: string;
  readonly maxOutputTokens: number;
}

export interface PendingQualificationResult {
  readonly status: "pending_review";
  readonly qualificationRunSha256: string;
  readonly fixtureSetSha256: string;
  readonly sourceManifestSha256: string;
  readonly totalCostMicros: number;
  readonly draftPins: Readonly<Record<ReportType, DraftQualificationPin>>;
  readonly draftPinsSha256: string;
  readonly reviewChecklist: readonly string[];
  readonly run: QualificationRunManifest;
}

export interface QualificationReviewApproval {
  readonly status: "approved";
  readonly qualificationRunSha256: string;
  readonly draftPinsSha256: string;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  readonly checklist: {
    readonly allOutputsReviewed: true;
    readonly prohibitedClaimsReviewed: true;
    readonly traceabilityReviewed: true;
    readonly fixtureComparabilityReviewed: true;
    readonly pinsApproved: true;
  };
}

export interface QualificationReviewerBoundary {
  approve(pending: PendingQualificationResult, approval: QualificationReviewApproval): ReviewedQualificationManifest;
}

export interface RunQualificationOptions {
  readonly outputDirectory: string;
  readonly provider: OpenRouterTransport;
  readonly fixtures: QualificationFixtureBoundary;
  readonly filesystem: QualificationFilesystemBoundary;
  readonly gates?: QualificationGateBoundary;
  readonly candidates?: readonly QualifiedModelTier[];
  readonly costCapMicros: number;
  readonly workspaceRoot?: string;
  readonly now?: () => Date;
}

function asJsonObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected a JSON object.");
  return value as JsonObject;
}

function clonePacket(packet: ReportEvidencePacketV3_1, reportType: "IFS" | "PV" | "ATT", fixtureId: string): ReportEvidencePacketV3_1 {
  const copy = structuredClone(packet);
  copy.report_type = reportType;
  copy.packet_id = `PKT-${reportType}-QUAL-${fixtureId}`;
  return copy;
}

function mappingPacket(packet: ReportEvidencePacketV3_1): ReportEvidencePacketV3_1 {
  const copy = structuredClone(packet);
  copy.assessment_completion = {
    ...copy.assessment_completion,
    completion_mode: "pass1_complete",
    last_completed_stage: "S2",
    safe_resume_stage: "S3",
  };
  return copy;
}

export class CanonicalQualificationFixtures implements QualificationFixtureBoundary {
  async load(workspaceRoot = process.cwd()): Promise<QualificationFixtureSet> {
    const integrity = await verifyPatternworkSourceIntegrity(workspaceRoot);
    if (!integrity.ok) throw new Error(`Canonical source drift blocks qualification: ${JSON.stringify(integrity.issues)}`);
    const names = ["12a_respondent_a_packet.json", "12b_respondent_b_packet.json", "12c_respondent_c_packet.json"] as const;
    const ids = ["A", "B", "C"] as const;
    const packets = await Promise.all(names.map(async (name) => asJsonObject(JSON.parse(await readFile(path.join(workspaceRoot, "specs/patternwork/question-engine-v3.1", name), "utf8"))) as ReportEvidencePacketV3_1));
    const sourceManifest = await loadSourceManifest(workspaceRoot);
    const fixtures = await Promise.all(packets.map(async (source, index) => {
      const fixtureId = ids[index];
      const inputs: Partial<Record<Exclude<ReportType, "SYNTHESIS">, QualificationFixtureInput>> = {};
      const mapPacket = mappingPacket(source);
      const mapValidation = await validateReportEvidencePacket(mapPacket, workspaceRoot);
      if (!mapValidation.ok) throw new Error(`Derived MAP fixture ${fixtureId} is invalid: ${JSON.stringify(mapValidation.issues)}`);
      inputs.MAP = { input: { packets: [mapPacket] } as unknown as JsonObject, packets: [mapPacket] };
      for (const reportType of ["IFS", "PV", "ATT"] as const) {
        const packet = clonePacket(source, reportType, fixtureId);
        const validation = await validateReportEvidencePacket(packet, workspaceRoot);
        if (!validation.ok) throw new Error(`Derived ${reportType} fixture ${fixtureId} is invalid: ${JSON.stringify(validation.issues)}`);
        inputs[reportType] = { input: { packet } as unknown as JsonObject, packets: [packet] };
      }
      return { id: fixtureId, sourcePacketSha256: sha256Canonical(source), inputs } as QualificationFixture;
    })) as unknown as [QualificationFixture, QualificationFixture, QualificationFixture];
    return {
      sourceManifestSha256: sha256Canonical(sourceManifest),
      fixtureSetSha256: sha256Canonical(fixtures.map((fixture) => ({ id: fixture.id, sourcePacketSha256: fixture.sourcePacketSha256, inputs: fixture.inputs }))),
      fixtures,
    };
  }

  async buildSynthesisInput(fixture: QualificationFixture, layers: Readonly<Record<"IFS" | "PV" | "ATT", ReportArtifact>>): Promise<QualificationFixtureInput> {
    const packets = (["IFS", "PV", "ATT"] as const).map((type) => fixture.inputs[type]!.packets[0]);
    const first = packets[0].snapshot_binding as JsonObject;
    const prepared: PreparedReportInputs = {
      snapshot: {
        databaseId: `qualification-${fixture.id}`,
        assessmentSessionId: `qualification-${fixture.id}`,
        snapshotId: String(first.snapshot_id),
        snapshotRevision: String(first.snapshot_revision),
        completedPass: 2,
        evidenceSha256: String(first.evidence_sha256),
        scopeSha256: String(first.scope_sha256),
      },
      packets,
    };
    const generated = (["IFS", "PV", "ATT"] as const).map((type) => ({
      reportType: type,
      artifact: layers[type],
      usage: { generationId: `qualification-${type}`, generationIds: [`qualification-${type}`], attempts: 1, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, costMicros: 0, currency: "USD", model: "qualification-source" },
    })) as GeneratedCanonicalArtifact[];
    const bundle = buildValidatedSynthesisBundle(prepared, generated);
    return { input: { bundle } as unknown as JsonObject, packets, bundle };
  }
}

export class CanonicalQualificationGates implements QualificationGateBoundary {
  async validate(reportType: ReportType, output: JsonObject, input: QualificationFixtureInput, workspaceRoot?: string) {
    const result = await validateCanonicalArtifact(reportType, output, input.packets, workspaceRoot, input.bundle);
    return result.ok ? { ok: true as const, artifact: result.value } : { ok: false as const, issues: result.issues };
  }
}

export class NodeQualificationFilesystem implements QualificationFilesystemBoundary {
  async loadRun(outputDirectory: string): Promise<QualificationRunManifest | undefined> {
    try { return JSON.parse(await readFile(path.join(outputDirectory, QUALIFICATION_RUN_FILE), "utf8")) as QualificationRunManifest; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  }
  async saveRun(outputDirectory: string, manifest: QualificationRunManifest): Promise<void> {
    await this.atomicJson(outputDirectory, QUALIFICATION_RUN_FILE, manifest);
  }
  async saveArtifact(outputDirectory: string, relativePath: string, artifact: JsonObject): Promise<void> {
    await this.atomicJson(outputDirectory, relativePath, artifact);
  }
  async loadArtifact(outputDirectory: string, relativePath: string): Promise<JsonObject> {
    return asJsonObject(JSON.parse(await readFile(path.join(outputDirectory, relativePath), "utf8")));
  }
  async saveReviewFiles(outputDirectory: string, pending: PendingQualificationResult): Promise<void> {
    await Promise.all([
      this.atomicJson(outputDirectory, "pending-review.json", pending),
      this.atomicJson(outputDirectory, "draft-pins.json", pending.draftPins),
      this.atomicJson(outputDirectory, "review-checklist.json", { qualificationRunSha256: pending.qualificationRunSha256, draftPinsSha256: pending.draftPinsSha256, checklist: pending.reviewChecklist }),
    ]);
  }
  async saveReviewedManifest(outputDirectory: string, manifest: ReviewedQualificationManifest): Promise<void> {
    await this.atomicJson(outputDirectory, "reviewed-activation-manifest.json", manifest);
  }
  private async atomicJson(outputDirectory: string, relativePath: string, value: unknown): Promise<void> {
    const target = path.join(outputDirectory, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }
}

function runKey(reportType: ReportType, candidate: QualifiedModelTier["name"], fixtureId: string): string {
  return `${reportType}:${candidate}:${fixtureId}:run-1`;
}

function replaceRun(manifest: QualificationRunManifest, record: QualificationRunRecord, now: Date): QualificationRunManifest {
  return {
    ...manifest,
    updatedAt: now.toISOString(),
    totalCostMicros: manifest.runs.filter((run) => run.status === "completed" && run.key !== record.key).reduce((sum, run) => sum + (run.costMicros ?? 0), 0) + (record.costMicros ?? 0),
    runs: [...manifest.runs.filter((run) => run.key !== record.key), record],
  };
}

function draftPins(manifest: QualificationRunManifest, candidates: readonly QualifiedModelTier[]): Readonly<Record<ReportType, DraftQualificationPin>> {
  return Object.fromEntries(QUALIFICATION_REPORT_ORDER.map((reportType) => {
    const selection = manifest.selections[reportType];
    if (!selection) throw new Error(`Cannot draft pins without a ${reportType} machine selection.`);
    const index = candidates.findIndex((candidate) => candidate.name === selection.candidate);
    const escalation = candidates[Math.min(index + 1, candidates.length - 1)];
    return [reportType, {
      tier: selection.candidate,
      model: selection.model,
      reasoningEffort: selection.reasoningEffort,
      escalationTier: escalation.name,
      escalationModel: escalation.model,
      escalationReasoningEffort: escalation.reasoningEffort,
      maxOutputTokens: UNQUALIFIED_MOCK_MODEL_POLICY[reportType].maxOutputTokens,
    }];
  })) as unknown as Readonly<Record<ReportType, DraftQualificationPin>>;
}

async function synthesisInputFor(
  fixture: QualificationFixture,
  manifest: QualificationRunManifest,
  filesystem: QualificationFilesystemBoundary,
  fixtures: QualificationFixtureBoundary,
  outputDirectory: string,
): Promise<QualificationFixtureInput> {
  const layers = {} as Record<"IFS" | "PV" | "ATT", ReportArtifact>;
  for (const type of ["IFS", "PV", "ATT"] as const) {
    const selection = manifest.selections[type];
    const key = selection?.runKeys.find((runKeyValue) => manifest.runs.find((run) => run.key === runKeyValue)?.fixtureId === fixture.id);
    const record = manifest.runs.find((run) => run.key === key);
    if (!record?.artifactPath || !record.artifactSha256) throw new Error(`Missing selected ${type} artifact for synthesis fixture ${fixture.id}.`);
    const artifact = await filesystem.loadArtifact(outputDirectory, record.artifactPath);
    if (sha256Canonical(artifact) !== record.artifactSha256) throw new Error(`Selected ${type} artifact digest changed for synthesis fixture ${fixture.id}.`);
    layers[type] = artifact as ReportArtifact;
  }
  return fixtures.buildSynthesisInput(fixture, layers);
}

export async function runOpenRouterQualification(options: RunQualificationOptions): Promise<QualificationRunManifest | PendingQualificationResult> {
  if (!Number.isFinite(options.costCapMicros) || options.costCapMicros <= 0) throw new Error("A positive qualification cost cap is required.");
  const now = options.now ?? (() => new Date());
  const candidates = options.candidates ?? QUALIFICATION_MODEL_ORDER;
  if (candidates.length !== 4 || candidates.map((candidate) => candidate.name).join(",") !== "luna-low,luna-medium,terra-medium,sol-high") throw new Error("Qualification candidates must preserve the accepted four-tier order.");
  const fixtureSet = await options.fixtures.load(options.workspaceRoot);
  if (fixtureSet.fixtures.length !== QUALIFICATION_RUNS_PER_CANDIDATE) throw new Error("Qualification requires exactly the canonical A/B/C fixture set.");
  const candidateOrderSha256 = sha256Canonical(candidates);
  let manifest = await options.filesystem.loadRun(options.outputDirectory) ?? {
    manifestVersion: "1",
    status: "running",
    contractId: "PWQE3-CONTRACT-2",
    integrityContractId: "PWQE3-INTEGRITY-1",
    promptRelease: "4.1.0",
    fixtureSetSha256: fixtureSet.fixtureSetSha256,
    sourceManifestSha256: fixtureSet.sourceManifestSha256,
    candidateOrderSha256,
    startedAt: now().toISOString(),
    updatedAt: now().toISOString(),
    costCapMicros: options.costCapMicros,
    totalCostMicros: 0,
    runs: [],
    selections: {},
  } satisfies QualificationRunManifest;
  if (manifest.fixtureSetSha256 !== fixtureSet.fixtureSetSha256 || manifest.sourceManifestSha256 !== fixtureSet.sourceManifestSha256 || manifest.candidateOrderSha256 !== candidateOrderSha256 || manifest.costCapMicros !== options.costCapMicros) throw new Error("Resumed qualification manifest does not match fixture, source, candidate, or cost-cap identity.");
  if (manifest.status === "pending_review") {
    const pins = draftPins(manifest, candidates);
    return pendingResult(manifest, pins);
  }
  if (manifest.status === "machine_failed") return manifest;
  const gates = options.gates ?? new CanonicalQualificationGates();

  for (const reportType of QUALIFICATION_REPORT_ORDER) {
    if (manifest.selections[reportType]) continue;
    let selected = false;
    for (const candidate of candidates) {
      const records: QualificationRunRecord[] = [];
      for (const fixture of fixtureSet.fixtures) {
        const key = runKey(reportType, candidate.name, fixture.id);
        let record = manifest.runs.find((run) => run.key === key);
        const input = reportType === "SYNTHESIS"
          ? await synthesisInputFor(fixture, manifest, options.filesystem, options.fixtures, options.outputDirectory)
          : fixture.inputs[reportType as Exclude<ReportType, "SYNTHESIS">];
        if (!input) throw new Error(`Fixture ${fixture.id} has no applicable ${reportType} input.`);
        if (record?.status === "completed") { records.push(record); continue; }
        const promptPackage = await loadReportPrompt(reportType, options.workspaceRoot);
        const prompt = buildGenerationPrompt(reportType, input.input);
        assertCallWithinCostCap({ capMicros: options.costCapMicros, spentMicros: manifest.totalCostMicros }, candidate, prompt, UNQUALIFIED_MOCK_MODEL_POLICY[reportType].maxOutputTokens);
        record = {
          key, reportType, candidate: candidate.name, fixtureId: fixture.id, repetition: 1, status: "started",
          inputSha256: sha256Canonical(input.input), sourcePacketSha256: fixture.sourcePacketSha256,
          requestedModel: candidate.model, requestedReasoningEffort: candidate.reasoningEffort,
        };
        manifest = replaceRun(manifest, record, now());
        await options.filesystem.saveRun(options.outputDirectory, manifest);
        const request: OpenRouterGenerationRequest = {
          model: candidate.model,
          reasoningEffort: candidate.reasoningEffort,
          system: promptPackage.system,
          prompt,
          schemaName: promptPackage.schemaName,
          schema: promptPackage.schema,
          maxOutputTokens: UNQUALIFIED_MOCK_MODEL_POLICY[reportType].maxOutputTokens,
          idempotencyKey: `qualification:${fixtureSet.fixtureSetSha256}:${key}`,
        };
        const result = await options.provider.generate(request);
        let issues: readonly ValidationIssue[] = [];
        let artifactPath: string | undefined;
        let artifactSha256: string | undefined;
        if (!result.ok) issues = [{ code: result.kind, path: "$", message: result.message }];
        else {
          const checked = await gates.validate(reportType, result.output, input, options.workspaceRoot);
          if (!checked.ok) issues = checked.issues;
          else {
            artifactPath = `artifacts/${reportType.toLowerCase()}/${candidate.name}/${fixture.id}.json`;
            artifactSha256 = sha256Canonical(checked.artifact);
            await options.filesystem.saveArtifact(options.outputDirectory, artifactPath, checked.artifact);
          }
        }
        const usage = result.usage;
        record = {
          ...record, status: "completed", provider: "openrouter", actualModel: usage.model,
          generationId: usage.generationId, ...(usage.requestId ? { requestId: usage.requestId } : {}), inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens, totalTokens: usage.totalTokens,
          costMicros: usage.costMicros, currency: usage.currency, machinePassed: issues.length === 0, issues,
          ...(artifactPath ? { artifactPath } : {}),
          ...(artifactSha256 ? { artifactSha256 } : {}),
        };
        manifest = replaceRun(manifest, record, now());
        await options.filesystem.saveRun(options.outputDirectory, manifest);
        records.push(record);
      }
      if (records.length !== QUALIFICATION_RUNS_PER_CANDIDATE) throw new Error(`Candidate ${candidate.name} did not complete exactly three ${reportType} runs.`);
      if (records.every((record) => record.machinePassed)) {
        manifest = { ...manifest, selections: { ...manifest.selections, [reportType]: { reportType, candidate: candidate.name, model: candidate.model, reasoningEffort: candidate.reasoningEffort, runKeys: records.map((record) => record.key) as [string, string, string] } }, updatedAt: now().toISOString() };
        await options.filesystem.saveRun(options.outputDirectory, manifest);
        selected = true;
        break;
      }
    }
    if (!selected) {
      manifest = { ...manifest, status: "machine_failed", failure: `No candidate passed all three ${reportType} fixture runs.`, updatedAt: now().toISOString() };
      await options.filesystem.saveRun(options.outputDirectory, manifest);
      return manifest;
    }
  }
  manifest = { ...manifest, status: "pending_review", updatedAt: now().toISOString() };
  await options.filesystem.saveRun(options.outputDirectory, manifest);
  const pending = pendingResult(manifest, draftPins(manifest, candidates));
  await options.filesystem.saveReviewFiles(options.outputDirectory, pending);
  return pending;
}

function pendingResult(manifest: QualificationRunManifest, pins: Readonly<Record<ReportType, DraftQualificationPin>>): PendingQualificationResult {
  return {
    status: "pending_review",
    qualificationRunSha256: sha256Canonical(manifest),
    fixtureSetSha256: manifest.fixtureSetSha256,
    sourceManifestSha256: manifest.sourceManifestSha256,
    totalCostMicros: manifest.totalCostMicros,
    draftPins: pins,
    draftPinsSha256: sha256Canonical(pins),
    reviewChecklist: [
      "Review all fifteen selected candidate outputs and the recorded failure summaries for lower candidates.",
      "Confirm prohibited-claim, traceability, confidence, contradiction, and snapshot boundaries in reader prose.",
      "Confirm the same A/B/C fixture identities and checks were used for every candidate.",
      "Confirm draft initial and escalation pins are acceptable for each report type.",
    ],
    run: manifest,
  };
}

export class StrictQualificationReviewer implements QualificationReviewerBoundary {
  approve(pending: PendingQualificationResult, approval: QualificationReviewApproval): ReviewedQualificationManifest {
    if (
      pending.run.status !== "pending_review" ||
      pending.qualificationRunSha256 !== sha256Canonical(pending.run) ||
      pending.draftPinsSha256 !== sha256Canonical(pending.draftPins) ||
      pending.fixtureSetSha256 !== pending.run.fixtureSetSha256 ||
      pending.sourceManifestSha256 !== pending.run.sourceManifestSha256
    ) throw new Error("Pending review package digest or qualification identity is invalid.");
    for (const reportType of QUALIFICATION_REPORT_ORDER) {
      const selection = pending.run.selections[reportType];
      if (!selection || pending.draftPins[reportType].tier !== selection.candidate || selection.runKeys.length !== QUALIFICATION_RUNS_PER_CANDIDATE) {
        throw new Error(`Pending review package has no bound three-run ${reportType} selection.`);
      }
      for (const key of selection.runKeys) {
        const run = pending.run.runs.find((candidateRun) => candidateRun.key === key);
        if (!run?.machinePassed || !run.artifactPath || !run.artifactSha256) throw new Error(`Pending review package has invalid selected ${reportType} evidence.`);
      }
    }
    if (approval.status !== "approved" || approval.qualificationRunSha256 !== pending.qualificationRunSha256 || approval.draftPinsSha256 !== pending.draftPinsSha256) throw new Error("Review approval is not bound to this qualification run and draft pin set.");
    if (!approval.reviewedBy.trim() || Number.isNaN(Date.parse(approval.reviewedAt)) || Object.values(approval.checklist).some((value) => value !== true)) throw new Error("Review approval lacks reviewer identity, timestamp, or completed checklist evidence.");
    return {
      manifestVersion: "1", status: "reviewed", contractId: "PWQE3-CONTRACT-2", integrityContractId: "PWQE3-INTEGRITY-1", promptRelease: "4.1.0",
      fixtureSetSha256: pending.fixtureSetSha256, reviewedAt: approval.reviewedAt, reviewedBy: approval.reviewedBy,
      pins: pending.draftPins as ReviewedQualificationManifest["pins"],
    };
  }
}

export async function approveOpenRouterQualification(
  pending: PendingQualificationResult,
  approval: QualificationReviewApproval,
  outputDirectory: string,
  filesystem: QualificationFilesystemBoundary,
  reviewer: QualificationReviewerBoundary = new StrictQualificationReviewer(),
): Promise<ReviewedQualificationManifest> {
  const manifest = reviewer.approve(pending, approval);
  await filesystem.saveReviewedManifest(outputDirectory, manifest);
  return manifest;
}

export function qualificationManifestDigest(value: unknown): string {
  return sha256Canonical(asJsonObject(value));
}

export function serializeQualificationManifest(value: unknown): string {
  return canonicalJson(value);
}
