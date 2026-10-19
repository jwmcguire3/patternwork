import assert from "node:assert/strict";
import test from "node:test";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import { OpenRouterTransportError, type OpenRouterGenerationRequest } from "../../lib/server/openrouter/types.ts";
import { mergeProviderPrivacyIdentityContexts } from "../../lib/server/openrouter/privacy-boundary.ts";
import { buildOpenRouterWirePayload } from "../../lib/server/openrouter/wire.ts";
import { REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT } from "../../lib/server/openrouter/privacy-boundary.ts";
import { GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY } from "../../lib/server/openrouter/qualification-budget.ts";

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

function testClient(options: ConstructorParameters<typeof OpenRouterClient>[0] = {}): OpenRouterClient {
  return new OpenRouterClient({ apiKey: "test", privacyIdentityContext: REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT, ...options });
}

function response(content: string, overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    id: "gen-real-1",
    model: "provider/model",
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, cost: 0.0012, completion_tokens_details: { reasoning_tokens: 2 } },
    ...overrides,
  }, { headers: { "x-request-id": "req-real-1" } });
}

test("OpenRouter request enforces strict schema and no-collection routing and captures actual usage", async () => {
  let body: Record<string, unknown> | undefined;
  const client = testClient({ fetch: async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return response('{"ok":true}');
  } });
  const result = await client.generate(request);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.finishReason, "stop");
  assert.equal(body?.max_completion_tokens, request.maxOutputTokens);
  assert.equal("max_tokens" in (body ?? {}), false);
  assert.deepEqual(body?.reasoning, { effort: request.reasoningEffort });
  assert.deepEqual(body?.provider, { data_collection: "deny", require_parameters: true });
  assert.equal(Object.hasOwn(body?.provider as object, "zdr"), false);
  assert.deepEqual(body?.response_format, { type: "json_schema", json_schema: { name: "test_schema", strict: true, schema: request.schema } });
  assert.equal(result.usage.generationId, "gen-real-1");
  assert.equal(result.usage.reasoningTokens, 2);
  assert.equal(result.usage.costMicros, 1_200);
});

test("qualification price ceiling and no-cache controls survive exact HTTP serialization", async () => {
  const controlledRequest: OpenRouterGenerationRequest = {
    ...request,
    model: "openai/gpt-6-luna",
    reasoningEffort: "max",
    providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
    promptCacheOptions: { mode: "explicit" },
    includeUsage: true,
  };
  const expected = buildOpenRouterWirePayload(controlledRequest);
  let capturedBody = "";
  const client = testClient({ fetch: async (_input, init) => {
    capturedBody = String(init?.body);
    return response('{"ok":true}', { model: controlledRequest.model });
  } });
  await client.generate(controlledRequest);
  assert.equal(capturedBody, JSON.stringify(expected));
  const body = JSON.parse(capturedBody) as Record<string, unknown>;
  assert.deepEqual(body.provider, { data_collection: "deny", require_parameters: true, max_price: { prompt: 0.1, completion: 0.5 } });
  assert.equal(Object.hasOwn(body.provider as object, "zdr"), false);
  assert.deepEqual(body.prompt_cache_options, { mode: "explicit" });
  assert.deepEqual(body.usage, { include: true });
  assert.deepEqual(body.reasoning, { effort: "max" });
});

test("PWRP 7.1 direct OpenRouter requests fail before API dispatch without budget controls", async () => {
  let dispatches = 0;
  const client = testClient({ fetch: async () => {
    dispatches += 1;
    return response('{"ok":true}');
  } });
  await assert.rejects(client.generate({
    ...request,
    model: "openai/gpt-6-luna",
    schemaName: "patternwork_ifs_pwrp71_candidate_1",
  }), (error: unknown) => {
    assert.ok(error instanceof OpenRouterTransportError);
    assert.equal(error.kind, "client_error");
    assert.match(error.message, /durable budget-prepared request/u);
    return true;
  });
  assert.equal(dispatches, 0);
});

