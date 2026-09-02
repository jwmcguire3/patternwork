import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_EXECUTABLE_ROUTING_CONTRACTS,
  assertAuthoredRoutingSurfaceBindings,
  validateExecutableRoutingContractInventory,
} from "../../lib/question-engine/routing-contracts.ts";
import { loadStructuredInstrumentManifest } from "../../lib/question-engine/renderable-manifest.ts";
import {
  canCompletePass,
  createInitialRoutingState,
  routeAssessmentResponse,
  startPassTwo,
} from "../../lib/server/assessment/routing.ts";
import type { AssessmentRoutingState, InteractionViewModel } from "../../lib/server/assessment/types.ts";

function answer(state: AssessmentRoutingState, sequence: number, extra: Record<string, unknown> = {}): AssessmentRoutingState {
  const current = state.currentInteraction;
  assert.ok(current, "simulation must have a current interaction");
  return routeAssessmentResponse(state, {
    interactionInstanceId: current.interactionInstanceId,
    bankItemId: current.bankItemId,
    completionState: "COMPLETED",
    userArousal: "low",
    response: {
      schemaVersion: "PWRS-1",
      semantic: {
        choices: [`OPT-SIM-${String(sequence).padStart(4, "0")}`],
        referentOptionId: `OPT-REF-${sequence % 3}`,
        safetyContext: "safe",
        eligible: true,
        coverageSectionCodes: ["IFS-01"],
        timeHorizon: sequence % 3 === 0 ? "anticipatory" : sequence % 3 === 1 ? "immediate" : "aftermath",
        ...extra,
      },
    },
  });
}

function runPass(initial: AssessmentRoutingState): { state: AssessmentRoutingState; visited: string[] } {
  let state = initial;
  const visited: string[] = [];
  for (let sequence = 1; state.currentInteraction && sequence <= 100; sequence += 1) {
    visited.push(state.currentInteraction.bankItemId);
    state = answer(state, sequence);
  }
  assert.ok(visited.length < 100, "canonical routing must terminate without cycling");
  assert.equal(state.currentInteraction, null);
  return { state, visited };
}

function forcedCurrent(base: AssessmentRoutingState, bankItemId: InteractionViewModel["bankItemId"], family: InteractionViewModel["family"], intensity: 0 | 1 | 2 | 3): AssessmentRoutingState {
  return {
    ...base,
    currentInteraction: {
      interactionInstanceId: `forced-${bankItemId}`,
      bankItemId,
      bankItemVersion: "3.0.0",
      family,
      title: "forced safety-order interaction",
      stage: "S3",
      pass: 2,
      administrationSequence: 50,
      form: family === "BTM" ? "map" : "recall",
      intensity,
      canSkip: true,
      canPause: true,
      routeReason: "test-setup",
    },
  };
}

test("active executable contracts are total and exact authored drift fails closed", async () => {
  assert.deepEqual(validateExecutableRoutingContractInventory(), []);
  assert.equal(ACTIVE_EXECUTABLE_ROUTING_CONTRACTS.filter((contract) => contract.bank === "mapping").length, 34);
  assert.equal(ACTIVE_EXECUTABLE_ROUTING_CONTRACTS.filter((contract) => contract.bank === "deepening").length, 27);
  const manifest = await loadStructuredInstrumentManifest();
  const activeItems = manifest.items.filter((item) => item.deterministicRouting.executable);
  assert.doesNotThrow(() => assertAuthoredRoutingSurfaceBindings(activeItems));
  const drifted = activeItems.map((item, index) => index === 0 ? { ...item, authoredContentSha256:"0".repeat(64) } : item);
  assert.throws(() => assertAuthoredRoutingSurfaceBindings(drifted), /authored eligibility\/branch\/recovery surface drift/u);
});

test("production canonical contracts complete both passes without injected contracts", () => {
  const passOne = runPass(createInitialRoutingState(1));
  assert.equal(passOne.state.coverage.mappingGate, "green");
  assert.equal(canCompletePass(passOne.state), true);
  assert.ok(passOne.visited.some((id) => id.startsWith("BTM-") || id.startsWith("FSR-")));
  assert.equal(passOne.state.completedInteractions.at(-1)?.resourceOrOrdinary, true);

  const passTwo = runPass(startPassTwo(passOne.state));
  assert.equal(passTwo.state.coverage.deepeningGate, "green");
  assert.ok(passTwo.visited.includes("FCF-201"));
  assert.equal(passTwo.state.fitCompleted, true);
  assert.equal(passTwo.state.pendingBtmTransition, false);
  assert.equal(passTwo.state.requiresLowIntensityAfterRre, false);
  assert.equal(passTwo.state.completedInteractions.at(-1)?.resourceOrOrdinary, true);
  assert.equal(canCompletePass(passTwo.state), true);
});

test("safety gates retain canonical priority ordering", () => {
  const base = createInitialRoutingState(2);
  const body = forcedCurrent(base, "BTM-201", "BTM", 2);
  const afterBody = routeAssessmentResponse(body, {
    interactionInstanceId: "forced-BTM-201",
    bankItemId: "BTM-201",
    completionState: "COMPLETED",
    userArousal: "high",
    unsafeContext: true,
    response: { schemaVersion:"PWRS-1", semantic:{ zones:["OPT-SIM-BODY"], eligible:true } },
  });
  assert.equal(afterBody.currentInteraction?.routeReason, "mandatory-post-body-map-recovery");

  const rupture = forcedCurrent({ ...base, consecutiveHighIntensity:1 }, "RRE-201", "RRE", 2);
  const afterRupture = routeAssessmentResponse(rupture, {
    interactionInstanceId: "forced-RRE-201",
    bankItemId: "RRE-201",
    completionState: "COMPLETED",
    userArousal: "high",
    response: { schemaVersion:"PWRS-1", semantic:{ choices:["OPT-SIM-RUPTURE"], eligible:true } },
  });
  assert.equal(afterRupture.currentInteraction?.routeReason, "high-arousal-resource-only");

  const repeatedHigh = forcedCurrent({ ...base, consecutiveHighIntensity:1 }, "BDA-201", "BDA", 2);
  const afterRepeatedHigh = answer(repeatedHigh, 999);
  assert.equal(afterRepeatedHigh.currentInteraction?.routeReason, "two-high-item-limit");
});
