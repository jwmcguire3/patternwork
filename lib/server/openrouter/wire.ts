import type { OpenRouterGenerationRequest } from "./types.ts";
import { OPENROUTER_PROVIDER_POLICY } from "./types.ts";
import { projectOpenRouterStrictSchemaObject } from "./schema-projection.ts";

export const OPENROUTER_DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions" as const;

/**
 * This is the one canonical serializer used both by the HTTP client and the
 * qualification attempt journal. Keep billing-relevant fields here so the
 * journal hashes exactly the body that the client transmits.
 */
export function buildOpenRouterWirePayload(request: OpenRouterGenerationRequest): Record<string, unknown> {
  const provider = request.providerPolicy ?? OPENROUTER_PROVIDER_POLICY;
  return {
    model: request.model,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ],
    stream: false,
    max_completion_tokens: request.maxOutputTokens,
    reasoning: { effort: request.reasoningEffort },
    provider,
    ...(request.promptCacheOptions ? { prompt_cache_options: request.promptCacheOptions } : {}),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: request.schemaName,
        strict: true,
        schema: projectOpenRouterStrictSchemaObject(request.schema),
      },
    },
  };
}
