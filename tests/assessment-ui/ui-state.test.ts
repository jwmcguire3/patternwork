import test from "node:test";
import assert from "node:assert/strict";
import { buildPwqe51DeepeningPreferences, buildPwqe51Response, buildTypedAssessmentResponse, familyLabel, isPwqe51AnswerValid, isPwqe51NoOtherPersonRole, normaliseAssessmentState, pwqe51AvailableStatuses, pwqe51QuestionPresentation, pwqe51ReferentGate, responseOrderForDraft, semanticOptionId, stateForHttpStatus, togglePwqe51Option, type Pwqe51RenderedInteraction } from "../../app/assessment/ui-state";
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

function pwqe51Item(overrides: Partial<Pwqe51RenderedInteraction> = {}): Pwqe51RenderedInteraction {
  return {
    instanceId:"interaction-private", questionId:"D65", bankItemId:"D65", bankItemVersion:"5.1",
    stage:"deepening", pass:2, administrationSequence:8, title:"How you met your own reaction",
    prompt:"When you noticed your own reaction, how did you relate to it?", context:"A remembered situation",
    episodeFamily:"internal", rootBasisRequired:true, basisOptions:["actual_recalled","reported_typicality"],
    referentSlotRequired:false,referentRoleOptions:[],
    selection:{mode:"single",max_select:1,allow_simultaneous_pair:false},
    responseControls:[{id:"none_fit",text:"None of these fits"},{id:"not_sure",text:"I am not sure"},{id:"no_event",text:"I cannot recall a situation like this"},{id:"not_applicable",text:"This does not fit my life"},{id:"skip",text:"Skip this question"}],
    options:[{id:"D65.curious",label:"I wanted to understand what was happening in me.",exclusive:false},{id:"D65.not_noticed",label:"I did not notice a reaction I can describe.",exclusive:true}],
    ...overrides,
  };
}

test("normalizes PWQE 5.1 authored question, root basis, and just-in-time referent choices without exposing internal identifiers", () => {
  const state=normaliseAssessmentState({state:{engine:"PWQE51",status:"PASS2_IN_PROGRESS",revision:9,pass:2,availableTopics:[{id:"self_expression",label:"Self-expression",description:"Explore how you describe yourself."}],availableFocuses:[{ref:"opaque-occurrence-a",label:"A recent work situation"},{ref:"opaque-occurrence-b",label:"A different conversation"},{id:"bad-shape",label:"should be dropped"}],currentInteraction:{interactionInstanceId:"interaction-private",questionId:"D65",bankItemId:"D65",bankItemVersion:"5.1",stage:"deepening",pass:2,administrationSequence:8,title:"How you met your own reaction",prompt:"How did you relate to it?",context:"A remembered situation",episodeFamily:"internal",occurrenceId:"do-not-render",episodeId:"also-private",rootBasisRequired:true,basisOptions:["actual_recalled","reported_typicality","invalid"],referentSlotRequired:true,referentSlotPrompt:"Who was involved in this situation?",referentSlotKey:"support_person-internal",referentRoleOptions:[{id:"role-friend",label:"A friend"},{id:"role-none",label:"No other person / no applicable situation"},{id:"ignore",name:"bad shape"}],selection:{mode:"single",max_select:1},responseControls:[{id:"not_sure",text:"I am not sure"}],options:[{id:"D65.curious",label:"Curious",exclusive:false}]},currentResponse:{response:{schemaVersion:"PWQE51-RS-1",status:"answered",mode:"single",selectedOptionIds:["D65.curious"],basis:"actual_recalled",referentRole:"role-friend"}}}});
  assert.equal(state.engine,"PWQE51");
  assert.equal(state.pwqe51Interaction?.questionId,"D65");
  assert.equal(state.pwqe51Interaction?.rootBasisRequired,true);
  assert.equal(state.pwqe51Interaction?.referentSlotRequired,true);
  assert.equal(state.pwqe51Interaction?.referentSlotPrompt,"Who was involved in this situation?");
  assert.deepEqual(state.pwqe51Interaction?.referentRoleOptions,[{id:"role-friend",label:"A friend"},{id:"role-none",label:"No other person / no applicable situation"}]);
  assert.deepEqual(state.pwqe51Interaction?.basisOptions,["actual_recalled","reported_typicality"]);
  assert.equal("occurrenceId" in (state.pwqe51Interaction as object),false);
  assert.equal("episodeId" in (state.pwqe51Interaction as object),false);
  assert.deepEqual(state.draft,{selectedOptionIds:["D65.curious"],status:"answered",mode:"single",basis:"actual_recalled",referentRole:"role-friend"});
  assert.equal(state.availableTopics?.[0]?.id,"self_expression");
  assert.deepEqual(state.availableFocuses,[{ref:"opaque-occurrence-a",label:"A recent work situation"},{ref:"opaque-occurrence-b",label:"A different conversation"}]);
});

