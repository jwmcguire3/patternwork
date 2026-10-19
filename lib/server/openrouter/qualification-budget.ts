import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import type { OpenRouterGenerationRequest, OpenRouterProviderPolicy } from "./types.ts";

/** OpenRouter's currently published non-cached GPT-6 Luna pricing basis. */
export const GPT6_LUNA_BILLING_BASIS = {
  basisId: "openrouter-openai-gpt-6-luna-2026-10-09",
  sourceUrl: "https://openrouter.ai/openai/gpt-6-luna?view=api",
  observedOn: "2026-10-09",
  model: "openai/gpt-6-luna",
  contextTokens: 1_050_000,
  maxCompletionTokens: 128_000,
  promptUsdPerMillionTokens: 0.1,
  completionUsdPerMillionTokens: 0.5,
  promptCacheMode: "explicit",
  excludedRequestFeatures: ["tools", "web_search", "images", "audio", "files"],
} as const;

export const GPT6_LUNA_PROVIDER_PRICE_CEILING: NonNullable<OpenRouterProviderPolicy["max_price"]> = {
  prompt: GPT6_LUNA_BILLING_BASIS.promptUsdPerMillionTokens,
  completion: GPT6_LUNA_BILLING_BASIS.completionUsdPerMillionTokens,
};

export const GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY: OpenRouterProviderPolicy = {
  data_collection: "deny",
  require_parameters: true,
  max_price: GPT6_LUNA_PROVIDER_PRICE_CEILING,
};

/** Provider pin used only by the owner-authorized fictional IFS diagnostic. */
export const GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY = {
  ...GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
  only: ["openai"],
  allow_fallbacks: false,
} as const satisfies OpenRouterProviderPolicy;

export const GPT6_LUNA_BILLING_BASIS_SHA256 = sha256Canonical(GPT6_LUNA_BILLING_BASIS);

export function reportBillingBasis(model: string) {
  if (model === GPT6_LUNA_BILLING_BASIS.model) return GPT6_LUNA_BILLING_BASIS;
  throw new Error(`No authorized billing basis exists for model ${model}.`);
}
export function reportBillingBasisSha256(model: string): string { return sha256Canonical(reportBillingBasis(model)); }
export function reportDevProviderPolicy(model: string): OpenRouterProviderPolicy {
  reportBillingBasis(model);
  return GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY;
}

export function validatePositiveMicros(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer in microdollars.`);
  }
}

/**
 * Conservative token-price ceiling: assume the entire model context is billable
 * input and add the full requested completion allowance. OpenRouter's max_price
 * limits provider rates; the context/output token ceilings bound token counts.
 * This is provider-dependent, not a locally enforceable invoice guarantee.
 */
export function maximumQuotedCallCostMicros(request: OpenRouterGenerationRequest): number {
  const basis = reportBillingBasis(request.model);
  if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0 || request.maxOutputTokens > basis.maxCompletionTokens) {
    throw new Error(`maxOutputTokens must be between 1 and ${basis.maxCompletionTokens}.`);
  }
  const promptRateMicrosPerMillion = Math.round(basis.promptUsdPerMillionTokens * 1_000_000);
  const completionRateMicrosPerMillion = Math.round(basis.completionUsdPerMillionTokens * 1_000_000);
  return Math.ceil((
    basis.contextTokens * promptRateMicrosPerMillion
    + request.maxOutputTokens * completionRateMicrosPerMillion
  ) / 1_000_000);
}
