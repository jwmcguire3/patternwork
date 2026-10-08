import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, ReportType, ValidationIssue } from "../../../question-engine/types.ts";
import { loadPwqe51SourcePackage, PWQE51_RELEASE_IDENTITY, PWQE51_SOURCE_MANIFEST_SHA256, type Pwqe51SourcePackage } from "../../../question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../../report-contracts/delivery-validator.ts";
import { OpenRouterClient } from "../../openrouter/client.ts";
import { QUALIFICATION_MODEL_ORDER, UNQUALIFIED_MOCK_MODEL_POLICY, type ActivatedReportModelPolicy } from "../../openrouter/policy.ts";
import type { OpenRouterGenerationRequest, OpenRouterGenerationResult, OpenRouterTransport, OpenRouterUsage } from "../../openrouter/types.ts";
import { generateCanonicalReport } from "../generator.ts";
import type { Pwrp71ReportArtifact } from "../pwrp71-validation.ts";
import { preparePwrp71Request } from "../pwrp71-adapter.ts";
import { loadPwrp71SourcePackage, type Pwrp71SourcePackage } from "../pwrp71-source.ts";
import { FileQualificationAttemptStore, JournaledPwrp71Transport, type QualificationAttemptRecord } from "./attempt-store.ts";
import { loadPwrp71FixturePacket, type Pwrp71FixturePacket } from "./replay.ts";
import { loadPwrp71QualificationFixtures, type Pwrp71QualificationFixtures } from "./fixtures.ts";

export const PWRP71_QUALIFICATION_RUN_SCHEMA = 1 as const;
export const PWRP71_QUALIFICATION_REPORT_ORDER = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const satisfies readonly ReportType[];
export const PWRP71_ROUTER_PARITY_EVIDENCE_VERSION = "pwqe51-routing-qualification-1" as const;

const ROUTER_IMPLEMENTATION_FILES = [
  "lib/server/assessment/pwqe51-router.ts",
  "lib/server/assessment/pwqe51-coverage.ts",
  "lib/server/assessment/pwqe51-flags.ts",
  "lib/server/reports/pwqe51-packet.ts",
] as const;

export interface Pwqe51RouterQualificationEvidence {
  readonly manifestVersion: typeof PWRP71_ROUTER_PARITY_EVIDENCE_VERSION;
  readonly status: "qualified";
  readonly questionRelease: typeof PWQE51_RELEASE_IDENTITY.questionRelease;
  readonly routerVersion: typeof PWQE51_RELEASE_IDENTITY.routerVersion;
  readonly questionSourceSha256: typeof PWQE51_RELEASE_IDENTITY.sourceSha256;
  readonly questionSourceManifestSha256: typeof PWQE51_SOURCE_MANIFEST_SHA256;
  readonly routerRuntimeSha256: string;
  readonly qualificationRunSha256: string;
  readonly verifiedCommit: string;
  readonly fixtures: readonly { readonly profileId: string; readonly packetSha256: string; readonly status: "passed" }[];
}

export interface Pwrp71QualificationReportResult {
  readonly profileId: string;
  readonly reportType: ReportType;
  readonly status: "accepted" | "failed" | "blocked";
  readonly fixtureStatus: Pwrp71FixturePacket["fixtureStatus"];
  readonly packetSha256: string;
  readonly evidenceSha256: string;
  readonly reportSourceManifestSha256: string;
  readonly requestedModel: string;
  readonly reasoningEffort: string;
  readonly artifactFile?: string;
  readonly markdownFile?: string;
  readonly artifactSha256?: string;
  readonly markdownSha256?: string;
  readonly validationIssues?: readonly ValidationIssue[];
  readonly reviewerReceipts?: readonly JsonObject[];
  readonly usage?: {
    readonly status: "reported" | "mock" | "unknown";
    readonly costMicros: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly reasoningTokens: number;
    readonly totalTokens: number;
    readonly attempts: number;
    readonly generationIds: readonly string[];
  };
  readonly failure?: { readonly code: string; readonly message: string; readonly issues: readonly ValidationIssue[] };
}

