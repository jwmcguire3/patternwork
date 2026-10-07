import type { JsonObject } from "../../question-engine/types.ts";
import {
  OPENROUTER_PROVIDER_POLICY,
  OpenRouterTransportError,
  type OpenRouterGenerationRequest,
  type OpenRouterGenerationResult,
  type OpenRouterTransport,
  type OpenRouterUsage,
} from "./types.ts";

const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface OpenRouterClientOptions {
  readonly apiKey?: string;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly fetch?: FetchLike;
  readonly appUrl?: string;
  readonly appTitle?: string;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function retryAfterMs(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

function parseUsage(body: Record<string, unknown>, response: Response, requestedModel: string): OpenRouterUsage {
  const generationId = typeof body.id === "string" && body.id.length > 0 ? body.id : undefined;
  const usage = asObject(body.usage);
  const details = asObject(usage?.completion_tokens_details);
  const inputTokens = finiteNumber(usage?.prompt_tokens);
  const outputTokens = finiteNumber(usage?.completion_tokens);
  const totalTokens = finiteNumber(usage?.total_tokens);
  const reasoningTokens = finiteNumber(details?.reasoning_tokens) ?? 0;
  const cost = finiteNumber(usage?.cost);
  if (!generationId || inputTokens === undefined || outputTokens === undefined || totalTokens === undefined || cost === undefined) {
    throw new OpenRouterTransportError("protocol", "OpenRouter omitted required generation usage metadata.", { retryable: false });
  }
  return {
    generationId,
    requestId: response.headers.get("x-request-id") ?? response.headers.get("x-openrouter-request-id") ?? undefined,
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    costMicros: Math.round(cost * 1_000_000),
    currency: "USD",
    model: typeof body.model === "string" ? body.model : requestedModel,
  };
}

function safeProviderField(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 96 || !/^[a-zA-Z0-9_.:/-]+$/.test(value)) return undefined;
  return value;
}

const PROVIDER_ERROR_HINTS = [
  ["reasoning", /reasoning|effort/],
  ["schema", /schema|response_format|structured output/],
  ["schema_required", /required.{0,32}(missing|must|include|array|every)|all fields.{0,32}required/],
  ["schema_closed_object", /additional.?properties/],
  ["schema_keyword", /unsupported.{0,32}(schema|keyword)|keyword.{0,32}not supported/],
  ["schema_root", /root.{0,32}(object|anyof)|root level/],
  ["schema_reference", /\$ref|reference.{0,32}(schema|definition)|definition.{0,32}reference/],
  ["schema_limits", /schema.{0,32}(too large|too many|limit|nesting)|(?:too large|too many).{0,32}schema/],
  ["privacy", /zdr|zero.data.retention|data_collection|privacy/],
  ["model", /model|endpoint|provider/],
  ["tokens", /token|context.length|maximum length/],
  ["account", /account|credit|balance|quota|billing/],
  ["auth", /unauthorized|authentication|api.key|permission/],
] as const;

async function responseError(response: Response): Promise<{ message: string; providerCode?: string; providerParam?: string; providerName?: string; providerUpstreamCode?: string; providerMetadataKeys?: readonly string[]; providerHints?: readonly string[] }> {
  try {
    const body = asObject(await response.json());
    const error = asObject(body?.error);
    const providerCode = typeof error?.code === "number" && Number.isFinite(error.code)
      ? String(error.code)
      : safeProviderField(error?.code);
    const providerParam = safeProviderField(error?.param);
    const metadata = asObject(error?.metadata);
    const providerName = safeProviderField(metadata?.provider_name);
    const providerUpstreamCode = safeProviderField(metadata?.provider_error_code);
    const routerMetadata = asObject(body?.openrouter_metadata);
    const metadataKeys = [
      ...(metadata ? Object.keys(metadata).map((key) => `error.${key}`) : []),
      ...(routerMetadata ? Object.keys(routerMetadata).map((key) => `router.${key}`) : []),
    ];
    const providerMetadataKeys = metadataKeys.filter((key) => /^[a-zA-Z0-9_.-]{1,72}$/.test(key)).slice(0, 16);
    const diagnosticText = JSON.stringify([metadata, routerMetadata]).toLowerCase();
    const providerHints = PROVIDER_ERROR_HINTS
      .filter(([, pattern]) => pattern.test(diagnosticText))
      .map(([hint]) => hint);
    return {
      message: typeof error?.message === "string" ? error.message : `OpenRouter returned HTTP ${response.status}.`,
      ...(providerCode ? { providerCode } : {}),
      ...(providerParam ? { providerParam } : {}),
      ...(providerName ? { providerName } : {}),
      ...(providerUpstreamCode ? { providerUpstreamCode } : {}),
      ...(providerMetadataKeys?.length ? { providerMetadataKeys } : {}),
      ...(providerHints.length ? { providerHints } : {}),
    };
  } catch {
    return { message: `OpenRouter returned HTTP ${response.status}.` };
  }
}

export class OpenRouterClient implements OpenRouterTransport {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly appUrl?: string;
  private readonly appTitle?: string;

  constructor(options: OpenRouterClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.appUrl = options.appUrl ?? process.env.OPENROUTER_APP_URL;
    this.appTitle = options.appTitle ?? process.env.OPENROUTER_APP_NAME;
  }

  async generate(request: OpenRouterGenerationRequest): Promise<OpenRouterGenerationResult> {
    if (!this.apiKey) {
      throw new OpenRouterTransportError("client_error", "OPENROUTER_API_KEY is not configured; live qualification and generation are disabled.", { retryable: false });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "x-openrouter-metadata": "enabled",
          "x-request-id": request.idempotencyKey,
          ...(this.appUrl ? { "http-referer": this.appUrl } : {}),
          ...(this.appTitle ? { "x-title": this.appTitle } : {}),
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
          stream: false,
          max_completion_tokens: request.maxOutputTokens,
          reasoning: { effort: request.reasoningEffort },
          provider: OPENROUTER_PROVIDER_POLICY,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.schemaName,
              strict: true,
              schema: request.schema,
            },
          },
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new OpenRouterTransportError("timeout", `OpenRouter request exceeded ${this.timeoutMs} ms.`, { retryable: true, cause: error });
      }
      throw new OpenRouterTransportError("network", "OpenRouter request failed before a response was received.", { retryable: true, cause: error });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const providerError = await responseError(response);
      const errorDetails = {
        statusCode: response.status,
        ...(providerError.providerCode ? { providerCode: providerError.providerCode } : {}),
        ...(providerError.providerParam ? { providerParam: providerError.providerParam } : {}),
        ...(providerError.providerName ? { providerName: providerError.providerName } : {}),
        ...(providerError.providerUpstreamCode ? { providerUpstreamCode: providerError.providerUpstreamCode } : {}),
        ...(providerError.providerMetadataKeys ? { providerMetadataKeys: providerError.providerMetadataKeys } : {}),
        ...(providerError.providerHints ? { providerHints: providerError.providerHints } : {}),
      };
      if (response.status === 429) {
        throw new OpenRouterTransportError("rate_limited", providerError.message, { ...errorDetails, retryable: true, retryAfterMs: retryAfterMs(response) });
      }
      if (response.status >= 500) {
        throw new OpenRouterTransportError("server_error", providerError.message, { ...errorDetails, retryable: true, retryAfterMs: retryAfterMs(response) });
      }
      throw new OpenRouterTransportError("client_error", providerError.message, { ...errorDetails, retryable: false });
    }

    let body: Record<string, unknown>;
    try {
      body = asObject(await response.json()) ?? {};
    } catch (error) {
      throw new OpenRouterTransportError("protocol", "OpenRouter returned a non-JSON response envelope.", { retryable: false, cause: error });
    }
    const usage = parseUsage(body, response, request.model);
    const choice = Array.isArray(body.choices) ? asObject(body.choices[0]) : undefined;
    const message = asObject(choice?.message);
    const refusal = message?.refusal;
    const finishReason = choice?.finish_reason;
    const finishMetadata = typeof finishReason === "string" ? { finishReason } : {};
    if ((typeof refusal === "string" && refusal.length > 0) || finishReason === "content_filter") {
      return { ok: false, kind: "refusal", message: typeof refusal === "string" ? refusal : "The provider refused the generation.", usage, ...finishMetadata };
    }
    const content = message?.content;
    if (typeof content !== "string") {
      return { ok: false, kind: "invalid_json", message: "OpenRouter response contained no string JSON content.", usage, ...finishMetadata };
    }
    try {
      const output = JSON.parse(content) as unknown;
      if (!asObject(output)) return { ok: false, kind: "invalid_json", message: "Structured output was not a JSON object.", usage, rawContent: content, ...finishMetadata };
      return { ok: true, output: output as JsonObject, usage, ...finishMetadata };
    } catch {
      return { ok: false, kind: "invalid_json", message: "Structured output was invalid JSON.", usage, rawContent: content, ...finishMetadata };
    }
  }
}
