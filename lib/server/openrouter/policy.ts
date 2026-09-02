import type { ReportType } from "../../question-engine/types.ts";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import type { OpenRouterReasoningEffort, OpenRouterUsage } from "./types.ts";

export interface QualifiedModelTier {
  readonly name: "luna-low" | "luna-medium" | "terra-medium" | "sol-high";
  readonly model: string;
  readonly reasoningEffort: OpenRouterReasoningEffort;
  readonly estimatedInputMicrosPerMillion: number;
  readonly estimatedOutputMicrosPerMillion: number;
}

export const QUALIFICATION_MODEL_ORDER: readonly QualifiedModelTier[] = [
  {
    name: "luna-low",
    model: process.env.OPENROUTER_MODEL_LUNA ?? "openai/gpt-5.6-luna",
    reasoningEffort: "low",
    estimatedInputMicrosPerMillion: 1_000_000,
    estimatedOutputMicrosPerMillion: 4_000_000,
  },
  {
    name: "luna-medium",
    model: process.env.OPENROUTER_MODEL_LUNA ?? "openai/gpt-5.6-luna",
    reasoningEffort: "medium",
    estimatedInputMicrosPerMillion: 1_000_000,
    estimatedOutputMicrosPerMillion: 4_000_000,
  },
  {
    name: "terra-medium",
    model: process.env.OPENROUTER_MODEL_TERRA ?? "openai/gpt-5.6-terra",
    reasoningEffort: "medium",
    estimatedInputMicrosPerMillion: 2_000_000,
    estimatedOutputMicrosPerMillion: 8_000_000,
  },
  {
    name: "sol-high",
    model: process.env.OPENROUTER_MODEL_SOL ?? "openai/gpt-5.6-sol",
    reasoningEffort: "high",
    estimatedInputMicrosPerMillion: 4_000_000,
    estimatedOutputMicrosPerMillion: 16_000_000,
  },
] as const;

export interface ReportModelPin {
  readonly pinnedTier: number;
  readonly model: string;
  readonly reasoningEffort: OpenRouterReasoningEffort;
  readonly escalationTier: number;
  readonly escalationModel: string;
  readonly escalationReasoningEffort: OpenRouterReasoningEffort;
  readonly maxOutputTokens: number;
}

export type ActivatedReportModelPolicy = Readonly<Record<ReportType, ReportModelPin>>;

/** Explicitly unqualified defaults for deterministic mocked tests only. Never use as a production activation signal. */
export const UNQUALIFIED_MOCK_MODEL_POLICY: ActivatedReportModelPolicy = {
  MAP: { pinnedTier: 0, model: QUALIFICATION_MODEL_ORDER[0].model, reasoningEffort: "low", escalationTier: 1, escalationModel: QUALIFICATION_MODEL_ORDER[1].model, escalationReasoningEffort: "medium", maxOutputTokens: 16_000 },
  IFS: { pinnedTier: 1, model: QUALIFICATION_MODEL_ORDER[1].model, reasoningEffort: "medium", escalationTier: 2, escalationModel: QUALIFICATION_MODEL_ORDER[2].model, escalationReasoningEffort: "medium", maxOutputTokens: 20_000 },
  PV: { pinnedTier: 1, model: QUALIFICATION_MODEL_ORDER[1].model, reasoningEffort: "medium", escalationTier: 2, escalationModel: QUALIFICATION_MODEL_ORDER[2].model, escalationReasoningEffort: "medium", maxOutputTokens: 20_000 },
  ATT: { pinnedTier: 2, model: QUALIFICATION_MODEL_ORDER[2].model, reasoningEffort: "medium", escalationTier: 3, escalationModel: QUALIFICATION_MODEL_ORDER[3].model, escalationReasoningEffort: "high", maxOutputTokens: 20_000 },
  SYNTHESIS: { pinnedTier: 2, model: QUALIFICATION_MODEL_ORDER[2].model, reasoningEffort: "medium", escalationTier: 3, escalationModel: QUALIFICATION_MODEL_ORDER[3].model, escalationReasoningEffort: "high", maxOutputTokens: 16_000 },
};

