import { REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1 } from "../../lib/server/openrouter/policy.ts";
import { writeHistoricalRunFixture } from "./historical-run-fixture.ts";
import assert from "node:assert/strict";
import { cp,mkdir,mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { JsonObject,ReportType } from "../../lib/question-engine/types.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage, type Pwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { runAssessmentPlan } from "../../scripts/report-dev/assessment.ts";
import { loadPwrp71ContinuationSeed,loadPwrp71ReviewRetrySeed,prepareReport,runReportBatch } from "../../scripts/report-dev/workflow.ts";
import { structuralReviewFixture } from "../../lib/server/reports/qualification/review-fixture.ts";

async function inputs(){
 const [questionSource,reportSource]=await Promise.all([loadPwqe51SourcePackage(),loadPwrp71SourcePackage()]);
 const assessment=runAssessmentPlan(JSON.parse(await readFile("scripts/report-dev/cases/ellis.json","utf8")),questionSource);
 return {assessment,questionSource,reportSource};
}
function draft(packet:JsonObject,type:ReportType,release:string):JsonObject{
 const obs=(packet.observations as JsonObject[])[0];
 return {report_release:release,release_id:packet.release_id,snapshot_id:packet.snapshot_id,evidence_sha256:packet.content_sha256,
  report_type:type,title:"Isolated lineage fixture",title_claim_ids:[],content_status:"complete",
  sections:[{id:"s1",heading:"Recorded response",text:"A selected response was retained.",claim_ids:["c1"]}],
  claims:[{id:"c1",text:"A selected response was retained.",kind:"reported",constructs:[],
    scope:{level:"occurrence",occurrence_ids:[obs.occurrence_id],person_ids:[],description:"One recorded occurrence."},
    evidence_ids:[obs.id],counterevidence_ids:[],sequence_edge_ids:[],depends_on_claim_ids:[],support_basis:["direct_report"],rationale:"Fixture only.",remaining_uncertainty:[]}],
  name_registry:[],relationships:[],reflection_questions:[]};
}
function revise(source:Pwrp71SourcePackage,packet:JsonObject,value:JsonObject):JsonObject{
 const result=structuralReviewFixture({source,packet,draft:value,verdict:"revise",issues:[{
  id:"i1",category:"voice",claim_ids:["c1"],section_ids:["s1"],name_ids:[],relationship_ids:[],evidence_ids:[],
  reason:"The fixture requests a bounded wording revision.",requested_change:"Clarify the sentence without changing its evidence scope.",
 }]});
 (result.quality_assessment as JsonObject).narrative_quality={status:"revise",rationale:"A bounded wording revision is requested."};
 return result;
}
async function markFixtureUsageReported(directory:string){
 const attemptsPath=path.join(directory,"provider/attempts.json"),attempts=JSON.parse(await readFile(attemptsPath,"utf8")) as {attempts:Array<Record<string,unknown>>};
 for(const attempt of attempts.attempts)attempt.usageStatus="reported";
 await writeFile(attemptsPath,`${JSON.stringify(attempts,null,2)}\n`);
}

async function makeLineage(root:string){
 const input=await inputs(),runs=path.join(root,"runs");await mkdir(runs,{recursive:true});
 const {packet}=prepareReport(input.assessment,"IFS",input.questionSource,input.reportSource);
 const initialDirectory=path.join(runs,"initial-review-validation-failure");
 const initialDraft=draft(packet,"IFS",input.reportSource.policy.release);
 const invalid=structuralReviewFixture({source:input.reportSource,packet,draft:initialDraft});
 (invalid.evidence_coverage as JsonObject[])[0].disposition="missing";
 const initial=await writeHistoricalRunFixture({...input,directory:initialDirectory,mode:"generate",steps:[{phase:"initial",output:initialDraft},{phase:"review",output:invalid}]});
 assert.equal((initial.reports.IFS as {failure?:{code:string}}).failure?.code,"review_validation_failed",JSON.stringify(initial.reports));
 await markFixtureUsageReported(initialDirectory);
 const retrySeed=await loadPwrp71ReviewRetrySeed({sourceRunDirectory:initialDirectory,outputRoot:root,...input});
 const parentDirectory=path.join(runs,"review-retry-parent");
 await writeHistoricalRunFixture({...input,directory:parentDirectory,mode:"review-retry",reviewRetry:retrySeed,steps:[{phase:"review_retry",output:revise(input.reportSource,packet,retrySeed.previousDraft)}]});
 await markFixtureUsageReported(parentDirectory);
 const parentSeed=await loadPwrp71ContinuationSeed({sourceRunDirectory:parentDirectory,outputRoot:root,...input});
 const continueDirectory=path.join(runs,"demonstrated-continue");
 const replacement=draft(packet,"IFS",input.reportSource.policy.release);
 await writeHistoricalRunFixture({...input,directory:continueDirectory,mode:"continue",continuation:parentSeed,steps:[{phase:"repair",output:replacement},{phase:"review_after_repair",output:revise(input.reportSource,packet,replacement)}]});
 await markFixtureUsageReported(continueDirectory);
 return {input,continueDirectory,parentDirectory};
}

test("accepts an isolated two-attempt continue run with a validated review-retry parent",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"pw-continue-lineage-"));
 try{
  const fixture=await makeLineage(root);
  const seed=await loadPwrp71ContinuationSeed({sourceRunDirectory:fixture.continueDirectory,outputRoot:root,...fixture.input});
  assert.equal(seed.sourceDraftSha256.length,64);
  assert.equal(seed.sourceReviewSha256.length,64);
  assert.equal(seed.sourceRunBindingSha256.length,64);
 }finally{await rm(root,{recursive:true,force:true});}
});

