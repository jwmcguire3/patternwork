-- Durable report workflow ownership, tracked notifications, and scoped response exports.
-- Existing assessment snapshots and report artifacts remain immutable.

ALTER TYPE "PatternworkV31AccessTokenPurpose" ADD VALUE 'EXPORT_RESPONSES';

CREATE TYPE "PatternworkV31ReportAttemptStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'STALLED');
CREATE TYPE "PatternworkV31ReportAttemptPhase" AS ENUM ('ENQUEUE', 'PREFLIGHT', 'GENERATION', 'PDF', 'RELEASE');
CREATE TYPE "PatternworkV31ReportAttemptRequester" AS ENUM ('COMPLETION', 'USER', 'OPERATOR', 'BACKFILL');
CREATE TYPE "PatternworkV31ReportFailureCategory" AS ENUM ('TRANSIENT', 'STALLED', 'CONFIGURATION', 'VALIDATION', 'COST', 'PDF', 'DELIVERY', 'INTERNAL');
CREATE TYPE "PatternworkV31RetryAudience" AS ENUM ('USER', 'OPERATOR', 'NONE');
CREATE TYPE "PatternworkV31NotificationType" AS ENUM ('RESUME_LINK', 'REPORT_STARTED', 'REPORT_FAILED', 'EXPORT_LINK');

ALTER TABLE "PatternworkV31AssessmentSnapshot"
  ADD COLUMN "currentReportAttemptNumber" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PatternworkV31ReportWorkflowAttempt" (
  "id" TEXT NOT NULL,
  "assessmentSnapshotId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "invocationKey" TEXT NOT NULL,
  "requestIdempotencyKey" TEXT,
  "workflowRunId" TEXT,
  "watchdogRunId" TEXT,
  "status" "PatternworkV31ReportAttemptStatus" NOT NULL DEFAULT 'QUEUED',
  "phase" "PatternworkV31ReportAttemptPhase" NOT NULL DEFAULT 'ENQUEUE',
  "requestedBy" "PatternworkV31ReportAttemptRequester" NOT NULL,
  "failureCategory" "PatternworkV31ReportFailureCategory",
  "retryAudience" "PatternworkV31RetryAudience" NOT NULL DEFAULT 'NONE',
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "reportsReleasedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatternworkV31ReportWorkflowAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatternworkV31ReportWorkflowAttempt_invocationKey_key"
  ON "PatternworkV31ReportWorkflowAttempt"("invocationKey");
CREATE UNIQUE INDEX "PatternworkV31ReportWorkflowAttempt_requestIdempotencyKey_key"
  ON "PatternworkV31ReportWorkflowAttempt"("requestIdempotencyKey");
CREATE UNIQUE INDEX "PatternworkV31ReportWorkflowAttempt_workflowRunId_key"
  ON "PatternworkV31ReportWorkflowAttempt"("workflowRunId");
CREATE UNIQUE INDEX "PatternworkV31ReportWorkflowAttempt_watchdogRunId_key"
  ON "PatternworkV31ReportWorkflowAttempt"("watchdogRunId");
CREATE UNIQUE INDEX "PatternworkV31ReportWorkflowAttempt_assessmentSnapshotId_at_key"
  ON "PatternworkV31ReportWorkflowAttempt"("assessmentSnapshotId", "attemptNumber");
CREATE INDEX "PatternworkV31ReportWorkflowAttempt_status_heartbeatAt_idx"
  ON "PatternworkV31ReportWorkflowAttempt"("status", "heartbeatAt");

ALTER TABLE "PatternworkV31ReportWorkflowAttempt"
  ADD CONSTRAINT "PatternworkV31ReportWorkflowAttempt_assessmentSnapshotId_fkey"
  FOREIGN KEY ("assessmentSnapshotId") REFERENCES "PatternworkV31AssessmentSnapshot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill one ownership attempt for every immutable historical snapshot.
