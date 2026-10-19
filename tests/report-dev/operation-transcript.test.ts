import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { canCompletePwqe51Pass, createPwqe51SessionState, advancePwqe51Session, renderPwqe51Interaction, pwqe51FocusChoices } from "../../lib/server/assessment/pwqe51-session.ts";
import { AssessmentOperationRecorder, loadAssessment, runAssessmentPlan, writeImmutableJson, type AssessmentRecord, type AssessmentOperationEntry } from "../../scripts/report-dev/assessment.ts";
import { assertAssessmentRoute } from "../../scripts/report-dev/verify-assessment.ts";
import { canonical, contentHash } from "../../scripts/report-dev/source.ts";

const sourcePromise = loadPwqe51SourcePackage();
const outputRoot = path.resolve(".codex-temp/operation-transcript");
type Source = Awaited<typeof sourcePromise>;
type Plan = { config: {topics:string[];details:string[]}; answers:Record<string,{selected:string[]}[]> };
async function c07():Promise<Plan> {
 const content=JSON.parse(await readFile("specs/patternwork/question-engine-v5.1/qualification/coverage/FICTIONAL_PLANS.json","utf8"));
 return content.plans.find((p: {id:string})=>p.id==="C07");
}
function answerCurrent(recorder:AssessmentOperationRecorder,source:Source,plan:Plan,used:Map<string,number>,prefix="r") {
 const state=recorder.state!; const issued=renderPwqe51Interaction(state,source);assert.ok(issued);
 const index=used.get(issued.questionId)??0;used.set(issued.questionId,index+1);
 const selected=plan.answers[issued.questionId]?.[index]?.selected;
 const role=issued.referentRoleOptions?.find(o=>o.id!=="no_other_person")?.id;
 recorder.issue({operation:"answer",input:{questionId:issued.questionId,responseId:`${prefix}_${state.responses.length}`,
 completionState:selected?"COMPLETED":"SKIPPED",selectedOptionIds:selected??[],
 ...(selected&&issued.rootBasisRequired?{basis:"actual_recalled" as const}:{}),...(issued.referentSlotRequired&&role?{referentRole:role}:{}),}});
}
async function pendingReplay() {
 const source=await sourcePromise,plan=await c07(),used=new Map<string,number>();
 const recorder=new AssessmentOperationRecorder(source);recorder.issue({operation:"create",input:{}});
 for(let i=0;i<24&&!recorder.state!.responses.some(r=>r.questionId==="M03"&&r.status==="answered");i++) answerCurrent(recorder,source,plan,used);
 const root=recorder.state!.responses.find(r=>r.questionId==="M02"&&r.status==="answered");assert.ok(root);
 recorder.issue({operation:"end",input:{}});
 recorder.issue({operation:"start_deepening",input:{optedInTopics:plan.config.topics,context:{focusOccurrences:[root.occurrenceId],details:plan.config.details}}});
 for(let i=0;i<24&&recorder.state!.routerResult.next?.bindingRequest!=="confirm_replay_distinctness";i++) answerCurrent(recorder,source,plan,used);
 assert.equal(recorder.state!.routerResult.next?.bindingRequest,"confirm_replay_distinctness");
 return {recorder,source,plan,used};
}
const decision=(n:number)=>`pwrb_${String(n).padStart(40,"0")}`;
function reseal(value:AssessmentRecord) { const content={...value,contentSha256:undefined};return {...content,contentSha256:contentHash(canonical(content))}; }

