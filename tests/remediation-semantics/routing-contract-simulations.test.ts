import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_EXECUTABLE_ROUTING_CONTRACTS,
  assertAuthoredRoutingSurfaceBindings,
  validateExecutableRoutingContractInventory,
} from "../../lib/question-engine/routing-contracts.ts";
import { loadStructuredInstrumentManifest, type StructuredInstrumentManifest } from "../../lib/question-engine/renderable-manifest.ts";
import { deriveTrustedEvidenceForAuthoredResponse, trustedEvidenceJson } from "../../lib/server/assessment/trusted-evidence.ts";
import {
  canCompletePass,
  createInitialRoutingState,
  routeAssessmentResponse,
  startPassTwo,
} from "../../lib/server/assessment/routing.ts";
import type { AssessmentRoutingState, InteractionViewModel } from "../../lib/server/assessment/types.ts";

function authoredOptionIds(manifest: StructuredInstrumentManifest, bankItemId: string): string[] {
  const definition = manifest.itemById.get(bankItemId)!;
  const ids = definition.optionGroups.flatMap((group) => group.options.map((option) => option.optionId));
  const prefixes = [...definition.responseLibraryReferences, ...definition.responseLibraryIds].map((reference) => reference.replace(/\*$/u, ""));
  for (const library of manifest.responseLibraries) if (prefixes.some((prefix) => library.libraryId === prefix || library.libraryId.startsWith(prefix))) ids.push(...library.options.map((option) => option.optionId));
  return [...new Set(ids)];
}

async function authoredProjection(manifest: StructuredInstrumentManifest, current: InteractionViewModel, referentOptionId?: string) {
  for (const optionId of authoredOptionIds(manifest, current.bankItemId)) {
    const semantic = { choices:[optionId], safetyContext:"safe", ...(referentOptionId ? { referentOptionId } : current.family === "RL" ? { referentOptionId:optionId } : {}) };
    const normalized = { schemaVersion:"PWRS-1", semantic } as const;
    const trustedEvidence = await deriveTrustedEvidenceForAuthoredResponse(current.bankItemId, current.bankItemVersion, normalized);
    if (trustedEvidence?.evidenceDisposition === "observed") return { ...normalized, trustedEvidence:trustedEvidenceJson(trustedEvidence) };
  }
  throw new Error(`No observed authored option is available for ${current.bankItemId}.`);
}

async function answer(manifest: StructuredInstrumentManifest, state: AssessmentRoutingState, referentOptionId?: string): Promise<AssessmentRoutingState> {
  const current = state.currentInteraction;
  assert.ok(current, "simulation must have a current interaction");
  return routeAssessmentResponse(state, {
    interactionInstanceId: current.interactionInstanceId,
    bankItemId: current.bankItemId,
    completionState: "COMPLETED",
    userArousal: "low",
    unsafeContext: false,
    response: await authoredProjection(manifest, current, referentOptionId),
  });
}

async function runPass(manifest: StructuredInstrumentManifest, initial: AssessmentRoutingState, referentOptionId?: string): Promise<{ state: AssessmentRoutingState; visited: string[] }> {
  let state = initial;
  const visited: string[] = [];
  for (let sequence = 1; state.currentInteraction && sequence <= 100; sequence += 1) {
    visited.push(state.currentInteraction.bankItemId);
    state = await answer(manifest, state, referentOptionId);
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

test("production canonical contracts complete both passes using authored options and trusted projections", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const referentOptionId = manifest.itemById.get("RL-101")!.optionGroups.flatMap((group) => group.options).find((option) => !/none|not sure/iu.test(option.label))!.optionId;
  const passOne = await runPass(manifest, createInitialRoutingState(1), referentOptionId);
  assert.equal(passOne.state.coverage.mappingGate, "green");
  assert.equal(canCompletePass(passOne.state), true);
  assert.ok(passOne.visited.some((id) => id.startsWith("BTM-") || id.startsWith("FSR-")));
  assert.equal(passOne.state.completedInteractions.at(-1)?.resourceOrOrdinary, true);

  const passTwo = await runPass(manifest, startPassTwo(passOne.state), referentOptionId);
  assert.equal(passTwo.state.coverage.deepeningGate, "green");
  assert.ok(passTwo.visited.includes("FCF-201"));
  assert.equal(passTwo.state.fitCompleted, true);
  assert.equal(passTwo.state.pendingBtmTransition, false);
  assert.equal(passTwo.state.requiresLowIntensityAfterRre, false);
  assert.equal(passTwo.state.completedInteractions.at(-1)?.resourceOrOrdinary, true);
  assert.equal(canCompletePass(passTwo.state), true);
});

test("safety gates retain canonical priority ordering", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const base = createInitialRoutingState(2);
  const body = forcedCurrent(base, "BTM-201", "BTM", 2);
  const afterBody = routeAssessmentResponse(body, {
    interactionInstanceId: "forced-BTM-201",
    bankItemId: "BTM-201",
    completionState: "COMPLETED",
    userArousal: "high",
    unsafeContext: true,
    response: await authoredProjection(manifest, body.currentInteraction!),
  });
  assert.equal(afterBody.currentInteraction?.routeReason, "mandatory-post-body-map-recovery");

  const rupture = forcedCurrent({ ...base, consecutiveHighIntensity:1 }, "RRE-201", "RRE", 2);
  const afterRupture = routeAssessmentResponse(rupture, {
    interactionInstanceId: "forced-RRE-201",
    bankItemId: "RRE-201",
    completionState: "COMPLETED",
    userArousal: "high",
    response: await authoredProjection(manifest, rupture.currentInteraction!),
  });
  assert.equal(afterRupture.currentInteraction?.routeReason, "high-arousal-resource-only");

  const repeatedHigh = forcedCurrent({ ...base, consecutiveHighIntensity:1 }, "BDA-201", "BDA", 2);
  const afterRepeatedHigh = await answer(manifest, repeatedHigh);
  assert.equal(afterRepeatedHigh.currentInteraction?.routeReason, "two-high-item-limit");
});