test("refuses continuation journals with unknown attempts and ambiguous exact parents",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"pw-continue-lineage-"));
 const ambiguousRoot=await mkdtemp(path.join(os.tmpdir(),"pw-continue-ambiguous-"));
 try{
  const fixture=await makeLineage(root),attemptsPath=path.join(fixture.continueDirectory,"provider/attempts.json");
  const attempts=JSON.parse(await readFile(attemptsPath,"utf8")) as {attempts:Array<Record<string,unknown>>};attempts.attempts[0].usageStatus="unknown";
  await writeFile(attemptsPath,JSON.stringify(attempts));
  await assert.rejects(loadPwrp71ContinuationSeed({sourceRunDirectory:fixture.continueDirectory,outputRoot:root,...fixture.input}),/unsettled/u);

  const ambiguous=await makeLineage(ambiguousRoot);
  await cp(ambiguous.parentDirectory,path.join(ambiguousRoot,"runs","duplicate-parent"),{recursive:true});
  await assert.rejects(loadPwrp71ContinuationSeed({sourceRunDirectory:ambiguous.continueDirectory,outputRoot:ambiguousRoot,...ambiguous.input}),/missing or ambiguous/u);
 }finally{await Promise.all([rm(root,{recursive:true,force:true}),rm(ambiguousRoot,{recursive:true,force:true})]);}
});


test("historical 20k candidates cannot dispatch new generation or recovery calls, including deterministic transports", async () => {
 const input = await inputs();
 const root = await mkdtemp(path.join(os.tmpdir(), "pw-historical-block-"));
 let calls = 0;
 try {
  for (const mode of ["generate", "continue", "review-retry", "review-closure"] as const) {
   await assert.rejects(runReportBatch({ ...input, directory:path.join(root,mode), types:["IFS"], mode,
    candidateId:REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id, testTransport:true, aggregateMicros:500_000, perCallMicros:500_000,
    transport:{ async generate() { calls++; throw new Error("Historical candidate reached transport."); } },
   }), /Historical 20k candidates cannot make new calls/u);
  }
  assert.equal(calls, 0);
 } finally { await rm(root, {recursive:true,force:true}); }
});
