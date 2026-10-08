import assert from "node:assert/strict";
import test from "node:test";
import { isCompleteReleasedReportSet } from "../../app/reports/_server/access.ts";

const run = (reportType: string, overrides: Partial<{
  status: string; attemptNumber: number; attemptStatus: string; artifactStatus: string; pdfStatus: string; pdfSha256: string | null;
}> = {}) => ({
  id: `run-${reportType}`,
  reportType,
  status: overrides.status ?? "SUCCEEDED",
  reportWorkflowAttemptId: "attempt-1",
  reportWorkflowAttempt: { attemptNumber: overrides.attemptNumber ?? 1, status: overrides.attemptStatus ?? "SUCCEEDED" },
  artifact: {
    artifactStatus: overrides.artifactStatus ?? "ACTIVE",
    pdfStatus: overrides.pdfStatus ?? "READY",
    pdfSha256: overrides.pdfSha256 === undefined ? `digest-${reportType}` : overrides.pdfSha256,
  },
});

test("a complete current attempt is the only releasable Pass 1 set", () => {
  assert.equal(isCompleteReleasedReportSet({ completedPass: 1, currentReportAttemptNumber: 1, reportRuns: [run("MAP")] }), true);
  assert.equal(isCompleteReleasedReportSet({ completedPass: 1, currentReportAttemptNumber: 2, reportRuns: [run("MAP")] }), false, "a stale successful artifact cannot survive a retry");
  assert.equal(isCompleteReleasedReportSet({ completedPass: 1, currentReportAttemptNumber: 1, reportRuns: [run("MAP", { attemptStatus: "RUNNING" })] }), false);
});

test("a Pass 2 bundle is private until every expected active PDF succeeds", () => {
  const complete = ["IFS", "PV", "ATT", "SYNTHESIS"].map((type) => run(type));
  assert.equal(isCompleteReleasedReportSet({ completedPass: 2, currentReportAttemptNumber: 1, reportRuns: complete }), true);
  assert.equal(isCompleteReleasedReportSet({ completedPass: 2, currentReportAttemptNumber: 1, reportRuns: complete.slice(0, 3) }), false);
  assert.equal(isCompleteReleasedReportSet({ completedPass: 2, currentReportAttemptNumber: 1, reportRuns: complete.map((value) => value.reportType === "ATT" ? run("ATT", { pdfStatus: "PENDING" }) : value) }), false);
  assert.equal(isCompleteReleasedReportSet({ completedPass: 2, currentReportAttemptNumber: 1, reportRuns: [...complete, run("EXTRA")] }), false);
});
