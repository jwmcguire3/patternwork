import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { QUALIFICATION_MODEL_ORDER, UNQUALIFIED_MOCK_MODEL_POLICY } from "../../lib/server/openrouter/policy.ts";
import type { OpenRouterGenerationRequest, OpenRouterGenerationResult, OpenRouterTransport } from "../../lib/server/openrouter/types.ts";
import { generateCanonicalReport } from "../../lib/server/reports/generator.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { loadPwrp71QualificationFixtures } from "../../lib/server/reports/qualification/fixtures.ts";
import { loadPwrp71FixturePacket } from "../../lib/server/reports/qualification/replay.ts";
import { readPwrp71QualificationAttempts, runPwrp71Qualification } from "../../lib/server/reports/qualification/runner.ts";

async function withOutputRoot(run: (outputRoot: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pwrp71-runner-"));
  try { await run(path.join(parent, "runs")); }
  finally { await rm(parent, { recursive: true, force: true }); }
}

test("offline runner uses the production report/review loop and keeps output explicitly unqualified", async () => {
  await withOutputRoot(async (outputRoot) => {
    const run = await runPwrp71Qualification({
      runId: "offline-c01-all-layers",
      mode: "offline",
      profileIds: ["C01"],
      reportTypes: ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"],
      costCapMicros: 1_000_000,
      outputRoot,
      workspaceRoot: process.cwd(),
    });
    assert.equal(run.status, "offline_complete");
    assert.equal(run.routeParity, "pending");
    assert.deepEqual(run.results.map(({ status }) => status), ["accepted", "accepted", "accepted", "accepted", "accepted"]);
    assert.ok(run.results.every((result) => result.usage?.status === "mock"));
    assert.equal(run.totalReportedCostMicros, 0);
    assert.equal((await readPwrp71QualificationAttempts(run)).length, 10, "each report has a generation and a reviewer call");
  });
});

test("live runner blocks before provider dispatch when final routing evidence is missing", async () => {
  await withOutputRoot(async (outputRoot) => {
    let providerCalls = 0;
    const transport: OpenRouterTransport = {
      async generate(): Promise<OpenRouterGenerationResult> {
        providerCalls += 1;
        throw new Error("provider must not be called without route qualification evidence");
      },
    };
    const run = await runPwrp71Qualification({
      runId: "live-no-route-evidence",
      mode: "live",
      profileIds: ["C01"],
      reportTypes: ["MAP"],
      costCapMicros: 1_000_000,
      outputRoot,
      workspaceRoot: process.cwd(),
      transport,
    });
    assert.equal(run.status, "blocked");
    assert.equal(providerCalls, 0);
    assert.match(run.blockers[0] ?? "", /router qualification evidence/u);
    assert.equal(run.results.length, 0);
  });
});

test("PWRP 7.1 generation records the requested model/effort and rejects a different returned model", async () => {
  const fixtures = await loadPwrp71QualificationFixtures();
  const questionSource = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const fixture = await loadPwrp71FixturePacket({ profileId: "C01", fixtures, questionSource });
  const prepared = preparePwrp71Request({ packet: fixture.packet, reportType: "MAP", questionSource, reportSource });
  assert.equal(prepared.ok, true, prepared.ok ? undefined : JSON.stringify(prepared.issues));
  if (!prepared.ok) return;

  let captured: OpenRouterGenerationRequest | undefined;
  const transport: OpenRouterTransport = {
    async generate(request): Promise<OpenRouterGenerationResult> {
      captured = request;
      return {
        ok: true,
        output: {} as JsonObject,
        usage: {
          generationId: "wrong-model-test",
          inputTokens: 2,
          outputTokens: 1,
          reasoningTokens: 0,
          totalTokens: 3,
          costMicros: 1,
          currency: "USD",
          model: "different/provider-model",
        },
        finishReason: "stop",
      };
    },
  };
  const result = await generateCanonicalReport({
    reportType: "MAP",
    input: {},
    packets: [fixture.packet],
    provider: transport,
    invocationKey: "wrong-model-test",
    spentMicros: 0,
    costCapMicros: 1_000_000,
    modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1",
    pwrp71: { request: prepared.value, packet: fixture.packet, source: reportSource },
  });
  assert.equal(captured?.model, QUALIFICATION_MODEL_ORDER[0].model);
  assert.equal(captured?.reasoningEffort, "max");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.code, "protocol");
    assert.match(result.failure.message, /returned model .* qualification request pinned/u);
    assert.equal(result.failure.usages[0]?.model, "different/provider-model");
  }
});
