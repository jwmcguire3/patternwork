import type { JsonObject } from "../../question-engine/types.ts";

export type OpenRouterReasoningEffort = "low" | "medium" | "high" | "max";

export interface OpenRouterProviderPolicy {
  readonly zdr: true;
  readonly data_collection: "deny";
  readonly require_parameters: true;
}

export const OPENROUTER_PROVIDER_POLICY: OpenRouterProviderPolicy = {
  zdr: true,
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
  | "protocol"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "network"
  | "client_error";

export type OpenRouterGenerationResult =
  | { readonly ok: true; readonly output: JsonObject; readonly usage: OpenRouterUsage }
  | {
      readonly ok: false;
      readonly kind: "invalid_json" | "refusal";
      readonly message: string;
      readonly usage: OpenRouterUsage;
      readonly rawContent?: string;
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
}

export interface OpenRouterTransport {
  generate(request: OpenRouterGenerationRequest): Promise<OpenRouterGenerationResult>;
}

export class OpenRouterTransportError extends Error {
  readonly kind: Exclude<OpenRouterFailureKind, "invalid_json" | "refusal">;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly statusCode?: number;
  readonly providerCode?: string;
  readonly providerParam?: string;
  readonly providerName?: string;
  readonly providerUpstreamCode?: string;
  readonly providerMetadataKeys?: readonly string[];
  readonly providerHints?: readonly string[];

  constructor(
    kind: Exclude<OpenRouterFailureKind, "invalid_json" | "refusal">,
    message: string,
    options: { retryable: boolean; retryAfterMs?: number; statusCode?: number; providerCode?: string; providerParam?: string; providerName?: string; providerUpstreamCode?: string; providerMetadataKeys?: readonly string[]; providerHints?: readonly string[]; cause?: unknown },
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
    this.providerMetadataKeys = options.providerMetadataKeys;
    this.providerHints = options.providerHints;
  }
}
