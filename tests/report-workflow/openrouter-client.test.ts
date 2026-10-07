import assert from "node:assert/strict";
import test from "node:test";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import { OpenRouterTransportError, type OpenRouterGenerationRequest } from "../../lib/server/openrouter/types.ts";

const request: OpenRouterGenerationRequest = {
  model: "mock/luna",
  reasoningEffort: "low",
  system: "Return JSON.",
  prompt: "input",
  schemaName: "test_schema",
  schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
  maxOutputTokens: 1_024,
  idempotencyKey: "stable-request-key",
};

function response(content: string, overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    id: "gen-real-1",
    model: "provider/model",
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, cost: 0.0012, completion_tokens_details: { reasoning_tokens: 2 } },
    ...overrides,
  }, { headers: { "x-request-id": "req-real-1" } });
}

test("OpenRouter request enforces strict schema and ZDR/no-collection routing and captures actual usage", async () => {
  let body: Record<string, unknown> | undefined;
  const client = new OpenRouterClient({ apiKey: "test", fetch: async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return response('{"ok":true}');
  } });
  const result = await client.generate(request);
  assert.equal(result.ok, true);
  assert.equal(body?.max_completion_tokens, request.maxOutputTokens);
  assert.equal("max_tokens" in (body ?? {}), false);
  assert.deepEqual(body?.reasoning, { effort: request.reasoningEffort });
  assert.deepEqual(body?.provider, { zdr: true, data_collection: "deny", require_parameters: true });
  assert.deepEqual(body?.response_format, { type: "json_schema", json_schema: { name: "test_schema", strict: true, schema: request.schema } });
  assert.equal(result.usage.generationId, "gen-real-1");
  assert.equal(result.usage.reasoningTokens, 2);
  assert.equal(result.usage.costMicros, 1_200);
});

for (const [status, kind] of [[429, "rate_limited"], [503, "server_error"]] as const) {
  test(`classifies HTTP ${status} as retryable ${kind}`, async () => {
    const client = new OpenRouterClient({ apiKey: "test", fetch: async () => Response.json({ error: { message: "try later" } }, { status, headers: { "retry-after": "1" } }) });
    await assert.rejects(client.generate(request), (error: unknown) => {
      assert.ok(error instanceof OpenRouterTransportError);
      assert.equal(error.kind, kind);
      assert.equal(error.retryable, true);
      assert.equal(error.statusCode, status);
      return true;
    });
  });
}

test("classifies refusal and malformed structured content without releasing output", async () => {
  const refusal = new OpenRouterClient({ apiKey: "test", fetch: async () => response("", { choices: [{ message: { content: "", refusal: "cannot comply" }, finish_reason: "stop" }] }) });
  const refused = await refusal.generate(request);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.kind, "refusal");

  const malformed = new OpenRouterClient({ apiKey: "test", fetch: async () => response("not-json") });
  const invalid = await malformed.generate(request);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.kind, "invalid_json");
});

test("retains bounded provider error code and parameter diagnostics without exposing provider message text", async () => {
  const client = new OpenRouterClient({ apiKey: "test", fetch: async () => Response.json({
    error: { code: "unsupported_parameter", param: "reasoning.exclude", message: "sensitive provider detail", metadata: { raw: "Unsupported reasoning parameter in JSON schema request" } },
  }, { status: 400 }) });
  await assert.rejects(client.generate(request), (error: unknown) => {
    assert.ok(error instanceof OpenRouterTransportError);
    assert.equal(error.providerCode, "unsupported_parameter");
    assert.equal(error.providerParam, "reasoning.exclude");
    assert.deepEqual(error.providerMetadataKeys, ["error.raw"]);
    assert.deepEqual(error.providerHints, ["reasoning", "schema", "schema_keyword"]);
    return true;
  });
});

test("classifies an aborted request as retryable timeout", async () => {
  const client = new OpenRouterClient({ apiKey: "test", timeoutMs: 5, fetch: async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }) });
  await assert.rejects(client.generate(request), (error: unknown) => {
    assert.ok(error instanceof OpenRouterTransportError);
    assert.equal(error.kind, "timeout");
    assert.equal(error.retryable, true);
    return true;
  });
});
