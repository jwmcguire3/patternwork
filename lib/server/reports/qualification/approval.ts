import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import type { ReportType } from "../../../question-engine/types.ts";
import { loadPwqe51SourcePackage, PWQE51_RELEASE_IDENTITY } from "../../../question-engine/pwqe51-source.ts";
import { sha256Canonical, sha256Text } from "../../../report-contracts/delivery-validator.ts";
import { QUALIFICATION_MODEL_ORDER } from "../../openrouter/policy.ts";
import { validatePwrp71ReportDraft, type Pwrp71ReportArtifact } from "../pwrp71-validation.ts";
import { validatePwrp71Review } from "../pwrp71-review.ts";
import { assertPwrp71ReportActivationReady, PWRP71_SEMANTIC_CASE_SET_SHA256, type ReviewedPwrp71QualificationManifest } from "../pwrp71-readiness.ts";
import { loadPwrp71SourcePackage, type Pwrp71SourcePackage } from "../pwrp71-source.ts";
import { loadPwrp71QualificationFixtures, type Pwrp71QualificationFixtures } from "./fixtures.ts";
import { loadPwrp71FixturePacket, type Pwrp71FixturePacket } from "./replay.ts";
import {
  computePwrp71QualificationRunSha256,
  computePwqe51RouterRuntimeSha256,
  readPwrp71QualificationAttempts,
  readPwrp71QualificationRun,
  validatePwrp71RoutingEvidence,
  type Pwrp71QualificationReportResult,
  type Pwrp71QualificationRun,
  type Pwqe51RouterQualificationEvidence,
} from "./runner.ts";
import type { QualificationAttemptRecord } from "./attempt-store.ts";

export const PWRP71_SEMANTIC_REVIEW_EVIDENCE_VERSION = "pwrp71-semantic-review-evidence-1" as const;
export const PWRP71_APPROVAL_INPUT_VERSION = "pwrp71-approval-input-1" as const;
const REPORT_TYPES = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const satisfies readonly ReportType[];
const PROFILE_IDS = [...Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`), ...Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`)];
const DIGEST = /^[a-f0-9]{64}$/u;
const RFC3339_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/u;

function isRfc3339DateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = RFC3339_DATETIME.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText ? Number(offsetHourText) : 0;
  const offsetMinute = offsetMinuteText ? Number(offsetMinuteText) : 0;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 ? (leapYear ? 29 : 28)
    : [4, 6, 9, 11].includes(month) ? 30
      : month >= 1 && month <= 12 ? 31 : 0;
  return day >= 1 && day <= daysInMonth
    && hour <= 23 && minute <= 59 && second <= 59
    && offsetHour <= 23 && offsetMinute <= 59
    && !Number.isNaN(Date.parse(value));
}

export interface Pwrp71SemanticReviewEvidence {
  readonly schemaVersion: typeof PWRP71_SEMANTIC_REVIEW_EVIDENCE_VERSION;
  readonly qualificationRunSha256: string;
  readonly semanticCaseSetSha256: string;
  readonly fixtureSetSha256: string;
  readonly sourcePinsSha256: string;
  readonly draftPinsSha256: string;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  readonly cases: readonly {
    readonly id: string;
    readonly verdict: "pass" | "fail";
    readonly reportRefs: readonly { readonly profileId: string; readonly reportType: ReportType; readonly artifactSha256: string }[];
    readonly notes: string;
  }[];
}

export interface Pwrp71ApprovalInput {
  readonly status: "approved";
  readonly qualificationRunSha256: string;
  readonly providerQualificationEvidenceSha256: string;
  readonly semanticApprovalEvidenceSha256: string;
  readonly draftPinsSha256: string;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  readonly checklist: {
    readonly allOutputsReviewed: true;
    readonly overreachAndOmissionReviewed: true;
    readonly sourceAndLineageReviewed: true;
    readonly pinsApproved: true;
  };
}

export interface Pwrp71ProviderQualificationEvidence {
  readonly schemaVersion: "pwrp71-provider-qualification-evidence-1";
  readonly qualificationRunSha256?: string;
  readonly runFingerprint: string;
  readonly sourcePins: Pwrp71QualificationRun["sourcePins"];
  readonly candidatePolicy: Pwrp71QualificationRun["candidatePolicy"];
  readonly selectedProfiles: readonly string[];
  readonly selectedReports: readonly ReportType[];
  readonly costCapMicros: number;
  readonly totalReportedCostMicros: number;
  readonly outputs: readonly {
    readonly profileId: string;
    readonly reportType: ReportType;
    readonly artifactSha256: string;
    readonly markdownSha256: string;
    readonly usage?: Pwrp71QualificationReportResult["usage"];
    readonly reviewerReceipts: readonly unknown[];
  }[];
  readonly attempts: readonly Record<string, unknown>[];
}

