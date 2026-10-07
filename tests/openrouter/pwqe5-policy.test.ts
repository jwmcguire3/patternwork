import assert from "node:assert/strict";
import test from "node:test";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import {
  QUALIFICATION_MODEL_ORDER,
  UnqualifiedModelPolicyError,
  activateReviewedPwqe5QualificationManifest,
  type ReviewedPwqe5QualificationManifest,
  type ReviewedQualificationPin,
} from "../../lib/server/openrouter/policy.ts";
import {
  PWQE5_NEGATIVE_CASES_SHA256,
  PWQE5_QUALIFICATION_FIXTURE_SET_SHA256,
  PWQE5_WORKED_PATHS_SHA256,
} from "../../lib/server/openrouter/policy.ts";
import { PWQE5_RELEASE_IDENTITY, PWQE5_SOURCE_MANIFEST_SHA256 } from "../../lib/server/reports/pwqe6-source.ts";

function reviewedFixture(): ReviewedPwqe5QualificationManifest {
  const pin = (tierIndex: number, maxOutputTokens: number): ReviewedQualificationPin => {
    const tier = QUALIFICATION_MODEL_ORDER[tierIndex];
    const escalation = QUALIFICATION_MODEL_ORDER[Math.min(tierIndex + 1, QUALIFICATION_MODEL_ORDER.length - 1)];
    return {
      tier: tier.name,
      model: tier.model,
      reasoningEffort: tier.reasoningEffort,
      escalationTier: escalation.name,
      escalationModel: escalation.model,
      escalationReasoningEffort: escalation.reasoningEffort,
      maxOutputTokens,
    };
  };
  const pins = {
    MAP: pin(0, 16_000), IFS: pin(1, 20_000), PV: pin(1, 20_000), ATT: pin(2, 20_000), SYNTHESIS: pin(2, 16_000),
  } as const;
  const qualificationRunSha256 = "3".repeat(64);
  const draftPinsSha256 = sha256Canonical(pins);
  const approval = {
    status: "approved" as const,
    qualificationRunSha256,
    draftPinsSha256,
    reviewedBy: "independent-review-board",
    reviewedAt: "2026-10-07T12:00:00.000Z",
    checklist: {
      allOutputsReviewed: true as const,
      prohibitedClaimsReviewed: true as const,
      traceabilityReviewed: true as const,
      fixtureComparabilityReviewed: true as const,
      pinsApproved: true as const,
    },
  };
  return {
    manifestVersion: "pwqe5-qualification-1",
    status: "reviewed",
    qualificationMode: "provider",
    questionRelease: PWQE5_RELEASE_IDENTITY.release,
    routerVersion: PWQE5_RELEASE_IDENTITY.routerVersion,
    promptRelease: PWQE5_RELEASE_IDENTITY.promptRelease,
    evidenceContract: PWQE5_RELEASE_IDENTITY.evidenceContract,
    reportContract: "patternwork-report-v6-design",
    routerPacketSchemaId: "urn:patternwork:router-evidence:1",
    reportDraftSchemaRevision: "draft-2020-12",
    sourceSha256: PWQE5_RELEASE_IDENTITY.sourceSha256,
    sourceManifestSha256: PWQE5_SOURCE_MANIFEST_SHA256,
    workedPathsSha256: PWQE5_WORKED_PATHS_SHA256,
    negativeCasesSha256: PWQE5_NEGATIVE_CASES_SHA256,
    fixtureSetSha256: PWQE5_QUALIFICATION_FIXTURE_SET_SHA256,
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

function activate(manifest: unknown, expected = sha256Canonical(manifest)) {
  return activateReviewedPwqe5QualificationManifest(JSON.stringify(manifest), expected);
}

test("activates only a reviewed v5 manifest bound to the pinned source, router, prompt and schema", () => {
  const manifest = reviewedFixture();
  const activated = activate(manifest);
  assert.equal(activated.manifestSha256, sha256Canonical(manifest));
  assert.equal(activated.manifest.questionRelease, "PWQE-5.0.0-design.1");
  assert.equal(activated.manifest.routerVersion, "PW-ROUTER-1.0.0-candidate.1");
  assert.equal(activated.manifest.promptRelease, "6.0");
  assert.equal(activated.manifest.sourceManifestSha256, PWQE5_SOURCE_MANIFEST_SHA256);
  assert.equal(activated.policy.MAP.model, QUALIFICATION_MODEL_ORDER[0].model);
  assert.ok(Object.values(activated.policy).every((pin) => pin.model === "openai/gpt-6-luna" && pin.reasoningEffort === "max"));
});

test("rejects v5 manifests reviewed for the previous OpenRouter model and effort", () => {
  const manifest = reviewedFixture();
  const candidates = manifest.candidates.map((candidate, index) => ({
    ...candidate,
    model: "openai/gpt-5.6-luna",
    reasoningEffort: (["low", "medium", "medium", "high"] as const)[index],
  }));
  const oldCandidateManifest = { ...manifest, candidates, candidateOrderSha256: sha256Canonical(candidates) };
  assert.throws(() => activate(oldCandidateManifest), /different configured OpenRouter model/u);
});

test("rejects unreviewed v5 source, router, prompt, schema, and fixture identities even with a new outer digest", () => {
  const manifest = reviewedFixture();
  const mutations = [
    { ...manifest, questionRelease: "PWQE-5.0.1-design.1" },
    { ...manifest, routerVersion: "PW-ROUTER-1.0.0" },
    { ...manifest, promptRelease: "6.1" },
    { ...manifest, reportContract: "legacy-report-contract" },
    { ...manifest, routerPacketSchemaId: "urn:legacy" },
    { ...manifest, reportDraftSchemaRevision: "draft-07" },
    { ...manifest, sourceSha256: "9".repeat(64) },
    { ...manifest, sourceManifestSha256: "8".repeat(64) },
    { ...manifest, workedPathsSha256: "7".repeat(64) },
    { ...manifest, negativeCasesSha256: "6".repeat(64) },
    { ...manifest, fixtureSetSha256: "5".repeat(64) },
  ];
  for (const mutation of mutations) assert.throws(() => activate(mutation), UnqualifiedModelPolicyError);
});

test("requires a deployment digest and refuses unreviewed status", () => {
  const manifest = reviewedFixture();
  assert.throws(() => activateReviewedPwqe5QualificationManifest(JSON.stringify(manifest), undefined), /deployment-pinned/u);
  assert.throws(() => activate({ ...manifest, status: "pending_review" }), /bind the reviewed source/u);
});
