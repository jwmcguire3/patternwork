import type { ReportType } from "../../question-engine/types.ts";
import { PWQE51_RELEASE_IDENTITY, PWQE51_SOURCE_MANIFEST_SHA256, loadPwqe51SourcePackage } from "../../question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import { QUALIFICATION_MODEL_ORDER, type ActivatedReportModelPolicy, type QualifiedModelTier, type ReportModelPin } from "../openrouter/policy.ts";
import { loadPwrp71SourcePackage, PWRP71_RELEASE_MANIFEST_SHA256, type Pwrp71SourcePackage } from "./pwrp71-source.ts";

export const PWRP71_SEMANTIC_CASE_SET_SHA256 = "fec1752b4a4892da77fcadbf78688b23fd77e010b845ae6ddcd4523c0547569d" as const;
const REPORT_TYPES = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const satisfies readonly ReportType[];
const DIGEST = /^[a-f0-9]{64}$/u;

export interface ReviewedPwrp71QualificationManifest {
  readonly manifestVersion: "pwrp71-qualification-1";
  readonly status: "reviewed";
  readonly questionRelease: typeof PWQE51_RELEASE_IDENTITY.questionRelease;
  readonly routerVersion: typeof PWQE51_RELEASE_IDENTITY.routerVersion;
  readonly questionSourceSha256: typeof PWQE51_RELEASE_IDENTITY.sourceSha256;
  readonly questionSourceManifestSha256: typeof PWQE51_SOURCE_MANIFEST_SHA256;
  readonly reportRelease: typeof PWQE51_RELEASE_IDENTITY.reportRelease;
  readonly reportSourceManifestSha256: typeof PWRP71_RELEASE_MANIFEST_SHA256;
  readonly routerPacketSchemaSha256: string;
  readonly reportDraftSchemaSha256: string;
  readonly reportReviewSchemaSha256: string;
  readonly semanticCaseSetSha256: typeof PWRP71_SEMANTIC_CASE_SET_SHA256;
  readonly qualificationRunSha256: string;
  readonly providerQualificationEvidenceSha256: string;
  readonly semanticApprovalEvidenceSha256: string;
  readonly candidateOrderSha256: string;
  readonly draftPinsSha256: string;
  readonly approvalSha256: string;
  readonly reviewedAt: string;
  readonly reviewedBy: string;
  readonly candidates: readonly QualifiedModelTier[];
  readonly approval: {
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
  };
  readonly pins: Readonly<Record<ReportType, {
    readonly tier: QualifiedModelTier["name"];
    readonly model: string;
    readonly reasoningEffort: QualifiedModelTier["reasoningEffort"];
    readonly escalationTier: QualifiedModelTier["name"];
    readonly escalationModel: string;
    readonly escalationReasoningEffort: QualifiedModelTier["reasoningEffort"];
    readonly maxOutputTokens: number;
  }>>;
}

export interface Pwrp71ReportActivation {
  readonly qualificationManifestSha256: string;
  readonly questionSource: Awaited<ReturnType<typeof loadPwqe51SourcePackage>>;
  readonly reportSource: Pwrp71SourcePackage;
  readonly modelPolicy: ActivatedReportModelPolicy;
}

export class Pwrp71ActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Pwrp71ActivationError";
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

const manifestKeys = [
  "manifestVersion", "status", "questionRelease", "routerVersion", "questionSourceSha256", "questionSourceManifestSha256",
  "reportRelease", "reportSourceManifestSha256", "routerPacketSchemaSha256", "reportDraftSchemaSha256", "reportReviewSchemaSha256",
  "semanticCaseSetSha256", "qualificationRunSha256", "providerQualificationEvidenceSha256", "semanticApprovalEvidenceSha256",
  "candidateOrderSha256", "draftPinsSha256", "approvalSha256", "reviewedAt", "reviewedBy", "candidates", "approval", "pins",
] as const;

