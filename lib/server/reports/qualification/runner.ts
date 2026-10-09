import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, ReportType, ValidationIssue } from "../../../question-engine/types.ts";
import { loadPwqe51SourcePackage, PWQE51_RELEASE_IDENTITY, PWQE51_SOURCE_MANIFEST_SHA256, type Pwqe51SourcePackage } from "../../../question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../../report-contracts/delivery-validator.ts";
import { OpenRouterClient } from "../../openrouter/client.ts";
import { QUALIFICATION_MODEL_ORDER, UNQUALIFIED_MOCK_MODEL_POLICY, type ActivatedReportModelPolicy } from "../../openrouter/policy.ts";
import type { OpenRouterGenerationRequest, OpenRouterGenerationResult, OpenRouterTransport, OpenRouterUsage } from "../../openrouter/types.ts";
import { GPT6_LUNA_BILLING_BASIS_SHA256 } from "../../openrouter/qualification-budget.ts";
import { generateCanonicalReport } from "../generator.ts";
import type { Pwrp71ReportArtifact } from "../pwrp71-validation.ts";
import { preparePwrp71Request } from "../pwrp71-adapter.ts";
import { loadPwrp71SourcePackage, type Pwrp71SourcePackage } from "../pwrp71-source.ts";
import { FileQualificationAttemptStore, JournaledPwrp71Transport, type QualificationAttemptRecord } from "./attempt-store.ts";
import { loadPwrp71FixturePacket, type Pwrp71FixturePacket } from "./replay.ts";
import { loadPwrp71QualificationFixtures, type Pwrp71QualificationFixtures } from "./fixtures.ts";
import { PWRP71_SEMANTIC_CASE_SET_SHA256 } from "../pwrp71-readiness.ts";

export const PWRP71_QUALIFICATION_RUN_SCHEMA = 1 as const;
export const PWRP71_QUALIFICATION_REPORT_ORDER = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const satisfies readonly ReportType[];
export const PWRP71_ROUTER_PARITY_EVIDENCE_VERSION = "pwqe51-routing-qualification-1" as const;
export type Pwrp71FixtureSet = "legacy-v1" | "route-replays-v3" | "route-replays-v4" | "route-replays-v5";
type FixtureStatus = Pwrp71FixturePacket["fixtureStatus"]
  | "route_replay_v3_eligible" | "route_replay_v3_partial" | "route_replay_v3_ineligible" | "route_replay_v3_missing"
  | "route_replay_v4_eligible" | "route_replay_v4_partial" | "route_replay_v4_ineligible" | "route_replay_v4_missing"
  | "route_replay_v5_eligible" | "route_replay_v5_partial" | "route_replay_v5_ineligible" | "route_replay_v5_missing";

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
  readonly fixtureStatus: FixtureStatus;
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
  /** Missing on schema-1 legacy runs; interpreted as legacy-v1 when resuming. */
  readonly fixtureSet?: Pwrp71FixtureSet;
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
    readonly sourceArchiveSha256?: string;
    readonly fixtureSet?: Pwrp71FixtureSet;
    readonly fixtureManifestSha256?: string;
    readonly fixtureSourceCommit?: string;
    readonly fixtureSourceSha256?: string;
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
  /** Explicit per-provider-call ceiling. Missing only on legacy/offline runs. */
  readonly maxCallCostMicros?: number;
  /** Aggregate qualification budget. costCapMicros is its legacy alias. */
  readonly aggregateCostCapMicros?: number;
  readonly billingBasisSha256?: string;
  readonly totalReportedCostMicros: number;
  /** Legacy alias retained for prior run readers; now includes started + unknown attempts. */
  readonly reservedUnknownCostMicros: number;
  readonly reservedInFlightOrUnknownCostMicros?: number;
  readonly selectedProfiles: readonly string[];
  readonly selectedReports: readonly ReportType[];
  readonly fixtureStatuses: Readonly<Record<string, FixtureStatus>>;
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
  /** Defaults to the archived v1 fixture set. V3 is an explicit, no-fallback selection. */
  readonly fixtureSet?: Pwrp71FixtureSet;
  /** Test seam and optional location for the selected versioned route replay set. */
  readonly fixtureRoot?: string;
  readonly profileIds: readonly string[];
  readonly reportTypes: readonly ReportType[];
  /** Legacy alias for aggregateCostCapMicros; live runs must also set maxCallCostMicros. */
  readonly costCapMicros?: number;
  readonly maxCallCostMicros?: number;
  readonly aggregateCostCapMicros?: number;
  readonly workspaceRoot?: string;
  readonly outputRoot?: string;
  readonly fixtures?: Pwrp71QualificationFixtures;
  readonly questionSource?: Pwqe51SourcePackage;
  readonly reportSource?: Pwrp71SourcePackage;
  readonly routingEvidence?: Pwqe51RouterQualificationEvidence;
  readonly transport?: OpenRouterTransport;
  readonly now?: () => Date;
}

interface RouteReplayManifest {
  readonly schemaVersion: "PWQE51-ROUTE-REPLAY-V3-MANIFEST" | "PWQE51-ROUTE-REPLAY-V4-MANIFEST" | "PWQE51-ROUTE-REPLAY-V5-MANIFEST";
  readonly qualificationStatus: "internal_session_replay_not_independent_qualification";
  readonly inputs: {
    readonly v2ManifestSha256: string;
    readonly sourceCommit: string;
    readonly questionRelease: string;
    readonly routerVersion: string;
    readonly questionSourceSha256: string;
    readonly questionSourceManifestSha256: string;
    readonly reportRelease: string;
    readonly reportSourceManifestSha256: string;
  };
  readonly profiles: readonly {
    readonly profileId: string;
    readonly file: string;
    readonly artifactSha256: string;
    readonly semanticResultSha256: string;
    readonly mapping: "complete" | "partial";
    readonly deepening: "complete" | "partial" | "not_applicable";
    readonly originalAnswers: Readonly<Record<string, unknown>>;
    readonly replayConfirmed: boolean;
    readonly mappingPacketAccepted: boolean;
    readonly deepeningPacketAccepted: boolean;
    readonly adapterIssueCodes: readonly string[];
    readonly firstDivergence: string | null;
  }[];
  readonly fixtureVariant?: { readonly id: string; readonly profiles: readonly string[]; readonly provenance: string; readonly archivedConfigurationDifference: string } | null;
}

