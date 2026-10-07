-- Normal pass snapshots must persist the same completion boundary required by
-- the report packet contract. Pre-production invalid snapshots must be purged
-- and recreated before this constraint is deployed.
ALTER TABLE "PatternworkV31AssessmentSnapshot"
  ADD CONSTRAINT "PatternworkV31AssessmentSnapshot_normal_completion_boundary_check"
  CHECK (
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
  );
