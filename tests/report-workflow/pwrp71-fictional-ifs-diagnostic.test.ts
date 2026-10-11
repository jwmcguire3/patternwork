import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { OpenRouterGenerationRequest, OpenRouterTransport } from "../../lib/server/openrouter/types.ts";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import { OPENROUTER_DEFAULT_ENDPOINT } from "../../lib/server/openrouter/wire.ts";
import {
  GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY,
  GPT6_LUNA_OPENAI_NON_ZDR_DIAGNOSTIC_PROVIDER_POLICY,
} from "../../lib/server/openrouter/qualification-budget.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import { readPwrp71QualificationRun } from "../../lib/server/reports/qualification/runner.ts";
import { FileQualificationAttemptStore } from "../../lib/server/reports/qualification/attempt-store.ts";
import {
  FICTIONAL_IFS_DIAGNOSTIC_LIMITS,
  FICTIONAL_IFS_DIAGNOSTIC_PINS,
  FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
  FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
  FICTIONAL_IFS_DIAGNOSTIC_EPOCH_2_ZDR_PARENT_SHA256,
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
import {
  assertOpenRouterDiagnosticRouteEligible,
  assertOpenRouterNonZdrDiagnosticRouteEligible,
  assertOpenRouterReachable,
  OpenRouterDiagnosticRouteIneligibleError,
  OpenRouterNonZdrRouteIneligibleError,
} from "../../scripts/pwrp71-fictional-ifs-diagnostic/connectivity.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";

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

const LEGACY_RUN_ARCHIVE_SHA = "63b73b54845e4a719603b77abddd403f7297c6d157be4a8ffbf5f1d29b2e73be";
const LEGACY_RUN_ROOT = path.join(process.cwd(), "qualification", "pwrp71", "gate11-fictional-ifs-diagnostic", "live", FICTIONAL_IFS_DIAGNOSTIC_RUN_ID);

async function seedLegacyUnknownRun(outputRoot: string): Promise<{ readonly runDirectory: string; readonly originalRunBytes: Buffer<ArrayBufferLike> }> {
  const runDirectory = path.join(outputRoot, FICTIONAL_IFS_DIAGNOSTIC_RUN_ID);
  const archivedNames = {
    "run.json": `prior-default-route-run-${LEGACY_RUN_ARCHIVE_SHA}.json`,
    "attempts.json": `prior-default-route-attempts-${LEGACY_RUN_ARCHIVE_SHA}.json`,
    "dispatches.json": `prior-default-route-dispatches-${LEGACY_RUN_ARCHIVE_SHA}.json`,
  } as const;
  await mkdir(runDirectory, { recursive: true });
  let originalRunBytes: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  for (const filename of Object.keys(archivedNames) as Array<keyof typeof archivedNames>) {
    let bytes: Buffer;
    try { bytes = await readFile(path.join(LEGACY_RUN_ROOT, "history", archivedNames[filename])); }
    catch { bytes = await readFile(path.join(LEGACY_RUN_ROOT, filename)); }
    await writeFile(path.join(runDirectory, filename), Uint8Array.from(bytes));
    if (filename === "run.json") originalRunBytes = bytes;
  }
  return { runDirectory, originalRunBytes };
}

async function seedEpoch2ZdrUnknownRun(outputRoot: string): Promise<{ readonly runDirectory: string; readonly originalRunBytes: Buffer<ArrayBufferLike> }> {
  const runDirectory = path.join(outputRoot, FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID);
  const sourceDirectory = path.join(process.cwd(), "qualification", "pwrp71", "gate11-fictional-ifs-diagnostic", "live", FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID);
  const archivedNames = {
    "run.json": `prior-openai-zdr-route-run-${FICTIONAL_IFS_DIAGNOSTIC_EPOCH_2_ZDR_PARENT_SHA256}.json`,
    "attempts.json": `prior-openai-zdr-route-attempts-${FICTIONAL_IFS_DIAGNOSTIC_EPOCH_2_ZDR_PARENT_SHA256}.json`,
    "dispatches.json": `prior-openai-zdr-route-dispatches-${FICTIONAL_IFS_DIAGNOSTIC_EPOCH_2_ZDR_PARENT_SHA256}.json`,
  } as const;
  await mkdir(runDirectory, { recursive: true });
  let originalRunBytes: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  for (const filename of Object.keys(archivedNames) as Array<keyof typeof archivedNames>) {
    const bytes = await readFile(path.join(sourceDirectory, "history", archivedNames[filename]));
    if (filename === "run.json") {
      const parent = JSON.parse(bytes.toString("utf8")) as { runSha256?: unknown; continuation?: unknown; providerDispatchCount?: unknown; budget?: { unknownOrInFlightReservedCostMicros?: unknown } };
      assert.equal(parent.runSha256, FICTIONAL_IFS_DIAGNOSTIC_EPOCH_2_ZDR_PARENT_SHA256);
      assert.equal(parent.continuation, undefined, "test setup must begin from the immutable pre-continuation parent");
      assert.equal(parent.providerDispatchCount, 1);
      assert.equal(parent.budget?.unknownOrInFlightReservedCostMicros, FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros);
    }
    await writeFile(path.join(runDirectory, filename), Uint8Array.from(bytes));
    if (filename === "run.json") originalRunBytes = bytes;
  }
  return { runDirectory, originalRunBytes };
}

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
    { name: "duplicate continuation flag", args: [...validArgs, "--continue-after-unknown-provider-attempt", "--continue-after-unknown-provider-attempt"] },
    { name: "duplicate fresh budget flag", args: [...validArgs, "--owner-authorized-fresh-budget-epoch-2", "--owner-authorized-fresh-budget-epoch-2"] },
    { name: "duplicate non-ZDR continuation flag", args: [...validArgs, "--owner-authorized-fresh-budget-epoch-2", "--owner-authorized-allow-non-zdr-continuation", "--owner-authorized-allow-non-zdr-continuation"] },
    { name: "non-ZDR continuation without fresh epoch", args: [...validArgs, "--owner-authorized-allow-non-zdr-continuation"] },
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

test("fresh budget epoch requires explicit owner authorization and cannot also request a continuation", async () => {
  assert.equal(parseFictionalIfsDiagnosticArgs([...validArgs, "--owner-authorized-fresh-budget-epoch-2"]).freshBudgetEpoch2, true);
  assert.throws(() => parseFictionalIfsDiagnosticArgs([
    ...validArgs,
    "--owner-authorized-fresh-budget-epoch-2",
    "--continue-after-unknown-provider-attempt",
  ]), /cannot be requested together/u);
});

test("OpenRouter reachability preflight is an unauthenticated catalog GET and reports safe DNS causes", async () => {
  let requestedUrl = "";
  let requestMethod = "";
  let requestBody: BodyInit | null | undefined;
  let requestHeaders: Headers | undefined;
  await assertOpenRouterReachable(async (input, init) => {
    requestedUrl = String(input);
    requestMethod = init?.method ?? "";
    requestBody = init?.body;
    requestHeaders = new Headers(init?.headers);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(requestedUrl, "https://openrouter.ai/api/v1/models");
  assert.equal(requestMethod, "GET");
  assert.equal(requestBody, undefined);
  assert.equal(requestHeaders?.has("authorization"), false);

  const cause = Object.assign(new Error("raw local resolver details"), { code: "ENOTFOUND", syscall: "getaddrinfo", hostname: "openrouter.ai" });
  await assert.rejects(() => assertOpenRouterReachable(async () => {
    throw new TypeError("fetch failed", { cause });
  }), /ENOTFOUND.*no report request was dispatched/u);
});

test("OpenRouter diagnostic route preflight blocks an empty OpenAI/ZDR intersection without credentials", async () => {
  let requestedUrl = "";
  let requestMethod = "";
  let requestHeaders: Headers | undefined;
  const noOpenAiZdrEndpoint = new Response(JSON.stringify({ data: [
    { model_id: "openai/gpt-6-luna", provider_name: "Azure", name: "Azure | GPT-6 Luna", tag: "azure" },
    { model_id: "openai/gpt-6-luna", provider_name: "Azure", name: "Azure | GPT-6 Luna US", tag: "azure/us" },
    { model_id: "openai/gpt-6-luna", provider_name: "Azure", name: "Azure | GPT-6 Luna EU", tag: "azure/eu" },
  ] }), { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(() => assertOpenRouterDiagnosticRouteEligible(async (input, init) => {
    requestedUrl = String(input);
    requestMethod = init?.method ?? "";
    requestHeaders = new Headers(init?.headers);
    return noOpenAiZdrEndpoint.clone();
  }, () => new Date("2026-10-11T00:00:00.000Z")), (error: unknown) => {
    assert.ok(error instanceof OpenRouterDiagnosticRouteIneligibleError);
    assert.equal(error.evidence.modelEndpointCount, 3);
    assert.equal(error.evidence.matchingEligibleEndpointCount, 0);
    assert.deepEqual(error.evidence.providerAllowlist, ["openai"]);
    return true;
  });
  assert.equal(requestedUrl, "https://openrouter.ai/api/v1/endpoints/zdr");
  assert.equal(requestMethod, "GET");
  assert.equal(requestHeaders?.has("authorization"), false);

  const eligible = await assertOpenRouterDiagnosticRouteEligible(async () => new Response(JSON.stringify({ data: [
    { model_id: "openai/gpt-6-luna", provider_name: "OpenAI", name: "OpenAI | GPT-6 Luna", tag: "openai" },
    { model_id: "openai/gpt-6-luna", provider_name: "Azure", name: "Azure | GPT-6 Luna", tag: "azure" },
  ] }), { status: 200 }), () => new Date("2026-10-11T00:00:00.000Z"));
  assert.equal(eligible.matchingEligibleEndpointCount, 1);
  assert.equal(eligible.matchingEligibleEndpoints[0]!.provider, "OpenAI");
});

test("owner-authorized non-ZDR route preflight requires an OpenAI endpoint and records retention policy without dispatch", async () => {
  let requestedUrl = "";
  let requestMethod = "";
  let requestHeaders: Headers | undefined;
  const eligible = await assertOpenRouterNonZdrDiagnosticRouteEligible(async (input, init) => {
    requestedUrl = String(input);
    requestMethod = init?.method ?? "";
    requestHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ data: { endpoints: [
      { provider_name: "Azure", name: "Azure route" },
      { provider_name: "OpenAI", name: "OpenAI route" },
    ] } }), { status: 200, headers: { "content-type": "application/json" } });
  }, () => new Date("2026-10-11T00:00:00.000Z"));
  assert.equal(requestedUrl, "https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints");
  assert.equal(requestMethod, "GET");
  assert.equal(requestHeaders?.has("authorization"), false);
  assert.equal(eligible.zeroDataRetentionRequired, false);
  assert.equal(eligible.privacyMode, "non_zdr_allowed");
  assert.equal(eligible.dataCollectionPolicy, "deny");
  assert.equal(eligible.matchingEligibleEndpointCount, 1);
  assert.equal(eligible.matchingEligibleEndpoints[0]!.provider, "OpenAI");

  await assert.rejects(() => assertOpenRouterNonZdrDiagnosticRouteEligible(async () => new Response(JSON.stringify({ data: { endpoints: [
    { provider_name: "Azure", name: "Azure route" },
  ] } }), { status: 200 })), (error: unknown) => {
    assert.ok(error instanceof OpenRouterNonZdrRouteIneligibleError);
    assert.equal(error.evidence.matchingEligibleEndpointCount, 0);
    assert.deepEqual(error.evidence.providerAllowlist, ["openai"]);
    return true;
  });
});

test("an ineligible pre-dispatch route stops before reservations and safely permits a metadata recheck", async () => {
  await withTempDirectory(async (outputRoot) => {
    let catalogChecks = 0;
    let generationCalls = 0;
    const transportFactory = async (): Promise<OpenRouterTransport> => {
      catalogChecks += 1;
      await assertOpenRouterDiagnosticRouteEligible(async () => new Response(JSON.stringify({ data: [
        { model_id: "openai/gpt-6-luna", provider_name: "Azure", name: "Azure | GPT-6 Luna", tag: "azure" },
      ] }), { status: 200 }));
      return { endpoint: OPENROUTER_DEFAULT_ENDPOINT, generate: async () => { generationCalls += 1; return unexpectedResult(); } };
    };
    const first = await runFictionalIfsDiagnostic(validInvocation, { workspaceRoot: process.cwd(), outputRoot, transportFactory });
    assert.equal(first.status, "diagnostic_stopped");
    assert.equal(first.providerDispatchCount, 0);
    assert.equal(first.attempts.length, 0);
    assert.equal(first.budget.unknownOrInFlightReservedCostMicros, 0);
    assert.equal(first.budget.remainingAuthorizedMicros, 3_000_000);
    assert.match(first.blockers[0] ?? "", /Pre-dispatch check failed:.*none from the pinned provider/u);

    const second = await runFictionalIfsDiagnostic(validInvocation, { workspaceRoot: process.cwd(), outputRoot, transportFactory });
    assert.equal(second.status, "diagnostic_stopped");
    assert.equal(catalogChecks, 2, "a no-dispatch eligibility failure can recheck public metadata without changing run identity");
    assert.equal(generationCalls, 0, "the generation transport is never called for an ineligible route");
  });
});

test("the explicit continuation flag cannot authorize a fresh run without its exact prior unknown attempt", async () => {
  const invocation = parseFictionalIfsDiagnosticArgs([...validArgs, "--continue-after-unknown-provider-attempt"]);
  assert.equal(invocation.continueAfterUnknownProviderAttempt, true);
  await withTempDirectory(async (outputRoot) => {
    let transportFactoryCalls = 0;
    await assert.rejects(() => runFictionalIfsDiagnostic(invocation, {
      workspaceRoot: process.cwd(),
      outputRoot,
      transportFactory: () => { transportFactoryCalls += 1; return { generate: async () => unexpectedResult() }; },
    }), /requires the exact previously stopped default-routed run/);
    assert.equal(transportFactoryCalls, 0);
  });
});

test("the changed OpenAI route preserves the prior unknown attempt and requires an explicit one-time continuation", async () => {
  await withTempDirectory(async (outputRoot) => {
    const seeded = await seedLegacyUnknownRun(outputRoot);
    let transportFactoryCalls = 0;
    await assert.rejects(() => runFictionalIfsDiagnostic(validInvocation, {
      workspaceRoot: process.cwd(),
      outputRoot,
      transportFactory: () => { transportFactoryCalls += 1; return { generate: async () => unexpectedResult() }; },
    }), /explicit --continue-after-unknown-provider-attempt operator flag/);
    assert.equal(transportFactoryCalls, 0);
    assert.deepEqual(await readFile(path.join(seeded.runDirectory, "run.json")), seeded.originalRunBytes, "the rejected invocation cannot overwrite the existing stopped run");
  });
});

test("a fresh owner-authorized epoch isolates its budget and retains safe transport causes", async () => {
  await withTempDirectory(async (outputRoot) => {
    const prior = await seedLegacyUnknownRun(outputRoot);
    const invocation = parseFictionalIfsDiagnosticArgs([...validArgs, "--owner-authorized-fresh-budget-epoch-2"]);
    const originalFetch = globalThis.fetch;
    let calls = 0;
    let requestId = "";
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      requestId = new Headers(init?.headers).get("x-request-id") ?? "";
      const cause = Object.assign(new Error("resolver detail must not be retained"), { code: "ENOTFOUND", syscall: "getaddrinfo", hostname: "openrouter.ai" });
      throw new TypeError("fetch failed", { cause });
    };
    try {
      const result = await runFictionalIfsDiagnostic(invocation, {
        workspaceRoot: process.cwd(),
        outputRoot,
        transportFactory: ({ fetch }) => new OpenRouterClient({ apiKey: "test-key", fetch }),
      });
      assert.equal(result.status, "diagnostic_stopped");
      assert.equal(result.runId, "gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011-fresh-budget-epoch-2");
      assert.notEqual(result.outputDirectory, prior.runDirectory);
      assert.match(requestId, /-fresh-budget-epoch-2:C01:IFS:initial:openai-gpt-6-luna-max:attempt-1$/u);
      assert.equal(calls, 1, "a single fresh C01 request is attempted and C02 is not sent after a no-response outcome");
      assert.equal(result.authorization.budgetEpoch, 2);
      assert.equal(result.authorization.priorRunBudgetDisposition?.priorUnknownReservedMicros, 230_000);
      assert.equal(result.authorization.priorRunBudgetDisposition?.priorInvoiceStatusRemainsUnknown, true);
      assert.equal(result.budget.unknownOrInFlightReservedCostMicros, FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros);
      assert.equal(result.budget.remainingAuthorizedMicros, FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros - FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros);
      const attempts = JSON.parse(await readFile(path.join(result.outputDirectory, "attempts.json"), "utf8")) as {
        attempts: Array<{ diagnostic?: { causeCode?: string; causeSyscall?: string; message?: string } }>;
      };
      assert.equal(attempts.attempts[0]?.diagnostic?.causeCode, "ENOTFOUND");
      assert.equal(attempts.attempts[0]?.diagnostic?.causeSyscall, "getaddrinfo");
      assert.equal(JSON.stringify(attempts.attempts[0]?.diagnostic).includes("resolver detail must not be retained"), false);
      const dispatches = JSON.parse(await readFile(path.join(result.outputDirectory, "dispatches.json"), "utf8")) as {
        entries: Array<{ requestVariant?: string }>;
      };
      assert.equal(dispatches.entries[0]?.requestVariant, "fresh-budget-epoch-2");
      assert.deepEqual(await readFile(path.join(prior.runDirectory, "run.json")), prior.originalRunBytes, "the prior run remains byte-for-byte unchanged");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("an explicitly authorized OpenAI continuation allocates a fresh C01 attempt and keeps the Azure reservation", async () => {
  await withTempDirectory(async (outputRoot) => {
    const seeded = await seedLegacyUnknownRun(outputRoot);
    let networkCalls = 0;
    let requestId = "";
    let outgoingProvider: unknown;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      networkCalls += 1;
      requestId = new Headers(init?.headers).get("x-request-id") ?? "";
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      outgoingProvider = body.provider;
      return new Response(JSON.stringify({ error: { message: "Simulated OpenAI schema rejection", code: 400, metadata: { provider_name: "OpenAI", provider_error_code: "invalid_json_schema" } } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const result = await runFictionalIfsDiagnostic({ ...validInvocation, continueAfterUnknownProviderAttempt: true }, {
        workspaceRoot: process.cwd(),
        outputRoot,
        transportFactory: ({ fetch }) => {
          return new OpenRouterClient({ apiKey: "test-key", fetch });
        },
      });
      assert.equal(result.status, "diagnostic_stopped");
      assert.equal(networkCalls, 1, "only the new C01 OpenAI-only request is dispatched; the prior unknown attempt is not replayed and C02 is not reached");
      assert.match(requestId, /:C01:openai-route-continuation-1:IFS:initial:openai-gpt-6-luna-max:attempt-1$/u);
      assert.notEqual(requestId, `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_RUN_ID}:C01:IFS:initial:openai-gpt-6-luna-max:attempt-1`);
      assert.deepEqual(outgoingProvider, GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY);
      assert.equal(result.providerDispatchCount, 2);
      assert.equal(result.budget.unknownOrInFlightReservedCostMicros, 2 * FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros);
      assert.equal(result.budget.remainingAuthorizedMicros, FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros - 2 * FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros);
      assert.equal(result.attempts.length, 2);
      assert.equal(result.attempts[0]!.attemptId, `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_RUN_ID}:C01:IFS:initial:openai-gpt-6-luna-max:attempt-1`);
      assert.equal(result.attempts[0]!.status, "unknown");
      assert.equal(result.attempts[1]!.attemptId, requestId);
      assert.equal(result.attempts[1]!.status, "unknown");
      assert.equal(result.continuation?.carriedUnknownReservationMicros, FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros);
      const archivedRun = await readFile(path.join(seeded.runDirectory, result.continuation!.priorRunArchiveFile));
      assert.deepEqual(archivedRun, seeded.originalRunBytes, "the exact prior run manifest is archived before its current manifest is updated");
      const dispatches = JSON.parse(await readFile(path.join(seeded.runDirectory, "dispatches.json"), "utf8")) as { entries: Array<{ idempotencyKey: string; requestVariant?: string; responseStatus?: number }> };
      assert.equal(dispatches.entries[0]!.idempotencyKey, result.attempts[0]!.attemptId);
      assert.equal(dispatches.entries[1]!.idempotencyKey, requestId);
      assert.equal(dispatches.entries[1]!.requestVariant, "openai-route-continuation-1");
      assert.equal(dispatches.entries[1]!.responseStatus, 400);

      const repeated = await runFictionalIfsDiagnostic({ ...validInvocation, continueAfterUnknownProviderAttempt: true }, {
        workspaceRoot: process.cwd(),
        outputRoot,
        transportFactory: () => { throw new Error("a stopped unknown-cost continuation must not initialize another provider transport"); },
      });
      assert.equal(repeated.status, "diagnostic_stopped");
      assert.equal(networkCalls, 1, "a second operator invocation cannot repeat the unknown-cost provider call");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("owner-authorized non-ZDR continuation changes only retention policy, retains the epoch-2 unknown cost, and never replays it", async () => {
  await withTempDirectory(async (outputRoot) => {
    const seeded = await seedEpoch2ZdrUnknownRun(outputRoot);
    const invocation = parseFictionalIfsDiagnosticArgs([
      ...validArgs,
      "--owner-authorized-fresh-budget-epoch-2",
      "--owner-authorized-allow-non-zdr-continuation",
    ]);
    let catalogChecks = 0;
    let providerDispatches = 0;
    let requestId = "";
    let requestPayload: Record<string, unknown> | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (init?.method === "GET") {
        catalogChecks += 1;
        assert.match(String(input), /\/api\/v1\/models\/openai\/gpt-6-luna\/endpoints$/u);
        return new Response(JSON.stringify({ data: { endpoints: [{ provider_name: "OpenAI", name: "OpenAI test endpoint" }] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      providerDispatches += 1;
      requestId = new Headers(init?.headers).get("x-request-id") ?? "";
      requestPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(new URL(String(input)).pathname, "/api/v1/chat/completions");
      return new Response(JSON.stringify({ error: { message: "Provider returned error", code: 400, metadata: { provider_name: "OpenAI", provider_error_code: "invalid_json_schema" } } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const result = await runFictionalIfsDiagnostic(invocation, {
        workspaceRoot: process.cwd(),
        outputRoot,
        transportFactory: async ({ fetch }) => {
          await assertOpenRouterNonZdrDiagnosticRouteEligible(globalThis.fetch, () => new Date("2026-10-11T00:00:00.000Z"));
          return new OpenRouterClient({ apiKey: "test-key", fetch });
        },
      });
      assert.equal(result.status, "diagnostic_stopped");
      assert.equal(catalogChecks, 1, "OpenAI endpoint eligibility is checked before dispatch");
      assert.equal(providerDispatches, 1, "one new C01 request is attempted; failed C01 stops before C02");
      assert.match(requestId, /-fresh-budget-epoch-2:C01:openai-non-zdr-continuation-1:IFS:initial:openai-gpt-6-luna-max:attempt-1$/u);
      assert.notEqual(requestId, `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:IFS:initial:openai-gpt-6-luna-max:attempt-1`);
      assert.deepEqual(requestPayload?.provider, GPT6_LUNA_OPENAI_NON_ZDR_DIAGNOSTIC_PROVIDER_POLICY);
      assert.equal(Object.hasOwn(requestPayload?.provider as object, "zdr"), false, "the retry identity omits only the ZDR requirement");
      assert.equal((requestPayload?.provider as Record<string, unknown>).data_collection, "deny");
      assert.deepEqual((requestPayload?.provider as Record<string, unknown>).only, ["openai"]);
      assert.equal((requestPayload?.provider as Record<string, unknown>).allow_fallbacks, false);
      assert.equal(result.providerDispatchCount, 2, "the previous ZDR attempt remains in the durable dispatch journal");
      assert.equal(result.budget.unknownOrInFlightReservedCostMicros, 2 * FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros);
      assert.equal(result.budget.remainingAuthorizedMicros, FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros - 2 * FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros);
      assert.equal(result.continuation?.ordinal, 2);
      assert.equal(result.continuation?.priorRunSha256, FICTIONAL_IFS_DIAGNOSTIC_EPOCH_2_ZDR_PARENT_SHA256);
      assert.deepEqual(result.continuation?.carriedUnknownAttemptIds, [
        `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:IFS:initial:openai-gpt-6-luna-max:attempt-1`,
      ]);
      assert.equal(result.scope.retentionPolicy, "non_zdr_allowed");
      assert.equal(result.routingQualification, "not_claimed");
      assert.equal(result.productionActivationEffect, "none");
      assert.equal(result.authorization.nonZdrContinuation?.promptRetentionAcknowledged, true);
      assert.equal(result.authorization.nonZdrContinuation?.priorInvoiceStatusRemainsUnknown, true);
      const archivedRun = await readFile(path.join(seeded.runDirectory, result.continuation!.priorRunArchiveFile));
      assert.deepEqual(archivedRun, seeded.originalRunBytes, "the prior ZDR run remains byte-for-byte preserved");
      const dispatches = JSON.parse(await readFile(path.join(seeded.runDirectory, "dispatches.json"), "utf8")) as {
        entries: Array<{ idempotencyKey: string; requestVariant?: string; responseStatus?: number }>;
      };
      assert.equal(dispatches.entries[1]!.idempotencyKey, requestId);
      assert.equal(dispatches.entries[1]!.requestVariant, "openai-non-zdr-continuation-1");
      assert.equal(dispatches.entries[1]!.responseStatus, 400);

      const repeated = await runFictionalIfsDiagnostic(invocation, {
        workspaceRoot: process.cwd(),
        outputRoot,
        transportFactory: () => { throw new Error("an unresolved billing attempt must not initialize another provider transport"); },
      });
      assert.equal(repeated.status, "diagnostic_stopped");
      assert.equal(providerDispatches, 1, "rerunning the exact privacy continuation cannot automatically repeat an unknown-cost call");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("corrected non-ZDR no-dispatch preflight records actual retention policy and hashes the embedded wire schema", async () => {
  const runDirectory = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/live/gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011-fresh-budget-epoch-2";
  const attempts = JSON.parse(await readFile(path.join(runDirectory, "attempts.json"), "utf8")) as {
    attempts: Array<{ attemptId: string; requestFingerprint: string }>;
  };
  const document = JSON.parse(await readFile(
    "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-non-zdr-continuation-v2-no-dispatch-20261011.json",
    "utf8",
  )) as {
    evidenceRecordRevision: number;
    dispatchPerformed: boolean;
    providerCalls: number;
    exactRequests: Array<{
      profileId: string;
      packetSha256: string;
      request: {
        model: string;
        requestFingerprint: string;
        requestFingerprintBasis: string;
        preparedRequestFingerprint: string;
        observedJournalAttemptFingerprint?: string;
        requestCorrelationHeader: { value: string };
        wireSchemaSha256: string;
        finalWirePayload: Record<string, unknown>;
      };
      privacy: { zeroDataRetentionRequested: boolean; dataCollectionDenied: boolean };
      schemaCompatibility: { remoteAcceptance: string };
    }>;
    budgetEpochAuthorization: { totalUnknownReservedMicros: number; remainingAuthorizationMicros: number };
  };

  assert.equal(document.evidenceRecordRevision, 2);
  assert.equal(document.dispatchPerformed, false);
  assert.equal(document.providerCalls, 0);
  assert.deepEqual(document.exactRequests.map((row) => row.profileId), ["C01", "C02"]);
  assert.equal(document.budgetEpochAuthorization.totalUnknownReservedMicros, 230_000);
  assert.equal(document.budgetEpochAuthorization.remainingAuthorizationMicros, 2_770_000);
  for (const row of document.exactRequests) {
    const responseFormat = row.request.finalWirePayload.response_format as Record<string, unknown>;
    const jsonSchema = responseFormat.json_schema as Record<string, unknown>;
    assert.equal(row.request.wireSchemaSha256, sha256Canonical(jsonSchema.schema));
    assert.equal(row.privacy.zeroDataRetentionRequested, false);
    assert.equal(row.privacy.dataCollectionDenied, true);
    assert.equal(row.request.requestFingerprintBasis, "prepared_diagnostic_request");
    assert.equal(row.request.preparedRequestFingerprint, row.request.requestFingerprint);
    assert.equal(row.request.model, "openai/gpt-6-luna");
    assert.equal(row.packetSha256, row.profileId === "C01"
      ? "c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036"
      : "c14bbcbd4ff8b6f69c1074b12a15d9132be9d3373d5d825257ff5dcf8ad61055");
    const provider = row.request.finalWirePayload.provider as Record<string, unknown>;
    assert.deepEqual(provider.only, ["openai"]);
    assert.equal(provider.data_collection, "deny");
    assert.equal(Object.hasOwn(provider, "zdr"), false);
    if (row.profileId === "C01") {
      assert.match(row.schemaCompatibility.remoteAcceptance, /HTTP 400.*invalid_json_schema/u);
      const attempt = attempts.attempts.find((entry) => entry.attemptId === row.request.requestCorrelationHeader.value);
      assert.ok(attempt, "C01's provider attempt must be present in the durable journal");
      assert.equal(row.request.observedJournalAttemptFingerprint, attempt.requestFingerprint);
    } else {
      assert.match(row.schemaCompatibility.remoteAcceptance, /NOT TESTED.*not dispatched/u);
      assert.equal(row.request.observedJournalAttemptFingerprint, undefined);
    }
  }
});

test("the non-ZDR continuation rejects a modified parent journal before provider initialization", async () => {
  await withTempDirectory(async (outputRoot) => {
    const seeded = await seedEpoch2ZdrUnknownRun(outputRoot);
    const runPath = path.join(seeded.runDirectory, "run.json");
    const changed = JSON.parse((await readFile(runPath, "utf8"))) as Record<string, unknown>;
    changed.status = "diagnostic_complete";
    await writeFile(runPath, JSON.stringify(changed));
    const invocation = parseFictionalIfsDiagnosticArgs([
      ...validArgs,
      "--owner-authorized-fresh-budget-epoch-2",
      "--owner-authorized-allow-non-zdr-continuation",
    ]);
    let transportFactoryCalls = 0;
    await assert.rejects(() => runFictionalIfsDiagnostic(invocation, {
      workspaceRoot: process.cwd(),
      outputRoot,
      transportFactory: () => { transportFactoryCalls += 1; return { generate: async () => unexpectedResult() }; },
    }));
    assert.equal(transportFactoryCalls, 0);
  });
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