WITH snapshot_status AS (
  SELECT
    s."id" AS snapshot_id,
    s."snapshotId" AS snapshot_public_id,
    s."completedPass",
    s."frozenAt" AS frozen_at,
    CASE WHEN s."completedPass" = 1 THEN 1 ELSE 4 END AS expected_count,
    COUNT(r."id") AS run_count,
    COUNT(r."id") FILTER (WHERE r."status" = 'FAILED') AS failed_count,
    COUNT(r."id") FILTER (WHERE r."status" IN ('QUEUED', 'RUNNING')) AS active_count,
    COUNT(r."id") FILTER (
      WHERE r."status" = 'SUCCEEDED'
        AND a."artifactStatus" = 'ACTIVE'
        AND a."pdfStatus" = 'READY'
        AND (
          (s."completedPass" = 1 AND r."reportType" = 'MAP') OR
          (s."completedPass" = 2 AND r."reportType" IN ('IFS', 'PV', 'ATT', 'SYNTHESIS'))
        )
    ) AS ready_count,
    MIN(r."failureCode") FILTER (WHERE r."failureCode" IS NOT NULL) AS failure_code,
    MIN(r."failureMessage") FILTER (WHERE r."failureMessage" IS NOT NULL) AS failure_message
  FROM "PatternworkV31AssessmentSnapshot" s
  LEFT JOIN "PatternworkV31ReportRun" r ON r."assessmentSnapshotId" = s."id"
  LEFT JOIN "PatternworkV31ReportArtifact" a ON a."reportRunId" = r."id"
  GROUP BY s."id", s."snapshotId", s."completedPass", s."frozenAt"
)
INSERT INTO "PatternworkV31ReportWorkflowAttempt" (
  "id", "assessmentSnapshotId", "attemptNumber", "invocationKey", "status", "phase",
  "requestedBy", "failureCategory", "retryAudience", "failureCode", "failureMessage",
  "heartbeatAt", "startedAt", "reportsReleasedAt", "finishedAt", "updatedAt"
)
SELECT
  'pwfa_backfill_' || md5(snapshot_id),
  snapshot_id,
  1,
  'pw31-backfill-' || md5(snapshot_public_id),
  CASE
    WHEN ready_count = expected_count THEN 'SUCCEEDED'::"PatternworkV31ReportAttemptStatus"
    WHEN run_count = 0 OR failed_count > 0 THEN 'FAILED'::"PatternworkV31ReportAttemptStatus"
    ELSE 'STALLED'::"PatternworkV31ReportAttemptStatus"
  END,
  CASE
    WHEN ready_count = expected_count THEN 'RELEASE'::"PatternworkV31ReportAttemptPhase"
    WHEN run_count = 0 THEN 'ENQUEUE'::"PatternworkV31ReportAttemptPhase"
    ELSE 'GENERATION'::"PatternworkV31ReportAttemptPhase"
  END,
  'BACKFILL'::"PatternworkV31ReportAttemptRequester",
  CASE
    WHEN ready_count = expected_count THEN NULL
    WHEN run_count = 0 THEN 'CONFIGURATION'::"PatternworkV31ReportFailureCategory"
    WHEN failed_count = 0 AND run_count > 0 THEN 'STALLED'::"PatternworkV31ReportFailureCategory"
    WHEN COALESCE(failure_code, '') ~ '(cost|budget)' THEN 'COST'::"PatternworkV31ReportFailureCategory"
    WHEN COALESCE(failure_code, '') ~ '(pdf)' THEN 'PDF'::"PatternworkV31ReportFailureCategory"
    WHEN COALESCE(failure_code, '') ~ '(invalid|validation|contract|synthesis)' THEN 'VALIDATION'::"PatternworkV31ReportFailureCategory"
    WHEN COALESCE(failure_code, '') ~ '(network|timeout|rate|server)' THEN 'TRANSIENT'::"PatternworkV31ReportFailureCategory"
    ELSE 'INTERNAL'::"PatternworkV31ReportFailureCategory"
  END,
  CASE
    WHEN ready_count = expected_count THEN 'NONE'::"PatternworkV31RetryAudience"
    WHEN failed_count = 0 AND run_count > 0 THEN 'USER'::"PatternworkV31RetryAudience"
    WHEN COALESCE(failure_code, '') ~ '(network|timeout|rate|server)' THEN 'USER'::"PatternworkV31RetryAudience"
    ELSE 'OPERATOR'::"PatternworkV31RetryAudience"
  END,
  CASE
    WHEN ready_count = expected_count THEN NULL
    WHEN run_count = 0 THEN 'legacy_untracked_failure'
    WHEN failed_count = 0 AND run_count > 0 THEN 'workflow_stalled'
    ELSE COALESCE(failure_code, 'legacy_report_failure')
  END,
  CASE
    WHEN ready_count = expected_count THEN NULL
    WHEN run_count = 0 THEN 'Historical snapshot had no durable report workflow state.'
    WHEN failed_count = 0 AND run_count > 0 THEN 'Historical workflow exceeded the supported ownership window.'
    ELSE 'Historical report workflow recorded a failure.'
  END,
  frozen_at,
  frozen_at,
  CASE WHEN ready_count = expected_count THEN frozen_at ELSE NULL END,
  frozen_at,
  CURRENT_TIMESTAMP