test("PWQE 5.1 answer contract keeps root basis and missingness choices distinct", () => {
  const itemWithRole=pwqe51Item({referentSlotRequired:true,referentRoleOptions:[{id:"friend",label:"A friend"},{id:"none",label:"No other person / no applicable situation"}]});
  const answered={selectedOptionIds:["D65.curious"],mode:"single",basis:"actual_recalled",referentRole:"friend"};
  assert.deepEqual(buildPwqe51Response(answered,itemWithRole),{schemaVersion:"PWQE51-RS-1",status:"answered",mode:"single",selectedOptionIds:["D65.curious"],basis:"actual_recalled",referentRole:"friend"});
  assert.equal(isPwqe51AnswerValid(answered,itemWithRole),true);
  assert.equal(isPwqe51AnswerValid({selectedOptionIds:["D65.curious"],basis:"actual_recalled"},itemWithRole),false,"a referent role must be chosen first");
  assert.equal(isPwqe51AnswerValid({selectedOptionIds:["D65.curious"],basis:"actual_recalled",referentRole:"none"},itemWithRole),false,"no-other-person cannot support a substantive selection");
  assert.deepEqual(buildPwqe51Response({...answered,referentRole:"none"},itemWithRole),{schemaVersion:"PWQE51-RS-1",status:"not_applicable",mode:"single",selectedOptionIds:[],referentRole:"none"});
  assert.equal(isPwqe51NoOtherPersonRole(itemWithRole.referentRoleOptions[1]),true);
  assert.equal(isPwqe51NoOtherPersonRole(itemWithRole.referentRoleOptions[0]),false);
  assert.equal(pwqe51ReferentGate(itemWithRole,{}),"choose_role");
  assert.deepEqual(pwqe51AvailableStatuses(itemWithRole,{}),["skip"],"the authored question stays gated until a role is chosen");
  assert.equal(pwqe51ReferentGate(itemWithRole,{referentRole:"friend"}),"selected_role");
  assert.deepEqual(pwqe51AvailableStatuses(itemWithRole,{referentRole:"friend"}),["none_fit","not_sure","no_event","not_applicable","skip"]);
  assert.equal(pwqe51ReferentGate(itemWithRole,{referentRole:"none"}),"no_other_person");
  assert.deepEqual(pwqe51AvailableStatuses(itemWithRole,{referentRole:"none"}),["not_applicable","skip"],"the explicit no-person choice cannot proceed substantively");
  for(const status of ["none_fit","not_sure","no_event","not_applicable","skip"]){
    assert.deepEqual(buildPwqe51Response({basis:"actual_recalled",referentRole:"friend"},itemWithRole,status),{schemaVersion:"PWQE51-RS-1",status,mode:"single",selectedOptionIds:[],referentRole:"friend"});
  }
});

test("PWQE 5.1 selection helpers enforce single-only and exclusive authored options", () => {
  const item=pwqe51Item({rootBasisRequired:false,basisOptions:[],selection:{mode:"single",max_select:1,allow_simultaneous_pair:true},options:[{id:"A",label:"A",exclusive:false},{id:"B",label:"B",exclusive:false},{id:"NONE",label:"None",exclusive:true}]});
  const first=togglePwqe51Option({},item,"A");
  const second=togglePwqe51Option(first,item,"B");
  assert.deepEqual(second.selectedOptionIds,["B"],"max_select=1 stays single even if a pair flag is present");
  const exclusive=togglePwqe51Option(second,item,"NONE");
  assert.deepEqual(exclusive.selectedOptionIds,["NONE"]);
  assert.equal(isPwqe51AnswerValid({...exclusive,basis:undefined},item),true);
  assert.equal(isPwqe51AnswerValid({selectedOptionIds:["A","NONE"],mode:"simultaneous"},item),false);
});

