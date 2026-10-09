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
  zdr: true,
  data_collection: "deny",
  require_parameters: true,
  max_price: GPT6_LUNA_PROVIDER_PRICE_CEILING,
};

export const GPT6_LUNA_BILLING_BASIS_SHA256 = sha256Canonical(GPT6_LUNA_BILLING_BASIS);

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
  if (request.model !== GPT6_LUNA_BILLING_BASIS.model) {
    throw new Error(`No pinned billing basis exists for model ${request.model}.`);
  }
  if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0 || request.maxOutputTokens > GPT6_LUNA_BILLING_BASIS.maxCompletionTokens) {
    throw new Error(`maxOutputTokens must be between 1 and ${GPT6_LUNA_BILLING_BASIS.maxCompletionTokens}.`);
  }
  const promptRateMicrosPerMillion = Math.round(GPT6_LUNA_BILLING_BASIS.promptUsdPerMillionTokens * 1_000_000);
  const completionRateMicrosPerMillion = Math.round(GPT6_LUNA_BILLING_BASIS.completionUsdPerMillionTokens * 1_000_000);
  return Math.ceil((
    GPT6_LUNA_BILLING_BASIS.contextTokens * promptRateMicrosPerMillion
    + request.maxOutputTokens * completionRateMicrosPerMillion
  ) / 1_000_000);
}