export interface Pwrp71QualificationRun {
  readonly schemaVersion: typeof PWRP71_QUALIFICATION_RUN_SCHEMA;
  readonly runId: string;
  readonly mode: "offline" | "live";
  readonly status: "running" | "blocked" | "failed" | "offline_complete" | "pending_human_review";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly runFingerprint: string;
  readonly qualificationRunSha256?: string;
  readonly outputDirectory: string;
  readonly attemptsFile: string;
  readonly routingEvidenceFile?: string;
  readonly sourcePins: {
    readonly questionRelease: string;
    readonly routerVersion: string;
    readonly questionSourceSha256: string;
    readonly questionSourceManifestSha256: string;
    readonly reportRelease: string;
    readonly reportSourceManifestSha256: string;
    readonly routerPacketSchemaSha256: string;
    readonly reportDraftSchemaSha256: string;
    readonly reportReviewSchemaSha256: string;
    readonly semanticCaseSetSha256: string;
    readonly semanticCasesCanonicalJsonSha256: string;
    readonly fixtureSetSha256: string;
    readonly sourceArchiveSha256: string;
    readonly routingQualificationSha256?: string;
    readonly routerRuntimeSha256: string;
  };
  readonly candidatePolicy: {
    readonly candidates: typeof QUALIFICATION_MODEL_ORDER;
    readonly candidatesSha256: string;
    readonly reportModelPolicy: ActivatedReportModelPolicy;
    readonly reportModelPolicySha256: string;
  };
  readonly costCapMicros: number;
  readonly totalReportedCostMicros: number;
  readonly reservedUnknownCostMicros: number;
  readonly selectedProfiles: readonly string[];
  readonly selectedReports: readonly ReportType[];
  readonly fixtureStatuses: Readonly<Record<string, Pwrp71FixturePacket["fixtureStatus"]>>;
  readonly routeParity: "pending" | "qualified";
  readonly blockers: readonly string[];
  readonly results: readonly Pwrp71QualificationReportResult[];
  readonly reviewPackageFile?: string;
}

export function computePwrp71QualificationRunSha256(
  run: Pick<Pwrp71QualificationRun, "runFingerprint" | "results">,
  attempts: readonly QualificationAttemptRecord[],
): string {
  return sha256Canonical({
    runFingerprint: run.runFingerprint,
    results: run.results,
    attempts: attempts.map(({ providerResult, ...record }) => ({
      ...record,
      ...(providerResult ? { providerResultSha256: sha256Canonical(providerResult) } : {}),
    })),
  });
}

export interface RunPwrp71QualificationOptions {
  readonly runId?: string;
  readonly mode: "offline" | "live";
  readonly profileIds: readonly string[];
  readonly reportTypes: readonly ReportType[];
  readonly costCapMicros: number;
  readonly workspaceRoot?: string;
  readonly outputRoot?: string;
  readonly fixtures?: Pwrp71QualificationFixtures;
  readonly questionSource?: Pwqe51SourcePackage;
  readonly reportSource?: Pwrp71SourcePackage;
  readonly routingEvidence?: Pwqe51RouterQualificationEvidence;
  readonly transport?: OpenRouterTransport;
  readonly now?: () => Date;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeRunId(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/u.test(value) || value === "." || value === "..") throw new Error("Run ID must use 1–80 letters, numbers, dots, underscores or hyphens.");
  return value;
}

export async function computePwqe51RouterRuntimeSha256(workspaceRoot: string): Promise<string> {
  const files: Record<string, string> = {};
  for (const relative of ROUTER_IMPLEMENTATION_FILES) {
    const bytes = await readFile(path.join(workspaceRoot, relative));
    files[relative] = sha256(bytes);
  }
  return sha256Canonical(files);
}

