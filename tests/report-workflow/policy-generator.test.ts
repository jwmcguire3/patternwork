import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import {
  QUALIFICATION_MODEL_ORDER,
  UNQUALIFIED_MOCK_MODEL_POLICY,
  UnqualifiedModelPolicyError,
  activateReviewedQualificationManifest,
  type ReviewedQualificationManifest,
  type ReviewedQualificationPin,
} from "../../lib/server/openrouter/policy.ts";
import type { OpenRouterGenerationRequest, OpenRouterGenerationResult, OpenRouterTransport, OpenRouterUsage } from "../../lib/server/openrouter/types.ts";
import { generateCanonicalReport } from "../../lib/server/reports/generator.ts";
import type { MappingSummaryArtifact, ReportEvidencePacketV3_1 } from "../../lib/report-contracts/types.ts";

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(new URL(`../../specs/patternwork/question-engine-v3.1/${name}`, import.meta.url), "utf8")) as T;
}

function usage(id: string, costMicros = 1_000): OpenRouterUsage {
  return { generationId: id, inputTokens: 10, outputTokens: 20, reasoningTokens: 2, totalTokens: 30, costMicros, currency: "USD", model: "mock/model" };
}

class QueueProvider implements OpenRouterTransport {
  readonly calls: OpenRouterGenerationRequest[] = [];
  constructor(private readonly queue: OpenRouterGenerationResult[]) {}
  async generate(request: OpenRouterGenerationRequest): Promise<OpenRouterGenerationResult> {
    this.calls.push(request);
    const result = this.queue.shift();
    if (!result) throw new Error("Unexpected provider call.");
    return result;
  }
}

function reviewedManifest(): { raw: string; sha256: string } {
  const pins = {
    MAP: { tier: "luna-low", model: QUALIFICATION_MODEL_ORDER[0].model, reasoningEffort: "low", escalationTier: "luna-medium", escalationModel: QUALIFICATION_MODEL_ORDER[1].model, escalationReasoningEffort: "medium", maxOutputTokens: 16_000 },
    IFS: { tier: "luna-medium", model: QUALIFICATION_MODEL_ORDER[1].model, reasoningEffort: "medium", escalationTier: "terra-medium", escalationModel: QUALIFICATION_MODEL_ORDER[2].model, escalationReasoningEffort: "medium", maxOutputTokens: 20_000 },
    PV: { tier: "luna-medium", model: QUALIFICATION_MODEL_ORDER[1].model, reasoningEffort: "medium", escalationTier: "terra-medium", escalationModel: QUALIFICATION_MODEL_ORDER[2].model, escalationReasoningEffort: "medium", maxOutputTokens: 20_000 },
    ATT: { tier: "terra-medium", model: QUALIFICATION_MODEL_ORDER[2].model, reasoningEffort: "medium", escalationTier: "sol-high", escalationModel: QUALIFICATION_MODEL_ORDER[3].model, escalationReasoningEffort: "high", maxOutputTokens: 20_000 },
    SYNTHESIS: { tier: "terra-medium", model: QUALIFICATION_MODEL_ORDER[2].model, reasoningEffort: "medium", escalationTier: "sol-high", escalationModel: QUALIFICATION_MODEL_ORDER[3].model, escalationReasoningEffort: "high", maxOutputTokens: 16_000 },
  } satisfies Readonly<Record<"MAP" | "IFS" | "PV" | "ATT" | "SYNTHESIS", ReviewedQualificationPin>>;
  const qualificationRunSha256 = "c".repeat(64);
  const draftPinsSha256 = sha256Canonical(pins);
  const approval = {
    status: "approved" as const,
    qualificationRunSha256,
    draftPinsSha256,
    reviewedBy: "review-board",
    reviewedAt: "2026-09-02T12:00:00Z",
    checklist: { allOutputsReviewed: true as const, prohibitedClaimsReviewed: true as const, traceabilityReviewed: true as const, fixtureComparabilityReviewed: true as const, pinsApproved: true as const },
  };
  const manifest: ReviewedQualificationManifest = {
    manifestVersion: "2", status: "reviewed", contractId: "PWQE3-CONTRACT-2", integrityContractId: "PWQE3-INTEGRITY-1", promptRelease: "4.1.0",
    fixtureSetSha256: "a".repeat(64), sourceManifestSha256: "b".repeat(64), qualificationRunSha256,
    candidateOrderSha256: sha256Canonical(QUALIFICATION_MODEL_ORDER), draftPinsSha256, approvalSha256: sha256Canonical(approval),
    reviewedAt: approval.reviewedAt, reviewedBy: approval.reviewedBy, candidates: QUALIFICATION_MODEL_ORDER, approval, pins,
  };
  return { raw: JSON.stringify(manifest), sha256: sha256Canonical(manifest) };
}

