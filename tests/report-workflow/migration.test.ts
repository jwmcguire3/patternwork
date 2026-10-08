import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../prisma/migrations/20260902180000_report_delivery_remediation/migration.sql", import.meta.url);
const completionBoundaryMigrationUrl = new URL("../../prisma/migrations/20260903120000_snapshot_completion_boundary/migration.sql", import.meta.url);
const completionBoundaryNotNullMigrationUrl = new URL("../../prisma/migrations/20260903130000_snapshot_completion_boundary_not_null/migration.sql", import.meta.url);

test("lifecycle migration backfills every historical snapshot with terminal truth", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /LEFT JOIN "PatternworkV31ReportRun"/u, "snapshots without runs must remain in the backfill input");
  assert.match(sql, /WHEN ready_count = expected_count THEN 'SUCCEEDED'/u);
  assert.match(sql, /WHEN run_count = 0 OR failed_count > 0 THEN 'FAILED'/u);
  assert.match(sql, /ELSE 'STALLED'::"PatternworkV31ReportAttemptStatus"/u);
  assert.match(sql, /WHEN run_count = 0 THEN 'CONFIGURATION'/u);
  assert.match(sql, /WHEN failed_count = 0 AND run_count > 0 THEN 'USER'/u);
  assert.match(sql, /legacy_untracked_failure/u);
  assert.doesNotMatch(sql, /ELSE LEFT\(COALESCE\(failure_message/u, "legacy internal error text must not be copied into the public lifecycle");
});

test("lifecycle migration binds legacy runs before enforcing ownership", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const attach = sql.indexOf('UPDATE "PatternworkV31ReportRun" r');
  const required = sql.indexOf('ALTER TABLE "PatternworkV31ReportRun" ALTER COLUMN "reportWorkflowAttemptId" SET NOT NULL');
  assert.ok(attach >= 0 && required > attach);
  assert.match(sql, /UPDATE "PatternworkV31AssessmentSnapshot" SET "currentReportAttemptNumber" = 1/u);
});

test("snapshot migration enforces both normal completion boundaries", async () => {
  const sql = await readFile(completionBoundaryMigrationUrl, "utf8");
  assert.match(sql, /PatternworkV31AssessmentSnapshot_normal_completion_boundary_check/u);
  assert.match(sql, /"completedPass" = 1[\s\S]*"completionMode" = 'pass1_complete'[\s\S]*"lastCompletedStage" = 'S2'[\s\S]*"safeResumeStage" = 'S3'/u);
  assert.match(sql, /"completedPass" = 2[\s\S]*"completionMode" = 'pass2_complete'[\s\S]*"lastCompletedStage" = 'S5'[\s\S]*"safeResumeStage" = 'complete'/u);
});

test("follow-up snapshot migration closes PostgreSQL's nullable CHECK bypass", async () => {
  const sql = await readFile(completionBoundaryNotNullMigrationUrl, "utf8");
  assert.match(sql, /DROP CONSTRAINT "PatternworkV31AssessmentSnapshot_normal_completion_boundary_check"/u);
  assert.match(sql, /"safeResumeStage" IS NOT NULL/u);
  assert.match(sql, /ADD CONSTRAINT "PatternworkV31AssessmentSnapshot_normal_completion_boundary_check"/u);
});
