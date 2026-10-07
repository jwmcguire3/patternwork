CREATE TABLE "PatternworkDebugReportRun" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "phase" TEXT NOT NULL DEFAULT 'QUEUED',
  "progressNote" TEXT NOT NULL DEFAULT 'Waiting for the report workflow.',
  "requestedModel" TEXT NOT NULL,
  "reasoningEffort" TEXT NOT NULL,
  "workflowRunId" TEXT,
  "resultJson" JSONB,
  "totalCostMicros" BIGINT NOT NULL DEFAULT 0,
  "failureCode" TEXT,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatternworkDebugReportRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatternworkDebugReportRun_workflowRunId_key"
  ON "PatternworkDebugReportRun"("workflowRunId");
CREATE INDEX "PatternworkDebugReportRun_status_updatedAt_idx"
  ON "PatternworkDebugReportRun"("status", "updatedAt");
CREATE INDEX "PatternworkDebugReportRun_profileId_createdAt_idx"
  ON "PatternworkDebugReportRun"("profileId", "createdAt");
