import type { ReportType } from "../../question-engine/types.ts";
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

export interface ReviewedQualificationManifest {
  readonly manifestVersion: "1";
  readonly status: "reviewed";
  readonly contractId: "PWQE3-CONTRACT-2";
  readonly integrityContractId: "PWQE3-INTEGRITY-1";
  readonly promptRelease: "4.1.0";
  readonly fixtureSetSha256: string;
  readonly reviewedAt: string;
  readonly reviewedBy: string;
  readonly pins: Readonly<Record<ReportType, {
    readonly tier: QualifiedModelTier["name"];
    readonly model: string;
    readonly reasoningEffort: OpenRouterReasoningEffort;
    readonly escalationTier: QualifiedModelTier["name"];
    readonly escalationModel: string;
    readonly escalationReasoningEffort: OpenRouterReasoningEffort;
    readonly maxOutputTokens: number;
  }>>;
}

export class UnqualifiedModelPolicyError extends Error {
  constructor(message = "Live OpenRouter generation is disabled until OPENROUTER_QUALIFICATION_MANIFEST_JSON contains a reviewed qualification manifest for every report type.") {
    super(message);
    this.name = "UnqualifiedModelPolicyError";
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function activateReviewedQualificationManifest(raw: string | undefined): { manifest: ReviewedQualificationManifest; policy: ActivatedReportModelPolicy } {
  if (!raw) throw new UnqualifiedModelPolicyError();
  let parsed: Record<string, unknown>;
  try {
    parsed = object(JSON.parse(raw)) ?? {};
  } catch (error) {
    throw new UnqualifiedModelPolicyError(`Qualification manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (
    parsed.manifestVersion !== "1" || parsed.status !== "reviewed" ||
    parsed.contractId !== "PWQE3-CONTRACT-2" || parsed.integrityContractId !== "PWQE3-INTEGRITY-1" ||
    parsed.promptRelease !== "4.1.0" || typeof parsed.fixtureSetSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(parsed.fixtureSetSha256) ||
    typeof parsed.reviewedAt !== "string" || Number.isNaN(Date.parse(parsed.reviewedAt)) ||
    typeof parsed.reviewedBy !== "string" || parsed.reviewedBy.trim().length === 0
  ) throw new UnqualifiedModelPolicyError("Qualification manifest lacks reviewed contract, fixture digest, timestamp, or reviewer evidence.");
  const rawPins = object(parsed.pins);
  const policy = {} as Record<ReportType, ReportModelPin>;
  for (const reportType of ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const) {
    const pin = object(rawPins?.[reportType]);
    const tierIndex = QUALIFICATION_MODEL_ORDER.findIndex((tier) => tier.name === pin?.tier);
    if (!pin || tierIndex < 0) throw new UnqualifiedModelPolicyError(`Qualification manifest has no valid reviewed pin for ${reportType}.`);
    const tier = QUALIFICATION_MODEL_ORDER[tierIndex];
    const expectedEscalationIndex = Math.min(tierIndex + 1, QUALIFICATION_MODEL_ORDER.length - 1);
    const escalationTier = QUALIFICATION_MODEL_ORDER[expectedEscalationIndex];
    if (
      typeof pin.model !== "string" || !pin.model.trim() ||
      pin.reasoningEffort !== tier.reasoningEffort || typeof pin.maxOutputTokens !== "number" ||
      !Number.isInteger(pin.maxOutputTokens) || pin.maxOutputTokens < 1_024 ||
      pin.escalationTier !== escalationTier.name || typeof pin.escalationModel !== "string" || !pin.escalationModel.trim() ||
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
  return { manifest: parsed as unknown as ReviewedQualificationManifest, policy };
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
