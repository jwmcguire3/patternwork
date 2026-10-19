import assert from "node:assert/strict";
import { mkdtemp,readFile,readdir,rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { renderPwrp71Markdown } from "../../lib/server/reports/pwrp71-render.ts";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { JsonObject,ReportType } from "../../lib/question-engine/types.ts";
import type { OpenRouterTransport } from "../../lib/server/openrouter/types.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { runAssessmentPlan } from "../../scripts/report-dev/assessment.ts";
import { prepareReport,REPORT_ORDER,runReportBatch } from "../../scripts/report-dev/workflow.ts";
import { structuralReviewFixture } from "../../lib/server/reports/qualification/review-fixture.ts";
import { assertNoRespondentClassification } from "../../lib/server/reports/content-boundary.ts";
import { validatePwrp71ReviewQuality } from "../../lib/server/reports/pwrp71-review-quality.ts";

async function inputs(){
 const [questionSource,reportSource]=await Promise.all([loadPwqe51SourcePackage(),loadPwrp71SourcePackage()]);
 const assessment=runAssessmentPlan(JSON.parse(await readFile("scripts/report-dev/cases/ellis.json","utf8")),questionSource);
 return {assessment,questionSource,reportSource};
}
function draft(packet:JsonObject,type:ReportType,release:string):JsonObject{
 const obs=(packet.observations as JsonObject[])[0];
 return {report_release:release,release_id:packet.release_id,snapshot_id:packet.snapshot_id,evidence_sha256:packet.content_sha256,
  report_type:type,title:"Transport integration fixture",title_claim_ids:[],content_status:"complete",
  sections:[{id:"s1",heading:"Recorded response",text:"A selected response was retained.",claim_ids:["c1"]}],
  claims:[{id:"c1",text:"A selected response was retained.",kind:"reported",constructs:[],
    scope:{level:"occurrence",occurrence_ids:[obs.occurrence_id],person_ids:[],description:"One recorded occurrence."},
    evidence_ids:[obs.id],counterevidence_ids:[],sequence_edge_ids:[],depends_on_claim_ids:[],support_basis:["direct_report"],rationale:"Transport fixture only.",remaining_uncertainty:[]}],
  name_registry:[],relationships:[],reflection_questions:[]};
}

test("all report inputs use real packets and synthesis waits without dispatching",async()=>{
 const input=await inputs(),directory=await mkdtemp(path.join(os.tmpdir(),"pw-dev-prepare-"));
 try{
  const result=await runReportBatch({...input,directory,types:REPORT_ORDER,mode:"prepare"});
  assert.equal(result.failed,false);assert.equal(result.providerAttempts,0);assert.equal(result.narrativeEvaluation,"not_run");
  for(const type of ["MAP","IFS","PV","ATT"]){
   assert.equal((result.reports[type] as {status:string}).status,"ready_for_generation");
   const request=JSON.parse(await readFile(path.join(directory,type,"prepared.json"),"utf8"));
   assert.doesNotThrow(()=>assertNoRespondentClassification(request));
  }
  assert.equal((result.reports.SYNTHESIS as {status:string}).status,"awaiting_generated_layers");
 }finally{await rm(directory,{recursive:true,force:true});}
});

test("live report generation stops before dispatch when the local identity inventory was not reviewed",async()=>{
 const input=await inputs(),directory=path.join(os.tmpdir(),`pw-dev-unreviewed-${Date.now()}`);let calls=0;
 const transport:OpenRouterTransport={async generate(){calls++;throw new Error("must not dispatch");}};
 await assert.rejects(runReportBatch({...input,directory,types:["IFS"],mode:"generate",transport,aggregateMicros:500_000,perCallMicros:500_000}),/reviewed local identity inventory/u);
 assert.equal(calls,0);
});

test("five real generator/review paths complete with an explicitly deterministic transport; durable attempts are reused",async()=>{
 const input=await inputs(),directory=await mkdtemp(path.join(os.tmpdir(),"pw-dev-generate-"));
 const packets=Object.fromEntries(REPORT_ORDER.map(type=>[type,prepareReport(input.assessment,type==="SYNTHESIS"?"IFS":type,input.questionSource,input.reportSource).packet]));
 const drafts:Partial<Record<ReportType,JsonObject>>={};let calls=0;
 const transport:OpenRouterTransport={async generate(request){
  calls++;
  assert.doesNotThrow(()=>assertNoRespondentClassification(request));
  const type=REPORT_ORDER.find(t=>request.schemaName.toLowerCase().startsWith(`patternwork_${t.toLowerCase()}_`))!;
  assert.ok(type,request.schemaName);
  const packet=packets[type];
  const output=request.schemaName.includes("_review_")
    ? structuralReviewFixture({source:input.reportSource,packet,draft:drafts[type]!})
    : (drafts[type]=draft(packet,type,input.reportSource.policy.release));
  return {ok:true,output,finishReason:"stop",usage:{generationId:`test-${calls}`,inputTokens:0,outputTokens:0,reasoningTokens:0,totalTokens:0,costMicros:0,currency:"USD",model:"offline/mock"}};
 }};
 try{
  const options={...input,directory,types:REPORT_ORDER,mode:"generate" as const,transport,testTransport:true,aggregateMicros:1000000,perCallMicros:100000,exportPdfs:true,pdfVerification:{async verify(bytes:Buffer){
   assert.equal(bytes.subarray(0,5).toString("ascii"),"%PDF-");
   const pageCount=Math.max(...Array.from(bytes.toString("latin1").matchAll(/\/Count (\d+)/gu),m=>Number(m[1])));
   const pngPages=Array.from({length:pageCount},()=>{const png=Buffer.alloc(128);Buffer.from("89504e47","hex").copy(png);return png;});
   return {extractedText:renderPwrp71Markdown(Object.values(drafts)[0]!),pageCount,pngPages};
  }}};
  const result=await runReportBatch(options);
  assert.equal(result.failed,false,JSON.stringify(result.reports));
  assert.equal(calls,10);assert.equal(result.narrativeEvaluation,"deterministic_transport_only");
  assert.equal(result.operationalApproval,false);
  for(const type of REPORT_ORDER){
   const saved=JSON.parse(await readFile(path.join(directory,type,"artifact.json"),"utf8"));
   assert.equal(await readFile(path.join(directory,type,"report.md"),"utf8"),saved.report_markdown);
   const pdf=await readFile(path.join(directory,type,"report.pdf"));
   const verification=JSON.parse(await readFile(path.join(directory,type,"pdf-verification.json"),"utf8"));
   assert.equal(verification.sha256,createHash("sha256").update(pdf).digest("hex"));
  }
  const requestsDirectory=path.join(directory,"provider","requests");
  const requestFiles=await readdir(requestsDirectory);assert.equal(requestFiles.length,10);
  for(const file of requestFiles){
   const exported=JSON.parse(await readFile(path.join(requestsDirectory,file),"utf8"));
   assert.equal(exported.wirePayload.messages[0].content,exported.request.system);
   assert.equal(exported.wirePayload.messages[1].content,exported.request.prompt);
   assert.equal(exported.wirePayload.max_completion_tokens,128000);
   assert.equal(exported.wirePayload.model,"openai/gpt-6-luna");
  }
  const second=await runReportBatch(options);
  assert.equal(second.failed,false,JSON.stringify(second.reports));assert.equal(calls,10,"resume must not repeat settled provider calls");
 }finally{await rm(directory,{recursive:true,force:true});}
});

test("review completeness is not satisfied by a valid schema or by counting words",async()=>{
 const input=await inputs(),{packet}=prepareReport(input.assessment,"IFS",input.questionSource,input.reportSource);
 const value=draft(packet,"IFS",input.reportSource.policy.release);
 const review=structuralReviewFixture({source:input.reportSource,packet,draft:value});
 assert.equal(validatePwrp71ReviewQuality(review,value,packet).length,0);
 const missing=structuredClone(review);(missing.evidence_coverage as JsonObject[]).pop();
 assert.ok(validatePwrp71ReviewQuality(missing,value,packet).some(x=>x.code==="review_coverage_incomplete"));
 const falseAccept=structuredClone(review);((falseAccept.quality_assessment as JsonObject).semantic_completeness as JsonObject).status="revise";
 assert.ok(validatePwrp71ReviewQuality(falseAccept,value,packet).some(x=>x.code==="review_quality_verdict"));
 const duplicate=structuredClone(review);(duplicate.evidence_coverage as JsonObject[]).push((duplicate.evidence_coverage as JsonObject[])[0]);
 assert.ok(validatePwrp71ReviewQuality(duplicate,value,packet).some(x=>x.code==="review_coverage_reference"));
});