export interface Pwrp71PendingReviewPackage {
  readonly schemaVersion: "pwrp71-pending-review-package-1";
  readonly status: "pending_human_review" | "not_eligible_for_review";
  readonly approvalEligible: boolean;
  readonly runId: string;
  readonly runStatus: Pwrp71QualificationRun["status"];
  readonly qualificationRunSha256?: string;
  readonly providerQualificationEvidenceSha256: string;
  readonly semanticCaseSetSha256: string;
  readonly fixtureSetSha256: string;
  readonly draftPinsSha256: string;
  readonly sourcePinsSha256: string;
  readonly sourcePins: Pwrp71QualificationRun["sourcePins"];
  readonly modelPins: Readonly<Record<ReportType, unknown>>;
  readonly modelPinsSha256: string;
  readonly candidateOrderSha256: string;
  readonly cost: { readonly capMicros: number; readonly reportedMicros: number; readonly reservedUnknownMicros: number };
  readonly profileCoverage: { readonly required: readonly string[]; readonly selected: readonly string[]; readonly missing: readonly string[] };
  readonly reportCoverage: { readonly required: readonly ReportType[]; readonly selected: readonly ReportType[]; readonly missing: readonly ReportType[] };
  readonly outputs: readonly {
    readonly profileId: string;
    readonly reportType: ReportType;
    readonly status: Pwrp71QualificationReportResult["status"];
    readonly artifactPath?: string;
    readonly markdownPath?: string;
    readonly artifactSha256?: string;
    readonly markdownSha256?: string;
    readonly reviewerReceipts: readonly unknown[];
    readonly usage?: Pwrp71QualificationReportResult["usage"];
    readonly failure?: Pwrp71QualificationReportResult["failure"];
  }[];
  readonly unresolvedCases: readonly { readonly id: string; readonly status: "pending_semantic_review"; readonly requiredPlanIds: readonly string[]; readonly supportedDistinction: string; readonly guardAgainst: string }[];
  readonly semanticChecklist: readonly { readonly id: string; readonly status: "pending"; readonly instruction: string }[];
  readonly blockers: readonly string[];
  readonly approvalInputSchema: string;
  readonly semanticReviewEvidenceSchema: string;
  readonly expectedApprovalBindings: {
    readonly qualificationRunSha256?: string;
    readonly providerQualificationEvidenceSha256: string;
    readonly draftPinsSha256: string;
    readonly semanticCaseSetSha256: string;
  };
}

export class Pwrp71ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Pwrp71ApprovalError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = [...expected].sort();
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function safeRelativeFile(runDirectory: string, relative: string | undefined): string {
  if (!relative || path.isAbsolute(relative)) throw new Pwrp71ApprovalError("A qualification output path is missing or absolute.");
  const resolved = path.resolve(runDirectory, relative);
  if (!resolved.startsWith(`${path.resolve(runDirectory)}${path.sep}`)) throw new Pwrp71ApprovalError("A qualification output path escapes its run directory.");
  return resolved;
}

function modelPinsForRun(run: Pwrp71QualificationRun): ReviewedPwrp71QualificationManifest["pins"] {
  return Object.fromEntries(REPORT_TYPES.map((reportType) => {
    const pin = run.candidatePolicy.reportModelPolicy[reportType];
    const tier = QUALIFICATION_MODEL_ORDER[pin.pinnedTier];
    const escalation = QUALIFICATION_MODEL_ORDER[pin.escalationTier];
    if (!tier || !escalation || tier.model !== pin.model || tier.reasoningEffort !== pin.reasoningEffort
      || escalation.model !== pin.escalationModel || escalation.reasoningEffort !== pin.escalationReasoningEffort) {
      throw new Pwrp71ApprovalError(`The ${reportType} provider model pin no longer matches the candidate policy.`);
    }
    return [reportType, {
      tier: tier.name,
      model: pin.model,
      reasoningEffort: pin.reasoningEffort,
      escalationTier: escalation.name,
      escalationModel: pin.escalationModel,
      escalationReasoningEffort: pin.escalationReasoningEffort,
      maxOutputTokens: pin.maxOutputTokens,
    }];
  })) as ReviewedPwrp71QualificationManifest["pins"];
}

function providerEvidence(run: Pwrp71QualificationRun, attempts: readonly QualificationAttemptRecord[]): Pwrp71ProviderQualificationEvidence {
  return {
    schemaVersion: "pwrp71-provider-qualification-evidence-1",
    ...(run.qualificationRunSha256 ? { qualificationRunSha256: run.qualificationRunSha256 } : {}),
    runFingerprint: run.runFingerprint,
    sourcePins: run.sourcePins,
    candidatePolicy: run.candidatePolicy,
    selectedProfiles: run.selectedProfiles,
    selectedReports: run.selectedReports,
    costCapMicros: run.costCapMicros,
    totalReportedCostMicros: run.totalReportedCostMicros,
    outputs: run.results.map((result) => ({
      profileId: result.profileId,
      reportType: result.reportType,
      artifactSha256: result.artifactSha256 ?? "",
      markdownSha256: result.markdownSha256 ?? "",
      ...(result.usage ? { usage: result.usage } : {}),
      reviewerReceipts: result.reviewerReceipts ?? [],
    })),
    attempts: attempts.map(({ providerResult, ...record }) => ({
      ...record,
      ...(providerResult ? { providerResultSha256: sha256Canonical(providerResult) } : {}),
    })),
  };
}

export function pwrp71ProviderQualificationEvidenceSha256(evidence: Pwrp71ProviderQualificationEvidence): string {
  return sha256Canonical(evidence);
}

