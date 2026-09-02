import assert from "node:assert/strict";
import test from "node:test";
import { abandonedRetentionExpiresAt, completedRetentionExpiresAt, planExpiredAssessmentDeletion } from "../../lib/server/assessment/retention.ts";

test("retention uses 30-day abandoned and one-year completed windows", () => {
  const start = new Date("2025-01-01T00:00:00Z");
  assert.equal(abandonedRetentionExpiresAt(start).toISOString(), "2025-01-31T00:00:00.000Z");
  assert.equal(completedRetentionExpiresAt(start).toISOString(), "2026-01-01T00:00:00.000Z");
});

test("deletion plan separates abandoned and completed purges and retains recent sessions", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  const plan = planExpiredAssessmentDeletion([
    { id: "old-paused", status: "PAUSED", updatedAt: new Date("2026-07-01T00:00:00Z"), completedAt: null },
    { id: "recent", status: "IN_PROGRESS", updatedAt: new Date("2026-08-20T00:00:00Z"), completedAt: null },
    { id: "old-complete", status: "COMPLETE", updatedAt: new Date("2025-01-01T00:00:00Z"), completedAt: new Date("2025-08-01T00:00:00Z") },
  ], now);
  assert.deepEqual(plan.abandonedSessionIds, ["old-paused"]);
  assert.deepEqual(plan.completedSessionIds, ["old-complete"]);
});