test("OpenRouter privacy boundary blocks respondent names, account IDs, and email values before dispatch", async () => {
  const cases: Array<{ label: string; request: Partial<OpenRouterGenerationRequest> }> = [
    { label: "name field", request: { prompt: JSON.stringify({ respondent_name: "Mara" }) } },
    { label: "account ID field", request: { prompt: JSON.stringify({ account_id: "acct-78421" }) } },
    { label: "email field", request: { prompt: JSON.stringify({ contact_email: "mara@example.test" }) } },
    { label: "email under opaque snapshot key", request: { prompt: JSON.stringify({ snapshot_id: "mara@example.test" }) } },
    { label: "email in schema description", request: { prompt: "input", schema: { ...request.schema, description: "Contact mara@example.test" } } },
    { label: "respondent name output field", request: { schema: { ...request.schema, properties: { respondent_name: { type: "string" } } } } },
    { label: "account ID output field", request: { schema: { ...request.schema, properties: { account_id: { type: "string" } } } } },
    { label: "name-like snapshot identifier", request: { prompt: JSON.stringify({ snapshot_id: "snapshot-Mara" }) } },
  ];
  for (const entry of cases) {
    let dispatches = 0;
    const client = testClient({ fetch: async () => {
      dispatches += 1;
      return response('{"ok":true}');
    } });
    await assert.rejects(client.generate({ ...request, ...entry.request }), (error: unknown) => {
      assert.ok(error instanceof OpenRouterTransportError);
      assert.equal(error.kind, "client_error");
      assert.match(error.message, /local privacy boundary/u);
      assert.equal(error.message.includes("mara@example.test"), false);
      assert.equal(error.message.includes("acct-78421"), false);
      return true;
    }, entry.label);
    assert.equal(dispatches, 0, `${entry.label} must be rejected before HTTP dispatch`);
  }
});

test("OpenRouter refuses all dispatch until a local identity inventory is reviewed", async () => {
  let dispatches = 0;
  const client = new OpenRouterClient({ apiKey: "test", fetch: async () => {
    dispatches += 1;
    return response('{"ok":true}');
  } });
  await assert.rejects(client.generate(request), /local privacy boundary/u);
  assert.equal(dispatches, 0);
});

test("local-only known identities are checked in prompt, schema, correlation ID, and outbound headers", async () => {
  const identityContext = {
    identityInventoryReviewed: true as const,
    respondentNames: ["Mara Jones"],
    accountIds: ["acct-78421"],
    emails: ["mara@example.test"],
  };
  const cases: Array<{ label: string; options?: { appTitle?: string; appUrl?: string; endpoint?: string }; request: Partial<OpenRouterGenerationRequest> }> = [
    { label: "known name in system JSON", request: { system: `Instructions ${JSON.stringify({ respondent_name: "Mara Jones" })}` } },
    { label: "known name in prose", request: { prompt: "Assessment for Mara Jones." } },
    { label: "known name component in prose", request: { prompt: "Assessment for Mara." } },
    { label: "known account ID without a label", request: { prompt: "Assessment account acct-78421." } },
    { label: "known email in schema enum", request: { schema: { ...request.schema, properties: { contact: { enum: ["mara@example.test"] } } } } },
    { label: "known account ID in correlation header", request: { idempotencyKey: "attempt-acct-78421" } },
    { label: "known name in title header", options: { appTitle: "Mara Jones reporting" }, request: {} },
    { label: "email in URL header", options: { appUrl: "https://example.test/?contact=mara@example.test" }, request: {} },
    { label: "known account ID in endpoint URL", options: { endpoint: "https://acct-78421.example.test/v1/chat/completions" }, request: {} },
    { label: "percent-encoded name in URL header", options: { appUrl: "https://example.test/?respondent=Mara%20Jones" }, request: {} },
    { label: "percent-encoded email in endpoint URL", options: { endpoint: "https://example.test/mara%40example.test/v1/chat/completions" }, request: {} },
  ];
  for (const entry of cases) {
    let dispatches = 0;
    const client = testClient({
      ...entry.options,
      privacyIdentityContext: identityContext,
      fetch: async () => { dispatches += 1; return response('{"ok":true}'); },
    });
    await assert.rejects(client.generate({ ...request, ...entry.request }), /local privacy boundary/u, entry.label);
    assert.equal(dispatches, 0, `${entry.label} must be rejected before HTTP dispatch`);
  }
});

test("identity inventory review state survives empty contexts only when every source is reviewed", () => {
  const reviewedEmpty = { identityInventoryReviewed: true as const, respondentNames: [], accountIds: [], emails: [], otherIdentityTokens: [] };
  assert.deepEqual(mergeProviderPrivacyIdentityContexts(reviewedEmpty), reviewedEmpty);
  assert.equal(mergeProviderPrivacyIdentityContexts(reviewedEmpty, { accountIds: ["acct-78421"] })?.identityInventoryReviewed, undefined);
});