// All final states in this file are produced exclusively by public session operations.
test("v2 records controls, response correction and all explicit comparison relations; immutable exact replay",async()=>{
 const source=await sourcePromise,plan=await c07();
 const recorder=new AssessmentOperationRecorder(source);recorder.issue({operation:"create",input:{}});
 recorder.issue({operation:"pause",input:{}});recorder.issue({operation:"resume",input:{}});
 for(let i=0;i<20&&pwqe51FocusChoices(recorder.state!).length<3;i++){
 const state=recorder.state!,issued=renderPwqe51Interaction(state,source);assert.ok(issued);
 recorder.issue({operation:"answer",input:{questionId:issued.questionId,responseId:`mapping_${i}`,completionState:"COMPLETED",selectedOptionIds:[issued.options[0].id],...(issued.rootBasisRequired?{basis:"actual_recalled" as const}:{}),...(issued.referentSlotRequired?{referentRole:issued.referentRoleOptions![0].id}:{})}});
 }
 const original=recorder.state!.responses[0];assert.ok(original);
 recorder.issue({operation:"begin_correction",input:{responseId:original.responseId}});
 recorder.issue({operation:"answer",input:{questionId:original.questionId,responseId:"corrected_root",completionState:"COMPLETED",selectedOptionIds:original.selectedOptionIds??[],supersedesResponseId:original.responseId}});
 const choices=pwqe51FocusChoices(recorder.state!);assert.ok(choices.length>=3);
 recorder.issue({operation:"end",input:{}});
 const [a,b,c]=choices.map(x=>x.occurrenceId);
 recorder.issue({operation:"start_deepening",input:{optedInTopics:plan.config.topics,context:{focusOccurrences:choices.map(x=>x.occurrenceId),details:plan.config.details,
 distinctPairs:[[a,b]],comparisonDecisions:[{firstOccurrenceId:a,secondOccurrenceId:b,relation:"different"},{firstOccurrenceId:a,secondOccurrenceId:c,relation:"same"},{firstOccurrenceId:b,secondOccurrenceId:c,relation:"cannot_tell"}]}}});
 if(!canCompletePwqe51Pass(recorder.state!))recorder.issue({operation:"shorten",input:{}});
 if(!canCompletePwqe51Pass(recorder.state!))recorder.issue({operation:"end",input:{}});
 const assessment=recorder.complete();assert.equal(assessment.schema,"patternwork-completed-assessment-2");
 assert.doesNotThrow(()=>assertAssessmentRoute(assessment,source));assert.doesNotThrow(()=>assertAssessmentRoute(assessment,source));
 assert.deepEqual(assessment.deepening.comparisonDecisions?.map(d=>d.relation),["different","same","cannot_tell"]);
 assert.ok(assessment.deepening.responses.some(r=>r.supersedesResponseId===original.responseId));
 const directory=path.join(outputRoot,assessment.contentSha256);await mkdir(directory,{recursive:true});const file=path.join(directory,"assessment.json");
 await writeImmutableJson(file,assessment);await writeImmutableJson(file,assessment);
 assert.equal(canonical(await loadAssessment(file,source)),canonical(assessment));
 const entries=assessment.transcript as AssessmentOperationEntry[];
 const edits:((v:AssessmentRecord)=>void)[]=[
 v=>{(v.deepening.controls as string[]).push("end");},
 v=>{(v.mapping.routerResult as unknown as {completionReason:string}).completionReason="invented";},
 v=>{(v.transcript[1] as AssessmentOperationEntry).issued={};},
 v=>{(v.transcript[0] as AssessmentOperationEntry).identities.pop();},
 v=>{(v.transcript[0] as AssessmentOperationEntry).identities.push({kind:"interaction",id:"pwi_00000000-0000-4000-8000-000000000000"});},
 v=>{(v.transcript[0] as AssessmentOperationEntry).identities[0].kind="interaction";},
 v=>{const e=v.transcript.find(e=>(e as AssessmentOperationEntry).operation==="answer") as AssessmentOperationEntry;(e.acceptedInput as {questionId:string}).questionId="NOT_ISSUED";},
 v=>{const e=v.transcript.find(e=>(e as AssessmentOperationEntry).operation==="answer") as AssessmentOperationEntry;(e.acceptedInput as {selectedOptionIds:string[]}).selectedOptionIds=["foreign"];},
 v=>{const e=v.transcript.find(e=>(e as AssessmentOperationEntry).operation==="begin_correction") as AssessmentOperationEntry;(e.acceptedInput as {responseId:string}).responseId="future_response";},
 v=>{const e=v.transcript.find(e=>(e as AssessmentOperationEntry).operation==="start_deepening") as AssessmentOperationEntry;(e.acceptedInput as {context:{comparisonDecisions:{relation:string}[]}}).context.comparisonDecisions[0].relation="same";},
 v=>{const e=v.transcript.find(e=>(e as AssessmentOperationEntry).operation==="start_deepening") as AssessmentOperationEntry;(e.acceptedInput as {context:{focusOccurrences:string[]}}).context.focusOccurrences=["stale_occurrence"];},
 v=>{[v.transcript[1],v.transcript[2]]=[v.transcript[2],v.transcript[1]];},
 v=>{v.questionSourceSha256="0".repeat(64);},
 v=>{(v as unknown as {unknown:boolean}).unknown=true;},
 ];
 for(const edit of edits){const changed=structuredClone(assessment);edit(changed);assert.throws(()=>assertAssessmentRoute(reseal(changed),source));}
 assert.ok(entries.some(e=>e.operation==="shorten"));
 // Runtime identity tapes form one global bijection, including identities no longer current.
 const duplicate=structuredClone(assessment),identityEntries=(duplicate.transcript as AssessmentOperationEntry[]).filter(e=>e.identities.some(i=>i.kind==="interaction"));
 const first=identityEntries[0].identities.find(i=>i.kind==="interaction")!,later=identityEntries[1].identities.find(i=>i.kind==="interaction")!;later.id=first.id;
 assert.throws(()=>assertAssessmentRoute(reseal(duplicate),source),/duplicated/);
});

