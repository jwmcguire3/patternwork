import type { JsonObject } from "../../question-engine/types.ts";

export type OpenRouterReasoningEffort = "low" | "medium" | "high" | "max";

export interface OpenRouterProviderPolicy {
  readonly data_collection: "deny";
  readonly require_parameters: true;
  /** Restrict OpenRouter to these provider slugs when an experiment pins an upstream. */
  readonly only?: readonly string[];
  /** Prevent OpenRouter from falling back to a provider outside the chosen route. */
  readonly allow_fallbacks?: boolean;
  readonly max_price?: {
    /** OpenRouter price ceiling in USD per million prompt tokens. */
    readonly prompt: number;
    /** OpenRouter price ceiling in USD per million completion tokens. */
    readonly completion: number;
  };
}

export type OpenRouterRequestProviderPolicy = OpenRouterProviderPolicy;

export interface OpenRouterPromptCacheOptions {
  readonly mode: "explicit";
}

export const OPENROUTER_PROVIDER_POLICY: OpenRouterProviderPolicy = {
  data_collection: "deny",
  require_parameters: true,
};

export interface OpenRouterUsage {
  readonly generationId: string;
  readonly requestId?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly costMicros: number;
  readonly currency: "USD";
  readonly model: string;
}

export type OpenRouterFailureKind =
  | "invalid_json"
  | "refusal"
  | "provider_error"
  | "protocol"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "network"
  | "client_error";

export type OpenRouterGenerationResult =
  | { readonly ok: true; readonly output: JsonObject; readonly usage: OpenRouterUsage; readonly finishReason?: string }
  | {
      readonly ok: false;
      readonly kind: "invalid_json" | "refusal" | "provider_error";
      readonly message: string;
      readonly usage: OpenRouterUsage;
      readonly rawContent?: string;
      readonly finishReason?: string;
      /** Allowlisted metadata only; upstream messages and raw metadata are never persisted. */
      readonly providerDiagnostic?: {
        readonly code?: string;
        readonly type?: string;
        readonly providerName?: string;
        readonly upstreamCode?: string;
        readonly metadataKeys?: readonly string[];
        readonly hints?: readonly string[];
      };
    };

export interface OpenRouterGenerationRequest {
  readonly model: string;
  readonly reasoningEffort: OpenRouterReasoningEffort;
  readonly system: string;
  readonly prompt: string;
  readonly schemaName: string;
  readonly schema: JsonObject;
  readonly maxOutputTokens: number;
  readonly idempotencyKey: string;
  /** Optional request-specific provider constraints included in the serialized body. */
  readonly providerPolicy?: OpenRouterRequestProviderPolicy;
  /** Optional provider request cache control included in the serialized body. */
  readonly promptCacheOptions?: OpenRouterPromptCacheOptions;
  /** Request usage and billing metadata explicitly when supported by OpenRouter. */
  readonly includeUsage?: boolean;
}

/** Local-only comparison values. Never place these on a generation request. */
export interface ProviderPrivacyIdentityContext {
  /** Set only after the caller reviews every local identity source for this report subject. */
  readonly identityInventoryReviewed?: true;
  readonly respondentNames?: readonly string[];
  readonly accountIds?: readonly string[];
  readonly emails?: readonly string[];
  readonly otherIdentityTokens?: readonly string[];
}

export interface OpenRouterTransport {
  /** Exact endpoint used by this transport; live qualification fingerprints require it. */
  readonly endpoint?: string;
  generate(request: OpenRouterGenerationRequest, localIdentityContext?: ProviderPrivacyIdentityContext): Promise<OpenRouterGenerationResult>;
}

export class OpenRouterTransportError extends Error {
  readonly kind: Exclude<OpenRouterFailureKind, "invalid_json" | "refusal" | "provider_error">;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly statusCode?: number;
  readonly providerCode?: string;
  readonly providerParam?: string;
  readonly providerName?: string;
  readonly providerUpstreamCode?: string;
  /** Bounded upstream error.raw text, populated only by explicitly opted-in diagnostics. */
  readonly providerErrorRaw?: string;
  readonly providerMetadataKeys?: readonly string[];
  readonly providerHints?: readonly string[];

  constructor(
    kind: Exclude<OpenRouterFailureKind, "invalid_json" | "refusal" | "provider_error">,
    message: string,
    options: { retryable: boolean; retryAfterMs?: number; statusCode?: number; providerCode?: string; providerParam?: string; providerName?: string; providerUpstreamCode?: string; providerErrorRaw?: string; providerMetadataKeys?: readonly string[]; providerHints?: readonly string[]; cause?: unknown },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "OpenRouterTransportError";
    this.kind = kind;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs;
    this.statusCode = options.statusCode;
    this.providerCode = options.providerCode;
    this.providerParam = options.providerParam;
    this.providerName = options.providerName;
    this.providerUpstreamCode = options.providerUpstreamCode;
    this.providerErrorRaw = options.providerErrorRaw;
    this.providerMetadataKeys = options.providerMetadataKeys;
    this.providerHints = options.providerHints;
  }
}