function approvalBlockers(run: Pwrp71QualificationRun, fixtures: Pwrp71QualificationFixtures, outputIssues: readonly string[]): string[] {
  const blockers = [...outputIssues];
  if (run.mode !== "live") blockers.push("Offline structural runs cannot qualify a provider or produce an activation manifest.");
  if (run.status !== "pending_human_review") blockers.push(`Run status ${run.status} is not a completed live qualification pending human review.`);
  if (run.routeParity !== "qualified" || !run.sourcePins.routingQualificationSha256) blockers.push("Final PWQE 5.1 routing parity evidence is not pinned to this run.");
  if (!validDigest(run.qualificationRunSha256)) blockers.push("Qualification run digest is missing or malformed.");
  const missingProfiles = PROFILE_IDS.filter((id) => !run.selectedProfiles.includes(id));
  if (missingProfiles.length) blockers.push(`Full fixture coverage is incomplete; missing profiles: ${missingProfiles.join(", ")}.`);
  const missingReports = REPORT_TYPES.filter((type) => !run.selectedReports.includes(type));
  if (missingReports.length) blockers.push(`Full five-report coverage is incomplete; missing reports: ${missingReports.join(", ")}.`);
  if (fixtures.profiles.length !== 9 || fixtures.coverageCandidates.length !== 16) blockers.push("The full authored P01–P09 and candidate C01–C16 fixture set is unavailable.");
  if (run.reservedUnknownCostMicros > 0) blockers.push("At least one provider attempt has unknown usage and remains reserved against the cost cap.");
  if (run.totalReportedCostMicros > run.costCapMicros) blockers.push("Reported cost exceeds the configured qualification cost cap.");
  return blockers;
}

function attemptQualityIssues(run: Pwrp71QualificationRun, attempts: readonly QualificationAttemptRecord[]): string[] {
  const issues: string[] = [];
  const byReport = new Map<string, QualificationAttemptRecord[]>();
  for (const attempt of attempts) {
    const match = attempt.attemptId.match(/^pwrp71-qualification:[^:]+:([^:]+):([^:]+):/u);
    if (!match) continue;
    const key = `${match[1]}:${match[2]}`;
    byReport.set(key, [...(byReport.get(key) ?? []), attempt]);
    const expectedUsageStatus = run.mode === "offline" ? "mock" : "reported";
    if (attempt.status !== "completed" || attempt.usageStatus !== expectedUsageStatus || !attempt.usage) {
      issues.push(`Attempt ${attempt.attemptId} is incomplete or has unknown usage.`);
    }
    if (run.mode === "live" && attempt.request.requestedModel !== attempt.usage?.model) issues.push(`Attempt ${attempt.attemptId} returned a different model than requested.`);
  }
  for (const result of run.results) {
    if (result.status !== "accepted") continue;
    const key = `${result.profileId}:${result.reportType}`;
    const group = byReport.get(key) ?? [];
    if (group.length < 2) issues.push(`${key} is missing its generation/reviewer attempt records.`);
    const generations = new Set(group.map((attempt) => attempt.usage?.generationId).filter((value): value is string => Boolean(value)));
    const expectedUsageStatus = run.mode === "offline" ? "mock" : "reported";
    if (result.usage?.status !== expectedUsageStatus || !result.usage.generationIds.every((id) => generations.has(id))) {
      issues.push(`${key} does not have complete ${run.mode === "offline" ? "mock" : "provider-reported"} usage linked to its attempts.`);
    }
  }
  return issues;
}

