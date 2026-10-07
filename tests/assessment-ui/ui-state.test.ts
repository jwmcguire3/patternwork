import test from "node:test";
import assert from "node:assert/strict";
import { buildTypedAssessmentResponse, familyLabel, normaliseAssessmentState, responseOrderForDraft, semanticOptionId, stateForHttpStatus } from "../../app/assessment/ui-state";
test("normalises authoritative state-view fields", () => { const s = normaliseAssessmentState({ status:"IN_PROGRESS", assessmentId:"a1", currentInteraction:{interactionInstanceId:"ri",bankItemId:"BTM-201",stage:"S3",title:"Map it"} }); assert.equal(s.status,"active"); assert.equal(s.assessmentId,"a1"); assert.equal(s.interaction?.family,"BTM"); assert.equal(s.interaction?.instanceId,"ri"); });
test("maps durable queue and failure states without hiding delivery truth", () => {
  const queued = normaliseAssessmentState({ state: { status: "COMPLETE", pass: 2, reportStatus: "QUEUED", deliveryStatus: "FAILED" } });
  assert.equal(queued.status, "generating_pass2");
  assert.equal(queued.deliveryStatus, "FAILED");
  const failed = normaliseAssessmentState({ state: { status: "COMPLETE", pass: 2, reportStatus: "FAILED", failureCategory: "STALLED", retryAudience: "USER", canRetry: true } });
  assert.equal(failed.status, "report_failed");
  assert.equal(failed.canRetry, true);
  const ready = normaliseAssessmentState({ state: { status: "COMPLETE", pass: 2, reportStatus: "READY", deliveryStatus: "FAILED" } });
  assert.equal(ready.status, "report_ready", "delivery failure must never demote a released report");
});
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
  assert.deepEqual(responseOrderForDraft({ note:"UP-PRIVATE-SECRET", safetyContext:"safe", zones:["UP-H-01"] }, ["UP-H-01"]), ["UP-H-01"]);
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
test("normalizes server-rendered PWQE5 question content and saved canonical answer", () => {
  const state = normaliseAssessmentState({ state: {
    engine:"PWQE5", status:"IN_PROGRESS", revision:7, pass:1, stage:"mapping", canPause:true,
    availableTopics:[{id:"body_detail",label:"Body detail",description:"Optional body-focused questions."}],
    responseHistory:[{responseId:"resp-1",questionId:"M02",title:"A prior prompt",prompt:"What happened?",context:"ordinary",status:"answered",mode:"single",selectedOptions:[{id:"M02.yes",label:"Yes"}],selection:{mode:"single"},responseControls:[{id:"not_sure",text:"Not sure"}],options:[{id:"M02.yes",label:"Yes",exclusive:false}],canCorrect:true}],
    currentInteraction:{interactionInstanceId:"pi-1",questionId:"M01",bankItemId:"M01",bankItemVersion:"5.0",stage:"mapping",pass:1,administrationSequence:1,title:"A little room",prompt:"What was it like?",context:"ordinary",episodeFamily:"ordinary",selection:{mode:"single"},responseControls:[{id:"none_fit",text:"None fit"}],options:[{id:"M01.rest",label:"I rested",exclusive:false}]},
    currentResponse:{completionState:"PARTIAL",response:{schemaVersion:"PWQE5-RS-1",status:"answered",mode:"single",selectedOptionIds:["M01.rest"],privateNote:"private"}},
  } });
  assert.equal(state.engine,"PWQE5");
  assert.equal(state.revision,7);
  assert.equal(state.pwqe5Interaction?.questionId,"M01");
  assert.deepEqual(state.pwqe5Interaction?.options,[{id:"M01.rest",label:"I rested",exclusive:false}]);
  assert.deepEqual(state.draft,{selectedOptionIds:["M01.rest"],status:"answered",mode:"single",note:"private"});
  assert.equal(state.responseHistory?.[0].context,"ordinary");
  assert.equal(state.responseHistory?.[0].mode,"single");
  assert.deepEqual(state.responseHistory?.[0].options,[{id:"M02.yes",label:"Yes",exclusive:false}]);
});
