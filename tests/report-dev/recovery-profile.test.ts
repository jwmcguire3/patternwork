import assert from "node:assert/strict";
import { cp,mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import type { OpenRouterGenerationRequest,OpenRouterGenerationResult } from "../../lib/server/openrouter/types.ts";
import { OpenRouterTransportError } from "../../lib/server/openrouter/types.ts";
import { REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2 as candidate } from "../../lib/server/openrouter/policy.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { structuralReviewFixture } from "../../lib/server/reports/qualification/review-fixture.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { runAssessmentPlan } from "../../scripts/report-dev/assessment.ts";
import { loadPwrp71RecoverySeed,loadPwrp71ContinuationSeed,prepareReport,runReportBatch } from "../../scripts/report-dev/workflow.ts";
import { REPORT_DEV_BOUNDED_STRUCTURE_RECOVERY_V1 as profile,recoveryProfileBinding } from "../../scripts/report-dev/recovery-profile.ts";
import { contentHash } from "../../scripts/report-dev/source.ts";

const json=async(file:string)=>JSON.parse(await readFile(file,"utf8"));
const put=async(file:string,value:unknown)=>writeFile(file,JSON.stringify(value));
async function fixture(root:string) {
 const [questionSource,reportSource]=await Promise.all([loadPwqe51SourcePackage(),loadPwrp71SourcePackage()]);
 const assessment=runAssessmentPlan(await json("scripts/report-dev/cases/ellis.json"),questionSource);
 const input={assessment,questionSource,reportSource}, {packet}=prepareReport(assessment,"IFS",questionSource,reportSource);
 const obs=(packet.observations as JsonObject[])[0];
 const draft:JsonObject={report_release:reportSource.policy.release,release_id:packet.release_id,snapshot_id:packet.snapshot_id,evidence_sha256:packet.content_sha256,report_type:"IFS",title:"Bounded recovery fixture",title_claim_ids:[],content_status:"complete",
 sections:[{id:"s1",heading:"Recorded response",text:"A selected response was retained.",claim_ids:["c1"]}],
 claims:[{id:"c1",text:"A selected response was retained.",kind:"reported",constructs:[],scope:{level:"occurrence",occurrence_ids:[obs.occurrence_id],person_ids:[],description:"One recorded occurrence."},evidence_ids:[obs.id],counterevidence_ids:[],sequence_edge_ids:[],depends_on_claim_ids:[],support_basis:["direct_report"],rationale:"Fixture only.",remaining_uncertainty:[]}],name_registry:[],relationships:[],reflection_questions:[]};
 const review=(value:JsonObject,verdict:"accept"|"revise"="accept")=>structuralReviewFixture({source:reportSource,packet,draft:value,verdict,...(verdict==="revise"?{issues:[{id:"i1",category:"voice",claim_ids:["c1"],section_ids:["s1"],name_ids:[],relationship_ids:[],evidence_ids:[],reason:"Bounded wording revision requested.",requested_change:"Clarify the sentence within its evidence scope."}]}:{})});
 const usage={generationId:"offline-recovery-fixture",inputTokens:0,outputTokens:0,reasoningTokens:0,totalTokens:0,costMicros:0,currency:"USD" as const,model:candidate.model};
 const result=(output:JsonObject):OpenRouterGenerationResult=>({ok:true,output,finishReason:"stop",usage});
 const sourceRunDirectory=path.join(root,"runs","generation");
 const generated=await runReportBatch({...input,directory:sourceRunDirectory,types:["IFS"],mode:"generate",candidateId:candidate.id,testTransport:true,aggregateMicros:300_000,perCallMicros:300_000,transport:{async generate(request){return result(request.schemaName.includes("_review_")?review(draft,"revise"):draft);}}});
 assert.equal(generated.failed,true);assert.equal(generated.providerAttempts,4,JSON.stringify(generated.reports));
 const journalPath=path.join(sourceRunDirectory,"provider/attempts.json"),journal=await json(journalPath);
 for(const attempt of journal.attempts)attempt.usageStatus="reported";
 await put(journalPath,journal); // Explicit synthetic reported-history fixture, never evidence of real dispatch.
 const recoverySource={sourceRunDirectory,outputRoot:root};
 const load=()=>loadPwrp71RecoverySeed({...input,...recoverySource,candidateId:candidate.id,recoveryProfileId:profile.id,aggregateMicros:250_000,perCallMicros:250_000});
 const options={...input,types:["IFS"] as "IFS"[],mode:"continue" as const,candidateId:candidate.id,recoveryProfileId:profile.id,recoverySource,testTransport:true,aggregateMicros:250_000,perCallMicros:250_000};
 return {input,draft,review,result,usage,sourceRunDirectory,journalPath,load,options};
}
async function withFixture(action:(value:Awaited<ReturnType<typeof fixture>>,root:string)=>Promise<void>) {
 const root=await mkdtemp(path.join(os.tmpdir(),"pw-bounded-recovery-"));
 try {await action(await fixture(root),root);} finally {await rm(root,{recursive:true,force:true});}
}

test("ordinary v2 still forbids a correction override and stops at one invalid repair",async()=>withFixture(async(f,root)=>{
 const continuation=await f.load();let calls=0;
 const base={...f.input,directory:path.join(root,"ordinary"),types:["IFS"] as "IFS"[],mode:"continue" as const,candidateId:candidate.id,continuation,testTransport:true,aggregateMicros:250_000,perCallMicros:250_000,transport:{async generate(){calls++;return f.result({...f.draft,report_type:"MAP"});}}};
 await assert.rejects(runReportBatch({...base,continuationStructuralRepair:true}),/one repair and one fresh review only/u);
 assert.equal(calls,0);
 const outcome=await runReportBatch(base);assert.equal(outcome.failed,true);assert.equal(calls,1);
 assert.equal(outcome.structuralRepairLimit,0);assert.equal("recoveryProfile" in outcome,false);
}));

test("profile valid repair gets exactly one full fresh review and distinct bound admission",async()=>withFixture(async(f,root)=>{
 const requests:OpenRouterGenerationRequest[]=[];
 const run=async(directory:string,profiled:boolean)=>runReportBatch({...f.options,directory,...(!profiled?{recoveryProfileId:undefined,recoverySource:undefined,continuation:await f.load()}:{}),transport:{async generate(request){requests.push(request);return f.result(request.schemaName.includes("_review_")?f.review(f.draft):f.draft);}}});
 const directory=path.join(root,"profiled"),summary=await run(directory,true);
 assert.equal(summary.failed,false,JSON.stringify(summary.reports));assert.equal(requests.length,2);
 assert.equal(summary.structuralRepairLimit,1);assert.deepEqual(summary.recoveryProfile,profile);
 assert.equal(summary.recoveryProfileSha256,sha256Canonical(profile));
 const binding=await json(path.join(directory,"binding.json")),journal=await json(path.join(directory,"provider/attempts.json"));
 for(const attempt of journal.attempts)assert.equal(attempt.candidateAdmission.runBindingSha256,sha256Canonical(binding));
 const reviewPrompt=JSON.parse(requests[1].prompt.split("\n\n").at(-1)!);assert.equal(reviewPrompt.reviewed_draft_sha256,sha256Canonical(f.draft));
 await run(path.join(root,"ordinary"),false);
 assert.notEqual(requests[0].idempotencyKey,requests[2].idempotencyKey);
 for(const request of requests){assert.equal(request.model,candidate.model);assert.equal(request.reasoningEffort,"high");assert.equal(request.maxOutputTokens,128000);assert.equal(request.providerPolicy?.data_collection,"deny");assert.equal(request.providerPolicy?.require_parameters,true);}
 assert.equal(journal.attempts[0].maximumCallCostMicros,250000);assert.equal(journal.attempts[0].aggregateCostCapMicros,250000);
 const replay=await run(directory,true);assert.equal(replay.failed,false);assert.equal(requests.length,4,"settled replay must not dispatch");
 binding.recoveryProfile.structuralCorrectionLimit=2;await put(path.join(directory,"binding.json"),binding);
 await assert.rejects(run(directory,true),/Immutable artifact already exists with different bytes/u);assert.equal(requests.length,4);
}));

test("profile invalid repair may receive one valid structural correction then full review",async()=>withFixture(async(f,root)=>{
 const requests:OpenRouterGenerationRequest[]=[];
 const outputs=[{...f.draft,report_type:"MAP"},f.draft,f.review(f.draft)];
 const summary=await runReportBatch({...f.options,directory:path.join(root,"corrected"),transport:{async generate(request){requests.push(request);return f.result(outputs[requests.length-1]);}}});
 assert.equal(summary.failed,false,JSON.stringify(summary.reports));assert.equal(requests.length,3);
 assert.match(requests[1].prompt,/BOUNDED STRUCTURAL CORRECTION/u);assert.match(requests[2].idempotencyKey,/:review_after_repair:.*attempt-3$/u);
 assert.equal(JSON.parse(requests[2].prompt.split("\n\n").at(-1)!).reviewed_draft_sha256,sha256Canonical(f.draft));
}));

test("profile invalid correction is terminal after two writer calls",async()=>withFixture(async(f,root)=>{
 let calls=0;const summary=await runReportBatch({...f.options,directory:path.join(root,"invalid"),transport:{async generate(request){calls++;assert.ok(!request.schemaName.includes("_review_"));return f.result({...f.draft,report_type:"MAP"});}}});
 assert.equal(summary.failed,true);assert.equal(calls,2);assert.equal((summary.reports.IFS as {failure:{code:string}}).failure.code,"artifact_validation_failed");
}));

test("provider failure, invalid fresh review, and fresh nonaccept are terminal",async()=>withFixture(async(f,root)=>{
 for(const scenario of ["provider","correction-provider","review-provider","invalid-review","revise"]){
  let calls=0;
  const summary=await runReportBatch({...f.options,directory:path.join(root,scenario),transport:{async generate(request){
   calls++;
   if(scenario==="provider"||scenario==="correction-provider"&&calls===2||scenario==="review-provider"&&calls===2)return {ok:false,kind:"refusal",message:"Fixture refusal",finishReason:"stop",usage:f.usage};
   if(scenario==="correction-provider")return f.result({...f.draft,report_type:"MAP"});
   return f.result(request.schemaName.includes("_review_")?(scenario==="invalid-review"?{}:f.review(f.draft,"revise")):f.draft);
  }}});
  assert.equal(summary.failed,true,scenario);assert.equal(calls,scenario==="provider"?1:2,scenario);
 }
}));

test("unknown provider outcome stays reserved and blocks replay without another call",async()=>withFixture(async(f,root)=>{
 let calls=0;const options={...f.options,directory:path.join(root,"unknown"),transport:{async generate(){calls++;throw new OpenRouterTransportError("timeout","Offline timeout",{retryable:false});}}};
 const first=await runReportBatch(options);assert.equal(first.failed,true);assert.equal(first.unknownAttempts.length,1);
 const second=await runReportBatch(options);assert.equal(second.failed,true);assert.equal(calls,1);
}));

test("profile rejects every recovery parent and historical candidate before dispatch",async()=>withFixture(async(f,root)=>{
 for(const mode of ["continue","review-retry","review-closure"]){
  const sourceRunDirectory=path.join(root,mode);await cp(f.sourceRunDirectory,sourceRunDirectory,{recursive:true});
  const file=path.join(sourceRunDirectory,"binding.json"),binding=await json(file);binding.mode=mode;await put(file,binding);
  await assert.rejects(loadPwrp71RecoverySeed({...f.options,...f.options.recoverySource,sourceRunDirectory}),/direct current-v2 generation/u);
 }
 await assert.rejects(loadPwrp71RecoverySeed({...f.options,...f.options.recoverySource,candidateId:"report-dev-luna-high-v1"}),/current fixed 128k/u);
 assert.throws(()=>recoveryProfileBinding("invented-profile"),/Unknown fixed/u);
}));

test("profile rejects raw seeds, other modes, missing sources, and unsafe spending limits",async()=>withFixture(async(f,root)=>{
 let calls=0;const base={...f.options,directory:path.join(root,"reject"),transport:{async generate(){calls++;return f.result(f.draft);}}};
 for(const mutation of [{continuation:await f.load()},{continuationStructuralRepair:true},{mode:"generate" as const},{recoverySource:undefined},{recoveryProfileId:"invented"},{aggregateMicros:250001},{perCallMicros:500001},{aggregateMicros:0},{aggregateMicros:NaN},{aggregateMicros:0.5},{perCallMicros:0},{perCallMicros:250001}])await assert.rejects(runReportBatch({...base,...mutation}));
 const bindingFile=path.join(f.sourceRunDirectory,"binding.json"),binding=await json(bindingFile);binding.aggregateMicros=240000;await put(bindingFile,binding);
 await assert.rejects(runReportBatch(base),/original generation authorization/u);assert.equal(calls,0);
}));

test("profile reload rejects changed source, candidate, draft, review, journal, usage, and unknowns",async()=>withFixture(async(f,root)=>{
 let calls=0;const base={...f.options,directory:path.join(root,"reject"),transport:{async generate(){calls++;return f.result(f.draft);}}};
 await assert.rejects(runReportBatch({...base,questionSource:{...f.input.questionSource,sourceManifestSha256:"f".repeat(64) as typeof f.input.questionSource.sourceManifestSha256}}));
 await assert.rejects(runReportBatch({...base,reportSource:{...f.input.reportSource,manifestSha256:"f".repeat(64) as typeof f.input.reportSource.manifestSha256}}));
 const original=await json(f.journalPath);
 const changes=[(j:typeof original)=>{j.attempts[0].usageStatus="unknown";},(j:typeof original)=>{j.attempts[0].requestFingerprint="f".repeat(64);},(j:typeof original)=>{j.attempts[0].usage.costMicros++;},(j:typeof original)=>{j.attempts[0].candidateAdmission.candidateSha256="f".repeat(64);},(j:typeof original)=>{j.attempts[2].providerResult.output.title="Tampered title";},(j:typeof original)=>{j.attempts[3].reviewReceipt.review.summary="Tampered review";}];
 for(const change of changes){const next=structuredClone(original);change(next);await put(f.journalPath,next);await assert.rejects(runReportBatch(base));await put(f.journalPath,original);}
 const capturePath=path.join(f.sourceRunDirectory,"provider/requests",`${contentHash(original.attempts[0].attemptId)}.json`),capture=await json(capturePath);capture.request.prompt+=" changed";await put(capturePath,capture);
 await assert.rejects(runReportBatch(base));assert.equal(calls,0);
}));

test("profile retains local identity checks before dispatch",async()=>withFixture(async(f,root)=>{
 let calls=0;
 await assert.rejects(runReportBatch({...f.options,directory:path.join(root,"identity"),testTransport:false,transport:{async generate(){calls++;return f.result(f.draft);}}}),/reviewed local identity inventory/u);
 const summary=await runReportBatch({...f.options,directory:path.join(root,"identity-token"),privacyIdentityContext:{identityInventoryReviewed:true,respondentNames:["A selected response"],accountIds:[],emails:[],otherIdentityTokens:[]},transport:{async generate(){calls++;return f.result(f.draft);}}});
 assert.equal(summary.failed,true);assert.equal(calls,0);
 // The ordinary loader remains available; the profile adds stricter source loading rather than altering it.
 assert.equal((await loadPwrp71ContinuationSeed({...f.input,...f.options.recoverySource,candidateId:candidate.id})).sourceDraftSha256.length,64);
}));


test("CLI exposes only the fixed profile and rejects incompatible modes/candidates offline",async()=>{
 const run=promisify(execFile),entry="scripts/report-dev/index.ts";
 const {OPENROUTER_API_KEY:omitted,...env}=process.env;void omitted;
 const help=await run(process.execPath,["--import","tsx",entry,"--help"],{env});
 assert.match(help.stdout,/--recovery-profile report-dev-luna-high-128k-bounded-structure-v1/u);
 for(const args of [["--mode","prepare","--reports","IFS","--recovery-profile",profile.id],["--mode","prepare","--recovery-profile","invented"],["--mode","continue","--continue-from","unused","--identity-file","unused","--candidate","report-dev-haiku-low-v1","--recovery-profile",profile.id]]) {
  await assert.rejects(run(process.execPath,["--import","tsx",entry,...args],{env}),/fixed.*(recovery profile|128k candidate)|requires --mode continue/u);
 }
});