interface RouteReplayCase {
  readonly schemaVersion: "PWQE51-ROUTE-REPLAY-V3" | "PWQE51-ROUTE-REPLAY-V4" | "PWQE51-ROUTE-REPLAY-V5";
  readonly profileId: string;
  readonly authoredAnswerDisposition: readonly {
    readonly responseId: string;
    readonly questionId: string | null;
    readonly classification: string;
    readonly reason: string;
  }[];
  readonly sourceIdentity: RouteReplayManifest["inputs"] & {
    readonly authoredFixtureFile: string;
    readonly authoredFixtureSha256: string;
  };
  readonly replay: {
    readonly completeness: { readonly mapping: string; readonly deepening: string };
  } & Readonly<Record<string, unknown>>;
  readonly packets: Partial<Record<"MAP" | "IFS" | "PV" | "ATT", {
    readonly packet: JsonObject;
  }>>;
  readonly packetValidation: Readonly<Partial<Record<"MAP" | "IFS" | "PV" | "ATT", { readonly accepted: boolean; readonly issueCodes: readonly string[] }>>>;
}

interface RouteReplayFixtureSet {
  readonly fixtureSet: "route-replays-v3" | "route-replays-v4" | "route-replays-v5";
  readonly fixtureSetSha256: string;
  readonly manifestSha256: string;
  readonly inputs: RouteReplayManifest["inputs"];
  readonly cases: ReadonlyMap<string, { readonly manifestCase: RouteReplayManifest["profiles"][number]; readonly replay: RouteReplayCase }>;
}

type SelectedQualificationFixture = Omit<Pwrp71FixturePacket, "fixtureStatus"> & {
  readonly fixtureStatus: FixtureStatus;
  readonly reportPackets?: Partial<Record<ReportType, Pwrp71FixturePacket>>;
  readonly reportIssues?: Partial<Record<ReportType, readonly ValidationIssue[]>>;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRouteReplayRuntimeIds(value: string): string {
  return value.replace(/pwep_[0-9a-f-]{36}/gu, "<server-occurrence-id>")
    .replace(/pwr_[0-9a-f]{40}/gu, "<server-response-id>");
}

const QUALIFICATION_PROFILE_IDS = [
  ...Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`),
];

function safeFixturePath(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Route replay fixture path must be relative: ${relative}`);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`Route replay fixture path escapes its source directory: ${relative}`);
  return resolved;
}

function normalizedTextSha256(text: string): string {
  return sha256(Buffer.from(text.replace(/\r\n/gu, "\n"), "utf8"));
}