FROM snapshot_status;

UPDATE "PatternworkV31AssessmentSnapshot" SET "currentReportAttemptNumber" = 1;

ALTER TABLE "PatternworkV31ReportRun" ADD COLUMN "reportWorkflowAttemptId" TEXT;
UPDATE "PatternworkV31ReportRun" r
SET "reportWorkflowAttemptId" = a."id"
FROM "PatternworkV31ReportWorkflowAttempt" a
WHERE a."assessmentSnapshotId" = r."assessmentSnapshotId" AND a."attemptNumber" = 1;
ALTER TABLE "PatternworkV31ReportRun" ALTER COLUMN "reportWorkflowAttemptId" SET NOT NULL;
ALTER TABLE "PatternworkV31ReportRun"
  ADD CONSTRAINT "PatternworkV31ReportRun_reportWorkflowAttemptId_fkey"
  FOREIGN KEY ("reportWorkflowAttemptId") REFERENCES "PatternworkV31ReportWorkflowAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PatternworkV31ReportRun_reportWorkflowAttemptId_status_idx"
  ON "PatternworkV31ReportRun"("reportWorkflowAttemptId", "status");

CREATE TABLE "PatternworkV31Notification" (
  "id" TEXT NOT NULL,
  "assessmentSessionId" TEXT NOT NULL,
  "assessmentSnapshotId" TEXT,
  "reportWorkflowAttemptId" TEXT,
  "type" "PatternworkV31NotificationType" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "PatternworkV31DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "recipientEmailHash" TEXT NOT NULL,
  "recipientEmailCiphertext" BYTEA NOT NULL,
  "emailNonce" BYTEA NOT NULL,
  "actionUrlCiphertext" BYTEA NOT NULL,
  "actionUrlNonce" BYTEA NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "resendMessageId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatternworkV31Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PatternworkV31Notification_idempotencyKey_key" ON "PatternworkV31Notification"("idempotencyKey");
CREATE UNIQUE INDEX "PatternworkV31Notification_providerMessageId_key" ON "PatternworkV31Notification"("providerMessageId");
CREATE UNIQUE INDEX "PatternworkV31Notification_resendMessageId_key" ON "PatternworkV31Notification"("resendMessageId");
CREATE INDEX "PatternworkV31Notification_assessmentSessionId_type_status_idx" ON "PatternworkV31Notification"("assessmentSessionId", "type", "status");
CREATE INDEX "PatternworkV31Notification_assessmentSnapshotId_type_idx" ON "PatternworkV31Notification"("assessmentSnapshotId", "type");
CREATE INDEX "PatternworkV31Notification_recipientEmailHash_idx" ON "PatternworkV31Notification"("recipientEmailHash");
ALTER TABLE "PatternworkV31Notification" ADD CONSTRAINT "PatternworkV31Notification_assessmentSessionId_fkey" FOREIGN KEY ("assessmentSessionId") REFERENCES "PatternworkV31AssessmentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatternworkV31Notification" ADD CONSTRAINT "PatternworkV31Notification_assessmentSnapshotId_fkey" FOREIGN KEY ("assessmentSnapshotId") REFERENCES "PatternworkV31AssessmentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatternworkV31Notification" ADD CONSTRAINT "PatternworkV31Notification_reportWorkflowAttemptId_fkey" FOREIGN KEY ("reportWorkflowAttemptId") REFERENCES "PatternworkV31ReportWorkflowAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PatternworkV31NotificationWebhookEvent" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "eventType" TEXT NOT NULL,
  "payloadSha256" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatternworkV31NotificationWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PatternworkV31NotificationWebhookEvent_providerEventId_key" ON "PatternworkV31NotificationWebhookEvent"("providerEventId");
CREATE INDEX "PatternworkV31NotificationWebhookEvent_providerMessageId_idx" ON "PatternworkV31NotificationWebhookEvent"("providerMessageId");