export interface QualificationApprovalEvidence {
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

export interface ReviewedQualificationPin {
  readonly tier: QualifiedModelTier["name"];
  readonly model: string;
  readonly reasoningEffort: OpenRouterReasoningEffort;
  readonly escalationTier: QualifiedModelTier["name"];
  readonly escalationModel: string;
  readonly escalationReasoningEffort: OpenRouterReasoningEffort;
  readonly maxOutputTokens: number;
}

export interface ReviewedQualificationManifest {
  readonly manifestVersion: "2";
  readonly status: "reviewed";
  readonly contractId: "PWQE3-CONTRACT-2";
  readonly integrityContractId: "PWQE3-INTEGRITY-1";
  readonly promptRelease: "4.1.0";
  readonly fixtureSetSha256: string;
  readonly sourceManifestSha256: string;
  readonly qualificationRunSha256: string;
  readonly candidateOrderSha256: string;
  readonly draftPinsSha256: string;
  readonly approvalSha256: string;
  readonly reviewedAt: string;
  readonly reviewedBy: string;
  readonly candidates: readonly QualifiedModelTier[];
  readonly approval: QualificationApprovalEvidence;
  readonly pins: Readonly<Record<ReportType, ReviewedQualificationPin>>;
}

export class UnqualifiedModelPolicyError extends Error {
  constructor(message = "Live OpenRouter generation is disabled until OPENROUTER_QUALIFICATION_MANIFEST_JSON contains a reviewed qualification manifest and OPENROUTER_QUALIFICATION_MANIFEST_SHA256 pins its canonical digest.") {
    super(message);
    this.name = "UnqualifiedModelPolicyError";
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

const REPORT_TYPES = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const satisfies readonly ReportType[];
const CANDIDATE_NAMES = ["luna-low", "luna-medium", "terra-medium", "sol-high"] as const;
const CANDIDATE_EFFORTS = ["low", "medium", "medium", "high"] as const;
const HEX_SHA256 = /^[a-f0-9]{64}$/u;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && HEX_SHA256.test(value);
}

export function activateReviewedQualificationManifest(
  raw: string | undefined,
  expectedManifestSha256: string | undefined = process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256,
): { manifest: ReviewedQualificationManifest; manifestSha256: string; policy: ActivatedReportModelPolicy } {
  if (!raw) throw new UnqualifiedModelPolicyError();
  if (!validDigest(expectedManifestSha256)) {
    throw new UnqualifiedModelPolicyError("OPENROUTER_QUALIFICATION_MANIFEST_SHA256 must be a deployment-pinned lowercase SHA-256 digest.");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = object(JSON.parse(raw)) ?? {};
  } catch (error) {
    throw new UnqualifiedModelPolicyError(`Qualification manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifestSha256 = sha256Canonical(parsed);
  if (manifestSha256 !== expectedManifestSha256) {
    throw new UnqualifiedModelPolicyError("Qualification manifest does not match the deployment-pinned canonical digest.");
  }
  if (
    !hasExactKeys(parsed, [
      "manifestVersion", "status", "contractId", "integrityContractId", "promptRelease",
      "fixtureSetSha256", "sourceManifestSha256", "qualificationRunSha256", "candidateOrderSha256",
      "draftPinsSha256", "approvalSha256", "reviewedAt", "reviewedBy", "candidates", "approval", "pins",
    ]) ||
    parsed.manifestVersion !== "2" || parsed.status !== "reviewed" ||
    parsed.contractId !== "PWQE3-CONTRACT-2" || parsed.integrityContractId !== "PWQE3-INTEGRITY-1" ||
    parsed.promptRelease !== "4.1.0" || !validDigest(parsed.fixtureSetSha256) || !validDigest(parsed.sourceManifestSha256) ||
    !validDigest(parsed.qualificationRunSha256) || !validDigest(parsed.candidateOrderSha256) ||
    !validDigest(parsed.draftPinsSha256) || !validDigest(parsed.approvalSha256) ||
    typeof parsed.reviewedAt !== "string" || Number.isNaN(Date.parse(parsed.reviewedAt)) ||
    typeof parsed.reviewedBy !== "string" || parsed.reviewedBy.trim().length === 0
  ) throw new UnqualifiedModelPolicyError("Qualification manifest lacks exact reviewed contract, source, run, pin, approval, or reviewer evidence.");

  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  if (rawCandidates.length !== CANDIDATE_NAMES.length || sha256Canonical(rawCandidates) !== parsed.candidateOrderSha256) {
    throw new UnqualifiedModelPolicyError("Qualification manifest candidate set is absent or does not match its reviewed digest.");
  }
  const candidates: QualifiedModelTier[] = rawCandidates.map((value, index) => {
    const candidate = object(value);
    if (
      !candidate || !hasExactKeys(candidate, ["name", "model", "reasoningEffort", "estimatedInputMicrosPerMillion", "estimatedOutputMicrosPerMillion"]) ||
      candidate.name !== CANDIDATE_NAMES[index] || candidate.reasoningEffort !== CANDIDATE_EFFORTS[index] ||
      typeof candidate.model !== "string" || candidate.model.trim().length === 0 ||
      typeof candidate.estimatedInputMicrosPerMillion !== "number" || !Number.isSafeInteger(candidate.estimatedInputMicrosPerMillion) || candidate.estimatedInputMicrosPerMillion <= 0 ||
      typeof candidate.estimatedOutputMicrosPerMillion !== "number" || !Number.isSafeInteger(candidate.estimatedOutputMicrosPerMillion) || candidate.estimatedOutputMicrosPerMillion <= 0
    ) throw new UnqualifiedModelPolicyError(`Qualification manifest has an invalid reviewed candidate at tier ${index}.`);
    return candidate as unknown as QualifiedModelTier;
  });

  const approval = object(parsed.approval);
  const checklist = object(approval?.checklist);
  if (
    !approval || !hasExactKeys(approval, ["status", "qualificationRunSha256", "draftPinsSha256", "reviewedBy", "reviewedAt", "checklist"]) ||
    !checklist || !hasExactKeys(checklist, ["allOutputsReviewed", "prohibitedClaimsReviewed", "traceabilityReviewed", "fixtureComparabilityReviewed", "pinsApproved"]) ||
    Object.values(checklist).some((value) => value !== true) || approval.status !== "approved" ||
    approval.qualificationRunSha256 !== parsed.qualificationRunSha256 || approval.draftPinsSha256 !== parsed.draftPinsSha256 ||
    approval.reviewedBy !== parsed.reviewedBy || approval.reviewedAt !== parsed.reviewedAt ||
    sha256Canonical(approval) !== parsed.approvalSha256
  ) throw new UnqualifiedModelPolicyError("Qualification manifest approval evidence is missing, altered, or not bound to this run and pin set.");

  const rawPins = object(parsed.pins);
  if (!rawPins || !hasExactKeys(rawPins, REPORT_TYPES) || sha256Canonical(rawPins) !== parsed.draftPinsSha256) {
    throw new UnqualifiedModelPolicyError("Qualification manifest reviewed pin set is missing, altered, or incomplete.");
  }
  const policy = {} as Record<ReportType, ReportModelPin>;
  for (const reportType of REPORT_TYPES) {
    const pin = object(rawPins?.[reportType]);
    const tierIndex = candidates.findIndex((tier) => tier.name === pin?.tier);
    if (!pin || tierIndex < 0) throw new UnqualifiedModelPolicyError(`Qualification manifest has no valid reviewed pin for ${reportType}.`);
    const tier = candidates[tierIndex];
    const expectedEscalationIndex = Math.min(tierIndex + 1, candidates.length - 1);
    const escalationTier = candidates[expectedEscalationIndex];
    if (
      !hasExactKeys(pin, ["tier", "model", "reasoningEffort", "escalationTier", "escalationModel", "escalationReasoningEffort", "maxOutputTokens"]) ||
      pin.model !== tier.model ||
      pin.reasoningEffort !== tier.reasoningEffort || typeof pin.maxOutputTokens !== "number" ||
      !Number.isSafeInteger(pin.maxOutputTokens) || pin.maxOutputTokens < 1_024 ||
      pin.escalationTier !== escalationTier.name || pin.escalationModel !== escalationTier.model ||
      pin.escalationReasoningEffort !== escalationTier.reasoningEffort
    ) throw new UnqualifiedModelPolicyError(`Qualification manifest has no valid reviewed pin for ${reportType}.`);
    policy[reportType] = {
      pinnedTier: tierIndex,
      model: pin.model,
      reasoningEffort: pin.reasoningEffort as OpenRouterReasoningEffort,
      escalationTier: expectedEscalationIndex,
      escalationModel: pin.escalationModel,
      escalationReasoningEffort: pin.escalationReasoningEffort as OpenRouterReasoningEffort,
      maxOutputTokens: pin.maxOutputTokens,
    };
  }
  return { manifest: parsed as unknown as ReviewedQualificationManifest, manifestSha256, policy };
}

export interface CostBudget {
  readonly capMicros: number;
  readonly spentMicros: number;
}

export class ReportCostCapError extends Error {
  constructor(readonly capMicros: number, readonly spentMicros: number, readonly estimatedNextCallMicros: number) {
    super(`Report generation cost cap would be exceeded (${spentMicros} + ${estimatedNextCallMicros} > ${capMicros} micros).`);
    this.name = "ReportCostCapError";
  }
}

export function estimatedCallCostMicros(tier: QualifiedModelTier, prompt: string, maxOutputTokens: number): number {
  const estimatedInputTokens = Math.ceil(prompt.length / 4);
  return Math.ceil(
    (estimatedInputTokens * tier.estimatedInputMicrosPerMillion + maxOutputTokens * tier.estimatedOutputMicrosPerMillion) / 1_000_000,
  );
}

export function assertCallWithinCostCap(budget: CostBudget, tier: QualifiedModelTier, prompt: string, maxOutputTokens: number): void {
  const estimated = estimatedCallCostMicros(tier, prompt, maxOutputTokens);
  if (budget.spentMicros + estimated > budget.capMicros) throw new ReportCostCapError(budget.capMicros, budget.spentMicros, estimated);
}

export function totalUsage(usages: readonly OpenRouterUsage[]): Omit<OpenRouterUsage, "generationId" | "requestId" | "model"> & {
  readonly generationId: string;
  readonly requestId?: string;
  readonly model: string;
  readonly generationIds: readonly string[];
  readonly attempts: number;
} {
  const final = usages.at(-1);
  if (!final) throw new Error("Cannot aggregate empty OpenRouter usage.");
  return {
    generationId: final.generationId,
    requestId: final.requestId,
    model: final.model,
    generationIds: usages.map((usage) => usage.generationId),
    attempts: usages.length,
    inputTokens: usages.reduce((sum, usage) => sum + usage.inputTokens, 0),
    outputTokens: usages.reduce((sum, usage) => sum + usage.outputTokens, 0),
    reasoningTokens: usages.reduce((sum, usage) => sum + usage.reasoningTokens, 0),
    totalTokens: usages.reduce((sum, usage) => sum + usage.totalTokens, 0),
    costMicros: usages.reduce((sum, usage) => sum + usage.costMicros, 0),
    currency: "USD",
  };
}