test("PWQE 5.1 partial-order choice does not imply order and later bank items normalize", () => {
  const partial=pwqe51Item({rootBasisRequired:false,basisOptions:[],selection:{mode:"partial_order",max_select:3,allow_simultaneous_pair:false,order_not_implied:true},options:[{id:"A",label:"A",exclusive:false},{id:"B",label:"B",exclusive:false},{id:"C",label:"C",exclusive:false}]});
  let value=togglePwqe51Option({},partial,"A");
  value=togglePwqe51Option(value,partial,"B");
  assert.equal(isPwqe51AnswerValid(value,partial),false,"the order relation must be explicitly chosen");
  value={...value,mode:"order_unknown"};
  assert.equal(isPwqe51AnswerValid(value,partial),true);
  for(const id of ["D65","D78","D91","D99","D100"]){
    const state=normaliseAssessmentState({state:{engine:"PWQE51",status:"PASS2_IN_PROGRESS",currentInteraction:{interactionInstanceId:`i-${id}`,questionId:id,bankItemId:id,title:id,prompt:`Prompt ${id}`,context:"Context",stage:"deepening",pass:2,options:[{id:`${id}.one`,label:"Authored",exclusive:false}],selection:{mode:"single",max_select:1},responseControls:[{id:"skip",text:"Skip this question"}]}}});
    assert.equal(state.pwqe51Interaction?.questionId,id);
    assert.equal(state.pwqe51Interaction?.options[0]?.id,`${id}.one`);
    assert.equal(state.pwqe51Interaction?.responseControls[0]?.id,"skip");
  }
});

test("PWQE 5.1 Deepening preferences project only safe focus labels and explicit comparison decisions", () => {
  const state=normaliseAssessmentState({state:{engine:"PWQE51",status:"PASS1_COMPLETE",availableFocuses:[{ref:"opaque-A",label:"A remembered work moment"},{ref:"opaque-B",label:"A later conversation"},{ref:"opaque-C",label:"An earlier family moment"},{ref:"not-a-ref",title:"drop me"}]}});
  assert.deepEqual(state.availableFocuses,[{ref:"opaque-A",label:"A remembered work moment"},{ref:"opaque-B",label:"A later conversation"},{ref:"opaque-C",label:"An earlier family moment"}]);
  const common={focuses:state.availableFocuses!,focusOccurrenceRefs:["opaque-A","opaque-A","not-available"],detailPermissions:["body","contrast","bogus"]};
  const different=buildPwqe51DeepeningPreferences({...common,comparisonFirstRef:"opaque-A",comparisonSecondRef:"opaque-B",comparisonRelation:"different"});
  assert.deepEqual(different,{focusOccurrenceRefs:["opaque-A"],detailPermissions:["body","contrast"],comparisonDecisions:[{firstRef:"opaque-A",secondRef:"opaque-B",relation:"different"}]});
  assert.equal("distinctOccurrencePairs" in different,false,"the service contract carries an explicit relation decision");
  const same=buildPwqe51DeepeningPreferences({...common,comparisonFirstRef:"opaque-A",comparisonSecondRef:"opaque-B",comparisonRelation:"same"});
  assert.deepEqual(same.comparisonDecisions,[{firstRef:"opaque-A",secondRef:"opaque-B",relation:"same"}]);
  const cannotTell=buildPwqe51DeepeningPreferences({...common,comparisonFirstRef:"opaque-A",comparisonSecondRef:"opaque-B",comparisonRelation:"cannot_tell"});
  assert.deepEqual(cannotTell.comparisonDecisions,[{firstRef:"opaque-A",secondRef:"opaque-B",relation:"cannot_tell"}]);
  const incomplete=buildPwqe51DeepeningPreferences({...common,comparisonFirstRef:"opaque-A",comparisonSecondRef:"opaque-A",comparisonRelation:"different"});
  assert.deepEqual(incomplete.comparisonDecisions,[]);
});

test("PWQE 5.1 unavailable bindings expose only skip, never an answer", () => {
  const state=normaliseAssessmentState({state:{engine:"PWQE51",status:"IN_PROGRESS",currentInteraction:{interactionInstanceId:"private-interaction",questionId:"D91",bankItemId:"D91",title:"Hidden authored title",prompt:"This follow-up depends on details that are not available from the answers so far. You can skip it and continue.",context:"this situation",unavailableBinding:true,options:[{id:"D91.offered",label:"They offered the help I had asked for.",exclusive:false}],selection:{mode:"single",max_select:1},responseControls:[{id:"skip",text:"Skip this question"},{id:"not_sure",text:"I am not sure"}]}}});
  const item=state.pwqe51Interaction!;
  assert.equal(item.unavailableBinding,true);
  assert.equal(item.prompt,"This follow-up depends on details that are not available from the answers so far. You can skip it and continue.");
  assert.equal(pwqe51QuestionPresentation(item,{}) ,"unavailable_explanation");
  assert.equal(pwqe51QuestionPresentation(pwqe51Item({referentSlotRequired:true}),{}),"choose_role");
  const value={selectedOptionIds:["D65.curious"],basis:"actual_recalled"};
  assert.deepEqual(pwqe51AvailableStatuses(item,value),["skip"]);
  assert.equal(isPwqe51AnswerValid(value,item),false);
  assert.deepEqual(buildPwqe51Response(value,item),{schemaVersion:"PWQE51-RS-1",status:"skip",mode:"single",selectedOptionIds:[]});
});
