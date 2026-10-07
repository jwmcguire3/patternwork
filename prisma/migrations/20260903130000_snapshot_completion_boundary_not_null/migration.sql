-- PostgreSQL CHECK constraints accept NULL results, so explicitly require the
-- nullable storage column to be present for normal completed-pass snapshots.
ALTER TABLE "PatternworkV31AssessmentSnapshot"
  DROP CONSTRAINT "PatternworkV31AssessmentSnapshot_normal_completion_boundary_check";

ALTER TABLE "PatternworkV31AssessmentSnapshot"
  ADD CONSTRAINT "PatternworkV31AssessmentSnapshot_normal_completion_boundary_check"
  CHECK (
    "safeResumeStage" IS NOT NULL
    AND (
      (
        "completedPass" = 1
        AND "completionMode" = 'pass1_complete'
        AND "lastCompletedStage" = 'S2'
        AND "safeResumeStage" = 'S3'
      )
      OR
      (
        "completedPass" = 2
        AND "completionMode" = 'pass2_complete'
        AND "lastCompletedStage" = 'S5'
        AND "safeResumeStage" = 'complete'
      )
    )
  );