export async function assertPwrp71ReportActivationReady(input: {
  readonly workspaceRoot?: string;
  readonly manifestJson?: string;
  readonly manifestSha256?: string;
} = {}): Promise<Pwrp71ReportActivation> {
  const [questionSource, reportSource] = await Promise.all([
    loadPwqe51SourcePackage(input.workspaceRoot),
    loadPwrp71SourcePackage(input.workspaceRoot),
  ]);
  const raw = input.manifestJson ?? process.env.PWRP71_QUALIFICATION_MANIFEST_JSON;
  const expectedDigest = input.manifestSha256 ?? process.env.PWRP71_QUALIFICATION_MANIFEST_SHA256;
  if (!raw) throw new Pwrp71ActivationError("PWQE 5.1 / PWRP 7.1 remains unavailable until an independently reviewed provider qualification and semantic approval manifest is configured.");
  if (!validDigest(expectedDigest)) throw new Pwrp71ActivationError("PWRP71_QUALIFICATION_MANIFEST_SHA256 must pin the reviewed qualification manifest.");

  let parsed: Record<string, unknown>;
  try { parsed = object(JSON.parse(raw)) ?? {}; }
  catch (error) { throw new Pwrp71ActivationError(`PWRP 7.1 qualification manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  const manifestSha256 = sha256Canonical(parsed);
  if (manifestSha256 !== expectedDigest) throw new Pwrp71ActivationError("PWRP 7.1 qualification manifest does not match its deployment-pinned digest.");
  if (!exactKeys(parsed, manifestKeys)
    || parsed.manifestVersion !== "pwrp71-qualification-1" || parsed.status !== "reviewed"
    || parsed.questionRelease !== PWQE51_RELEASE_IDENTITY.questionRelease
    || parsed.routerVersion !== PWQE51_RELEASE_IDENTITY.routerVersion
    || parsed.questionSourceSha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || parsed.questionSourceManifestSha256 !== questionSource.sourceManifestSha256
    || parsed.reportRelease !== PWQE51_RELEASE_IDENTITY.reportRelease
    || parsed.reportSourceManifestSha256 !== reportSource.manifestSha256
    || parsed.semanticCaseSetSha256 !== PWRP71_SEMANTIC_CASE_SET_SHA256
    || !validDigest(parsed.qualificationRunSha256)
    || !validDigest(parsed.providerQualificationEvidenceSha256)
    || !validDigest(parsed.semanticApprovalEvidenceSha256)
    || !validDigest(parsed.candidateOrderSha256)
    || !validDigest(parsed.draftPinsSha256)
    || !validDigest(parsed.approvalSha256)
    || typeof parsed.reviewedAt !== "string" || Number.isNaN(Date.parse(parsed.reviewedAt))
    || typeof parsed.reviewedBy !== "string" || parsed.reviewedBy.trim().length === 0) {
    throw new Pwrp71ActivationError("PWRP 7.1 qualification does not bind the exact PWQE source, prompts, schemas, semantic cases, provider outputs, and approval records.");
  }
  const sourceDigests = {
    routerPacketSchemaSha256: questionSource.manifest.files["schemas/router_packet.schema.json"],
    reportDraftSchemaSha256: reportSource.manifest.files["schemas/report_draft.schema.json"],
    reportReviewSchemaSha256: reportSource.manifest.files["schemas/report_review.schema.json"],
  };
  if (Object.entries(sourceDigests).some(([key, digest]) => parsed[key] !== digest)) {
    throw new Pwrp71ActivationError("PWRP 7.1 qualification was reviewed against different packet or report schemas.");
  }
  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  if (rawCandidates.length !== QUALIFICATION_MODEL_ORDER.length
    || sha256Canonical(rawCandidates) !== parsed.candidateOrderSha256
    || sha256Canonical(rawCandidates) !== sha256Canonical(QUALIFICATION_MODEL_ORDER)) {
    throw new Pwrp71ActivationError("PWRP 7.1 qualification uses an unreviewed provider/model ladder or candidate order.");
  }
  const pins = object(parsed.pins);
  if (!pins || !exactKeys(pins, REPORT_TYPES) || sha256Canonical(pins) !== parsed.draftPinsSha256) {
    throw new Pwrp71ActivationError("PWRP 7.1 reviewed model pins are absent, altered, or incomplete.");
  }
  const approval = object(parsed.approval);
  const checklist = object(approval?.checklist);
  if (!approval || !exactKeys(approval, ["status", "qualificationRunSha256", "providerQualificationEvidenceSha256", "semanticApprovalEvidenceSha256", "draftPinsSha256", "reviewedBy", "reviewedAt", "checklist"])
    || !checklist || !exactKeys(checklist, ["allOutputsReviewed", "overreachAndOmissionReviewed", "sourceAndLineageReviewed", "pinsApproved"])
    || Object.values(checklist).some((value) => value !== true)
    || approval.status !== "approved" || approval.qualificationRunSha256 !== parsed.qualificationRunSha256
    || approval.providerQualificationEvidenceSha256 !== parsed.providerQualificationEvidenceSha256
    || approval.semanticApprovalEvidenceSha256 !== parsed.semanticApprovalEvidenceSha256
    || approval.draftPinsSha256 !== parsed.draftPinsSha256 || approval.reviewedBy !== parsed.reviewedBy
    || approval.reviewedAt !== parsed.reviewedAt || sha256Canonical(approval) !== parsed.approvalSha256) {
    throw new Pwrp71ActivationError("PWRP 7.1 approval is missing, altered, or not bound to provider output, semantic review, and model pins.");
  }

  const modelPolicy = {} as Record<ReportType, ReportModelPin>;
  for (const reportType of REPORT_TYPES) {
    const pin = object(pins[reportType]);
    const tierIndex = QUALIFICATION_MODEL_ORDER.findIndex((tier) => tier.name === pin?.tier);
    const tier = QUALIFICATION_MODEL_ORDER[tierIndex];
    const escalationIndex = Math.min(tierIndex + 1, QUALIFICATION_MODEL_ORDER.length - 1);
    const escalation = QUALIFICATION_MODEL_ORDER[escalationIndex];
    if (!pin || tierIndex < 0 || !exactKeys(pin, ["tier", "model", "reasoningEffort", "escalationTier", "escalationModel", "escalationReasoningEffort", "maxOutputTokens"])
      || pin.model !== tier.model || pin.reasoningEffort !== tier.reasoningEffort
      || pin.escalationTier !== escalation.name || pin.escalationModel !== escalation.model
      || pin.escalationReasoningEffort !== escalation.reasoningEffort
      || typeof pin.maxOutputTokens !== "number" || !Number.isSafeInteger(pin.maxOutputTokens) || pin.maxOutputTokens < 1_024) {
      throw new Pwrp71ActivationError(`PWRP 7.1 has an invalid reviewed ${reportType} provider pin.`);
    }
    modelPolicy[reportType] = {
      pinnedTier: tierIndex,
      model: pin.model as string,
      reasoningEffort: pin.reasoningEffort as ReportModelPin["reasoningEffort"],
      escalationTier: escalationIndex,
      escalationModel: pin.escalationModel as string,
      escalationReasoningEffort: pin.escalationReasoningEffort as ReportModelPin["escalationReasoningEffort"],
      maxOutputTokens: pin.maxOutputTokens,
    };
  }
  return { qualificationManifestSha256: manifestSha256, questionSource, reportSource, modelPolicy };
}
