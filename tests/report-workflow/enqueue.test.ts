import assert from "node:assert/strict";
import test from "node:test";
import { buildReportWorkflowInvocation } from "../../lib/server/reports/enqueue.ts";

test("enqueue invocation contract is stable per immutable snapshot and pass", () => {
  const first = buildReportWorkflowInvocation({ assessmentSessionId: "session", snapshotId: "snapshot", completedPass: 1 });
  const replay = buildReportWorkflowInvocation({ assessmentSessionId: "session", snapshotId: "snapshot", completedPass: 1 });
  const passTwo = buildReportWorkflowInvocation({ assessmentSessionId: "session", snapshotId: "snapshot", completedPass: 2 });
  assert.equal(first.invocationKey, replay.invocationKey);
  assert.notEqual(first.invocationKey, passTwo.invocationKey);
  assert.match(first.invocationKey, /^pw31-report-[a-f0-9]{64}$/u);
});