export function validatePwrp71RoutingEvidence(input: {
  readonly evidence: Pwqe51RouterQualificationEvidence | undefined;
  readonly expectedRouterRuntimeSha256: string;
  readonly fixtures: readonly Pwrp71FixturePacket[];
  readonly workspaceSource: Pwqe51SourcePackage;
}): { readonly ok: true; readonly digest: string } | { readonly ok: false; readonly reason: string } {
  const evidence = input.evidence;
  if (!evidence) return { ok: false, reason: "Final PWQE 5.1 router qualification evidence was not supplied." };
  if (evidence.manifestVersion !== PWRP71_ROUTER_PARITY_EVIDENCE_VERSION || evidence.status !== "qualified"
    || evidence.questionRelease !== PWQE51_RELEASE_IDENTITY.questionRelease
    || evidence.routerVersion !== PWQE51_RELEASE_IDENTITY.routerVersion
    || evidence.questionSourceSha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || evidence.questionSourceManifestSha256 !== input.workspaceSource.sourceManifestSha256
    || evidence.routerRuntimeSha256 !== input.expectedRouterRuntimeSha256
    || !/^[a-f0-9]{64}$/u.test(evidence.qualificationRunSha256)
    || !/^[a-f0-9]{40,64}$/u.test(evidence.verifiedCommit)) {
    return { ok: false, reason: "Router qualification evidence does not bind the final current PWQE 5.1 source and router implementation." };
  }
  const packets = new Map(evidence.fixtures.map((fixture) => [fixture.profileId, fixture]));
  for (const fixture of input.fixtures) {
    const qualified = packets.get(fixture.profileId);
    if (!qualified || qualified.status !== "passed" || qualified.packetSha256 !== fixture.packetSha256) {
      return { ok: false, reason: `${fixture.profileId} is not passed and bound to the selected packet in router qualification evidence.` };
    }
  }
  return { ok: true, digest: sha256Canonical(evidence) };
}

function mockDraft(input: { readonly source: Pwrp71SourcePackage; readonly packet: JsonObject; readonly reportType: ReportType }): JsonObject {
  const packet = input.packet as Record<string, unknown>;
  return {
    report_release: input.source.policy.release,
    release_id: String(packet.release_id),
    snapshot_id: String(packet.snapshot_id),
    evidence_sha256: String(packet.content_sha256),
    report_type: input.reportType,
    title: `Offline structural fixture for ${input.reportType}`,
    title_claim_ids: [],
    content_status: "insufficient_evidence",
    sections: [],
    claims: [],
    name_registry: [],
    relationships: [],
    reflection_questions: [],
  };
}

function mockReview(input: { readonly source: Pwrp71SourcePackage; readonly packet: JsonObject; readonly draft: JsonObject }): JsonObject {
  return {
    review_contract: "PWRP-REVIEW-7.0.0-candidate.1",
    report_release: input.source.policy.release,
    reviewed_draft_sha256: sha256Canonical(input.draft),
    reviewed_evidence_sha256: String((input.packet as Record<string, unknown>).content_sha256),
    verdict: "accept",
    issues: [],
    summary: "Offline deterministic structural mock; not a semantic or human approval.",
  };
}

function deterministicMockTransport(input: { readonly source: Pwrp71SourcePackage; readonly packet: JsonObject; readonly reportType: ReportType; readonly getDraft: () => JsonObject | undefined; readonly setDraft: (draft: JsonObject) => void }): OpenRouterTransport {
  return {
    async generate(request: OpenRouterGenerationRequest) {
      const isReview = request.schemaName.includes("_review_candidate_1");
      let output: JsonObject;
      if (isReview) {
        const draft = input.getDraft();
        if (!draft) throw new Error("Offline review mock has no validated draft context.");
        output = mockReview({ source: input.source, packet: input.packet, draft });
      } else {
        output = mockDraft({ source: input.source, packet: input.packet, reportType: input.reportType });
        input.setDraft(output);
      }
      const generationId = `offline-${sha256(Buffer.from(request.idempotencyKey)).slice(0, 24)}`;
      const usage: OpenRouterUsage = {
        generationId,
        requestId: generationId,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        costMicros: 0,
        currency: "USD",
        model: "offline/mock",
      };
      return { ok: true, output, usage, finishReason: "stop" } satisfies OpenRouterGenerationResult;
    },
  };
}