test("all issued replay outcomes and binding corrections replay through actual production APIs",async()=>{
 for(const [index,outcome]of(["different","same","unknown","no_event","skip"]as const).entries()){
  const {recorder,source,plan,used}=await pendingReplay();
  recorder.issue({operation:"replay_binding",input:{decisionId:decision(index*3+1),outcome}});
  if(outcome!=="different")recorder.issue({operation:"replay_binding",input:{decisionId:decision(index*3+2),outcome:"different",correctsDecisionId:decision(index*3+1)}});
  assert.equal(recorder.state!.currentInteraction?.questionId,"M02");
  answerCurrent(recorder,source,plan,used,"replay");
  if(!canCompletePwqe51Pass(recorder.state!))recorder.issue({operation:"end",input:{}});
  const assessment=recorder.complete();assert.doesNotThrow(()=>assertAssessmentRoute(assessment,source));
  const file=path.join(outputRoot,assessment.contentSha256,"assessment.json");await writeImmutableJson(file,assessment);await loadAssessment(file,source);
  const tampered=structuredClone(assessment),entry=tampered.transcript.find(e=>(e as AssessmentOperationEntry).operation==="replay_binding")as AssessmentOperationEntry;
  (entry.acceptedInput as {correctsDecisionId:string}).correctsDecisionId=decision(999);assert.throws(()=>assertAssessmentRoute(reseal(tampered),source),/current issued request|active correction/);
 }
});

test("operation plans resolve only earlier response occurrence aliases, then persist resolved issued context",async()=>{
 const source=await sourcePromise;
 const plan={schema:"patternwork-operation-plan-2",id:"operations",operations:[
 {operation:"create",input:{}},{operation:"answer",input:{questionId:"M01",responseId:"first",completionState:"COMPLETED",selectedOptionIds:["M01.rest"],basis:"actual_recalled"}},
 {operation:"end",input:{}},{operation:"start_deepening",input:{optedInTopics:[],context:{focusOccurrences:["$response:first"]}}}]};
 const result=runAssessmentPlan(plan,source);assert.doesNotThrow(()=>assertAssessmentRoute(result,source));
 const wrong=structuredClone(plan);(wrong.operations[3].input as {context:{focusOccurrences:string[]}}).context.focusOccurrences=["$response:future"];
 assert.throws(()=>runAssessmentPlan(wrong,source),/earlier recorded response/);
 const unknown=structuredClone(plan);(unknown.operations[0].input as {routerInput:unknown}).routerInput={distinctPairs:[]};
 assert.throws(()=>runAssessmentPlan(unknown,source),/Invalid assessment operation input/);
});