test("live model activation fails closed without reviewed qualification evidence", () => {
  assert.throws(() => activateReviewedQualificationManifest(undefined), UnqualifiedModelPolicyError);
  const reviewed = reviewedManifest();
  assert.throws(() => activateReviewedQualificationManifest(reviewed.raw), /SHA-256/u);
  const activated = activateReviewedQualificationManifest(reviewed.raw, reviewed.sha256);
  assert.equal(activated.policy.MAP.model, QUALIFICATION_MODEL_ORDER[0].model);
  assert.equal(activated.policy.ATT.escalationModel, QUALIFICATION_MODEL_ORDER[3].model);
});

test("validator rejection gets one same-tier repair and aggregates actual usage", async () => {
  const packet = await fixture<ReportEvidencePacketV3_1>("12c_respondent_c_packet.json");
  const artifact = await fixture<MappingSummaryArtifact>("12c_mapping_summary_artifact.json");
  const provider = new QueueProvider([
    { ok: true, output: {} as JsonObject, usage: usage("gen-1") },
    { ok: true, output: artifact, usage: usage("gen-2", 2_000) },
  ]);
  const outcome = await generateCanonicalReport({ reportType: "MAP", input: { packets: [packet] } as unknown as JsonObject, packets: [packet], provider, invocationKey: "stable", spentMicros: 0, costCapMicros: 10_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY });
  assert.equal(outcome.ok, true);
  assert.equal(provider.calls.length, 2);
  assert.equal(provider.calls[0].model, provider.calls[1].model);
  assert.match(provider.calls[1].prompt, /validator_feedback/u);
  if (outcome.ok) {
    assert.equal(outcome.value.usage.attempts, 2);
    assert.equal(outcome.value.usage.costMicros, 3_000);
    assert.deepEqual(outcome.value.usage.generationIds, ["gen-1", "gen-2"]);
  }
});

test("failed repair escalates exactly one tier and refusal skips same-tier repair", async () => {
  const packet = await fixture<ReportEvidencePacketV3_1>("12c_respondent_c_packet.json");
  const artifact = await fixture<MappingSummaryArtifact>("12c_mapping_summary_artifact.json");
  const invalidProvider = new QueueProvider([
    { ok: true, output: {} as JsonObject, usage: usage("gen-1") },
    { ok: false, kind: "invalid_json", message: "bad", usage: usage("gen-2") },
    { ok: true, output: artifact, usage: usage("gen-3") },
  ]);
  const repaired = await generateCanonicalReport({ reportType: "MAP", input: { packets: [packet] } as unknown as JsonObject, packets: [packet], provider: invalidProvider, invocationKey: "stable", spentMicros: 0, costCapMicros: 10_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY });
  assert.equal(repaired.ok, true);
  assert.deepEqual(invalidProvider.calls.map((call) => call.reasoningEffort), ["low", "low", "medium"]);

  const refusalProvider = new QueueProvider([
    { ok: false, kind: "refusal", message: "refused", usage: usage("gen-r1") },
    { ok: true, output: artifact, usage: usage("gen-r2") },
  ]);
  const escalated = await generateCanonicalReport({ reportType: "MAP", input: { packets: [packet] } as unknown as JsonObject, packets: [packet], provider: refusalProvider, invocationKey: "stable", spentMicros: 0, costCapMicros: 10_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY });
  assert.equal(escalated.ok, true);
  assert.deepEqual(refusalProvider.calls.map((call) => call.reasoningEffort), ["low", "medium"]);
});

test("cost cap is checked before every provider call", async () => {
  const packet = await fixture<ReportEvidencePacketV3_1>("12c_respondent_c_packet.json");
  const provider = new QueueProvider([]);
  const outcome = await generateCanonicalReport({ reportType: "MAP", input: { packets: [packet] } as unknown as JsonObject, packets: [packet], provider, invocationKey: "stable", spentMicros: 0, costCapMicros: 1, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failure.code, "cost_cap_exceeded");
  assert.equal(provider.calls.length, 0);
});