function attemptUsage(attempts: readonly QualificationAttemptRecord[]): { reported: number; reserved: number } {
  return {
    reported: attempts.reduce((sum, item) => sum + (item.usageStatus === "reported" ? item.usage?.costMicros ?? 0 : 0), 0),
    reserved: attempts.reduce((sum, item) => sum + (item.usageStatus === "unknown" ? item.locallyEstimatedCostMicros : 0), 0),
  };
}

async function atomicWrite(target: string, contents: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
}

async function saveRun(runDirectory: string, run: Pwrp71QualificationRun): Promise<Pwrp71QualificationRun> {
  const attempts = await new FileQualificationAttemptStore(runDirectory).list();
  const usage = attemptUsage(attempts);
  const withTotals = { ...run, updatedAt: new Date().toISOString(), totalReportedCostMicros: usage.reported, reservedUnknownCostMicros: usage.reserved };
  await atomicWrite(path.join(runDirectory, "run.json"), `${JSON.stringify(withTotals, null, 2)}\n`);
  return withTotals;
}

function resultUsages(attempts: readonly QualificationAttemptRecord[], invocationPrefix: string): Pwrp71QualificationReportResult["usage"] {
  const selected = attempts.filter((attempt) => attempt.attemptId.startsWith(invocationPrefix));
  if (!selected.length) return undefined;
  const actualUsage = selected.map((attempt) => attempt.usage).filter((usage): usage is OpenRouterUsage => usage !== undefined);
  const usageStatus = selected.some((attempt) => attempt.usageStatus === "unknown") ? "unknown"
    : selected.some((attempt) => attempt.usageStatus === "mock") ? "mock" : "reported";
  return {
    status: usageStatus,
    costMicros: actualUsage.reduce((sum, usage) => sum + usage.costMicros, 0),
    inputTokens: actualUsage.reduce((sum, usage) => sum + usage.inputTokens, 0),
    outputTokens: actualUsage.reduce((sum, usage) => sum + usage.outputTokens, 0),
    reasoningTokens: actualUsage.reduce((sum, usage) => sum + usage.reasoningTokens, 0),
    totalTokens: actualUsage.reduce((sum, usage) => sum + usage.totalTokens, 0),
    attempts: selected.length,
    generationIds: actualUsage.map((usage) => usage.generationId),
  };
}

