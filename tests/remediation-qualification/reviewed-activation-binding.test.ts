import assert from "node:assert/strict";
import test from "node:test";
import type { ReportType } from "../../lib/question-engine/types.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import {
  QUALIFICATION_MODEL_ORDER,
  UnqualifiedModelPolicyError,
  activateReviewedQualificationManifest,
  type ReviewedQualificationManifest,
  type ReviewedQualificationPin,
  type QualifiedModelTier,
} from "../../lib/server/openrouter/policy.ts";

const REPORT_TYPES = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const satisfies readonly ReportType[];

function reviewedFixture(): ReviewedQualificationManifest {
  const pin = (tierIndex: number, maxOutputTokens: number): ReviewedQualificationPin => {
    const candidate = QUALIFICATION_MODEL_ORDER[tierIndex];
    const escalation = QUALIFICATION_MODEL_ORDER[Math.min(tierIndex + 1, QUALIFICATION_MODEL_ORDER.length - 1)];
    return {
      tier: candidate.name,
      model: candidate.model,
      reasoningEffort: candidate.reasoningEffort,
      escalationTier: escalation.name,
      escalationModel: escalation.model,
      escalationReasoningEffort: escalation.reasoningEffort,
      maxOutputTokens,
    };
  };
  const pins: Readonly<Record<ReportType, ReviewedQualificationPin>> = {
    MAP: pin(0, 16_000), IFS: pin(1, 20_000), PV: pin(1, 20_000), ATT: pin(2, 20_000), SYNTHESIS: pin(2, 16_000),
  };
  const qualificationRunSha256 = "3".repeat(64);
  const draftPinsSha256 = sha256Canonical(pins);
  const approval = {
    status: "approved" as const,
    qualificationRunSha256,
    draftPinsSha256,
    reviewedBy: "review-board",
    reviewedAt: "2026-09-02T13:00:00.000Z",
    checklist: {
      allOutputsReviewed: true as const,
      prohibitedClaimsReviewed: true as const,
      traceabilityReviewed: true as const,
      fixtureComparabilityReviewed: true as const,
      pinsApproved: true as const,
    },
  };
  return {
    manifestVersion: "2",
    status: "reviewed",
    contractId: "PWQE3-CONTRACT-2",
    integrityContractId: "PWQE3-INTEGRITY-1",
    promptRelease: "4.1.0",
    fixtureSetSha256: "1".repeat(64),
    sourceManifestSha256: "2".repeat(64),
    qualificationRunSha256,
    candidateOrderSha256: sha256Canonical(QUALIFICATION_MODEL_ORDER),
    draftPinsSha256,
    approvalSha256: sha256Canonical(approval),
    reviewedAt: approval.reviewedAt,
    reviewedBy: approval.reviewedBy,
    candidates: structuredClone(QUALIFICATION_MODEL_ORDER),
    approval,
    pins,
  };
}

function activate(manifest: unknown, expectedSha256 = sha256Canonical(manifest)) {
  return activateReviewedQualificationManifest(JSON.stringify(manifest), expectedSha256);
}

test("activates only the complete reviewed manifest pinned by deployment digest", () => {
  const manifest = reviewedFixture();
  const activated = activate(manifest);
  assert.equal(activated.manifestSha256, sha256Canonical(manifest));
  assert.deepEqual(Object.keys(activated.policy), REPORT_TYPES);
  assert.equal(activated.manifest.sourceManifestSha256, "2".repeat(64));
  assert.equal(activated.manifest.qualificationRunSha256, "3".repeat(64));
});

test("rejects hand-authored legacy JSON even when its digest is supplied", () => {
  const legacy = { manifestVersion: "1", status: "reviewed", pins: reviewedFixture().pins };
  assert.throws(() => activate(legacy), UnqualifiedModelPolicyError);
});

test("deployment digest rejects stale source, run, approval, model, and token mutations", () => {
  const manifest = reviewedFixture();
  const expectedSha256 = sha256Canonical(manifest);
  const mutations: unknown[] = [
    { ...manifest, sourceManifestSha256: "9".repeat(64) },
    { ...manifest, qualificationRunSha256: "8".repeat(64) },
    { ...manifest, reviewedBy: "unreviewed-editor" },
    { ...manifest, pins: { ...manifest.pins, MAP: { ...manifest.pins.MAP, model: "arbitrary/model" } } },
    { ...manifest, pins: { ...manifest.pins, SYNTHESIS: { ...manifest.pins.SYNTHESIS, maxOutputTokens: 999_999 } } },
  ];
  for (const mutation of mutations) {
    assert.throws(() => activateReviewedQualificationManifest(JSON.stringify(mutation), expectedSha256), /deployment-pinned/u);
  }
});

test("internal review digests reject model and token edits even if an attacker substitutes the outer digest", () => {
  const manifest = reviewedFixture();
  const arbitraryModel = { ...manifest, pins: { ...manifest.pins, MAP: { ...manifest.pins.MAP, model: "arbitrary/model" } } };
  const unreviewedLimit = { ...manifest, pins: { ...manifest.pins, MAP: { ...manifest.pins.MAP, maxOutputTokens: 999_999 } } };
  assert.throws(() => activate(arbitraryModel), /pin set/u);
  assert.throws(() => activate(unreviewedLimit), /pin set/u);
});

test("candidate and approval evidence cannot be rewritten under a substituted outer digest", () => {
  const manifest = reviewedFixture();
  const candidates: QualifiedModelTier[] = manifest.candidates.map((candidate) => ({ ...candidate }));
  candidates[0] = { ...candidates[0], model: "arbitrary/model" };
  const candidateRewrite = { ...manifest, candidates, candidateOrderSha256: sha256Canonical(candidates) };
  const priorModelCandidates = manifest.candidates.map((candidate, index) => ({
    ...candidate,
    model: "openai/gpt-5.6-luna",
    reasoningEffort: (["low", "medium", "medium", "high"] as const)[index],
  }));
  const priorModelRewrite = { ...manifest, candidates: priorModelCandidates, candidateOrderSha256: sha256Canonical(priorModelCandidates) };
  const approvalRewrite = { ...manifest, approval: { ...manifest.approval, reviewedBy: "different-reviewer" } };
  assert.throws(() => activate(candidateRewrite), /configured OpenRouter model/u);
  assert.throws(() => activate(priorModelRewrite), /configured OpenRouter model/u);
  assert.throws(() => activate(approvalRewrite), /approval evidence/u);
});
