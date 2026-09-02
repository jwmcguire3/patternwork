import assert from "node:assert/strict";
import test from "node:test";
import { createInitialRoutingState, pauseRoutingState, routeAssessmentResponse } from "../../lib/server/assessment/routing.ts";
import type { AssessmentRoutingState, InteractionViewModel } from "../../lib/server/assessment/types.ts";

function current(bankItemId: InteractionViewModel["bankItemId"], family: InteractionViewModel["family"], intensity: 0 | 1 | 2 | 3, sequence = 10): InteractionViewModel {
  return { interactionInstanceId: `test-${sequence}-${bankItemId}`, bankItemId, bankItemVersion: "3.1.0", family, title: "test", stage: "S3", pass: 2, administrationSequence: sequence, form: family === "BTM" ? "map" : "recall", intensity, canSkip: true, canPause: true, routeReason: "test" };
}

test("every completed body map routes immediately to RSR-003 and preserves the gate across pause", () => {
  const base = createInitialRoutingState(2);
  const mapped = { ...base, currentInteraction: current("BTM-201", "BTM", 2) } as AssessmentRoutingState;
  const next = routeAssessmentResponse(mapped, { interactionInstanceId: "test-10-BTM-201", bankItemId: "BTM-201", completionState: "COMPLETED", response: { regions: ["chest"] } });
  assert.equal(next.pendingBtmTransition, true);
  assert.equal(next.currentInteraction?.bankItemId, "RSR-003");
  const paused = pauseRoutingState(next);
  assert.equal(paused.pendingBtmTransition, true);
  assert.equal(paused.currentInteraction?.bankItemId, "RSR-003");
});

test("two consecutive high-intensity interactions force a recovery item", () => {
  const base = createInitialRoutingState(2);
  const state = { ...base, consecutiveHighIntensity: 1, currentInteraction: current("BDA-201", "BDA", 2) } as AssessmentRoutingState;
  const next = routeAssessmentResponse(state, { interactionInstanceId: "test-10-BDA-201", bankItemId: "BDA-201", completionState: "COMPLETED", response: {} });
  assert.equal(next.currentInteraction?.bankItemId, "RSR-003");
  assert.equal(next.currentInteraction?.routeReason, "two-high-item-limit");
});

test("skip remains unknown and repeated family skips suppress that family without becoming a negative answer", () => {
  const base = createInitialRoutingState(1);
  const once = routeAssessmentResponse(base, { interactionInstanceId: base.currentInteraction!.interactionInstanceId, bankItemId: base.currentInteraction!.bankItemId, completionState: "SKIPPED", response: null });
  assert.equal(once.completedInteractions[0].completionState, "SKIPPED");
  assert.equal(once.skipCounts.RL, 1);
  assert.notEqual(once.currentInteraction?.bankItemId, base.currentInteraction?.bankItemId);
});
