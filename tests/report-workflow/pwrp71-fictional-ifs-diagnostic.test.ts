import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { OpenRouterGenerationRequest, OpenRouterTransport } from "../../lib/server/openrouter/types.ts";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import { OPENROUTER_DEFAULT_ENDPOINT } from "../../lib/server/openrouter/wire.ts";
import { GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY } from "../../lib/server/openrouter/qualification-budget.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import { readPwrp71QualificationRun } from "../../lib/server/reports/qualification/runner.ts";
import { FileQualificationAttemptStore } from "../../lib/server/reports/qualification/attempt-store.ts";
import {
  FICTIONAL_IFS_DIAGNOSTIC_LIMITS,
  FICTIONAL_IFS_DIAGNOSTIC_PINS,
  FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
  FICTIONAL_IFS_DIAGNOSTIC_SCHEMA,
  assertDiagnosticSourcePins,
  createDiagnosticFetch,
  diagnosticManifestCannotQualify,
  parseFictionalIfsDiagnosticArgs,
  runFictionalIfsDiagnostic,
  type FictionalIfsDiagnosticInvocation,
} from "../../scripts/pwrp71-fictional-ifs-diagnostic/diagnostic.ts";
import { loadPwrp71FictionalDiagnosticFixture } from "../../lib/server/reports/qualification/runner.ts";
import { OpenRouterTransportError, type OpenRouterGenerationResult } from "../../lib/server/openrouter/types.ts";

const TEST_SCRATCH = path.join(process.cwd(), ".codex-temp", "test-runs");

const validArgs = [
  "--owner-authorized-fictional-diagnostic",
  "--profiles", "C01,C02",
  "--reports", "IFS",
  "--fixture-set", "route-replays-v5",
  "--model", "openai/gpt-6-luna",
  "--reasoning-effort", "max",
  "--max-call-cost-micros", "115000",
  "--aggregate-cost-cap-micros", "3000000",
] as const;

const validInvocation: FictionalIfsDiagnosticInvocation = {
  operatorAuthorized: true,
  profiles: ["C01", "C02"],
  reportType: "IFS",
  fixtureSet: "route-replays-v5",
  model: "openai/gpt-6-luna",
  reasoningEffort: "max",
  maxCallCostMicros: 115_000,
  aggregateCostCapMicros: 3_000_000,
};