async function loadRouteReplayFixtureSet(input: {
  readonly workspaceRoot: string;
  readonly fixtureRoot?: string;
  readonly fixtureSet: "route-replays-v3" | "route-replays-v4" | "route-replays-v5";
  readonly questionSource: Pwqe51SourcePackage;
  readonly reportSource: Pwrp71SourcePackage;
}): Promise<RouteReplayFixtureSet> {
  const version = input.fixtureSet === "route-replays-v5" ? "V5" : input.fixtureSet === "route-replays-v4" ? "V4" : "V3";
  const root = path.resolve(input.fixtureRoot ?? path.join(input.workspaceRoot, "qualification", "pwrp71", `route_replays_${version.toLowerCase()}`));
  let manifestText: string;
  try { manifestText = await readFile(path.join(root, "manifest.json"), "utf8"); }
  catch { throw new Error(`Selected ${version.toLowerCase()} route replay fixture set is missing or unreadable at ${root}; no legacy fallback or alternate fixture fallback is available.`); }
  let manifest: RouteReplayManifest;
  try { manifest = JSON.parse(manifestText) as RouteReplayManifest; }
  catch (error) { throw new Error(`Selected ${version.toLowerCase()} route replay manifest is invalid JSON: ${String(error)}`); }
  if (!isRecord(manifest) || manifest.schemaVersion !== `PWQE51-ROUTE-REPLAY-${version}-MANIFEST`
    || manifest.qualificationStatus !== "internal_session_replay_not_independent_qualification" || !isRecord(manifest.inputs) || !Array.isArray(manifest.profiles)) {
    throw new Error(`Selected route replay manifest does not use the internal PWQE51-ROUTE-REPLAY-${version}-MANIFEST contract.`);
  }
  if (version === "V5" && (!isRecord(manifest.fixtureVariant) || manifest.fixtureVariant.id !== "body-detail-opt-in-at-mapping-entry-v1"
    || manifest.fixtureVariant.provenance !== "new_synthetic_mapping_control"
    || !Array.isArray(manifest.fixtureVariant.profiles)
    || JSON.stringify(manifest.fixtureVariant.profiles) !== JSON.stringify(["P05", "C10", "C11"]))) {
    throw new Error("The v5 fixture must declare its separately simulated body-detail Mapping-entry permission variant for P05, C10, and C11.");
  }
  const source = manifest.inputs;
  if (source.questionRelease !== PWQE51_RELEASE_IDENTITY.questionRelease
    || source.routerVersion !== PWQE51_RELEASE_IDENTITY.routerVersion
    || source.questionSourceSha256 !== input.questionSource.manifest.source_binding.source_sha256
    || source.questionSourceManifestSha256 !== input.questionSource.sourceManifestSha256
    || source.reportRelease !== input.reportSource.policy.release
    || source.reportSourceManifestSha256 !== input.reportSource.manifestSha256
    || !/^[a-f0-9]{64}$/u.test(source.v2ManifestSha256)
    || !/^[a-f0-9]{40,64}$/u.test(source.sourceCommit)
    || !/^[a-f0-9]{64}$/u.test(source.questionSourceSha256)) {
    throw new Error("Selected route replay manifest source identity does not match the loaded PWQE 5.1/PWRP 7.1 packages.");
  }
  const v2Root = path.join(input.workspaceRoot, "qualification", "pwrp71", "constructed_histories_v2");
  const v2ManifestText = await readFile(path.join(v2Root, "manifest.json"), "utf8");
  const v2ManifestSha256 = normalizedTextSha256(v2ManifestText);
  if (v2ManifestSha256 !== source.v2ManifestSha256) throw new Error("Selected route replay set does not bind the current constructed-history v2 manifest.");
  const v2Manifest = JSON.parse(v2ManifestText) as { schemaVersion?: unknown; sourceCommit?: unknown; sourceRelease?: unknown; profiles?: unknown };
  if (v2Manifest.schemaVersion !== "PWQE51-FICTIONAL-HISTORIES-V2-MANIFEST"
    || v2Manifest.sourceCommit !== source.sourceCommit || v2Manifest.sourceRelease !== source.questionRelease || !Array.isArray(v2Manifest.profiles)) {
    throw new Error("Constructed-history v2 manifest release, schema, or source commit does not match the route replay source pins.");
  }
  const authoredProfiles = new Map<string, string>();
  for (const profile of v2Manifest.profiles) {
    if (!isRecord(profile) || typeof profile.id !== "string" || typeof profile.file !== "string" || authoredProfiles.has(profile.id)) {
      throw new Error("Constructed-history v2 manifest profile index is invalid.");
    }
    authoredProfiles.set(profile.id, profile.file);
  }
  if (authoredProfiles.size !== QUALIFICATION_PROFILE_IDS.length || QUALIFICATION_PROFILE_IDS.some((id) => !authoredProfiles.has(id))) {
    throw new Error("Constructed-history v2 manifest must index exactly P01–P09 and C01–C16.");
  }
  const seen = new Set<string>();
  const cases = new Map<string, { manifestCase: RouteReplayManifest["profiles"][number]; replay: RouteReplayCase }>();
  const casePins: Array<{ profileId: string; artifactSha256: string; semanticResultSha256: string }> = [];
  for (const entry of manifest.profiles) {
    if (!isRecord(entry) || !QUALIFICATION_PROFILE_IDS.includes(String(entry.profileId)) || seen.has(String(entry.profileId))
      || typeof entry.file !== "string" || typeof entry.artifactSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.artifactSha256)
      || typeof entry.semanticResultSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.semanticResultSha256)
      || !["complete", "partial"].includes(String(entry.mapping))
      || !["complete", "partial", "not_applicable"].includes(String(entry.deepening))
      || !isRecord(entry.originalAnswers)
      || typeof entry.mappingPacketAccepted !== "boolean" || typeof entry.deepeningPacketAccepted !== "boolean"
      || typeof entry.replayConfirmed !== "boolean" || !Array.isArray(entry.adapterIssueCodes)
      || entry.adapterIssueCodes.some((code) => typeof code !== "string")
      || !(entry.firstDivergence === null || typeof entry.firstDivergence === "string")) {
      throw new Error("Selected route replay manifest has invalid or duplicate profile records.");
    }
    const manifestCase = entry as RouteReplayManifest["profiles"][number];
    seen.add(manifestCase.profileId);
    const file = await readFile(safeFixturePath(root, manifestCase.file), "utf8");
    if (normalizedTextSha256(file) !== manifestCase.artifactSha256) throw new Error(`${manifestCase.profileId} route replay artifact hash does not match its manifest.`);
    let replay: RouteReplayCase;
    try { replay = JSON.parse(file) as RouteReplayCase; }
    catch (error) { throw new Error(`${manifestCase.profileId} route replay artifact is invalid JSON: ${String(error)}`); }
    if (!isRecord(replay) || replay.schemaVersion !== `PWQE51-ROUTE-REPLAY-${version}` || replay.profileId !== manifestCase.profileId
      || !isRecord(replay.sourceIdentity) || !isRecord(replay.replay) || !isRecord(replay.packets) || !isRecord(replay.packetValidation)) {
      throw new Error(`${manifestCase.profileId} route replay artifact does not match the ${version.toLowerCase()} replay contract.`);
    }
    const identity = replay.sourceIdentity;
    if (identity.v2ManifestSha256 !== source.v2ManifestSha256 || identity.sourceCommit !== source.sourceCommit
      || identity.questionRelease !== source.questionRelease || identity.routerVersion !== source.routerVersion
      || identity.questionSourceSha256 !== source.questionSourceSha256 || identity.questionSourceManifestSha256 !== source.questionSourceManifestSha256
      || identity.reportRelease !== source.reportRelease || identity.reportSourceManifestSha256 !== source.reportSourceManifestSha256
      || identity.authoredFixtureFile !== `${manifestCase.profileId}.json` || identity.authoredFixtureFile !== authoredProfiles.get(manifestCase.profileId)
      || !/^[a-f0-9]{64}$/u.test(String(identity.authoredFixtureSha256))) {
      throw new Error(`${manifestCase.profileId} route replay artifact source or original fixture pin is invalid.`);
    }
    const authoredFile = safeFixturePath(path.join(input.workspaceRoot, "qualification", "pwrp71", "constructed_histories_v2"), identity.authoredFixtureFile);
    if (normalizedTextSha256(await readFile(authoredFile, "utf8")) !== identity.authoredFixtureSha256) throw new Error(`${manifestCase.profileId} original v2 history hash does not match its route replay artifact.`);
    if (!isRecord(replay.replay.completeness) || typeof replay.replay.completeness.mapping !== "string" || typeof replay.replay.completeness.deepening !== "string") {
      throw new Error(`${manifestCase.profileId} route replay artifact has no stage completion record.`);
    }
    for (const [packetType, packetRecord] of Object.entries(replay.packets)) {
      if (!packetRecord || !isRecord(packetRecord) || !isRecord(packetRecord.packet)) throw new Error(`${manifestCase.profileId} ${packetType} packet record is malformed.`);
    }
    for (const [packetType, validation] of Object.entries(replay.packetValidation)) {
      if (!["MAP", "IFS", "PV", "ATT"].includes(packetType) || !isRecord(validation)
        || typeof validation.accepted !== "boolean" || !Array.isArray(validation.issueCodes)
        || validation.issueCodes.some((code) => typeof code !== "string")) {
        throw new Error(`${manifestCase.profileId} ${packetType} packet validation record is malformed.`);
      }
    }
    const completeness = replay.replay.completeness;
    const validationByType = replay.packetValidation;
    const accepted = (type: "MAP" | "IFS" | "PV" | "ATT") => validationByType[type]?.accepted === true;
    const expectedMappingAccepted = accepted("MAP") && Boolean(replay.packets.MAP);
    const expectedDeepeningAccepted = accepted("IFS") && accepted("PV") && accepted("ATT")
      && Boolean(replay.packets.IFS) && Boolean(replay.packets.PV) && Boolean(replay.packets.ATT);
    const submitted = Array.isArray(replay.replay.submittedSourceToRuntimeResponses) ? replay.replay.submittedSourceToRuntimeResponses : [];
    const trace = Array.isArray(replay.replay.routingDecisionTrace) ? replay.replay.routingDecisionTrace : [];
    const submittedSemantic = submitted.map((row) => isRecord(row) ? {
      sourceResponseId: row.sourceResponseId, questionId: row.questionId, stepId: row.stepId, phase: row.phase, provenance: row.provenance,
    } : {});
    const traceSemantic = trace.map((row) => {
      const candidate = isRecord(row) && isRecord(row.candidate) ? row.candidate : {};
      return { phase: isRecord(row) ? row.phase : undefined, questionId: candidate.questionId, stepId: candidate.stepId, variantId: candidate.variantId ?? null, result: isRecord(row) ? row.result : undefined };
    });
    const authoredAnswerDispositionSemantic = Array.isArray(replay.authoredAnswerDisposition)
      ? replay.authoredAnswerDisposition.map((row) => isRecord(row) ? {
        responseId: typeof row.responseId === "string" ? row.responseId : typeof row.sourceAnswerRef === "string" ? row.sourceAnswerRef : null,
        questionId: typeof row.questionId === "string" ? row.questionId : null,
        classification: typeof row.classification === "string" ? row.classification : "",
        reason: typeof row.reason === "string" ? normalizeRouteReplayRuntimeIds(row.reason) : "",
      } : {})
      : [];
    const completenessSemantic = version !== "V3"
      ? [
        completeness.mapping === "complete",
        completeness.deepening !== "not_applicable",
        completeness.deepening === "complete",
        isRecord(replay.replay.semanticCore) ? replay.replay.semanticCore.status : undefined,
        isRecord(replay.replay.semanticCore) ? replay.replay.semanticCore.requiredSourceResponseIds : undefined,
        isRecord(replay.replay.semanticCore) ? replay.replay.semanticCore.acceptedSourceResponseIds : undefined,
      ]
      : [completeness.mapping === "complete", completeness.deepening !== "not_applicable", completeness.deepening === "complete"];
    const semanticDigest = version !== "V3"
      ? sha256Canonical({
        submitted: submittedSemantic,
        trace: traceSemantic,
        completeness: completenessSemantic,
        packets: validationByType,
        syntheticDeepeningAnswerAudit: (Array.isArray(replay.replay.syntheticDeepeningAnswerAudit) ? replay.replay.syntheticDeepeningAnswerAudit : []).map((entry) => isRecord(entry) ? ({
          profileId: entry.profileId,
          sourceQuestionId: entry.sourceQuestionId,
          selectedOptionIds: entry.selectedOptionIds,
          status: entry.status,
          selectionMode: entry.selectionMode,
          occurrenceReference: normalizeRouteReplayRuntimeIds(String(entry.occurrenceReference ?? "")),
          step: entry.step,
          existingFictionalFacts: (Array.isArray(entry.existingFictionalFacts) ? entry.existingFictionalFacts : []).map((fact) => isRecord(fact) ? ({
            responseId: fact.responseId,
            questionId: fact.questionId,
            status: fact.status,
            ...(typeof fact.occurrenceId === "string" ? { occurrenceId: normalizeRouteReplayRuntimeIds(fact.occurrenceId) } : {}),
            ...(typeof fact.stepId === "string" ? { stepId: fact.stepId } : {}),
            ...(Array.isArray(fact.selectedOptionIds) ? { selectedOptionIds: fact.selectedOptionIds } : {}),
            ...(typeof fact.evidenceKind === "string" ? { evidenceKind: fact.evidenceKind } : {}),
            ...(typeof fact.contextRelation === "string" ? { contextRelation: fact.contextRelation } : {}),
          }) : {}),
          rationale: entry.rationale,
          scenarioRole: entry.scenarioRole,
          changesIntendedSemanticTest: entry.changesIntendedSemanticTest,
          provenance: entry.provenance,
          outcome: entry.outcome,
        }) : {}),
        syntheticRespondentControls: JSON.parse(normalizeRouteReplayRuntimeIds(JSON.stringify(replay.replay.syntheticRespondentControls ?? []))) as unknown,
        ...(version === "V5" ? { mappingEntryTopicOptIns: JSON.parse(normalizeRouteReplayRuntimeIds(JSON.stringify(
          isRecord(replay.replay.contextDecisions) ? replay.replay.contextDecisions.mappingEntryTopicOptIns ?? [] : [],
        ))) as unknown } : {}),
        replayDecisions: (Array.isArray(replay.replay.replayAndDistinctnessDecisions) ? replay.replay.replayAndDistinctnessDecisions : []).map((decision) => isRecord(decision) ? ({
          sourceOccurrenceReference: decision.sourceOccurrenceReference,
          outcome: decision.outcome,
        }) : {}),
        authoredAnswerDisposition: authoredAnswerDispositionSemantic,
      })
      : sha256Canonical({ submitted: submittedSemantic, trace: traceSemantic, completeness: completenessSemantic, packets: validationByType, authoredAnswerDisposition: authoredAnswerDispositionSemantic });
    const responseProvenance = Array.isArray(replay.replay.completeResponseProvenance) ? replay.replay.completeResponseProvenance : [];
    const expectedAuthoredAccepted = responseProvenance.filter((row) => isRecord(row) && row.accepted === true && typeof row.origin === "string" && row.origin.startsWith("original_authored_fictional_")).length;
    const forbidden = isRecord(replay.declaredFictionalDecisions) && Array.isArray(replay.declaredFictionalDecisions.intentionallyForbiddenAnswers)
      ? replay.declaredFictionalDecisions.intentionallyForbiddenAnswers.length : 0;
    const issueCodes = Object.values(validationByType).flatMap((row) => row?.issueCodes ?? []);
    if (manifestCase.mapping !== completeness.mapping || manifestCase.deepening !== completeness.deepening
      || manifestCase.semanticResultSha256 !== semanticDigest
      || manifestCase.mappingPacketAccepted !== expectedMappingAccepted
      || manifestCase.deepeningPacketAccepted !== expectedDeepeningAccepted
      || JSON.stringify(manifestCase.adapterIssueCodes) !== JSON.stringify(issueCodes)
      || manifestCase.replayConfirmed !== (Array.isArray(replay.replay.replayAndDistinctnessDecisions) && replay.replay.replayAndDistinctnessDecisions.some((decision) => isRecord(decision) && decision.outcome === "different"))
      || manifestCase.firstDivergence !== (typeof replay.replay.firstDivergence === "string" ? replay.replay.firstDivergence : null)
      || manifestCase.originalAnswers.issuedAndAccepted !== expectedAuthoredAccepted
      || manifestCase.originalAnswers.unreached !== (Array.isArray(replay.replay.unreachedOriginalAnswers) ? replay.replay.unreachedOriginalAnswers.length : 0)
      || manifestCase.originalAnswers.intentionallyForbidden !== forbidden) {
      throw new Error(`${manifestCase.profileId} route replay manifest summary does not match its hashed artifact content.`);
    }
    cases.set(manifestCase.profileId, { manifestCase, replay });
    casePins.push({ profileId: manifestCase.profileId, artifactSha256: manifestCase.artifactSha256, semanticResultSha256: manifestCase.semanticResultSha256 });
  }
  if (seen.size !== QUALIFICATION_PROFILE_IDS.length || QUALIFICATION_PROFILE_IDS.some((id) => !seen.has(id))) {
    throw new Error(`Selected ${version.toLowerCase()} route replay manifest must explicitly index P01–P09 and C01–C16, including ineligible profiles.`);
  }
  const manifestSha256 = normalizedTextSha256(manifestText);
  return {
    fixtureSet: input.fixtureSet,
    manifestSha256,
    fixtureSetSha256: sha256Canonical({ schemaVersion: manifest.schemaVersion, manifestSha256, casePins }),
    inputs: source,
    cases,
  };
}

