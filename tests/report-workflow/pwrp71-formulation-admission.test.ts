import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { REPORT_DEV_LUNA_MAX_128K_CANDIDATE_V1, type ReportDevCandidateAdmission } from "../../lib/server/openrouter/policy.ts";
import { REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT } from "../../lib/server/openrouter/privacy-boundary.ts";
import { GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY } from "../../lib/server/openrouter/qualification-budget.ts";
import type { OpenRouterGenerationRequest, OpenRouterGenerationResult } from "../../lib/server/openrouter/types.ts";
import { FileQualificationAttemptStore, JournaledPwrp71Transport } from "../../lib/server/reports/qualification/attempt-store.ts";

const candidate = REPORT_DEV_LUNA_MAX_128K_CANDIDATE_V1;
const admission: ReportDevCandidateAdmission = {
  scope: "report-dev-experimental-v1",
  candidateId: candidate.id,
  candidateSha256: sha256Canonical(candidate),
  runBindingSha256: "a".repeat(64),
};

function requestFor(phase: string, schemaName: string, ordinal: number): OpenRouterGenerationRequest {
  return {
    model: candidate.model,
    reasoningEffort: candidate.reasoningEffort,
    system: "Return the requested JSON object.",
    prompt: "Use the bound report inputs.",
    schemaName,
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    maxOutputTokens: candidate.maxOutputTokens,
    idempotencyKey: `dev:${admission.runBindingSha256}:IFS:${phase}:${candidate.id}:attempt-${ordinal}`,
  };
}

async function withStore(run: (store: FileQualificationAttemptStore) => Promise<void>): Promise<void> {
  const scratch = path.resolve(".codex-temp/test-runs");
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(path.join(scratch, "formulation-admission-"));
  try {
    await run(new FileQualificationAttemptStore(directory));
  } finally {
    assert.equal(path.dirname(directory), scratch);
    await rm(directory, { recursive: true, force: true });
  }
}

function harness(store: FileQualificationAttemptStore, perCall = 500_000, aggregate = 2_000_000, cost = 30) {
  const requests: OpenRouterGenerationRequest[] = [];
  const transport = new JournaledPwrp71Transport({
    store,
    candidateAdmission: admission,
    maxCallCostMicros: perCall,
    aggregateCostCapMicros: aggregate,
    privacyIdentityContext: REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT,
    transport: { generate: async (request): Promise<OpenRouterGenerationResult> => {
      requests.push(request);
      return {
        ok: true, output: { ok: true }, finishReason: "stop",
        usage: { generationId: `offline-admission-${requests.length}`, inputTokens: 12, outputTokens: 4,
          reasoningTokens: 1, totalTokens: 16, costMicros: cost, currency: "USD", model: candidate.model },
      };
    } },
  });
  return { transport, requests };
}

test("fixed Luna Max candidate admits all current formulation-first stages through the journal", async () => {
  await withStore(async (store) => {
    const { transport, requests } = harness(store);
    const stages = [
      ["initial", "patternwork_ifs_pwrp71_formulation_3"],
      ["repair", "patternwork_ifs_pwrp71_formulation_3"],
      ["initial", "patternwork_ifs_pwrp71_narrative_2"],
      ["repair", "patternwork_ifs_pwrp71_narrative_2"],
      ["review", "patternwork_ifs_pwrp71_review_candidate_5"],
      ["review_after_repair", "patternwork_ifs_pwrp71_review_candidate_5"],
    ];
    for (const [index, [phase, schema]] of stages.entries()) await transport.generate(requestFor(phase, schema, index + 1));
    assert.equal(requests.length, stages.length);
    for (const wire of requests) {
      assert.equal(wire.model, "openai/gpt-6-luna");
      assert.equal(wire.reasoningEffort, "max");
      assert.equal(wire.maxOutputTokens, 128_000);
      assert.equal(wire.includeUsage, true);
      assert.deepEqual(wire.providerPolicy, GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY);
    }
    const attempts = await store.list();
    assert.equal(attempts.length, stages.length);
    assert.ok(attempts.every(row => row.status === "completed" && row.maximumCallCostMicros === 500_000 && row.aggregateCostCapMicros === 2_000_000));
  });
});

test("candidate stage admission rejects retired schemas/phases and altered model or run pins before dispatch", async () => {
  await withStore(async (store) => {
    const { transport, requests } = harness(store);
    const current = requestFor("initial", "patternwork_ifs_pwrp71_formulation_3", 1);
    const invalid: OpenRouterGenerationRequest[] = [
      { ...current, schemaName: "patternwork_ifs_pwrp71_candidate_1" },
      { ...current, schemaName: "patternwork_ifs_pwrp71_formulation_1" },
      { ...current, schemaName: "patternwork_ifs_pwrp71_formulation_2" },
      { ...current, schemaName: "patternwork_ifs_pwrp71_narrative_1" },
      requestFor("review", "patternwork_ifs_pwrp71_review_candidate_4", 1),
      requestFor("review", "patternwork_ifs_pwrp71_review_candidate_3", 1),
      requestFor("review", "patternwork_ifs_pwrp71_formulation_3", 1),
      requestFor("initial", "patternwork_ifs_pwrp71_review_candidate_5", 1),
      requestFor("review_retry", "patternwork_ifs_pwrp71_review_candidate_5", 1),
      requestFor("escalation", "patternwork_ifs_pwrp71_formulation_3", 1),
      { ...current, model: "openai/other-model" },
      { ...current, reasoningEffort: "high" },
      { ...current, maxOutputTokens: 64_000 },
      { ...current, idempotencyKey: current.idempotencyKey.replace(":IFS:", ":PV:") },
      { ...current, idempotencyKey: current.idempotencyKey.replace(admission.runBindingSha256, "b".repeat(64)) },
    ];
    for (const request of invalid) await assert.rejects(transport.generate(request));
    assert.equal(requests.length, 0);
    assert.deepEqual(await store.list(), []);
  });
});

test("saving a formulation records private provenance hashes without a false repair decision", async () => {
  await withStore(async (store) => {
    const { transport } = harness(store);
    const request = requestFor("initial", "patternwork_ifs_pwrp71_formulation_3", 1);
    await transport.generate(request);
    const formulationSha256 = "c".repeat(64), analysisSha256 = "d".repeat(64);
    await store.recordGenerationEvent({ type: "formulation_saved", attemptId: request.idempotencyKey,
      reportType: "IFS", formulationSha256, analysisSha256 });
    const record = await store.get(request.idempotencyKey);
    assert.deepEqual(record?.formulationReceipt, { formulationSha256, analysisSha256 });
    assert.equal(record?.repairDecisions, undefined);
  });
});

test("formulation-first candidate cannot bypass per-call or aggregate budget admission", async () => {
  await withStore(async (store) => {
    const { transport, requests } = harness(store, 100_000);
    await assert.rejects(transport.generate(requestFor("initial", "patternwork_ifs_pwrp71_formulation_3", 1)), /Per-call ceiling blocked/u);
    assert.equal(requests.length, 0);
    assert.deepEqual(await store.list(), []);
  });
  await withStore(async (store) => {
    const { transport, requests } = harness(store, 500_000, 200_000, 100_000);
    await transport.generate(requestFor("initial", "patternwork_ifs_pwrp71_formulation_3", 1));
    await assert.rejects(transport.generate(requestFor("initial", "patternwork_ifs_pwrp71_narrative_2", 2)), /aggregate budget blocked/u);
    assert.equal(requests.length, 1);
    assert.equal((await store.list()).length, 1);
  });
});