export async function runPwrp71Qualification(input: RunPwrp71QualificationOptions): Promise<Pwrp71QualificationRun> {
  const now = input.now ?? (() => new Date());
  const workspaceRoot = path.resolve(input.workspaceRoot ?? process.cwd());
  const runId = safeRunId(input.runId ?? `pwrp71-${now().toISOString().replace(/[:.]/gu, "-")}`);
  if (!Number.isSafeInteger(input.costCapMicros) || input.costCapMicros <= 0) throw new Error("PWRP 7.1 qualification requires a positive integer cost cap in micros.");
  if (!input.profileIds.length || new Set(input.profileIds).size !== input.profileIds.length) throw new Error("Select one or more unique PWRP 7.1 profiles.");
  if (!input.reportTypes.length || new Set(input.reportTypes).size !== input.reportTypes.length || input.reportTypes.some((type) => !PWRP71_QUALIFICATION_REPORT_ORDER.includes(type))) throw new Error("Select one or more unique PWRP 7.1 report types.");

  const [fixtures, questionSource, reportSource] = await Promise.all([
    input.fixtures ? Promise.resolve(input.fixtures) : loadPwrp71QualificationFixtures({ workspaceRoot }),
    input.questionSource ? Promise.resolve(input.questionSource) : loadPwqe51SourcePackage(workspaceRoot),
    input.reportSource ? Promise.resolve(input.reportSource) : loadPwrp71SourcePackage(workspaceRoot),
  ]);
  const selectedFixtures = await Promise.all(input.profileIds.map((profileId) => loadPwrp71FixturePacket({ profileId, fixtures, questionSource })));
  const outputRoot = path.resolve(input.outputRoot ?? path.join(workspaceRoot, ".qualification", "pwrp71"));
  const runDirectory = path.join(outputRoot, runId);
  await mkdir(runDirectory, { recursive: true });
  const store = new FileQualificationAttemptStore(runDirectory);
  const attemptFile = path.relative(workspaceRoot, store.attemptsPath).replaceAll("\\", "/");
  const runtimeSha = await computePwqe51RouterRuntimeSha256(workspaceRoot);
  const routeResult = input.mode === "offline"
    ? { ok: false as const, reason: "Offline mock runs do not establish router parity." }
    : validatePwrp71RoutingEvidence({ evidence: input.routingEvidence, expectedRouterRuntimeSha256: runtimeSha, fixtures: selectedFixtures, workspaceSource: questionSource });
  const blockers = input.mode === "live" && !routeResult.ok ? [routeResult.reason]
    : input.mode === "live" && !input.transport && !process.env.OPENROUTER_API_KEY ? ["OPENROUTER_API_KEY is not configured; no provider request was made."]
      : [];
  const fixtureStatuses = Object.fromEntries(selectedFixtures.map((fixture) => [fixture.profileId, fixture.fixtureStatus]));
  const sourcePins: Pwrp71QualificationRun["sourcePins"] = {
    questionRelease: PWQE51_RELEASE_IDENTITY.questionRelease,
    routerVersion: PWQE51_RELEASE_IDENTITY.routerVersion,
    questionSourceSha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
    questionSourceManifestSha256: questionSource.sourceManifestSha256,
    reportRelease: reportSource.policy.release,
    reportSourceManifestSha256: reportSource.manifestSha256,
    routerPacketSchemaSha256: questionSource.manifest.files["schemas/router_packet.schema.json"],
    reportDraftSchemaSha256: reportSource.manifest.files["schemas/report_draft.schema.json"],
    reportReviewSchemaSha256: reportSource.manifest.files["schemas/report_review.schema.json"],
    semanticCaseSetSha256: fixtures.semanticCaseSetSha256,
    semanticCasesCanonicalJsonSha256: fixtures.semanticCasesCanonicalJsonSha256,
    fixtureSetSha256: fixtures.fixtureSetSha256,
    sourceArchiveSha256: fixtures.sourceArchiveSha256,
    ...(routeResult.ok ? { routingQualificationSha256: routeResult.digest } : {}),
    routerRuntimeSha256: runtimeSha,
  };
  let routingEvidenceFile: string | undefined;
  if (routeResult.ok && input.routingEvidence) {
    routingEvidenceFile = "routing-evidence.json";
    await atomicWrite(path.join(runDirectory, routingEvidenceFile), `${JSON.stringify(input.routingEvidence, null, 2)}\n`);
  }
  const policy = structuredClone(UNQUALIFIED_MOCK_MODEL_POLICY);
  const runFingerprint = sha256Canonical({
    schemaVersion: PWRP71_QUALIFICATION_RUN_SCHEMA,
    mode: input.mode,
    profiles: selectedFixtures.map((fixture) => ({ id: fixture.profileId, fixtureStatus: fixture.fixtureStatus, packetSha256: fixture.packetSha256, evidenceSha256: fixture.packet.content_sha256 })),
    reports: input.reportTypes,
    sourcePins,
    costCapMicros: input.costCapMicros,
    candidates: QUALIFICATION_MODEL_ORDER,
    modelPolicy: policy,
  });
  const existing = await readRun(runDirectory);
  if (existing && existing.runFingerprint !== runFingerprint) throw new Error(`Run ${runId} was created with different source, fixture, report, model, or cost-cap pins; start a new run ID.`);
  let run: Pwrp71QualificationRun = existing ?? {
    schemaVersion: PWRP71_QUALIFICATION_RUN_SCHEMA,
    runId,
    mode: input.mode,
    status: blockers.length ? "blocked" : "running",
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
    runFingerprint,
    outputDirectory: runDirectory,
    attemptsFile: attemptFile,
    ...(routingEvidenceFile ? { routingEvidenceFile } : {}),
    sourcePins,
    candidatePolicy: {
      candidates: QUALIFICATION_MODEL_ORDER,
      candidatesSha256: sha256Canonical(QUALIFICATION_MODEL_ORDER),
      reportModelPolicy: policy,
      reportModelPolicySha256: sha256Canonical(policy),
    },
    costCapMicros: input.costCapMicros,
    totalReportedCostMicros: 0,
    reservedUnknownCostMicros: 0,
    selectedProfiles: input.profileIds,
    selectedReports: input.reportTypes,
    fixtureStatuses,
    routeParity: routeResult.ok ? "qualified" : "pending",
    blockers,
    results: [],
  };
  if (blockers.length) return saveRun(runDirectory, run);

  const selectedProvider = input.mode === "offline"
    ? undefined
    : input.transport ?? new OpenRouterClient();
  const priorResults = new Map(run.results.map((result) => [`${result.profileId}:${result.reportType}`, result]));
  const results = [...run.results];
  for (const fixture of selectedFixtures) {
    if (fixture.issues.length) {
      for (const reportType of input.reportTypes) {
        const key = `${fixture.profileId}:${reportType}`;
        if (!priorResults.has(key)) results.push({
          profileId: fixture.profileId,
          reportType,
          status: "blocked",
          fixtureStatus: fixture.fixtureStatus,
          packetSha256: fixture.packetSha256,
          evidenceSha256: String(fixture.packet.content_sha256 ?? ""),
          reportSourceManifestSha256: reportSource.manifestSha256,
          requestedModel: policy[reportType].model,
          reasoningEffort: policy[reportType].reasoningEffort,
          failure: { code: "fixture_packet_invalid", message: `${fixture.profileId} does not validate as a report qualification packet.`, issues: fixture.issues },
        });
      }
      run = await saveRun(runDirectory, { ...run, results });
      continue;
    }

    const acceptedDrafts = new Map<ReportType, JsonObject>();
    for (const reportType of input.reportTypes) {
      const key = `${fixture.profileId}:${reportType}`;
      const previous = priorResults.get(key);
      if (previous?.status === "accepted" && previous.artifactFile) {
        try {
          const saved = JSON.parse(await readFile(path.join(runDirectory, previous.artifactFile), "utf8")) as Pwrp71ReportArtifact;
          acceptedDrafts.set(reportType, saved.draft as unknown as JsonObject);
          continue;
        } catch { /* an incomplete or changed output is regenerated from its cached provider attempts */ }
      }
      const acceptedLayers = reportType === "SYNTHESIS" ? Object.fromEntries(["IFS", "PV", "ATT"].map((layer) => [layer, acceptedDrafts.get(layer as ReportType)]).filter((entry): entry is [string, JsonObject] => Boolean(entry[1]))) : undefined;
      if (reportType === "SYNTHESIS" && (!acceptedLayers || Object.keys(acceptedLayers).length !== 3)) {
        const blocked: Pwrp71QualificationReportResult = {
          profileId: fixture.profileId, reportType, status: "blocked", fixtureStatus: fixture.fixtureStatus,
          packetSha256: fixture.packetSha256, evidenceSha256: String(fixture.packet.content_sha256),
          reportSourceManifestSha256: reportSource.manifestSha256,
          requestedModel: policy[reportType].model, reasoningEffort: policy[reportType].reasoningEffort,
          failure: { code: "synthesis_layer_dependency", message: "Synthesis requires accepted same-profile IFS, PV, and ATT outputs.", issues: [] },
        };
        results.push(blocked); priorResults.set(key, blocked);
        run = await saveRun(runDirectory, { ...run, results });
        continue;
      }
      const prepared = preparePwrp71Request({ packet: fixture.packet, reportType, questionSource, reportSource, ...(acceptedLayers ? { acceptedLayers } : {}) });
      if (!prepared.ok) {
        const blocked: Pwrp71QualificationReportResult = {
          profileId: fixture.profileId, reportType, status: "blocked", fixtureStatus: fixture.fixtureStatus,
          packetSha256: fixture.packetSha256, evidenceSha256: String(fixture.packet.content_sha256),
          reportSourceManifestSha256: reportSource.manifestSha256,
          requestedModel: policy[reportType].model, reasoningEffort: policy[reportType].reasoningEffort,
          validationIssues: prepared.issues,
          failure: { code: "pwrp71_input_binding", message: "PWRP 7.1 request preparation failed its full source/packet/layer checks.", issues: prepared.issues },
        };
        results.push(blocked); priorResults.set(key, blocked);
        run = await saveRun(runDirectory, { ...run, results });
        continue;
      }

      let currentDraft: JsonObject | undefined;
      const baseTransport = input.mode === "offline"
        ? deterministicMockTransport({ source: reportSource, packet: fixture.packet, reportType, getDraft: () => currentDraft, setDraft: (draft) => { currentDraft = draft; } })
        : selectedProvider!;
      const invocationKey = `pwrp71-qualification:${runId}:${fixture.profileId}`;
      const invocationPrefix = `${invocationKey}:${reportType}:`;
      const attemptsBefore = await store.list();
      const spentBeforeThisReport = attemptsBefore.filter((attempt) => !attempt.attemptId.startsWith(invocationPrefix)).reduce((sum, attempt) => sum + (attempt.usage?.costMicros ?? (attempt.status === "unknown" ? attempt.locallyEstimatedCostMicros : 0)), 0);
      const provider = new JournaledPwrp71Transport({
        store,
        transport: baseTransport,
        costCapMicros: input.costCapMicros,
        usageStatus: input.mode === "offline" ? "mock" : "reported",
        now,
        onResult: (request, result) => {
          if (!request.schemaName.includes("_review_candidate_1") && result.ok) currentDraft = structuredClone(result.output);
        },
      });
      const generated = await generateCanonicalReport({
        reportType,
        input: {},
        packets: [fixture.packet],
        provider,
        invocationKey,
        spentMicros: spentBeforeThisReport,
        costCapMicros: input.costCapMicros,
        modelPolicy: policy,
        contractVersion: "v7.1",
        pwrp71: { request: prepared.value, packet: fixture.packet, source: reportSource },
        onPwrp71Event: async (event) => {
          await store.recordGenerationEvent(event);
        },
      });
      const attempts = await store.list();
      const usage = resultUsages(attempts, invocationPrefix);
      if (!generated.ok) {
        const failed: Pwrp71QualificationReportResult = {
          profileId: fixture.profileId, reportType, status: "failed", fixtureStatus: fixture.fixtureStatus,
          packetSha256: fixture.packetSha256, evidenceSha256: String(fixture.packet.content_sha256),
          reportSourceManifestSha256: reportSource.manifestSha256,
          requestedModel: policy[reportType].model, reasoningEffort: policy[reportType].reasoningEffort,
          validationIssues: generated.failure.issues,
          reviewerReceipts: attempts.filter((attempt) => attempt.attemptId.startsWith(invocationPrefix) && attempt.reviewReceipt).map((attempt) => attempt.reviewReceipt as unknown as JsonObject),
          ...(usage ? { usage } : {}),
          failure: { code: generated.failure.code, message: generated.failure.message, issues: generated.failure.issues },
        };
        const existingIndex = results.findIndex((result) => result.profileId === fixture.profileId && result.reportType === reportType);
        if (existingIndex >= 0) results[existingIndex] = failed; else results.push(failed);
        priorResults.set(key, failed);
        run = await saveRun(runDirectory, { ...run, status: "running", results });
        continue;
      }
      const artifact = generated.value.artifact as Pwrp71ReportArtifact;
      const artifactRelative = `reports/${fixture.profileId}_${reportType}.json`;
      const markdownRelative = `reports/${fixture.profileId}_${reportType}.md`;
      await atomicWrite(path.join(runDirectory, artifactRelative), `${JSON.stringify(artifact, null, 2)}\n`);
      await atomicWrite(path.join(runDirectory, markdownRelative), artifact.report_markdown);
      const outputAttempts = attempts.filter((attempt) => attempt.attemptId.startsWith(invocationPrefix));
      const receipts = outputAttempts.filter((attempt) => attempt.reviewReceipt).map((attempt) => attempt.reviewReceipt as unknown as JsonObject);
      const reportResult: Pwrp71QualificationReportResult = {
        profileId: fixture.profileId,
        reportType,
        status: "accepted",
        fixtureStatus: fixture.fixtureStatus,
        packetSha256: fixture.packetSha256,
        evidenceSha256: artifact.evidence_sha256,
        reportSourceManifestSha256: reportSource.manifestSha256,
        requestedModel: policy[reportType].model,
        reasoningEffort: policy[reportType].reasoningEffort,
        artifactFile: artifactRelative,
        markdownFile: markdownRelative,
        artifactSha256: artifact.digests.artifact_sha256,
        markdownSha256: artifact.digests.report_markdown_sha256,
        validationIssues: [],
        reviewerReceipts: receipts,
        ...(usage ? { usage } : {}),
      };
      const existingIndex = results.findIndex((result) => result.profileId === fixture.profileId && result.reportType === reportType);
      if (existingIndex >= 0) results[existingIndex] = reportResult; else results.push(reportResult);
      priorResults.set(key, reportResult);
      acceptedDrafts.set(reportType, artifact.draft as unknown as JsonObject);
      run = await saveRun(runDirectory, { ...run, status: "running", results });
    }
  }

  const attempts = await store.list();
  const hadFailures = results.some((result) => result.status === "failed");
  const hadBlockers = results.some((result) => result.status === "blocked");
  const status: Pwrp71QualificationRun["status"] = hadFailures ? "failed" : hadBlockers ? "blocked" : input.mode === "offline" ? "offline_complete" : "pending_human_review";
  const finalized: Pwrp71QualificationRun = { ...run, status, results };
  const qualificationRunSha256 = computePwrp71QualificationRunSha256({ runFingerprint, results }, attempts);
  const complete = await saveRun(runDirectory, { ...finalized, qualificationRunSha256 });
  return complete;
}

async function readRun(runDirectory: string): Promise<Pwrp71QualificationRun | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path.join(runDirectory, "run.json"), "utf8")) as Pwrp71QualificationRun;
    if (parsed.schemaVersion !== PWRP71_QUALIFICATION_RUN_SCHEMA || !Array.isArray(parsed.results)) throw new Error("PWRP 7.1 run file has an invalid schema.");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function readPwrp71QualificationRun(runId: string, outputRoot = path.join(process.cwd(), ".qualification", "pwrp71")): Promise<Pwrp71QualificationRun> {
  const runDirectory = path.join(path.resolve(outputRoot), safeRunId(runId));
  const run = await readRun(runDirectory);
  if (!run) throw new Error(`PWRP 7.1 qualification run ${runId} was not found.`);
  return run;
}

export async function readPwrp71QualificationAttempts(run: Pwrp71QualificationRun): Promise<readonly QualificationAttemptRecord[]> {
  return new FileQualificationAttemptStore(run.outputDirectory).list();
}

export function offlineAttemptUsage(): OpenRouterUsage {
  return { generationId: "offline/mock", inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, costMicros: 0, currency: "USD", model: "offline/mock" };
}