function routeReplayFixturePacket(input: {
  readonly profileId: string;
  readonly reportTypes: readonly ReportType[];
  readonly set: RouteReplayFixtureSet;
  readonly questionSource: Pwqe51SourcePackage;
  readonly reportSource: Pwrp71SourcePackage;
}): SelectedQualificationFixture {
  const entry = input.set.cases.get(input.profileId);
  if (!entry) throw new Error(`Selected route replay fixture set has no entry for ${input.profileId}.`);
  const { manifestCase, replay } = entry;
  const reportPackets: Partial<Record<ReportType, Pwrp71FixturePacket>> = {};
  const reportIssues: Partial<Record<ReportType, readonly ValidationIssue[]>> = {};
  for (const reportType of input.reportTypes) {
    const requiresMapping = reportType === "MAP";
    const packetType: "MAP" | "IFS" | "PV" | "ATT" = reportType === "MAP" ? "MAP" : reportType === "PV" ? "PV" : reportType === "ATT" ? "ATT" : "IFS";
    const stageComplete = requiresMapping ? manifestCase.mapping === "complete" : manifestCase.deepening === "complete";
    const stagePacketAccepted = requiresMapping ? manifestCase.mappingPacketAccepted : manifestCase.deepeningPacketAccepted;
    const packetEntry = replay.packets[packetType];
    const packetValidation = replay.packetValidation[packetType];
    const reasons: ValidationIssue[] = [];
    if (!stageComplete) reasons.push({ code: "route_replay_stage_incomplete", path: `$.${input.profileId}.${requiresMapping ? "mapping" : "deepening"}`, message: `The ${input.set.fixtureSet} server replay did not complete the ${requiresMapping ? "Mapping" : "Deepening"} stage.` });
    if (!packetEntry) reasons.push({ code: "route_replay_packet_unavailable", path: `$.${input.profileId}.packets.${reportType}`, message: `${reportType} is blocked because the ${input.set.fixtureSet} replay did not build its required packet.` });
    if (packetEntry && (!stagePacketAccepted || packetValidation?.accepted !== true)) {
      reasons.push({ code: "route_replay_adapter_rejected", path: `$.${input.profileId}.packetValidation.${packetType}`, message: `The ${input.set.fixtureSet} artifact does not record adapter acceptance for ${packetType}.` });
    }
    if (packetEntry) {
      const packetScope = packetEntry.packet.assessment_scope as Record<string, unknown> | undefined;
      const expectedPhase = requiresMapping ? "mapping" : "deepening";
      if (!isRecord(packetScope) || packetScope.phase !== expectedPhase) {
        reasons.push({ code: "route_replay_stage_packet_mismatch", path: `$.${input.profileId}.packets.${packetType}.assessment_scope.phase`, message: `${reportType} requires a ${expectedPhase} packet.` });
      }
    }
    if (packetEntry && reasons.length === 0) {
      const validation = preparePwrp71Request({ packet: packetEntry.packet, reportType: reportType === "SYNTHESIS" ? "IFS" : reportType, questionSource: input.questionSource, reportSource: input.reportSource });
      if (!validation.ok) reasons.push(...validation.issues);
    }
    const packet = packetEntry?.packet ?? {};
    const packetSha256 = sha256Canonical(packet);
    const fixture: Pwrp71FixturePacket = {
      profileId: input.profileId,
      title: `${input.profileId} router-issued ${input.set.fixtureSet} fictional session replay`,
      packet,
      packetSha256,
      sourceHistorySha256: replay.sourceIdentity.authoredFixtureSha256,
      routerResultSha256: sha256Canonical(replay.replay.routingDecisionTrace),
      fixtureStatus: "pending_router_parity",
      routerParity: "pending",
      issues: reasons,
    };
    reportPackets[reportType] = fixture;
    reportIssues[reportType] = reasons;
  }
  const fallbackPacket = reportPackets.MAP ?? reportPackets[input.reportTypes[0] ?? "MAP"] ?? {
    profileId: input.profileId, title: `${input.profileId} router-issued ${input.set.fixtureSet} fictional session replay`, packet: {}, packetSha256: sha256Canonical({}),
    fixtureStatus: "pending_router_parity" as const, routerParity: "pending" as const, issues: [],
  };
  const anyPacket = Object.keys(replay.packets).length > 0;
  const allStagesComplete = manifestCase.mapping === "complete" && manifestCase.deepening === "complete";
  return {
    ...fallbackPacket,
    fixtureStatus: allStagesComplete && manifestCase.mappingPacketAccepted && manifestCase.deepeningPacketAccepted
      ? input.set.fixtureSet === "route-replays-v5" ? "route_replay_v5_eligible" : input.set.fixtureSet === "route-replays-v4" ? "route_replay_v4_eligible" : "route_replay_v3_eligible"
      : anyPacket ? input.set.fixtureSet === "route-replays-v5" ? "route_replay_v5_partial" : input.set.fixtureSet === "route-replays-v4" ? "route_replay_v4_partial" : "route_replay_v3_partial"
        : input.set.fixtureSet === "route-replays-v5" ? "route_replay_v5_ineligible" : input.set.fixtureSet === "route-replays-v4" ? "route_replay_v4_ineligible" : "route_replay_v3_ineligible",
    reportPackets,
    reportIssues,
  };
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
  readonly fixtures: readonly Pick<Pwrp71FixturePacket, "profileId" | "packetSha256">[];
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
    reserved: attempts.reduce((sum, item) => sum + (item.status !== "completed" ? item.reservedCostMicros ?? item.locallyEstimatedCostMicros : 0), 0),
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
  const withTotals = {
    ...run,
    updatedAt: new Date().toISOString(),
    totalReportedCostMicros: usage.reported,
    reservedUnknownCostMicros: usage.reserved,
    reservedInFlightOrUnknownCostMicros: usage.reserved,
  };
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
  const aggregateCostCapMicros = input.aggregateCostCapMicros ?? input.costCapMicros;
  const maxCallCostMicros = input.maxCallCostMicros ?? (input.mode === "offline" ? aggregateCostCapMicros : undefined);
  if (!Number.isSafeInteger(aggregateCostCapMicros) || typeof aggregateCostCapMicros !== "number" || aggregateCostCapMicros <= 0) throw new Error("PWRP 7.1 qualification requires an explicit positive safe-integer aggregateCostCapMicros.");
  if (!Number.isSafeInteger(maxCallCostMicros) || typeof maxCallCostMicros !== "number" || maxCallCostMicros <= 0) throw new Error("Live PWRP 7.1 qualification requires an explicit positive safe-integer maxCallCostMicros; offline mock runs may use the aggregate cap as a non-spending ceiling.");
  if (!input.profileIds.length || new Set(input.profileIds).size !== input.profileIds.length) throw new Error("Select one or more unique PWRP 7.1 profiles.");
  if (!input.reportTypes.length || new Set(input.reportTypes).size !== input.reportTypes.length || input.reportTypes.some((type) => !PWRP71_QUALIFICATION_REPORT_ORDER.includes(type))) throw new Error("Select one or more unique PWRP 7.1 report types.");
  const fixtureSet = input.fixtureSet ?? "legacy-v1";
  if (fixtureSet !== "legacy-v1" && fixtureSet !== "route-replays-v3" && fixtureSet !== "route-replays-v4" && fixtureSet !== "route-replays-v5") throw new Error(`Unknown PWRP 7.1 fixture set: ${String(fixtureSet)}.`);
  if (fixtureSet !== "legacy-v1" && input.fixtures) throw new Error(`The ${fixtureSet} fixture set cannot be combined with injected legacy fixtures.`);
  const reportTypes = PWRP71_QUALIFICATION_REPORT_ORDER.filter((type) => input.reportTypes.includes(type));

  const [legacyFixtures, questionSource, reportSource] = await Promise.all([
    fixtureSet === "legacy-v1" ? (input.fixtures ? Promise.resolve(input.fixtures) : loadPwrp71QualificationFixtures({ workspaceRoot })) : Promise.resolve(undefined),
    input.questionSource ? Promise.resolve(input.questionSource) : loadPwqe51SourcePackage(workspaceRoot),
    input.reportSource ? Promise.resolve(input.reportSource) : loadPwrp71SourcePackage(workspaceRoot),
  ]);
  const routeReplaySet = fixtureSet === "route-replays-v3" || fixtureSet === "route-replays-v4" || fixtureSet === "route-replays-v5"
    ? await loadRouteReplayFixtureSet({ workspaceRoot, fixtureRoot: input.fixtureRoot, fixtureSet, questionSource, reportSource })
    : undefined;
  let semanticCaseSetSha256: string;
  let semanticCasesCanonicalJsonSha256: string;
  if (legacyFixtures) {
    semanticCaseSetSha256 = legacyFixtures.semanticCaseSetSha256;
    semanticCasesCanonicalJsonSha256 = legacyFixtures.semanticCasesCanonicalJsonSha256;
  } else {
    const semanticFile = path.join(workspaceRoot, "qualification", "pwrp71", "SEMANTIC_CASES.json");
    const semanticBytes = await readFile(semanticFile);
    const semanticSha256 = normalizedTextSha256(semanticBytes.toString("utf8"));
    if (semanticSha256 !== PWRP71_SEMANTIC_CASE_SET_SHA256) throw new Error("PWRP 7.1 semantic case source bytes drifted from the readiness contract.");
    const semanticCases = JSON.parse(semanticBytes.toString("utf8")) as unknown;
    if (!isRecord(semanticCases) || !Array.isArray(semanticCases.cases)) throw new Error("PWRP 7.1 semantic cases must contain a cases array.");
    semanticCaseSetSha256 = semanticSha256;
    semanticCasesCanonicalJsonSha256 = sha256Canonical(semanticCases);
  }
  const selectedFixtures: SelectedQualificationFixture[] = fixtureSet !== "legacy-v1"
    ? input.profileIds.map((profileId) => routeReplayFixturePacket({ profileId, reportTypes, set: routeReplaySet!, questionSource, reportSource }))
    : await Promise.all(input.profileIds.map((profileId) => loadPwrp71FixturePacket({ profileId, fixtures: legacyFixtures!, questionSource })));
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
    semanticCaseSetSha256,
    semanticCasesCanonicalJsonSha256,
    fixtureSetSha256: routeReplaySet?.fixtureSetSha256 ?? legacyFixtures!.fixtureSetSha256,
    ...(legacyFixtures ? { sourceArchiveSha256: legacyFixtures.sourceArchiveSha256 } : {}),
    ...(routeReplaySet ? {
      fixtureManifestSha256: routeReplaySet.manifestSha256,
      fixtureSourceCommit: routeReplaySet.inputs.sourceCommit,
      fixtureSourceSha256: routeReplaySet.inputs.v2ManifestSha256,
    } : {}),
    ...(fixtureSet === "legacy-v1" ? {} : { fixtureSet }),
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
    profiles: selectedFixtures.map((fixture) => ({ id: fixture.profileId, fixtureStatus: fixture.fixtureStatus, packetSha256: fixture.packetSha256, evidenceSha256: fixture.packet.content_sha256,
      ...(fixture.reportPackets ? { reportPackets: Object.fromEntries(reportTypes.map((type) => [type, fixture.reportPackets?.[type]?.packetSha256 ?? null])) } : {}) })),
    reports: reportTypes,
    sourcePins,
    maxCallCostMicros,
    aggregateCostCapMicros,
    billingBasisSha256: GPT6_LUNA_BILLING_BASIS_SHA256,
    candidates: QUALIFICATION_MODEL_ORDER,
    modelPolicy: policy,
  });
  const existing = await readRun(runDirectory);
  if (existing && existing.runFingerprint !== runFingerprint) throw new Error(`Run ${runId} was created with different source, fixture, report, model, or cost-cap pins; start a new run ID.`);
  let run: Pwrp71QualificationRun = existing ?? {
    schemaVersion: PWRP71_QUALIFICATION_RUN_SCHEMA,
    runId,
    mode: input.mode,
    ...(fixtureSet !== "legacy-v1" ? { fixtureSet } : {}),
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
    costCapMicros: aggregateCostCapMicros,
    maxCallCostMicros,
    aggregateCostCapMicros,
    billingBasisSha256: GPT6_LUNA_BILLING_BASIS_SHA256,
    totalReportedCostMicros: 0,
    reservedUnknownCostMicros: 0,
    reservedInFlightOrUnknownCostMicros: 0,
    selectedProfiles: input.profileIds,
    selectedReports: reportTypes,
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
    const acceptedDrafts = new Map<ReportType, JsonObject>();
    for (const reportType of reportTypes) {
      const reportFixture = fixture.reportPackets?.[reportType] ?? fixture;
      const reportIssues = fixture.reportIssues?.[reportType] ?? reportFixture.issues;
      const key = `${fixture.profileId}:${reportType}`;
      const previous = priorResults.get(key);
      if (previous?.status === "accepted" && previous.artifactFile) {
        try {
          const saved = JSON.parse(await readFile(path.join(runDirectory, previous.artifactFile), "utf8")) as Pwrp71ReportArtifact;
          acceptedDrafts.set(reportType, saved.draft as unknown as JsonObject);
          continue;
        } catch { /* an incomplete or changed output is regenerated from its cached provider attempts */ }
      }
      if (reportIssues.length) {
        const blocked: Pwrp71QualificationReportResult = {
          profileId: fixture.profileId,
          reportType,
          status: "blocked",
          fixtureStatus: fixture.fixtureStatus,
          packetSha256: reportFixture.packetSha256,
          evidenceSha256: String(reportFixture.packet.content_sha256 ?? ""),
          reportSourceManifestSha256: reportSource.manifestSha256,
          requestedModel: policy[reportType].model,
          reasoningEffort: policy[reportType].reasoningEffort,
          validationIssues: reportIssues,
          failure: { code: fixtureSet !== "legacy-v1" ? "route_replay_report_ineligible" : "fixture_packet_invalid", message: `${fixture.profileId} is not eligible for ${reportType} with the selected fixture set.`, issues: reportIssues },
        };
        const existingIndex = results.findIndex((result) => result.profileId === fixture.profileId && result.reportType === reportType);
        if (existingIndex >= 0) results[existingIndex] = blocked; else results.push(blocked);
        priorResults.set(key, blocked);
        run = await saveRun(runDirectory, { ...run, results });
        continue;
      }
      const acceptedLayers = reportType === "SYNTHESIS" ? Object.fromEntries(["IFS", "PV", "ATT"].map((layer) => [layer, acceptedDrafts.get(layer as ReportType)]).filter((entry): entry is [string, JsonObject] => Boolean(entry[1]))) : undefined;
      if (reportType === "SYNTHESIS" && (!acceptedLayers || Object.keys(acceptedLayers).length !== 3)) {
        const blocked: Pwrp71QualificationReportResult = {
          profileId: fixture.profileId, reportType, status: "blocked", fixtureStatus: fixture.fixtureStatus,
          packetSha256: reportFixture.packetSha256, evidenceSha256: String(reportFixture.packet.content_sha256),
          reportSourceManifestSha256: reportSource.manifestSha256,
          requestedModel: policy[reportType].model, reasoningEffort: policy[reportType].reasoningEffort,
          failure: { code: "synthesis_layer_dependency", message: "Synthesis requires accepted same-profile IFS, PV, and ATT outputs.", issues: [] },
        };
        results.push(blocked); priorResults.set(key, blocked);
        run = await saveRun(runDirectory, { ...run, results });
        continue;
      }
      const prepared = preparePwrp71Request({ packet: reportFixture.packet, reportType, questionSource, reportSource, ...(acceptedLayers ? { acceptedLayers } : {}) });
      if (!prepared.ok) {
        const blocked: Pwrp71QualificationReportResult = {
          profileId: fixture.profileId, reportType, status: "blocked", fixtureStatus: fixture.fixtureStatus,
          packetSha256: reportFixture.packetSha256, evidenceSha256: String(reportFixture.packet.content_sha256),
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
        ? deterministicMockTransport({ source: reportSource, packet: reportFixture.packet, reportType, getDraft: () => currentDraft, setDraft: (draft) => { currentDraft = draft; } })
        : selectedProvider!;
      const invocationKey = `pwrp71-qualification:${runId}:${fixture.profileId}`;
      const invocationPrefix = `${invocationKey}:${reportType}:`;
      const attemptsBefore = await store.list();
      const spentBeforeThisReport = attemptsBefore.filter((attempt) => !attempt.attemptId.startsWith(invocationPrefix)).reduce((sum, attempt) => sum + (
        attempt.status === "completed"
          ? attempt.usageStatus === "reported" ? attempt.usage?.costMicros ?? 0 : 0
          : attempt.reservedCostMicros ?? attempt.locallyEstimatedCostMicros
      ), 0);
      const provider = new JournaledPwrp71Transport({
        store,
        transport: baseTransport,
        maxCallCostMicros,
        aggregateCostCapMicros,
        usageStatus: input.mode === "offline" ? "mock" : "reported",
        now,
        onResult: (request, result) => {
          if (!request.schemaName.includes("_review_candidate_1") && result.ok) currentDraft = structuredClone(result.output);
        },
      });
      const generated = await generateCanonicalReport({
        reportType,
        input: {},
        packets: [reportFixture.packet],
        provider,
        invocationKey,
        spentMicros: spentBeforeThisReport,
        costCapMicros: aggregateCostCapMicros,
        modelPolicy: policy,
        contractVersion: "v7.1",
        pwrp71: { request: prepared.value, packet: reportFixture.packet, source: reportSource },
        onPwrp71Event: async (event) => {
          await store.recordGenerationEvent(event);
        },
      });
      const attempts = await store.list();
      const usage = resultUsages(attempts, invocationPrefix);
      if (!generated.ok) {
        const failed: Pwrp71QualificationReportResult = {
          profileId: fixture.profileId, reportType, status: "failed", fixtureStatus: fixture.fixtureStatus,
          packetSha256: reportFixture.packetSha256, evidenceSha256: String(reportFixture.packet.content_sha256),
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
        packetSha256: reportFixture.packetSha256,
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