test("production identity seam preserves UUID-sensitive ordering without replacing responses or source fields",async()=>{
 const source=await sourcePromise;
 function run(reverse:boolean){let n=0;const ids=(kind:"occurrence"|"interaction")=>`${kind==="occurrence"?"pwep":"pwi"}_${String(reverse?999-n++:n++).padStart(8,"0")}-0000-4000-8000-000000000000`;
 let state=createPwqe51SessionState(source,{}, {},ids);
 for(let i=0;i<12;i++){const issued=renderPwqe51Interaction(state,source);assert.ok(issued);state=advancePwqe51Session(state,{responseId:`stable_${i}`,completionState:"COMPLETED",selectedOptionIds:[issued.options[0].id],...(issued.rootBasisRequired?{basis:"actual_recalled" as const}:{}),...(issued.referentSlotRequired?{referentRole:issued.referentRoleOptions![0].id}:{})},source,ids);}
 return state;}
 const forward=run(false),reverse=run(true);assert.ok(forward.routerResult.episodes.length>1);
 assert.deepEqual(forward.responses.map(r=>r.questionId),reverse.responses.map(r=>r.questionId));
 assert.notDeepEqual(forward.routerResult.episodes.map(e=>e.responseIds),reverse.routerResult.episodes.map(e=>e.responseIds));
});

test("issued D56/D57/D77 comparison lineage survives immutable replay and correction invalidation",async()=>{
 const {recorder,source,plan,used}=await pendingReplay();
 recorder.issue({operation:"replay_binding",input:{decisionId:decision(101),outcome:"different"}});
 const replayOccurrenceId=recorder.state!.currentInteraction!.occurrenceId;
 recorder.issue({operation:"pause",input:{}});recorder.issue({operation:"resume",input:{}});
 answerCurrent(recorder,source,plan,used,"comparison");
 const replayRoot=recorder.state!.responses.at(-1)!;
 for(let i=0;i<60&&!recorder.state!.responses.some(r=>r.questionId==="D77"&&r.status==="answered");i++)answerCurrent(recorder,source,plan,used,"comparison");
 const before=recorder.state!;
 for(const id of["D56","D57","D77"]){
  const response=before.responses.find(r=>r.questionId===id&&r.status==="answered");assert.ok(response);
  assert.ok(before.routerInput.comparisonIdsByResponseId?.[response.responseId]?.includes(replayOccurrenceId));
 }
 recorder.issue({operation:"begin_correction",input:{responseId:replayRoot.responseId}});
 recorder.issue({operation:"answer",input:{questionId:"M02",responseId:"comparison_root_corrected",completionState:"COMPLETED",selectedOptionIds:["M02.none"]}});
 assert.ok(recorder.state!.routerResult.invalidatedResponses.some(r=>r.responseId===before.responses.find(r=>r.questionId==="D77")!.responseId));
 recorder.issue({operation:"replay_binding",input:{decisionId:decision(102),outcome:"same",correctsDecisionId:decision(101)}});
 assert.ok(!recorder.state!.routerResult.episodes.some(e=>e.id===replayOccurrenceId));
 recorder.issue({operation:"replay_binding",input:{decisionId:decision(103),outcome:"different",correctsDecisionId:decision(102)}});
 assert.ok(recorder.state!.routerResult.episodes.some(e=>e.id===replayOccurrenceId));
 if(!canCompletePwqe51Pass(recorder.state!))recorder.issue({operation:"end",input:{}});
 const completed=recorder.complete();assert.doesNotThrow(()=>assertAssessmentRoute(completed,source));
 const file=path.join(outputRoot,completed.contentSha256,"assessment.json");await writeImmutableJson(file,completed);await loadAssessment(file,source);
 const changed=structuredClone(completed);
 const entry=changed.transcript.find(e=>(e as AssessmentOperationEntry).operation==="answer"&&((e as AssessmentOperationEntry).acceptedInput as {questionId:string}).questionId==="D77") as AssessmentOperationEntry;
 (entry.issued as {currentInteraction:{comparisonIds:string[]}}).currentInteraction.comparisonIds=["stale","pair"];
 assert.throws(()=>assertAssessmentRoute(reseal(changed),source),/Issued operation context mismatch/);
});
