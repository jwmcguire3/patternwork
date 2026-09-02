import test from "node:test";
import assert from "node:assert/strict";
import { buildTypedAssessmentResponse, familyLabel, normaliseAssessmentState, responseOrderForDraft, semanticOptionId, stateForHttpStatus } from "../../app/assessment/ui-state";
test("normalises authoritative state-view fields", () => { const s = normaliseAssessmentState({ status:"IN_PROGRESS", assessmentId:"a1", currentInteraction:{interactionInstanceId:"ri",bankItemId:"BTM-201",stage:"S3",title:"Map it"} }); assert.equal(s.status,"active"); assert.equal(s.assessmentId,"a1"); assert.equal(s.interaction?.family,"BTM"); assert.equal(s.interaction?.instanceId,"ri"); });
test("uses ordinary family labels", () => assert.equal(familyLabel("FCF"),"Check the fit"));
test("preserves top-level report links around a nested state payload", () => {
  const state = normaliseAssessmentState({ assessmentId:"assessment-1", reportReadyUrl:"/reports/assessment-1", state:{ status:"COMPLETE" } });
  assert.equal(state.assessmentId,"assessment-1"); assert.equal(state.reportReadyUrl,"/reports/assessment-1");
});
test("treats unauthenticated state responses as consent state", () => {
  assert.equal(stateForHttpStatus(401)?.status,"needs_consent"); assert.equal(stateForHttpStatus(403)?.status,"needs_consent"); assert.equal(stateForHttpStatus(500),undefined);
});
test("uses authored option IDs while retaining their display labels", () => {
  const state = normaliseAssessmentState({ status:"IN_PROGRESS", currentInteraction:{ interactionInstanceId:"ri", bankItemId:"MS-101", authored:{ prompt:"A prompt", mechanic:"Choose", optionGroups:[{options:[{optionId:"OL-01",label:"Display text"}]}] } } });
  assert.equal(state.interaction?.prompt,"A prompt"); assert.deepEqual(state.interaction?.options,[{id:"OL-01",label:"Display text"}]);
});
test("preserves authoritative response-library IDs for body controls and persistence order", () => {
  const state = normaliseAssessmentState({ status:"IN_PROGRESS", currentInteraction:{ interactionInstanceId:"ri", bankItemId:"BTM-201", authored:{ prompt:"Map", responseLibraries:[{ libraryId:"OL-BQ-UP-HEAD-01", options:[{ optionId:"UP-H-01", label:"Pressure behind my eyes or forehead" }] }] } } });
  assert.deepEqual(state.interaction?.options, [{ id:"UP-H-01", label:"Pressure behind my eyes or forehead" }]);
  assert.deepEqual(responseOrderForDraft({ zones:["UP-H-01"] }), ["UP-H-01"]);
  assert.deepEqual(responseOrderForDraft({ note:"private", safetyContext:"safe", zones:["UP-H-01"] }), ["UP-H-01"]);
});
test("derives non-positional semantic IDs and keeps encrypted notes outside semantic values", () => {
  assert.equal(semanticOptionId("scope", "First"), semanticOptionId("scope", "First"));
  assert.notEqual(semanticOptionId("scope", "First"), semanticOptionId("scope", "Second"));
  const item = { instanceId:"ri", bankItemId:"MS-101", family:"MS", stage:"S1", prompt:"Prompt" } as const;
  const response = buildTypedAssessmentResponse(item, { choices:[semanticOptionId("scope", "First")], note:"My private narrative" });
  assert.deepEqual(response.semantic, { choices:[semanticOptionId("scope", "First")] });
  assert.equal(response.privateNote, "My private narrative");
});
test("preserves an independently available Mapping Summary link during Pass 2", () => {
  const state = normaliseAssessmentState({ state:{ status:"PASS2_IN_PROGRESS", pass:2, mappingSummaryUrl:"/reports/session-1#map-1" } });
  assert.equal(state.status, "active");
  assert.equal(state.mappingSummaryUrl, "/reports/session-1#map-1");
});
test("covers every authoritative interaction family", () => {
  for (const family of ["RL","MS","BDA","BTM","FSR","VFR","RLB","BSP","PIS","PDL","RMX","PCR","RRE","WMA","RSR","SEF","FCF"] as const) {
    assert.notEqual(familyLabel(family), "Reflection");
  }
});