test("names-free assessment fields and pseudonymous referent IDs remain eligible", async () => {
  let dispatches = 0;
  const client = testClient({ fetch: async () => {
    dispatches += 1;
    return response('{"ok":true}');
  } });
  const prompt = JSON.stringify({
    snapshot_id: "snapshot-1",
    evidence: [{ person_id: "person-1", answer: "Choose the option describing the event." }],
    accountability: { evidence: "The person took responsibility for the repair." },
  });
  const result = await client.generate({ ...request, prompt });
  assert.equal(result.ok, true);
  assert.equal(dispatches, 1);
});

test("OpenRouter privacy boundary permits schema-validated author labels and opaque IDs", async () => {
  let dispatches = 0;
  const client = testClient({ fetch: async () => {
    dispatches += 1;
    return response('{"ok":true}');
  } });
  const prompt = JSON.stringify({
    snapshot_id: "snapshot-1",
    session_id: "SESSION-0123456789abcdef01234567",
    draft: { name_registry: [{ author_generated: true, entity_kind: "ifs_part", name: "Protector" }] },
  });
  const result = await client.generate({ ...request, prompt });
  assert.equal(result.ok, true);
  assert.equal(dispatches, 1);
});

test("OpenRouter privacy boundary catches account identifiers in prose and rejects invalid opaque IDs", async () => {
  for (const prompt of ["account ID: ZXCV-99881", JSON.stringify({ snapshot_id: "Mara" })]) {
    let dispatches = 0;
    const client = testClient({ fetch: async () => {
      dispatches += 1;
      return response('{"ok":true}');
    } });
    await assert.rejects(client.generate({ ...request, prompt }), /local privacy boundary/u);
    assert.equal(dispatches, 0);
  }
});

test("legacy source fixture IDs remain opaque and known account values cannot bypass that grammar", async () => {
  for (const id of ["A", "B", "C"]) {
    const client = testClient({fetch:async()=>response('{"ok":true}')});
    const result = await client.generate({...request,prompt:JSON.stringify({session_id:`SES-${id}`,snapshot_id:`SNP-PWQE3-FIXTURE-${id}`})});
    assert.equal(result.ok,true);
  }
  for (const value of ["SES-Mara", "SNP-PWQE3-FIXTURE-Mara", "SNP-PWQE3-FIXTURE-D"]) {
    let calls=0;
    const client=testClient({fetch:async()=>{calls++;return response('{"ok":true}');}});
    await assert.rejects(client.generate({...request,prompt:JSON.stringify({snapshot_id:value})}),/local privacy boundary/u);
    assert.equal(calls,0);
  }
  const knownAccount="pwsn_11111111-2222-4333-8444-555555555555";
  let calls=0;
  const client=testClient({privacyIdentityContext:{identityInventoryReviewed:true,accountIds:[knownAccount]},fetch:async()=>{calls++;return response('{"ok":true}');}});
  await assert.rejects(client.generate({...request,prompt:JSON.stringify({snapshot_id:knownAccount})}),/local privacy boundary/u);
  assert.equal(calls,0,"local account identity check precedes the allowed opaque snapshot grammar");
});

test("OpenRouter snapshot IDs accept only source-defined qualification profiles", async () => {
  for (const snapshotId of ["qualification-P01-mapping", "qualification-P09-deepening", "pwrp71-C16-0123456789abcdef", "fictional-C01-mapping", "SN76f0c769594f8a6d96e1"]) {
    let dispatches = 0;
    const client = testClient({ fetch: async () => {
      dispatches += 1;
      return response('{"ok":true}');
    } });
    const result = await client.generate({ ...request, prompt: JSON.stringify({ snapshot_id: snapshotId }) });
    assert.equal(result.ok, true, snapshotId);
    assert.equal(dispatches, 1, `${snapshotId} is a source-defined opaque ID`);
  }

  for (const snapshotId of ["qualification-MARA-mapping", "qualification-P10-mapping", "pwrp71-MARA-0123456789abcdef", "SNMara", "SN76f0c769594f8a6d96e1-account"]) {
    let dispatches = 0;
    const client = testClient({ fetch: async () => {
      dispatches += 1;
      return response('{"ok":true}');
    } });
    await assert.rejects(client.generate({ ...request, prompt: JSON.stringify({ snapshot_id: snapshotId }) }), /local privacy boundary/u);
    assert.equal(dispatches, 0, `${snapshotId} must be rejected before HTTP dispatch`);
  }
});

