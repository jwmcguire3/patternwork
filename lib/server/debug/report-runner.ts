import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../prisma.ts";
import { loadPwqe51SourcePackage, PWQE51_RELEASE_IDENTITY } from "../../question-engine/pwqe51-source.ts";
import type { JsonObject, ReportType } from "../../question-engine/types.ts";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import { OPENROUTER_SITE_MODEL, QUALIFICATION_MODEL_ORDER, UNQUALIFIED_MOCK_MODEL_POLICY } from "../openrouter/policy.ts";
import { OpenRouterClient } from "../openrouter/client.ts";
import { generateCanonicalReport, type Pwrp71GenerationEvent } from "../reports/generator.ts";
import { preparePwrp71Request } from "../reports/pwrp71-adapter.ts";
import { loadPwrp71SourcePackage } from "../reports/pwrp71-source.ts";
import type { Pwrp71ReportArtifact } from "../reports/pwrp71-validation.ts";
import { loadPwrp71FixturePacket } from "../reports/qualification/replay.ts";
import { loadPwrp71QualificationFixtures } from "../reports/qualification/fixtures.ts";
import type { Pwqe51RouterQualificationEvidence } from "../reports/qualification/runner.ts";

export type DebugReportMode = "mapping" | "ifs" | "pv" | "att" | "deepening" | "all";
export type DebugReportPhase = "PREPARING" | "MAP" | "IFS" | "PV" | "ATT" | "SYNTHESIS" | "COMPLETE";
export const DEBUG_REPORT_MODES: readonly DebugReportMode[] = ["mapping", "ifs", "pv", "att", "deepening", "all"];
export const DEBUG_PROFILE_IDS: readonly string[] = [
  ...Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`),
];

const ROUTER_EVIDENCE_ENV = "PWQE51_ROUTING_QUALIFICATION_EVIDENCE_JSON";
const ROUTER_IMPLEMENTATION_FILES = [
  "lib/server/assessment/pwqe51-router.ts",
  "lib/server/assessment/pwqe51-coverage.ts",
  "lib/server/assessment/pwqe51-flags.ts",
  "lib/server/reports/pwqe51-packet.ts",
] as const;
const ROUTER_EVIDENCE_VERSION = "pwqe51-routing-qualification-1";

export interface DebugReportRunInput {
  readonly runId: string;
  readonly profileId: string;
  readonly mode: DebugReportMode;
}

export interface DebugReportResult {
  readonly reportType: ReportType;
  readonly title: string;
  readonly reportMarkdown: string;
  readonly draft: JsonObject;
  readonly reviewerReceipts: readonly JsonObject[];
  readonly sourcePins: { readonly questionSourceManifestSha256: string; readonly reportSourceManifestSha256: string; readonly packetSha256: string; readonly routingQualificationSha256: string };
  readonly usage: {
    readonly model: string;
    readonly costMicros: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly reasoningTokens: number;
    readonly totalTokens: number;
    readonly attempts: number;
    readonly generationIds: readonly string[];
  };
}

export interface DebugProfileAvailability {
  readonly id: string;
  readonly title: string;
  readonly eligible: boolean;
  readonly status: "pending_router_qualification" | "eligible";
  readonly reason?: string;
}

export function selectDebugReports(mode: DebugReportMode): readonly ReportType[] {
  if (mode === "mapping") return ["MAP"];
  if (mode === "ifs") return ["IFS"];
  if (mode === "pv") return ["PV"];
  if (mode === "att") return ["ATT"];
  if (mode === "deepening") return ["IFS", "PV", "ATT"];
  return ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"];
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function isDebugReportResult(value: unknown): value is DebugReportResult {
  const result = object(value);
  const usage = object(result?.usage);
  const pins = object(result?.sourcePins);
  const digest = /^[a-f0-9]{64}$/u;
  return Boolean(result
    && ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"].includes(String(result.reportType))
    && typeof result.title === "string"
    && typeof result.reportMarkdown === "string"
    && object(result.draft)
    && Array.isArray(result.reviewerReceipts) && result.reviewerReceipts.every((receipt) => Boolean(object(receipt)))
    && pins && digest.test(String(pins.questionSourceManifestSha256)) && digest.test(String(pins.reportSourceManifestSha256))
    && digest.test(String(pins.packetSha256)) && digest.test(String(pins.routingQualificationSha256))
    && usage && typeof usage.model === "string"
    && [usage.costMicros, usage.inputTokens, usage.outputTokens, usage.reasoningTokens, usage.totalTokens, usage.attempts].every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0)
    && Array.isArray(usage.generationIds) && usage.generationIds.every((id) => typeof id === "string"));
}

function costCapMicros(): number {
  const dollars = Number(process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD);
  if (!Number.isFinite(dollars) || dollars <= 0) throw new Error("debug_cost_cap_not_configured");
  return Math.floor(dollars * 1_000_000);
}

async function routerRuntimeDigest(workspaceRoot: string): Promise<string> {
  const files: Record<string, string> = {};
  for (const relative of ROUTER_IMPLEMENTATION_FILES) {
    files[relative] = createHash("sha256").update(await readFile(path.join(workspaceRoot, relative))).digest("hex");
  }
  return sha256Canonical(files);
}

function parseRoutingEvidence(): Pwqe51RouterQualificationEvidence | undefined {
  const raw = process.env[ROUTER_EVIDENCE_ENV];
  if (!raw) return undefined;
  try { return JSON.parse(raw) as Pwqe51RouterQualificationEvidence; }
  catch { return undefined; }
}

async function resolveQualifiedProfile(profileId: string) {
  if (!DEBUG_PROFILE_IDS.includes(profileId)) throw new Error("debug_profile_not_found");
  const workspaceRoot = process.cwd();
  const [fixtures, questionSource, reportSource] = await Promise.all([
    loadPwrp71QualificationFixtures({ workspaceRoot }),
    loadPwqe51SourcePackage(workspaceRoot),
    loadPwrp71SourcePackage(workspaceRoot),
  ]);
  const fixture = await loadPwrp71FixturePacket({ profileId, fixtures, questionSource });
  const evidence = parseRoutingEvidence();
  if (!evidence) throw new Error(`debug_router_qualification_pending:${profileId}:Set ${ROUTER_EVIDENCE_ENV} to final PWQE 5.1 routing qualification evidence.`);
  const runtimeSha = await routerRuntimeDigest(workspaceRoot);
  const evidenceFixtures = Array.isArray(evidence.fixtures) ? evidence.fixtures : [];
  const fixtureIds = evidenceFixtures.map((entry) => object(entry)?.profileId);
  if (evidence.manifestVersion !== ROUTER_EVIDENCE_VERSION || evidence.status !== "qualified"
    || evidence.questionRelease !== PWQE51_RELEASE_IDENTITY.questionRelease
    || evidence.routerVersion !== PWQE51_RELEASE_IDENTITY.routerVersion
    || evidence.questionSourceSha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || evidence.questionSourceManifestSha256 !== questionSource.sourceManifestSha256
    || evidence.routerRuntimeSha256 !== runtimeSha
    || !/^[a-f0-9]{64}$/u.test(evidence.qualificationRunSha256)
    || !/^[a-f0-9]{40,64}$/u.test(evidence.verifiedCommit)
    || !Array.isArray(evidence.fixtures)
    || evidenceFixtures.some((entry) => {
      const fixture = object(entry);
      return !fixture || typeof fixture.profileId !== "string" || fixture.status !== "passed" || !/^[a-f0-9]{64}$/u.test(String(fixture.packetSha256));
    })
    || new Set(fixtureIds).size !== fixtureIds.length) {
    throw new Error(`debug_router_qualification_pending:${profileId}:Routing evidence does not bind the current PWQE 5.1 source and router.`);
  }
  const qualified = evidence.fixtures.find((entry) => entry.profileId === profileId);
  if (!qualified || qualified.status !== "passed" || qualified.packetSha256 !== fixture.packetSha256) {
    throw new Error(`debug_router_qualification_pending:${profileId}:This exact profile packet has not passed routing qualification.`);
  }
  if (fixture.issues.length) throw new Error(`debug_profile_packet_invalid:${profileId}`);
  return { fixture, fixtures, questionSource, reportSource, routingQualificationSha256: sha256Canonical(evidence) };
}

export async function assertDebugProfileEligible(profileId: string): Promise<void> {
  await resolveQualifiedProfile(profileId);
}

export async function listDebugProfileAvailability(): Promise<DebugProfileAvailability[]> {
  const evidence = parseRoutingEvidence();
  if (!evidence) {
    let titles = new Map<string, string>();
    try {
      const fixtures = await loadPwrp71QualificationFixtures();
      titles = new Map([
        ...fixtures.profiles.map((profile) => [profile.id, profile.title] as const),
        ...fixtures.coverageCandidates.map((candidate) => [candidate.id, `${candidate.id} candidate packet archive`] as const),
      ]);
    } catch { /* expose IDs with pending status if fixture files are unavailable */ }
    return DEBUG_PROFILE_IDS.map((id) => ({
      id,
      title: titles.get(id) ?? id,
      eligible: false,
      status: "pending_router_qualification",
      reason: `Set ${ROUTER_EVIDENCE_ENV} to final PWQE 5.1 routing qualification evidence.`,
    }));
  }
  const entries = await Promise.all(DEBUG_PROFILE_IDS.map(async (id): Promise<DebugProfileAvailability> => {
    try {
      const resolved = await resolveQualifiedProfile(id);
      return { id, title: resolved.fixture.title, eligible: true, status: "eligible" };
    } catch (error) {
      let title = id;
      try {
        const fixtures = await loadPwrp71QualificationFixtures();
        title = fixtures.profiles.find((profile) => profile.id === id)?.title
          ?? (fixtures.coverageCandidates.some((candidate) => candidate.id === id) ? `${id} candidate packet archive` : undefined)
          ?? id;
      } catch { /* profile stays unavailable if source fixtures are missing */ }
      const reason = error instanceof Error ? error.message.replace(/^debug_router_qualification_pending:[^:]+:/u, "") : "Routing qualification is pending.";
      return { id, title, eligible: false, status: "pending_router_qualification", reason };
    }
  }));
  return entries;
}

async function generateDebugDraft(input: {
  readonly runId: string;
  readonly reportType: ReportType;
  readonly profileId: string;
  readonly layerReports: readonly DebugReportResult[];
  readonly spentMicros: number;
}): Promise<DebugReportResult> {
  const resolved = await resolveQualifiedProfile(input.profileId);
  const target = QUALIFICATION_MODEL_ORDER[0];
  if (target.model !== OPENROUTER_SITE_MODEL || target.reasoningEffort !== "max") throw new Error("debug_model_configuration_mismatch");
  const packet = resolved.fixture.packet;
  const acceptedLayers = input.reportType === "SYNTHESIS"
    ? Object.fromEntries(["IFS", "PV", "ATT"].map((type) => {
      const layer = input.layerReports.find((report) => report.reportType === type);
      if (!layer) throw new Error(`debug_synthesis_input_missing_${type.toLowerCase()}`);
      return [type, layer.draft];
    })) as Readonly<Record<string, JsonObject>>
    : undefined;
  const prepared = preparePwrp71Request({ packet, reportType: input.reportType, questionSource: resolved.questionSource, reportSource: resolved.reportSource, acceptedLayers });
  if (!prepared.ok) throw new Error(`debug_pwrp71_input_invalid:${prepared.issues.slice(0, 5).map((entry) => entry.code).join(",")}`);
  const events: Pwrp71GenerationEvent[] = [];
  const result = await generateCanonicalReport({
    reportType: input.reportType,
    input: prepared.value.user_data,
    packets: [packet],
    provider: new OpenRouterClient(),
    invocationKey: `patternwork-debug-pwrp71:${input.runId}`,
    spentMicros: input.spentMicros,
    costCapMicros: costCapMicros(),
    modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1",
    pwrp71: { request: prepared.value, packet, source: resolved.reportSource },
    onPwrp71Event: (event) => { events.push(event); },
  });
  if (!result.ok) throw new Error(`debug_${result.failure.code}:${result.failure.message}`);
  const artifact = result.value.artifact as Pwrp71ReportArtifact;
  const aggregate = result.value.usage;
  if (aggregate.model !== OPENROUTER_SITE_MODEL) throw new Error("debug_actual_model_mismatch");
  return {
    reportType: input.reportType,
    title: artifact.draft.title,
    reportMarkdown: artifact.report_markdown,
    draft: artifact.draft,
    reviewerReceipts: events.filter((event) => event.type === "review_receipt").map((event) => event.receipt),
    sourcePins: {
      questionSourceManifestSha256: resolved.questionSource.sourceManifestSha256,
      reportSourceManifestSha256: resolved.reportSource.manifestSha256,
      packetSha256: resolved.fixture.packetSha256,
      routingQualificationSha256: resolved.routingQualificationSha256,
    },
    usage: {
      model: aggregate.model,
      costMicros: aggregate.costMicros,
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      reasoningTokens: aggregate.reasoningTokens,
      totalTokens: aggregate.totalTokens,
      attempts: aggregate.attempts,
      generationIds: aggregate.generationIds,
    },
  };
}

function reportList(value: unknown): DebugReportResult[] {
  return Array.isArray(value) ? value.filter(isDebugReportResult) : [];
}

async function updateRunProgress(input: {
  readonly runId: string;
  readonly phase: DebugReportPhase;
  readonly progressNote: string;
  readonly status?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  readonly resultJson?: JsonObject[];
  readonly totalCostMicros?: number;
  readonly failureCode?: string | null;
}): Promise<void> {
  await prisma.patternworkDebugReportRun.update({
    where: { id: input.runId },
    data: {
      phase: input.phase,
      progressNote: input.progressNote,
      ...(input.status ? { status: input.status } : {}),
      ...(input.resultJson ? { resultJson: input.resultJson as unknown as object } : {}),
      ...(input.totalCostMicros !== undefined ? { totalCostMicros: BigInt(input.totalCostMicros) } : {}),
      ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
      heartbeatAt: new Date(),
      ...(input.status === "SUCCEEDED" || input.status === "FAILED" ? { completedAt: new Date() } : {}),
    },
  });
}

export async function startDebugReportRunStep(runId: string): Promise<void> {
  "use step";
  await updateRunProgress({ runId, phase: "PREPARING", progressNote: "Loading the fictional profile packet.", status: "RUNNING" });
}

export async function generateDebugReportStep(input: DebugReportRunInput & {
  readonly reportType: ReportType;
  readonly layerReports: readonly DebugReportResult[];
  readonly spentMicros: number;
}): Promise<DebugReportResult> {
  "use step";
  await updateRunProgress({ runId: input.runId, phase: input.reportType, progressNote: `Generating the ${input.reportType} draft with GPT-6 Luna · max.` });
  const result = await generateDebugDraft({
    runId: input.runId,
    reportType: input.reportType,
    profileId: input.profileId,
    layerReports: input.layerReports,
    spentMicros: input.spentMicros,
  });
  const current = await prisma.patternworkDebugReportRun.findUniqueOrThrow({ where: { id: input.runId }, select: { resultJson: true } });
  const priorResults = reportList(current.resultJson);
  const results = [...priorResults.filter((entry) => entry.reportType !== result.reportType), result];
  const totalCostMicros = results.reduce((sum, entry) => sum + entry.usage.costMicros, 0);
  await updateRunProgress({
    runId: input.runId,
    phase: input.reportType,
    progressNote: `${input.reportType} draft validated.`,
    resultJson: results as unknown as JsonObject[],
    totalCostMicros,
  });
  return result;
}
generateDebugReportStep.maxRetries = 0;

export async function finishDebugReportRunStep(runId: string): Promise<void> {
  "use step";
  await updateRunProgress({ runId, phase: "COMPLETE", progressNote: "All selected report drafts are ready.", status: "SUCCEEDED" });
}

export async function failDebugReportRunStep(input: { readonly runId: string; readonly failureCode: string }): Promise<void> {
  "use step";
  await updateRunProgress({
    runId: input.runId,
    phase: "COMPLETE",
    progressNote: "The report run stopped. You can review completed drafts and start another run.",
    status: "FAILED",
    failureCode: input.failureCode.slice(0, 80),
  });
}