async function currentQualificationContext(input: {
  readonly run: Pwrp71QualificationRun;
  readonly runDirectory: string;
  readonly workspaceRoot: string;
  readonly attempts: readonly QualificationAttemptRecord[];
  readonly fixtures: Pwrp71QualificationFixtures;
  readonly questionSource: Awaited<ReturnType<typeof loadPwqe51SourcePackage>>;
  readonly reportSource: Pwrp71SourcePackage;
}): Promise<{ readonly packets: ReadonlyMap<string, Pwrp71FixturePacket>; readonly sourceIssues: readonly string[] }> {
  const sourceIssues: string[] = [];
  const { run, workspaceRoot, fixtures, questionSource, reportSource } = input;
  const currentRuntimeSha = await computePwqe51RouterRuntimeSha256(workspaceRoot);
  if (run.candidatePolicy.candidatesSha256 !== sha256Canonical(QUALIFICATION_MODEL_ORDER)
    || sha256Canonical(run.candidatePolicy.candidates) !== sha256Canonical(QUALIFICATION_MODEL_ORDER)
    || run.candidatePolicy.reportModelPolicySha256 !== sha256Canonical(run.candidatePolicy.reportModelPolicy)) {
    sourceIssues.push("Provider candidate order or per-report model settings differ from the completed run pins.");
  }
  if (run.sourcePins.questionRelease !== PWQE51_RELEASE_IDENTITY.questionRelease
    || run.sourcePins.routerVersion !== PWQE51_RELEASE_IDENTITY.routerVersion
    || run.sourcePins.questionSourceSha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || run.sourcePins.questionSourceManifestSha256 !== questionSource.sourceManifestSha256
    || run.sourcePins.reportRelease !== reportSource.policy.release
    || run.sourcePins.reportSourceManifestSha256 !== reportSource.manifestSha256
    || run.sourcePins.routerPacketSchemaSha256 !== questionSource.manifest.files["schemas/router_packet.schema.json"]
    || run.sourcePins.reportDraftSchemaSha256 !== reportSource.manifest.files["schemas/report_draft.schema.json"]
    || run.sourcePins.reportReviewSchemaSha256 !== reportSource.manifest.files["schemas/report_review.schema.json"]
    || run.sourcePins.semanticCaseSetSha256 !== fixtures.semanticCaseSetSha256
    || run.sourcePins.semanticCasesCanonicalJsonSha256 !== fixtures.semanticCasesCanonicalJsonSha256
    || run.sourcePins.fixtureSetSha256 !== fixtures.fixtureSetSha256
    || run.sourcePins.sourceArchiveSha256 !== fixtures.sourceArchiveSha256
    || run.sourcePins.routerRuntimeSha256 !== currentRuntimeSha) {
    sourceIssues.push("Current question, report, schema, fixture, semantic-case, or router implementation pins differ from the completed run.");
  }
  const packets = new Map<string, Pwrp71FixturePacket>();
  for (const profileId of run.selectedProfiles) {
    try { packets.set(profileId, await loadPwrp71FixturePacket({ profileId, fixtures, questionSource })); }
    catch (error) { sourceIssues.push(`${profileId} can no longer be loaded: ${error instanceof Error ? error.message : String(error)}`); }
  }
  for (const [profileId, packet] of packets) {
    const result = run.results.find((item) => item.profileId === profileId);
    if (result && result.packetSha256 !== packet.packetSha256) sourceIssues.push(`${profileId} packet digest differs from the completed run.`);
  }
  let evidence: Pwqe51RouterQualificationEvidence | undefined;
  if (run.routingEvidenceFile) {
    try { evidence = JSON.parse(await readFile(safeRelativeFile(input.runDirectory, run.routingEvidenceFile), "utf8")) as Pwqe51RouterQualificationEvidence; }
    catch { sourceIssues.push("Saved routing qualification evidence is unreadable."); }
  } else sourceIssues.push("The completed run has no saved routing qualification evidence.");
  if (evidence) {
    if (run.sourcePins.routingQualificationSha256 !== sha256Canonical(evidence)) sourceIssues.push("Saved routing qualification evidence digest differs from the run source pin.");
    const selectedPackets = [...packets.values()];
    const checked = validatePwrp71RoutingEvidence({ evidence, expectedRouterRuntimeSha256: currentRuntimeSha, fixtures: selectedPackets, workspaceSource: questionSource });
    if (!checked.ok) sourceIssues.push(checked.reason);
  }
  return { packets, sourceIssues };
}

