import type { AssessmentPass } from "./types.ts";

export interface NormalCompletionBoundary {
  readonly completionMode: "pass1_complete" | "pass2_complete";
  readonly lastCompletedStage: "S2" | "S5";
  readonly safeResumeStage: "S3" | "complete";
}

const NORMAL_COMPLETION_BOUNDARIES: Readonly<Record<AssessmentPass, NormalCompletionBoundary>> = {
  1: { completionMode: "pass1_complete", lastCompletedStage: "S2", safeResumeStage: "S3" },
  2: { completionMode: "pass2_complete", lastCompletedStage: "S5", safeResumeStage: "complete" },
};

export function normalCompletionBoundary(completedPass: AssessmentPass): NormalCompletionBoundary {
  return NORMAL_COMPLETION_BOUNDARIES[completedPass];
}

export function assertNormalCompletionBoundary(
  completedPass: AssessmentPass,
  actual: {
    readonly completionMode?: unknown;
    readonly lastCompletedStage?: unknown;
    readonly safeResumeStage?: unknown;
  },
  source: string,
): NormalCompletionBoundary {
  const expected = normalCompletionBoundary(completedPass);
  if (
    actual.completionMode !== expected.completionMode ||
    actual.lastCompletedStage !== expected.lastCompletedStage ||
    actual.safeResumeStage !== expected.safeResumeStage
  ) {
    throw new Error(
      `${source} completion boundary does not match completed Pass ${completedPass}; expected ` +
      `${expected.completionMode}/${expected.lastCompletedStage}/${expected.safeResumeStage}.`,
    );
  }
  return expected;
}

export function assertCanonicalCompletionBoundary(
  completedPass: AssessmentPass,
  value: unknown,
  source = "Canonical assessment snapshot",
): NormalCompletionBoundary {
  const completion = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return assertNormalCompletionBoundary(completedPass, {
    completionMode: completion.completion_mode,
    lastCompletedStage: completion.last_completed_stage,
    safeResumeStage: completion.safe_resume_stage,
  }, source);
}
