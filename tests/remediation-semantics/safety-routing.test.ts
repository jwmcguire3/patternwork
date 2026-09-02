import assert from "node:assert/strict";
import test from "node:test";
import { responseSafetySignals, normalizeTypedAssessmentResponse, reportArtifactUrl } from "../../lib/server/assessment/service.ts";
import { createInitialRoutingState, routeAssessmentResponse } from "../../lib/server/assessment/routing.ts";
import { isAuthoredContractEligible } from "../../lib/server/assessment/routing.ts";
import { loadStructuredInstrumentManifest } from "../../lib/question-engine/renderable-manifest.ts";

const typed = (semantic: Record<string, unknown>, privateNote?: string) => ({ schemaVersion:"PWRS-1", semantic, ...(privateNote ? { privateNote } : {}) });

test("safety booleans and enums are exact and cannot be coerced from narrative", () => {
  for (const candidate of [
    typed({}, "unsafe threatening controlling coercive high stop"),
    typed({ safetyContext:"true", userArousal:"HIGH", resourceSafetyClear:"true" }),
    { unsafeContext:true, userArousal:"high", note:"unsafe" },
  ]) assert.deepEqual(responseSafetySignals(candidate), { userArousal:"unknown", unsafeContext:false, resourceSafetyClear:false });
  assert.deepEqual(responseSafetySignals(typed({ safetyContext:"unsafe", userArousal:"high", resourceSafetyClear:true })), { userArousal:"high", unsafeContext:true, resourceSafetyClear:true });
});

test("normalization retains typed semantics and private note separately while dropping unknown narrative", () => {
  const value = normalizeTypedAssessmentResponse(typed({ choices:["OPT-MS-101-choice-aabbccdd", "plain prose"], injected:"address 44 King Street", certainty:0.75 }, "encrypted only"), "MS-101");
  assert.deepEqual(value, { schemaVersion:"PWRS-1", bankItemId:"MS-101", semantic:{ choices:["OPT-MS-101-choice-aabbccdd"], certainty:0.75 }, privateNote:"encrypted only" });
});

test("report links are rooted at the assessment session and may deep-link an independently ready artifact", () => {
  assert.equal(reportArtifactUrl("session id", "map/id"), "/reports/session%20id#map%2Fid");
});

test("unsafe state survives canonical replay until a completed resource step explicitly clears it", () => {
  const initial = createInitialRoutingState(1);
  const unsafeInput = { interactionInstanceId:initial.currentInteraction!.interactionInstanceId, bankItemId:initial.currentInteraction!.bankItemId, completionState:"COMPLETED" as const, response:typed({ choices:["OPT-RL-unsafe-aabbccdd"], safetyContext:"unsafe" }), unsafeContext:true, userArousal:"high" as const } as never;
  const unsafeA = routeAssessmentResponse(initial, unsafeInput);
  const unsafeB = routeAssessmentResponse(createInitialRoutingState(1), unsafeInput);
  assert.deepEqual(unsafeA, unsafeB);
  assert.equal(unsafeA.currentInteraction?.bankItemId, "RSR-003");

  const uncleared = routeAssessmentResponse(unsafeA, { interactionInstanceId:unsafeA.currentInteraction!.interactionInstanceId, bankItemId:"RSR-003", completionState:"COMPLETED", response:typed({ choices:["OPT-RSR-ground-aabbccdd"], safetyContext:"safe" }), unsafeContext:false, userArousal:"low", resourceSafetyClear:false } as never);
  assert.equal(uncleared.currentInteraction?.bankItemId, "RSR-003");
  assert.equal((uncleared as unknown as { safetyContext:string }).safetyContext, "unsafe");

  const cleared = routeAssessmentResponse(uncleared, { interactionInstanceId:uncleared.currentInteraction!.interactionInstanceId, bankItemId:"RSR-003", completionState:"COMPLETED", response:typed({ choices:["OPT-RSR-ground-aabbccdd"], safetyContext:"safe", resourceSafetyClear:true }), unsafeContext:false, userArousal:"low", resourceSafetyClear:true } as never);
  assert.equal((cleared as unknown as { safetyContext:string }).safetyContext, "safe");
  assert.notEqual(cleared.currentInteraction?.routeReason, "unsafe-context-resource-only");
});

test("answerless COMPLETED responses remain non-evidence and cannot advance coverage or completion", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const contracts = Object.fromEntries(manifest.items.map((item) => [item.bankItemId, item.deterministicRouting.executable]));
  const initial = createInitialRoutingState(1);
  const next = routeAssessmentResponse(initial, {
    interactionInstanceId: initial.currentInteraction!.interactionInstanceId,
    bankItemId: initial.currentInteraction!.bankItemId,
    completionState: "COMPLETED",
    response: typed({ eligible:true, coverageSectionCodes:["IFS-01"], timeHorizon:"immediate" }),
    authoredRoutingContracts: contracts,
  } as never);
  assert.equal((next.completedInteractions[0] as unknown as { evidenceEligible:boolean }).evidenceEligible, false);
  assert.equal(next.coverage.directSamples, 0);
  assert.equal(next.mappingCompleted, false);
});

test("reviewed active eligibility contracts execute without caller injection", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const ms101 = manifest.itemById.get("MS-101")!.deterministicRouting.executable!;
  const rl102 = manifest.itemById.get("RL-102")!.deterministicRouting.executable!;
  assert.equal(ms101.eligibilityCompilation, "compiled");
  assert.equal(rl102.eligibilityCompilation, "compiled");
  assert.deepEqual(rl102.uncompiledFragments, []);
  const state = { ...createInitialRoutingState(1), stage:"S1" as const };
  const completed = [{ bankItemId:"RL-102", completionState:"COMPLETED", evidenceEligible:true, referentPresent:true }] as never;
  assert.equal(isAuthoredContractEligible(ms101, state, completed), true);
  assert.equal(isAuthoredContractEligible(rl102, { ...state, stage:"S0" as const }, completed), true);

  const initial = createInitialRoutingState(1);
  const closest = manifest.itemById.get("RL-101")!.optionGroups.flatMap((group) => group.options).find((option) => /`closest`/u.test(option.authored))!.optionId;
  const next = routeAssessmentResponse(initial, { interactionInstanceId:initial.currentInteraction!.interactionInstanceId, bankItemId:"RL-101", completionState:"COMPLETED", response:typed({ choices:[closest], referentOptionId:closest }) } as never);
  assert.notEqual(next.currentInteraction?.routeReason, "authored-option-branch");
});

test("authored body-map recovery dominates ordinary routing and replays deterministically", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const contracts = Object.fromEntries(manifest.items.map((item) => [item.bankItemId, item.deterministicRouting.executable]));
  const initial = createInitialRoutingState(2);
  const current = { ...initial.currentInteraction!, interactionInstanceId:"btm-replay", bankItemId:"BTM-201", family:"BTM", intensity:2 } as never;
  const state = { ...initial, currentInteraction:current } as never;
  const input = { interactionInstanceId:"btm-replay", bankItemId:"BTM-201", completionState:"COMPLETED", response:typed({ zones:["OPT-body-chest-aabbccdd"] }), authoredRoutingContracts:contracts } as never;
  const first = routeAssessmentResponse(state, input);
  const replay = routeAssessmentResponse(state, input);
  assert.deepEqual(first, replay);
  assert.equal(first.currentInteraction?.bankItemId, "RSR-003");
  assert.equal(first.currentInteraction?.routeReason, "mandatory-post-body-map-recovery");
});