async function inspectOutputs(input: {
  readonly run: Pwrp71QualificationRun;
  readonly runDirectory: string;
  readonly packets: ReadonlyMap<string, Pwrp71FixturePacket>;
  readonly source: Pwrp71SourcePackage;
}): Promise<{ readonly issues: readonly string[]; readonly artifacts: ReadonlyMap<string, Pwrp71ReportArtifact> }> {
  const issues: string[] = [];
  const artifacts = new Map<string, Pwrp71ReportArtifact>();
  const resultKeys = new Set<string>();
  for (const result of input.run.results) {
    const key = `${result.profileId}:${result.reportType}`;
    if (resultKeys.has(key)) issues.push(`${key} appears more than once in the run results.`);
    resultKeys.add(key);
    if (result.status !== "accepted") {
      issues.push(`${key} has status ${result.status}${result.failure ? ` (${result.failure.code})` : ""}.`);
      continue;
    }
    try {
      const artifactPath = safeRelativeFile(input.runDirectory, result.artifactFile);
      const markdownPath = safeRelativeFile(input.runDirectory, result.markdownFile);
      const [artifactText, markdownText] = await Promise.all([readFile(artifactPath, "utf8"), readFile(markdownPath, "utf8")]);
      const artifact = JSON.parse(artifactText) as Pwrp71ReportArtifact;
      const { digests, ...withoutDigests } = artifact;
      if (!isRecord(digests) || digests.artifact_sha256 !== result.artifactSha256
        || sha256Canonical(withoutDigests) !== result.artifactSha256
        || digests.report_markdown_sha256 !== result.markdownSha256
        || sha256Text(markdownText) !== result.markdownSha256
        || markdownText !== artifact.report_markdown) {
        issues.push(`${key} artifact or Markdown file changed after qualification.`);
        continue;
      }
      const packet = input.packets.get(result.profileId);
      if (!packet || packet.issues.length || packet.packetSha256 !== result.packetSha256 || packet.packet.content_sha256 !== result.evidenceSha256) {
        issues.push(`${key} no longer binds to its exact current source packet.`);
        continue;
      }
      const regenerated = validatePwrp71ReportDraft({
        value: artifact.draft,
        reportType: result.reportType,
        snapshotId: String(packet.packet.snapshot_id),
        packet: packet.packet,
        source: input.source,
      });
      if (!regenerated.ok || sha256Canonical(regenerated.value) !== sha256Canonical(artifact)) {
        issues.push(`${key} no longer passes the full local PWRP 7.1 report validator.`);
        continue;
      }
      const acceptedReceipts = (result.reviewerReceipts ?? []).filter((receipt) => isRecord(receipt) && receipt.verdict === "accept" && isRecord(receipt.review));
      const verifiedReceipt = acceptedReceipts.some((receipt) => {
        const checked = validatePwrp71Review({ value: receipt.review, artifact, packet: packet.packet, source: input.source });
        return checked.ok && checked.value.verdict === "accept" && sha256Canonical(checked.value) === sha256Canonical(receipt);
      });
      if (!verifiedReceipt) {
        issues.push(`${key} has no current, validated structural reviewer acceptance receipt.`);
        continue;
      }
      artifacts.set(key, artifact);
    } catch (error) {
      issues.push(`${key} output could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { issues, artifacts };
}

async function loadReviewContext(input: {
  readonly runId: string;
  readonly outputRoot?: string;
  readonly workspaceRoot?: string;
}): Promise<{
  readonly run: Pwrp71QualificationRun;
  readonly runDirectory: string;
  readonly attempts: readonly QualificationAttemptRecord[];
  readonly fixtures: Pwrp71QualificationFixtures;
  readonly packets: ReadonlyMap<string, Pwrp71FixturePacket>;
  readonly sourceIssues: readonly string[];
  readonly outputIssues: readonly string[];
  readonly artifacts: ReadonlyMap<string, Pwrp71ReportArtifact>;
  readonly providerEvidence: Pwrp71ProviderQualificationEvidence;
  readonly reportSource: Pwrp71SourcePackage;
}> {
  const workspaceRoot = path.resolve(input.workspaceRoot ?? process.cwd());
  const outputRoot = path.resolve(input.outputRoot ?? path.join(workspaceRoot, ".qualification", "pwrp71"));
  const run = await readPwrp71QualificationRun(input.runId, outputRoot);
  const runDirectory = path.join(outputRoot, run.runId);
  if (path.resolve(run.outputDirectory) !== path.resolve(runDirectory)) throw new Pwrp71ApprovalError("Run output directory differs from its pinned run ID location.");
  const attempts = await readPwrp71QualificationAttempts(run);
  const actualRunSha = computePwrp71QualificationRunSha256(run, attempts);
  const runDigestIssues = run.qualificationRunSha256 === actualRunSha ? [] : ["Qualification run or attempt ledger changed after completion."];
  const [fixtures, questionSource, reportSource] = await Promise.all([
    loadPwrp71QualificationFixtures({ workspaceRoot }),
    loadPwqe51SourcePackage(workspaceRoot),
    loadPwrp71SourcePackage(workspaceRoot),
  ]);
  const context = await currentQualificationContext({ run, runDirectory, workspaceRoot, attempts, fixtures, questionSource, reportSource });
  const outputCheck = await inspectOutputs({ run, runDirectory, packets: context.packets, source: reportSource });
  const providerEvidence = providerEvidenceForRun(run, attempts);
  return {
    run,
    runDirectory,
    attempts,
    fixtures,
    packets: context.packets,
    sourceIssues: [...runDigestIssues, ...context.sourceIssues],
    outputIssues: outputCheck.issues,
    artifacts: outputCheck.artifacts,
    providerEvidence,
    reportSource,
  };
}

function providerEvidenceForRun(run: Pwrp71QualificationRun, attempts: readonly QualificationAttemptRecord[]): Pwrp71ProviderQualificationEvidence {
  return providerEvidence(run, attempts);
}

export async function preparePwrp71PendingReviewPackage(input: {
  readonly runId: string;
  readonly outputRoot?: string;
  readonly workspaceRoot?: string;
}): Promise<Pwrp71PendingReviewPackage> {
  const context = await loadReviewContext(input);
  const { run, fixtures, runDirectory } = context;
  const modelPins = modelPinsForRun(run);
  const draftPinsSha256 = sha256Canonical(modelPins);
  const providerSha = pwrp71ProviderQualificationEvidenceSha256(context.providerEvidence);
  const profileMissing = PROFILE_IDS.filter((id) => !run.selectedProfiles.includes(id));
  const reportMissing = REPORT_TYPES.filter((type) => !run.selectedReports.includes(type));
  const outputs = run.results.map((result) => ({
    profileId: result.profileId,
    reportType: result.reportType,
    status: result.status,
    ...(result.artifactFile ? { artifactPath: path.join(runDirectory, result.artifactFile) } : {}),
    ...(result.markdownFile ? { markdownPath: path.join(runDirectory, result.markdownFile) } : {}),
    ...(result.artifactSha256 ? { artifactSha256: result.artifactSha256 } : {}),
    ...(result.markdownSha256 ? { markdownSha256: result.markdownSha256 } : {}),
    reviewerReceipts: result.reviewerReceipts ?? [],
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.failure ? { failure: result.failure } : {}),
  }));
  const unresolvedCases = (Array.isArray(fixtures.semanticCases.cases) ? fixtures.semanticCases.cases : []).flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string") return [];
    return [{
      id: entry.id,
      status: "pending_semantic_review" as const,
      requiredPlanIds: Array.isArray(entry.plan_ids) ? entry.plan_ids.filter((id): id is string => typeof id === "string") : [],
      supportedDistinction: typeof entry.supported_distinction === "string" ? entry.supported_distinction : "",
      guardAgainst: typeof entry.guard_against === "string" ? entry.guard_against : "",
    }];
  });
  const blockers = [...new Set([
    ...context.sourceIssues,
    ...context.outputIssues,
    ...approvalBlockers(run, fixtures, [...context.sourceIssues, ...context.outputIssues, ...attemptQualityIssues(run, context.attempts)]),
    ...attemptQualityIssues(run, context.attempts),
  ])];
  const candidateOrderSha256 = sha256Canonical(QUALIFICATION_MODEL_ORDER);
  return {
    schemaVersion: "pwrp71-pending-review-package-1",
    status: blockers.length ? "not_eligible_for_review" : "pending_human_review",
    approvalEligible: blockers.length === 0,
    runId: run.runId,
    runStatus: run.status,
    ...(run.qualificationRunSha256 ? { qualificationRunSha256: run.qualificationRunSha256 } : {}),
    providerQualificationEvidenceSha256: providerSha,
    semanticCaseSetSha256: fixtures.semanticCaseSetSha256,
    fixtureSetSha256: fixtures.fixtureSetSha256,
    draftPinsSha256,
    sourcePinsSha256: sha256Canonical(run.sourcePins),
    sourcePins: run.sourcePins,
    modelPins,
    modelPinsSha256: draftPinsSha256,
    candidateOrderSha256,
    cost: { capMicros: run.costCapMicros, reportedMicros: run.totalReportedCostMicros, reservedUnknownMicros: run.reservedUnknownCostMicros },
    profileCoverage: { required: PROFILE_IDS, selected: run.selectedProfiles, missing: profileMissing },
    reportCoverage: { required: REPORT_TYPES, selected: run.selectedReports, missing: reportMissing },
    outputs,
    unresolvedCases,
    semanticChecklist: [
      { id: "allOutputsReviewed", status: "pending", instruction: "Read every linked Markdown report and its JSON artifact; assess whether each output is complete and usable." },
      { id: "overreachAndOmissionReviewed", status: "pending", instruction: "Review unsupported claims and material omissions, including protective function, differentiated vulnerabilities, Self-related capacity, context differences, and unsupported causes or diagnoses." },
      { id: "sourceAndLineageReviewed", status: "pending", instruction: "Verify source pins, packet/evidence hashes, response and occurrence lineage, sequence, correction, and distinctness against the linked qualification evidence." },
      { id: "pinsApproved", status: "pending", instruction: "Approve the exact model, reasoning, escalation, output-token, prompt, schema, and candidate-order pins shown above." },
    ],
    blockers,
    approvalInputSchema: "qualification/pwrp71/approval-input.schema.json",
    semanticReviewEvidenceSchema: "qualification/pwrp71/semantic-review-evidence.schema.json",
    expectedApprovalBindings: {
      ...(run.qualificationRunSha256 ? { qualificationRunSha256: run.qualificationRunSha256 } : {}),
      providerQualificationEvidenceSha256: providerSha,
      draftPinsSha256,
      semanticCaseSetSha256: fixtures.semanticCaseSetSha256,
    },
  };
}

function assertSemanticEvidence(input: {
  readonly evidence: Pwrp71SemanticReviewEvidence;
  readonly run: Pwrp71QualificationRun;
  readonly fixtures: Pwrp71QualificationFixtures;
  readonly sourcePinsSha256: string;
  readonly draftPinsSha256: string;
  readonly artifactByKey: ReadonlyMap<string, Pwrp71ReportArtifact>;
}): void {
  const { evidence, run, fixtures } = input;
  if (!isRecord(evidence) || !exactKeys(evidence, ["schemaVersion", "qualificationRunSha256", "semanticCaseSetSha256", "fixtureSetSha256", "sourcePinsSha256", "draftPinsSha256", "reviewedBy", "reviewedAt", "cases"])
    || !Array.isArray(evidence.cases)) throw new Pwrp71ApprovalError("Semantic evidence must match the exact machine-readable semantic-review schema.");
  const submittedCases = evidence.cases as Pwrp71SemanticReviewEvidence["cases"];
  if (evidence.schemaVersion !== PWRP71_SEMANTIC_REVIEW_EVIDENCE_VERSION
    || evidence.qualificationRunSha256 !== run.qualificationRunSha256
    || evidence.semanticCaseSetSha256 !== fixtures.semanticCaseSetSha256
    || evidence.fixtureSetSha256 !== fixtures.fixtureSetSha256
    || evidence.sourcePinsSha256 !== input.sourcePinsSha256
    || evidence.draftPinsSha256 !== input.draftPinsSha256
    || typeof evidence.reviewedBy !== "string" || !evidence.reviewedBy.trim()
    || !isRfc3339DateTime(evidence.reviewedAt)) {
    throw new Pwrp71ApprovalError("Semantic review evidence is missing, stale, or not bound to this qualification run and its current pins.");
  }
  const cases = Array.isArray(fixtures.semanticCases.cases) ? fixtures.semanticCases.cases.filter(isRecord) : [];
  const expectedIds = cases.map((entry) => String(entry.id)).sort();
  if (evidence.cases.some((entry) => !isRecord(entry) || !exactKeys(entry, ["id", "verdict", "reportRefs", "notes"]) || !Array.isArray(entry.reportRefs))) {
    throw new Pwrp71ApprovalError("Each semantic case must use the exact semantic-review schema.");
  }
  const suppliedIds = submittedCases.map((entry) => entry.id).sort();
  if (expectedIds.length !== suppliedIds.length || expectedIds.some((id, index) => id !== suppliedIds[index])) {
    throw new Pwrp71ApprovalError("Semantic evidence must contain every canonical case exactly once.");
  }
  for (const semanticCase of cases) {
    const submitted = submittedCases.find((entry) => entry.id === semanticCase.id)!;
    if (submitted.verdict !== "pass" || !submitted.notes.trim()) throw new Pwrp71ApprovalError(`${semanticCase.id} is not explicitly reviewed as passing with reviewer notes.`);
    if (submitted.reportRefs.some((entry) => !isRecord(entry) || !exactKeys(entry, ["profileId", "reportType", "artifactSha256"])
      || !REPORT_TYPES.includes(entry.reportType as ReportType) || !validDigest(entry.artifactSha256))) {
      throw new Pwrp71ApprovalError(`${semanticCase.id} has a malformed report reference.`);
    }
    const planIds = Array.isArray(semanticCase.plan_ids) ? semanticCase.plan_ids.filter((id): id is string => typeof id === "string") : [];
    if (submitted.reportRefs.length !== planIds.length * REPORT_TYPES.length) throw new Pwrp71ApprovalError(`${semanticCase.id} must review every report for each authored plan profile.`);
    for (const profileId of planIds) {
      for (const reportType of REPORT_TYPES) {
        const reportRef = submitted.reportRefs.find((entry) => entry.profileId === profileId && entry.reportType === reportType);
        const artifact = input.artifactByKey.get(`${profileId}:${reportType}`);
        if (!reportRef || !artifact || reportRef.artifactSha256 !== artifact.digests.artifact_sha256) {
          throw new Pwrp71ApprovalError(`${semanticCase.id} must cite the current ${profileId} ${reportType} output digest for each authored plan profile.`);
        }
      }
    }
  }
}

function assertApprovalInput(input: Pwrp71ApprovalInput, expected: {
  readonly runSha: string;
  readonly providerSha: string;
  readonly semanticSha: string;
  readonly draftPinsSha: string;
}): void {
  if (!isRecord(input) || !exactKeys(input, ["status", "qualificationRunSha256", "providerQualificationEvidenceSha256", "semanticApprovalEvidenceSha256", "draftPinsSha256", "reviewedBy", "reviewedAt", "checklist"])) {
    throw new Pwrp71ApprovalError("Approval input must match the exact machine-readable PWRP 7.1 approval schema.");
  }
  if (input.status !== "approved" || input.qualificationRunSha256 !== expected.runSha
    || input.providerQualificationEvidenceSha256 !== expected.providerSha
    || input.semanticApprovalEvidenceSha256 !== expected.semanticSha
    || input.draftPinsSha256 !== expected.draftPinsSha
    || typeof input.reviewedBy !== "string" || !input.reviewedBy.trim()
    || !isRfc3339DateTime(input.reviewedAt)) {
    throw new Pwrp71ApprovalError("Approval input is fabricated, incomplete, or bound to stale qualification evidence.");
  }
  const checklist = isRecord(input.checklist) ? input.checklist : undefined;
  if (!checklist || !exactKeys(checklist, ["allOutputsReviewed", "overreachAndOmissionReviewed", "sourceAndLineageReviewed", "pinsApproved"])
    || Object.values(checklist).some((value) => value !== true)) {
    throw new Pwrp71ApprovalError("Every explicit human review checklist item must be true before a manifest can be created.");
  }
}

export async function validatePwrp71ApprovalAndBuildManifest(input: {
  readonly runId: string;
  readonly approval: Pwrp71ApprovalInput;
  readonly semanticEvidence: Pwrp71SemanticReviewEvidence;
  readonly outputRoot?: string;
  readonly workspaceRoot?: string;
}): Promise<{ readonly manifest: ReviewedPwrp71QualificationManifest; readonly manifestSha256: string; readonly providerEvidence: Pwrp71ProviderQualificationEvidence }> {
  const context = await loadReviewContext(input);
  const { run, fixtures, attempts } = context;
  if (run.mode !== "live" || run.status !== "pending_human_review" || run.routeParity !== "qualified") {
    throw new Pwrp71ApprovalError("Only a completed live run with final qualified router parity can be reviewed for activation.");
  }
  const expectedProfiles = [...PROFILE_IDS].sort();
  const selectedProfiles = [...run.selectedProfiles].sort();
  if (expectedProfiles.length !== selectedProfiles.length || expectedProfiles.some((id, index) => id !== selectedProfiles[index])) {
    throw new Pwrp71ApprovalError("Approval requires the complete source-pinned P01–P09 and C01–C16 fixture set.");
  }
  if (REPORT_TYPES.length !== run.selectedReports.length || REPORT_TYPES.some((type) => !run.selectedReports.includes(type))) {
    throw new Pwrp71ApprovalError("Approval requires Mapping, IFS, PV, ATT, and same-profile Synthesis outputs.");
  }
  if (context.sourceIssues.length || context.outputIssues.length) throw new Pwrp71ApprovalError([...context.sourceIssues, ...context.outputIssues].join(" "));
  const attemptIssues = attemptQualityIssues(run, attempts);
  if (attemptIssues.length) throw new Pwrp71ApprovalError(attemptIssues.join(" "));
  if (run.results.length !== PROFILE_IDS.length * REPORT_TYPES.length || run.results.some((result) => result.status !== "accepted")) {
    throw new Pwrp71ApprovalError("Every selected profile/report output must be accepted before human approval.");
  }
  if (run.reservedUnknownCostMicros !== 0 || run.totalReportedCostMicros > run.costCapMicros) {
    throw new Pwrp71ApprovalError("Unknown usage remains reserved or provider-reported cost exceeds the approved cap.");
  }
  const runSha = computePwrp71QualificationRunSha256(run, attempts);
  if (run.qualificationRunSha256 !== runSha) throw new Pwrp71ApprovalError("Qualification run or attempt evidence changed after completion.");
  const modelPins = modelPinsForRun(run);
  const draftPinsSha = sha256Canonical(modelPins);
  const providerSha = pwrp71ProviderQualificationEvidenceSha256(context.providerEvidence);
  const sourcePinsSha = sha256Canonical(run.sourcePins);
  const semanticSha = sha256Canonical(input.semanticEvidence);
  assertSemanticEvidence({ evidence: input.semanticEvidence, run, fixtures, sourcePinsSha256: sourcePinsSha, draftPinsSha256: draftPinsSha, artifactByKey: context.artifacts });
  assertApprovalInput(input.approval, { runSha, providerSha, semanticSha, draftPinsSha });

  const approval: Pwrp71ApprovalInput = input.approval;
  const candidateOrderSha = sha256Canonical(QUALIFICATION_MODEL_ORDER);
  const manifest = {
    manifestVersion: "pwrp71-qualification-1" as const,
    status: "reviewed" as const,
    questionRelease: PWQE51_RELEASE_IDENTITY.questionRelease,
    routerVersion: PWQE51_RELEASE_IDENTITY.routerVersion,
    questionSourceSha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
    questionSourceManifestSha256: run.sourcePins.questionSourceManifestSha256 as typeof import("../../../question-engine/pwqe51-source.ts").PWQE51_SOURCE_MANIFEST_SHA256,
    reportRelease: PWQE51_RELEASE_IDENTITY.reportRelease,
    reportSourceManifestSha256: context.reportSource.manifestSha256,
    routerPacketSchemaSha256: run.sourcePins.routerPacketSchemaSha256,
    reportDraftSchemaSha256: run.sourcePins.reportDraftSchemaSha256,
    reportReviewSchemaSha256: run.sourcePins.reportReviewSchemaSha256,
    semanticCaseSetSha256: PWRP71_SEMANTIC_CASE_SET_SHA256,
    qualificationRunSha256: runSha,
    providerQualificationEvidenceSha256: providerSha,
    semanticApprovalEvidenceSha256: semanticSha,
    candidateOrderSha256: candidateOrderSha,
    draftPinsSha256: draftPinsSha,
    approvalSha256: sha256Canonical(approval),
    reviewedAt: approval.reviewedAt,
    reviewedBy: approval.reviewedBy,
    candidates: QUALIFICATION_MODEL_ORDER,
    approval,
    pins: modelPins,
  } satisfies ReviewedPwrp71QualificationManifest;
  const manifestJson = JSON.stringify(manifest);
  const manifestSha256 = sha256Canonical(manifest);
  await assertPwrp71ReportActivationReady({
    workspaceRoot: path.resolve(input.workspaceRoot ?? process.cwd()),
    manifestJson,
    manifestSha256,
  });
  return { manifest, manifestSha256, providerEvidence: context.providerEvidence };
}

export async function writePwrp71PendingReviewPackage(input: {
  readonly runId: string;
  readonly outputRoot?: string;
  readonly workspaceRoot?: string;
}): Promise<{ readonly reviewPackage: Pwrp71PendingReviewPackage; readonly reviewPackageFile: string; readonly semanticEvidenceTemplateFile: string }> {
  const reviewPackage = await preparePwrp71PendingReviewPackage(input);
  const workspaceRoot = path.resolve(input.workspaceRoot ?? process.cwd());
  const outputRoot = path.resolve(input.outputRoot ?? path.join(workspaceRoot, ".qualification", "pwrp71"));
  const runDirectory = path.join(outputRoot, input.runId);
  const reviewPackageFile = path.join(runDirectory, "pending-review-package.json");
  const semanticEvidenceTemplateFile = path.join(runDirectory, "semantic-review-evidence.template.json");
  await writeJsonAtomic(reviewPackageFile, reviewPackage);
  const template: Record<string, unknown> = {
    schemaVersion: PWRP71_SEMANTIC_REVIEW_EVIDENCE_VERSION,
    qualificationRunSha256: reviewPackage.qualificationRunSha256 ?? "",
    semanticCaseSetSha256: reviewPackage.semanticCaseSetSha256,
    fixtureSetSha256: reviewPackage.fixtureSetSha256,
    sourcePinsSha256: reviewPackage.sourcePinsSha256,
    draftPinsSha256: reviewPackage.draftPinsSha256,
    reviewedBy: "",
    reviewedAt: "",
    cases: reviewPackage.unresolvedCases.map((entry) => ({ id: entry.id, verdict: "fail", reportRefs: [], notes: "" })),
  };
  await writeJsonAtomic(semanticEvidenceTemplateFile, template);
  return { reviewPackage, reviewPackageFile, semanticEvidenceTemplateFile };
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, file);
}