test("retains provider finish reason so report contracts can reject truncated structured output", async () => {
  const client = testClient({ fetch: async () => response('{"ok":true}', {
    choices: [{ message: { content: '{"ok":true}' }, finish_reason: "length" }],
  }) });
  const result = await client.generate(request);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.finishReason, "length");
});

test("fails closed when the provider omits cost or token usage metadata", async () => {
  for (const omitted of ["cost", "prompt_tokens", "completion_tokens", "total_tokens"]) {
    const usage = { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, cost: 0.0012 };
    delete (usage as Record<string, unknown>)[omitted];
    const client = testClient({ fetch: async () => response('{"ok":true}', { usage }) });
    await assert.rejects(client.generate(request), (error: unknown) => {
      assert.ok(error instanceof OpenRouterTransportError);
      assert.equal(error.kind, "protocol");
      return true;
    });
  }
});

for (const [status, kind] of [[429, "rate_limited"], [503, "server_error"]] as const) {
  test(`classifies HTTP ${status} as retryable ${kind}`, async () => {
    const client = testClient({ fetch: async () => Response.json({ error: { message: "try later" } }, { status, headers: { "retry-after": "1" } }) });
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
  const refusal = testClient({ fetch: async () => response("", { choices: [{ message: { content: "", refusal: "cannot comply" }, finish_reason: "stop" }] }) });
  const refused = await refusal.generate(request);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.kind, "refusal");

  const malformed = testClient({ fetch: async () => response("not-json") });
  const invalid = await malformed.generate(request);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.kind, "invalid_json");
});

test("retains bounded provider error code and parameter diagnostics without exposing provider message text", async () => {
  const client = testClient({ fetch: async () => Response.json({
    error: { code: "unsupported_parameter", param: "reasoning.exclude", message: "sensitive provider detail", metadata: { raw: "Unsupported reasoning parameter in JSON schema request" } },
  }, { status: 400 }) });
  await assert.rejects(client.generate(request), (error: unknown) => {
    assert.ok(error instanceof OpenRouterTransportError);
    assert.equal(error.providerCode, "unsupported_parameter");
    assert.equal(error.providerParam, "reasoning.exclude");
    assert.equal(error.providerErrorRaw, undefined, "provider error.raw stays off unless a diagnostic explicitly opts in");
    assert.deepEqual(error.providerMetadataKeys, ["error.raw"]);
    assert.deepEqual(error.providerHints, ["reasoning", "schema", "schema_keyword"]);
    return true;
  });
});

test("explicit diagnostic mode retains bounded sanitized upstream schema rejection detail", async () => {
  const raw = JSON.stringify({
    error: {
      message: "Invalid JSON schema: unsupported keyword at $.properties.status.enum",
      type: "invalid_request_error",
      param: "response_format.json_schema.schema.properties.status.enum",
      code: "invalid_json_schema",
    },
    authorization: "Bearer provider-secret-value",
    api_key: "sk-proj-provider-secret-value-1234567890",
  });
  const client = testClient({
    captureProviderErrorDetail: true,
    fetch: async () => Response.json({
      error: { message: "Provider returned error", code: 400, metadata: { provider_name: "OpenAI", provider_error_code: "invalid_json_schema", raw } },
    }, { status: 400 }),
  });
  await assert.rejects(client.generate(request), (error: unknown) => {
    assert.ok(error instanceof OpenRouterTransportError);
    assert.equal(error.providerUpstreamCode, "invalid_json_schema");
    assert.ok(error.providerErrorRaw);
    assert.match(error.providerErrorRaw, /unsupported keyword at \$\.properties\.status\.enum/u);
    assert.match(error.providerErrorRaw, /response_format\.json_schema\.schema\.properties\.status\.enum/u);
    assert.equal(error.providerErrorRaw.includes("provider-secret-value"), false);
    return true;
  });
});

test("classifies an aborted request as retryable timeout", async () => {
  const client = testClient({ timeoutMs: 5, fetch: async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }) });
  await assert.rejects(client.generate(request), (error: unknown) => {
    assert.ok(error instanceof OpenRouterTransportError);
    assert.equal(error.kind, "timeout");
    assert.equal(error.retryable, true);
    return true;
  });
});
