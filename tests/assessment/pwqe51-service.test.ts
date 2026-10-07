import assert from "node:assert/strict";
import test from "node:test";
import { pwqe51CandidateConfigured } from "../../lib/server/assessment/service.ts";
import { AssessmentError } from "../../lib/server/assessment/errors.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { createPwqe51SessionState, type Pwqe51SessionState } from "../../lib/server/assessment/pwqe51-session.ts";
import { resolvePwqe51PassTwoContext } from "../../lib/server/assessment/service.ts";
import { sha256 } from "../../lib/server/security/crypto.ts";

test("candidate selector preserves the current engine when no qualification manifest is configured", async () => {
  const priorJson = process.env.PWRP71_QUALIFICATION_MANIFEST_JSON;
  const priorDigest = process.env.PWRP71_QUALIFICATION_MANIFEST_SHA256;
  delete process.env.PWRP71_QUALIFICATION_MANIFEST_JSON;
  delete process.env.PWRP71_QUALIFICATION_MANIFEST_SHA256;
  try { assert.equal(await pwqe51CandidateConfigured(), false); }
  finally {
    if (priorJson === undefined) delete process.env.PWRP71_QUALIFICATION_MANIFEST_JSON;
    else process.env.PWRP71_QUALIFICATION_MANIFEST_JSON = priorJson;
    if (priorDigest === undefined) delete process.env.PWRP71_QUALIFICATION_MANIFEST_SHA256;
    else process.env.PWRP71_QUALIFICATION_MANIFEST_SHA256 = priorDigest;
  }
});

test("a present but malformed qualification manifest fails closed", async () => {
  const priorJson = process.env.PWRP71_QUALIFICATION_MANIFEST_JSON;
  const priorDigest = process.env.PWRP71_QUALIFICATION_MANIFEST_SHA256;
  process.env.PWRP71_QUALIFICATION_MANIFEST_JSON = "{";
  process.env.PWRP71_QUALIFICATION_MANIFEST_SHA256 = "0".repeat(64);
  try {
    await assert.rejects(pwqe51CandidateConfigured(), (error: unknown) => error instanceof AssessmentError && error.code === "report_unavailable");
  } finally {
    if (priorJson === undefined) delete process.env.PWRP71_QUALIFICATION_MANIFEST_JSON;
    else process.env.PWRP71_QUALIFICATION_MANIFEST_JSON = priorJson;
    if (priorDigest === undefined) delete process.env.PWRP71_QUALIFICATION_MANIFEST_SHA256;
    else process.env.PWRP71_QUALIFICATION_MANIFEST_SHA256 = priorDigest;
  }
});

test("pass-two context resolves opaque focus references to current server-owned episodes", async () => {
  const source = await loadPwqe51SourcePackage();
  const initial = createPwqe51SessionState(source);
  const state = {
    ...initial,
    routerResult: {
      ...initial.routerResult,
      episodes: [
        { id: "occurrence-secret-a", family: "conflict", context: "private context", basis: "actual_recalled", actual: true, distinctFrom: [], responseIds: [] },
        { id: "occurrence-secret-b", family: "conflict", context: "private context", basis: "actual_recalled", actual: true, distinctFrom: [], responseIds: [] },
        { id: "occurrence-secret-c", family: "conflict", context: "private context", basis: "actual_recalled", actual: true, distinctFrom: [], responseIds: [] },
      ],
    },
  } as Pwqe51SessionState;
  const sessionId = "session-opaque-test";
  const refA = `focus_${sha256(`${sessionId}:occurrence-secret-a`).slice(0, 20)}`;
  const refB = `focus_${sha256(`${sessionId}:occurrence-secret-b`).slice(0, 20)}`;
  const refC = `focus_${sha256(`${sessionId}:occurrence-secret-c`).slice(0, 20)}`;
  assert.deepEqual(resolvePwqe51PassTwoContext(sessionId, state, {
    focusOccurrenceRefs: [refA],
    detailPermissions: ["body", "contrast"],
    comparisonDecisions: [
      { firstRef: refA, secondRef: refB, relation: "different" },
      { firstRef: refA, secondRef: refC, relation: "same" },
      { firstRef: refB, secondRef: refC, relation: "cannot_tell" },
    ],
  }), {
    focusOccurrences: ["occurrence-secret-a"],
    details: ["body", "contrast"],
    distinctPairs: [["occurrence-secret-a", "occurrence-secret-b"]],
    comparisonDecisions: [
      { firstOccurrenceId: "occurrence-secret-a", secondOccurrenceId: "occurrence-secret-b", relation: "different" },
      { firstOccurrenceId: "occurrence-secret-a", secondOccurrenceId: "occurrence-secret-c", relation: "same" },
      { firstOccurrenceId: "occurrence-secret-b", secondOccurrenceId: "occurrence-secret-c", relation: "cannot_tell" },
    ],
  });
  assert.throws(() => resolvePwqe51PassTwoContext(sessionId, state, { focusOccurrenceRefs: ["occurrence-secret-a"] }), /stale or unavailable/u);
  assert.throws(() => resolvePwqe51PassTwoContext(sessionId, state, { comparisonDecisions: [{ firstRef: refA, secondRef: refA, relation: "same" }] }), /cannot be marked distinct from itself/u);
  assert.throws(() => resolvePwqe51PassTwoContext(sessionId, state, { comparisonDecisions: [{ firstRef: "forged", secondRef: refB, relation: "different" }] }), /stale or unavailable/u);
  assert.throws(() => resolvePwqe51PassTwoContext(sessionId, state, { comparisonDecisions: [{ firstRef: refA, secondRef: refB, relation: "different" }, { firstRef: refB, secondRef: refA, relation: "same" }] }), /duplicate pair/u);
  assert.throws(() => resolvePwqe51PassTwoContext(sessionId, state, { detailPermissions: ["diagnose"] }), /outside the authored controls/u);
});
