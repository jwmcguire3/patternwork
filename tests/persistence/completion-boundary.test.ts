import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCanonicalCompletionBoundary,
  assertNormalCompletionBoundary,
  normalCompletionBoundary,
} from "../../lib/server/assessment/completion-boundary.ts";

test("normal completion boundaries are authoritative for each completed pass", () => {
  assert.deepEqual(normalCompletionBoundary(1), {
    completionMode: "pass1_complete",
    lastCompletedStage: "S2",
    safeResumeStage: "S3",
  });
  assert.deepEqual(normalCompletionBoundary(2), {
    completionMode: "pass2_complete",
    lastCompletedStage: "S5",
    safeResumeStage: "complete",
  });
});

test("stored and canonical completion metadata fail closed on pass-boundary drift", () => {
  assert.deepEqual(assertNormalCompletionBoundary(1, {
    completionMode: "pass1_complete",
    lastCompletedStage: "S2",
    safeResumeStage: "S3",
  }, "Stored assessment snapshot"), normalCompletionBoundary(1));
  assert.deepEqual(assertCanonicalCompletionBoundary(2, {
    completion_mode: "pass2_complete",
    last_completed_stage: "S5",
    safe_resume_stage: "complete",
  }), normalCompletionBoundary(2));

  assert.throws(() => assertNormalCompletionBoundary(1, {
    completionMode: "pass1_complete",
    lastCompletedStage: "S1",
    safeResumeStage: "S1",
  }, "Stored assessment snapshot"), /expected pass1_complete\/S2\/S3/u);
  assert.throws(() => assertCanonicalCompletionBoundary(1, {
    completion_mode: "pass1_complete",
    last_completed_stage: "S1",
    safe_resume_stage: "S1",
  }), /expected pass1_complete\/S2\/S3/u);
});