async function withTempDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  await mkdir(TEST_SCRATCH, { recursive: true });
  const directory = await mkdtemp(path.join(TEST_SCRATCH, "pwrp71-fictional-ifs-"));
  try { await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("diagnostic CLI requires exact owner scope, candidate, and both approved caps", async () => {
  const cases: Array<{ readonly name: string; readonly args: readonly string[] }> = [
    { name: "missing operator authorization", args: validArgs.filter((arg) => arg !== "--owner-authorized-fictional-diagnostic") },
    { name: "C03", args: replaceFlag(validArgs, "--profiles", "C01,C03") },
    { name: "MAP", args: replaceFlag(validArgs, "--reports", "MAP") },
    { name: "PV", args: replaceFlag(validArgs, "--reports", "PV") },
    { name: "ATT", args: replaceFlag(validArgs, "--reports", "ATT") },
    { name: "SYNTHESIS", args: replaceFlag(validArgs, "--reports", "SYNTHESIS") },
    { name: "v4 fixture", args: replaceFlag(validArgs, "--fixture-set", "route-replays-v4") },
    { name: "different model", args: replaceFlag(validArgs, "--model", "openai/gpt-6-sol") },
    { name: "different effort", args: replaceFlag(validArgs, "--reasoning-effort", "medium") },
    { name: "missing per-call cap", args: validArgs.filter((arg) => arg !== "--max-call-cost-micros" && arg !== "115000") },
    { name: "missing aggregate cap", args: validArgs.filter((arg) => arg !== "--aggregate-cost-cap-micros" && arg !== "3000000") },
    { name: "enlarged per-call cap", args: replaceFlag(validArgs, "--max-call-cost-micros", "115001") },
    { name: "enlarged aggregate cap", args: replaceFlag(validArgs, "--aggregate-cost-cap-micros", "3000001") },
    { name: "production packet path", args: [...validArgs, "--packet-file", "customer.json"] },
    { name: "production assessment selector", args: [...validArgs, "--assessment-id", "assessment-1"] },
    { name: "routing receipt injection", args: [...validArgs, "--routing-evidence", "receipt.json"] },
    { name: "approval manifest request", args: [...validArgs, "--activation-manifest", "approval.json"] },
  ];
  for (const entry of cases) {
    let providerFactoryCalls = 0;
    let providerCalls = 0;
    await assert.rejects(async () => {
      const invocation = parseFictionalIfsDiagnosticArgs(entry.args);
      await runFictionalIfsDiagnostic(invocation, {
        workspaceRoot: process.cwd(),
        outputRoot: path.join(TEST_SCRATCH, "rejected", entry.name.replaceAll(" ", "-")),
        transportFactory: () => {
          providerFactoryCalls += 1;
          return { generate: async () => { providerCalls += 1; throw new Error("unexpected provider call"); } };
        },
      });
    }, entry.name);
    assert.equal(providerFactoryCalls, 0, `${entry.name} must reject before provider initialization`);
    assert.equal(providerCalls, 0, `${entry.name} must reject before provider dispatch`);
  }
});

function replaceFlag(args: readonly string[], flag: string, value: string): string[] {
  const index = args.indexOf(flag);
  assert.notEqual(index, -1);
  return args.map((item, itemIndex) => itemIndex === index + 1 ? value : item);
}

test("source, runtime, and packet pin mismatches reject before transport creation", async () => {
  await withTempDirectory(async (outputRoot) => {
    let providerFactoryCalls = 0;
    await assert.rejects(() => runFictionalIfsDiagnostic(validInvocation, {
      workspaceRoot: process.cwd(),
      outputRoot,
      runtimeShaLoader: async () => "0".repeat(64),
      transportFactory: () => { providerFactoryCalls += 1; return { generate: async () => unexpectedResult() }; },
    }), /routerRuntimeSha256/);
    assert.equal(providerFactoryCalls, 0);

    const cache = new Map<string, Awaited<ReturnType<typeof loadPwrp71FictionalDiagnosticFixture>>>();
    const fixtureLoader = async (input: Parameters<typeof loadPwrp71FictionalDiagnosticFixture>[0]) => {
      let fixture = cache.get(input.profileId);
      if (!fixture) {
        fixture = await loadPwrp71FictionalDiagnosticFixture(input);
        cache.set(input.profileId, fixture);
      }
      if (input.profileId === "C01") return { ...fixture, packet: { ...fixture.packet, title: "changed packet" } };
      return fixture;
    };
    await assert.rejects(() => runFictionalIfsDiagnostic(validInvocation, {
      workspaceRoot: process.cwd(),
      outputRoot,
      fixtureLoader: fixtureLoader as typeof loadPwrp71FictionalDiagnosticFixture,
      transportFactory: () => { providerFactoryCalls += 1; return { generate: async () => unexpectedResult() }; },
    }), /packet digest/);
    assert.equal(providerFactoryCalls, 0);
  });
});

test("pure current-source pin checks reject every changed comparison surface", () => {
  const base = {
    questionSourceSha256: FICTIONAL_IFS_DIAGNOSTIC_PINS.questionSourceSha256,
    questionSourceManifestSha256: FICTIONAL_IFS_DIAGNOSTIC_PINS.questionSourceManifestSha256,
    routerRuntimeSha256: FICTIONAL_IFS_DIAGNOSTIC_PINS.routerRuntimeSha256,
    reportSourceManifestSha256: FICTIONAL_IFS_DIAGNOSTIC_PINS.reportSourceManifestSha256,
    semanticCaseSetSha256: FICTIONAL_IFS_DIAGNOSTIC_PINS.semanticCaseSetSha256,
    fixtureManifestSha256: FICTIONAL_IFS_DIAGNOSTIC_PINS.fixtureManifestSha256,
    profileId: "C01" as const,
    packetSha256: FICTIONAL_IFS_DIAGNOSTIC_PINS.c01PacketSha256,
  };
  assert.doesNotThrow(() => assertDiagnosticSourcePins(base));
  for (const key of ["questionSourceSha256", "questionSourceManifestSha256", "routerRuntimeSha256", "reportSourceManifestSha256", "semanticCaseSetSha256", "fixtureManifestSha256", "packetSha256"] as const) {
    assert.throws(() => assertDiagnosticSourcePins({ ...base, [key]: "0".repeat(64) }), /differs from the reviewed candidate/);
  }
});

test("the pre-dispatch transport rejects changed provider parameters before fetch", async () => {
  await withTempDirectory(async (directory) => {
    const dispatchFile = path.join(directory, "dispatches.json");
    await writeFile(dispatchFile, JSON.stringify({ schemaVersion: 1, entries: [] }));
    const store = new FileQualificationAttemptStore(path.join(directory, "attempts"));
    const preflight = JSON.parse(await readFile("qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-no-dispatch-20261011.json", "utf8")) as {
      exactRequests: Array<{ profileId: string; request: { requestCorrelationHeader: { value: string }; finalWirePayload: Record<string, unknown> } }>;
    };
    const validPayload = preflight.exactRequests[0]!.request.finalWirePayload;
    let networkCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { networkCalls += 1; return new Response("{}", { status: 200 }); };
    try {
      for (const mutate of [
        (payload: Record<string, unknown>) => { payload.model = "openai/gpt-6-sol"; },
        (payload: Record<string, unknown>) => { payload.reasoning = { effort: "medium" }; },
        (payload: Record<string, unknown>) => { payload.provider = { ...GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY, data_collection: "allow" }; },
        (payload: Record<string, unknown>) => { payload.provider = { ...GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY, only: ["azure"] }; },
        (payload: Record<string, unknown>) => { payload.provider = { ...GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY, allow_fallbacks: true }; },
        (payload: Record<string, unknown>) => { payload.provider = { ...GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY, only: undefined }; },
        (payload: Record<string, unknown>) => { payload.tools = []; },
      ]) {
        const payload = structuredClone(validPayload);
        mutate(payload);
        const fetch = createDiagnosticFetch({
          dispatchFile,
          store,
          hooks: { recordResponse: async () => undefined, recordNoResponse: async () => undefined },
          now: () => new Date("2026-10-11T12:00:00.000Z"),
        });
        await assert.rejects(() => fetch(OPENROUTER_DEFAULT_ENDPOINT, {
          method: "POST",
          headers: { authorization: "Bearer test-key", "x-request-id": preflight.exactRequests[0]!.request.requestCorrelationHeader.value },
          body: JSON.stringify(payload),
        }));
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(networkCalls, 0);
    const dispatches = JSON.parse(await readFile(dispatchFile, "utf8")) as { entries: unknown[] };
    assert.deepEqual(dispatches.entries, []);
  });
});

test("the diagnostic fetch requires an exact active journal reservation and dispatches each attempt once", async () => {
  await withTempDirectory(async (directory) => {
    const dispatchFile = path.join(directory, "dispatches.json");
    await writeFile(dispatchFile, JSON.stringify({ schemaVersion: 1, entries: [] }));
    const store = new FileQualificationAttemptStore(path.join(directory, "attempts"));
    const preflight = JSON.parse(await readFile("qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-no-dispatch-20261011.json", "utf8")) as {
      exactRequests: Array<{ request: { requestCorrelationHeader: { value: string }; finalWirePayload: Record<string, unknown> } }>;
    };
    const request = preflight.exactRequests[0]!.request;
    const payload = request.finalWirePayload;
    const messages = payload.messages as Array<{ role: string; content: string }>;
    const jsonSchema = (payload.response_format as { json_schema: { name: string; schema: Record<string, unknown> } }).json_schema;
    const candidate: OpenRouterGenerationRequest = {
      model: String(payload.model),
      reasoningEffort: String((payload.reasoning as { effort: string }).effort) as "max",
      system: messages[0]!.content,
      prompt: messages[1]!.content,
      schemaName: jsonSchema.name,
      schema: jsonSchema.schema as JsonObject,
      maxOutputTokens: Number(payload.max_completion_tokens),
      idempotencyKey: request.requestCorrelationHeader.value,
      providerPolicy: payload.provider as typeof GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY,
      promptCacheOptions: payload.prompt_cache_options as { mode: "explicit" },
      includeUsage: true,
    };
    const wireRequest = { ...candidate };
    const dispatchRequest = () => ({
      method: "POST",
      headers: { authorization: "Bearer test-key", "x-request-id": candidate.idempotencyKey },
      body: JSON.stringify(payload),
    } satisfies RequestInit);
    let networkCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { networkCalls += 1; return new Response("{}", { status: 200 }); };
    const fetch = createDiagnosticFetch({
      dispatchFile,
      store,
      hooks: { recordResponse: async () => undefined, recordNoResponse: async () => undefined },
      now: () => new Date("2026-10-11T12:00:00.000Z"),
    });
    try {
      await assert.rejects(() => fetch(OPENROUTER_DEFAULT_ENDPOINT, dispatchRequest()), /no matching durable/);
      assert.equal(networkCalls, 0, "a valid-looking but unjournaled request cannot dispatch");

      await store.begin({
        request: candidate,
        wireRequest,
        maxCallCostMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros,
        aggregateCostCapMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros,
        usageStatus: "reported",
        endpoint: OPENROUTER_DEFAULT_ENDPOINT,
        startedAt: new Date("2026-10-11T12:00:00.000Z"),
      });
      const changed = structuredClone(payload);
      (changed.messages as Array<{ role: string; content: string }>)[1]!.content += " changed";
      await assert.rejects(() => fetch(OPENROUTER_DEFAULT_ENDPOINT, { ...dispatchRequest(), body: JSON.stringify(changed) }), /no matching durable/);
      assert.equal(networkCalls, 0, "a validly shaped body that differs from its reservation cannot dispatch");

      const dispatched = await fetch(OPENROUTER_DEFAULT_ENDPOINT, dispatchRequest());
      assert.equal(dispatched.status, 200);
      assert.equal(networkCalls, 1);
      await assert.rejects(() => fetch(OPENROUTER_DEFAULT_ENDPOINT, dispatchRequest()), /one-use dispatch boundary/);
      assert.equal(networkCalls, 1, "an attempt can cross the HTTP boundary only once");
      const dispatches = JSON.parse(await readFile(dispatchFile, "utf8")) as { entries: Array<{ idempotencyKey: string }> };
      assert.equal(dispatches.entries.length, 1);
      assert.equal(dispatches.entries[0]!.idempotencyKey, candidate.idempotencyKey);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("direct unjournaled PWRP calls and diagnostic-to-qualification conversions fail closed", async () => {
  let providerCalls = 0;
  const client = new OpenRouterClient({ apiKey: "test-key", fetch: async () => { providerCalls += 1; return new Response("{}", { status: 200 }); } });
  const request: OpenRouterGenerationRequest = {
    model: "openai/gpt-6-luna", reasoningEffort: "max", system: "system", prompt: "prompt",
    schemaName: "patternwork_ifs_pwrp71_candidate_1", schema: { type: "object", additionalProperties: false },
    maxOutputTokens: 20_000, idempotencyKey: "unjournaled-test",
  };
  await assert.rejects(() => client.generate(request), /durable budget-prepared request/);
  assert.equal(providerCalls, 0);

  const diagnosticRecord = {
    schemaVersion: FICTIONAL_IFS_DIAGNOSTIC_SCHEMA,
    resultKind: "fictional_report_diagnostic",
    routingQualification: "not_claimed",
    productionActivationEffect: "none",
    status: "diagnostic_complete",
    results: [],
  };
  assert.equal(diagnosticManifestCannotQualify(diagnosticRecord), true);
  await withTempDirectory(async (directory) => {
    const runDirectory = path.join(directory, FICTIONAL_IFS_DIAGNOSTIC_RUN_ID);
    await mkdir(runDirectory, { recursive: true });
    await writeFile(path.join(runDirectory, "run.json"), JSON.stringify(diagnosticRecord));
    await assert.rejects(() => readPwrp71QualificationRun(FICTIONAL_IFS_DIAGNOSTIC_RUN_ID, directory), /invalid schema/);
  });
});

test("a restarted diagnostic retains dispatch evidence before a profile result was saved", async () => {
  await withTempDirectory(async (outputRoot) => {
    const runDirectory = path.join(outputRoot, FICTIONAL_IFS_DIAGNOSTIC_RUN_ID);
    await mkdir(runDirectory, { recursive: true });
    const priorDispatch = {
      index: 1,
      idempotencyKey: `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_RUN_ID}:C01:IFS:initial:openai-gpt-6-luna-max:attempt-1`,
      profileId: "C01",
      phase: "initial",
      model: "openai/gpt-6-luna",
      reasoningEffort: "max",
      endpoint: OPENROUTER_DEFAULT_ENDPOINT,
      wirePayloadSha256: "a".repeat(64),
      dispatchedAt: "2026-10-11T12:00:00.000Z",
      outcome: "dispatched",
    };
    await writeFile(path.join(runDirectory, "dispatches.json"), JSON.stringify({ schemaVersion: 1, entries: [priorDispatch] }));
    const result = await runFictionalIfsDiagnostic(validInvocation, {
      workspaceRoot: process.cwd(),
      outputRoot,
      transportFactory: () => { throw new Error("simulated interruption before report generation"); },
    });
    assert.equal(result.status, "diagnostic_stopped");
    assert.equal(result.providerDispatchCount, 1);
    assert.equal(result.providerDispatchesFileSha256, (await import("../../lib/report-contracts/delivery-validator.ts")).sha256Canonical({ schemaVersion: 1, entries: [priorDispatch] }));
    const retained = JSON.parse(await readFile(path.join(runDirectory, "dispatches.json"), "utf8")) as { entries: unknown[] };
    assert.deepEqual(retained.entries, [priorDispatch]);
  });
});

test("the fictional diagnostic rejects an offline/mock returned model before review or C02", async () => {
  await withTempDirectory(async (outputRoot) => {
    let generatedCalls = 0;
    const providerPolicies: Array<OpenRouterGenerationRequest["providerPolicy"]> = [];
    const transportFactory = (): OpenRouterTransport => ({
      endpoint: OPENROUTER_DEFAULT_ENDPOINT,
      generate: async (request) => {
        generatedCalls += 1;
        providerPolicies.push(request.providerPolicy);
        return {
          ok: true,
          output: {} as import("../../lib/question-engine/types.ts").JsonObject,
          usage: {
            generationId: "wrong-model-result",
            inputTokens: 1,
            outputTokens: 1,
            reasoningTokens: 0,
            totalTokens: 2,
            costMicros: 45_000,
            currency: "USD",
            model: "offline/mock",
          },
          finishReason: "stop",
        };
      },
    });
    const result = await runFictionalIfsDiagnostic(validInvocation, { workspaceRoot: process.cwd(), outputRoot, transportFactory });
    assert.equal(result.status, "diagnostic_stopped");
    assert.equal(generatedCalls, 1, "the diagnostic stops after the first wrong-model result");
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]!.profileId, "C01");
    assert.equal(result.results[0]!.status, "failed");
    assert.equal(result.results[0]!.reviewerReceipts.length, 0, "review is never called for a wrong-model result");
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0]!.usage?.model, "offline/mock");
    assert.deepEqual(providerPolicies, [GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY], "every journaled diagnostic call is pinned to OpenAI without fallbacks");
    assert.equal(result.budget.aggregateReportedCostMicros, 45_000, "known usage remains charged to the authorized budget");
    assert.equal(result.budget.remainingAuthorizedMicros, 2_955_000);
  });
});

test("an unknown-cost attempt retains its reservation and the fixed diagnostic never retries", async () => {
  await withTempDirectory(async (outputRoot) => {
    let transportFactories = 0;
    let transportCalls = 0;
    const transportFactory = (): OpenRouterTransport => {
      transportFactories += 1;
      return {
        endpoint: OPENROUTER_DEFAULT_ENDPOINT,
        generate: async () => {
          transportCalls += 1;
          throw new OpenRouterTransportError("network", "simulated unknown billing outcome", { retryable: false });
        },
      };
    };
    const first = await runFictionalIfsDiagnostic(validInvocation, { workspaceRoot: process.cwd(), outputRoot, transportFactory });
    assert.equal(first.status, "diagnostic_stopped");
    assert.equal(first.results.some((result) => result.profileId === "C02"), false);
    assert.equal(first.providerDispatchCount, 0, "the fake transport never made an HTTP dispatch");
    assert.equal(first.budget.unknownOrInFlightReservedCostMicros, FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros);
    const second = await runFictionalIfsDiagnostic(validInvocation, { workspaceRoot: process.cwd(), outputRoot, transportFactory });
    assert.equal(second.status, "diagnostic_stopped");
    assert.equal(transportFactories, 1);
    assert.equal(transportCalls, 1);
  });
});

function unexpectedResult(): Promise<OpenRouterGenerationResult> {
  return Promise.reject(new Error("Unexpected provider generation in a rejection test."));
}
