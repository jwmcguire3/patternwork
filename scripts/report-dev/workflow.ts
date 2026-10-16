import { assertAssessmentRoute } from "./verify-assessment.ts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, ReportType } from "../../lib/question-engine/types.ts";
import type { Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import type { Pwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { QUALIFICATION_MODEL_ORDER, type ActivatedReportModelPolicy } from "../../lib/server/openrouter/policy.ts";
import type { OpenRouterTransport } from "../../lib/server/openrouter/types.ts";
import { buildPwqe51RouterPacket } from "../../lib/server/reports/pwqe51-packet.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { pwrp71CanonicalResponseEvidenceFromRoute } from "../../lib/server/reports/pwrp71-response-evidence.ts";
import { generateCanonicalReport } from "../../lib/server/reports/generator.ts";
import { validatePwrp71Review } from "../../lib/server/reports/pwrp71-review.ts";
import { validatePwrp71ReportDraft, type Pwrp71ReportArtifact } from "../../lib/server/reports/pwrp71-validation.ts";
import { FileQualificationAttemptStore, JournaledPwrp71Transport } from "../../lib/server/reports/qualification/attempt-store.ts";
import { assertNoRespondentClassification } from "../../lib/server/reports/content-boundary.ts";
import { canonical, contentHash } from "./source.ts";
import { type AssessmentRecord, writeImmutableJson } from "./assessment.ts";

export const REPORT_ORDER:ReportType[]=["MAP","IFS","PV","ATT","SYNTHESIS"];
/** The existing configured tiers and limits, without manufacturing an activation receipt. */
export function developmentModelPolicy():ActivatedReportModelPolicy {
 return Object.fromEntries(REPORT_ORDER.map(type=>{
  const tier=type==="MAP"?0:type==="IFS"||type==="PV"?1:2;
  return [type,{pinnedTier:tier,model:QUALIFICATION_MODEL_ORDER[tier].model,reasoningEffort:QUALIFICATION_MODEL_ORDER[tier].reasoningEffort,escalationTier:tier+1,escalationModel:QUALIFICATION_MODEL_ORDER[tier+1].model,escalationReasoningEffort:QUALIFICATION_MODEL_ORDER[tier+1].reasoningEffort,maxOutputTokens:type==="MAP"||type==="SYNTHESIS"?16000:20000}];
 })) as ActivatedReportModelPolicy;
}
export function packetFor(assessment:AssessmentRecord,type:ReportType,source:Pwqe51SourcePackage):JsonObject {
 const state=type==="MAP"?assessment.mapping:assessment.deepening;
 return buildPwqe51RouterPacket({snapshotId:`dev-${assessment.contentSha256.slice(0,32)}-${state.pass}`,responses:state.responses,routerResult:state.routerResult,pass:state.pass,controls:state.controls,comparisonDecisions:state.comparisonDecisions,source}) as JsonObject;
}
export function prepareReport(assessment:AssessmentRecord,type:ReportType,questionSource:Pwqe51SourcePackage,reportSource:Pwrp71SourcePackage,acceptedLayers?:Record<string,JsonObject>) {
 const state=type==="MAP"?assessment.mapping:assessment.deepening, packet=packetFor(assessment,type,questionSource);
 const request=preparePwrp71Request({packet,reportType:type,questionSource,reportSource,canonicalResponseEvidence:pwrp71CanonicalResponseEvidenceFromRoute(state.responses,state.routerResult),...(type==="SYNTHESIS"?{acceptedLayers}:{})});
 return {packet,request};
}
export interface RunReportBatchOptions {
 assessment:AssessmentRecord; types:ReportType[]; questionSource:Pwqe51SourcePackage; reportSource:Pwrp71SourcePackage; directory:string;
 mode:"prepare"|"generate"; aggregateMicros?:number; perCallMicros?:number; transport?:OpenRouterTransport;
 /** Injected deterministic transports are allowed only by tests, never exposed by the CLI. */
 testTransport?:boolean;
}
export async function runReportBatch(options:RunReportBatchOptions) {
 const {assessment,types,questionSource,reportSource,directory,mode}=options;
 assertAssessmentRoute(assessment,questionSource);
 const modelPolicy=developmentModelPolicy();
 const binding={schema:"patternwork-report-dev-run-1",assessmentSha256:assessment.contentSha256,questionSourceSha256:questionSource.sourceManifestSha256,reportSourceSha256:reportSource.manifestSha256,types,modelPolicy,mode,aggregateMicros:options.aggregateMicros??0,perCallMicros:options.perCallMicros??0};
 await writeImmutableJson(path.join(directory,"binding.json"),binding);
 const store=new FileQualificationAttemptStore(path.join(directory,"provider"));
 const provider=options.transport?new JournaledPwrp71Transport({store,transport:options.transport,maxCallCostMicros:options.perCallMicros,aggregateCostCapMicros:options.aggregateMicros,usageStatus:options.testTransport?"mock":"reported",onResult:(_request,result)=>{
  if(!options.testTransport&&result.usage.model==="offline/mock") throw new Error("A live development run cannot accept a mock provider response.");
 }}):undefined;
 if(mode==="generate"&&(!provider||!Number.isSafeInteger(options.aggregateMicros)||!Number.isSafeInteger(options.perCallMicros)||options.aggregateMicros!<=0||options.perCallMicros!<=0)) throw new Error("Generation requires a transport and explicit positive aggregate/per-call limits.");
 const layers:Record<string,JsonObject>={}, reports:Record<string,unknown>={};
 let failed=false;
 for(const type of REPORT_ORDER.filter(t=>types.includes(t))) {
  const sub=path.join(directory,type); await mkdir(sub,{recursive:true,mode:0o700});
  try {
   if(type==="SYNTHESIS"&&["IFS","PV","ATT"].some(t=>!layers[t])) {
    reports[type]={stage:"dependencies",status:mode==="prepare"?"awaiting_generated_layers":"blocked",required:["IFS","PV","ATT"],providerCalled:false};
    if(mode==="generate") failed=true;
    await writeImmutableJson(path.join(sub,"dependency-status.json"),reports[type]); continue;
   }
   const {packet,request}=prepareReport(assessment,type,questionSource,reportSource,layers);
   await writeImmutableJson(path.join(sub,"packet.json"),packet);
   await writeImmutableJson(path.join(sub,"prepared.json"),request);
   if(!request.ok) {reports[type]={stage:"adapter",status:"failed",issues:request.issues,providerCalled:false};failed=true;continue;}
   if(mode==="prepare") {reports[type]={stage:"prepared",status:"ready_for_generation",providerCalled:false,observations:(packet.observations as unknown[]).length,claimsEvaluated:0};continue;}
   const events:JsonObject[]=[];
   const outcome=await generateCanonicalReport({reportType:type,input:request.value.user_data,packets:[packet],provider:provider!,invocationKey:`dev:${contentHash(canonical(binding))}:${type}`,spentMicros:0,costCapMicros:options.aggregateMicros!,modelPolicy,contractVersion:"v7.1",pwrp71:{request:request.value,packet,source:reportSource},onPwrp71Event:async event=>{assertNoRespondentClassification(event);events.push(event as unknown as JsonObject);await store.recordGenerationEvent(event);}});
   await writeImmutableJson(path.join(sub,"outcome.json"),outcome);
   await writeImmutableJson(path.join(sub,"events.json"),events);
   if(!outcome.ok) {reports[type]={stage:"generation_or_review",status:"failed",failure:outcome.failure};failed=true;continue;}
   const artifact=outcome.value.artifact as Pwrp71ReportArtifact;
   const receipt=events.filter(e=>e.type==="review_receipt").at(-1)?.receipt as JsonObject|undefined;
   const review=receipt?.review;
   const validated=validatePwrp71Review({value:review,artifact,packet,source:reportSource});
   if(!validated.ok||validated.value.verdict!=="accept") throw new Error("Generated artifact lacks a current accepted review receipt.");
   await writeImmutableJson(path.join(sub,"artifact.json"),artifact);
   await writeImmutableJson(path.join(sub,"review.json"),review);
   const markdown=artifact.report_markdown;
   // JSON is the authoritative immutable record; Markdown is its byte-identical projection.
   await writeFile(path.join(sub,"report.md"),markdown,{mode:0o600});
   if(["IFS","PV","ATT"].includes(type)) layers[type]=artifact.draft;
   reports[type]={stage:"reviewed",status:"accepted_for_this_development_run",structurallyValid:true,review:validated.value.verdict,quality:(review as JsonObject).quality_assessment,words:markdown.trim().split(/\s+/u).length,sections:(artifact.draft.sections as unknown[]).length,operationalApproval:false};
  } catch(error) {
   failed=true; const failure={stage:"runtime",status:"failed",code:error&&typeof error==="object"&&"code" in error?String(error.code):"runtime_failure",message:error instanceof Error?error.message:"Unknown runtime failure"};
   reports[type]=failure; await writeFile(path.join(sub,"failure.json"),JSON.stringify(failure,null,2),{mode:0o600});
  }
 }
 const attempts=await store.list();
 const summary={...binding,reports,failed,providerAttempts:attempts.length,settledCostMicros:attempts.reduce((n,a)=>n+(a.usage?.costMicros??0),0),unknownAttempts:attempts.filter(a=>a.usageStatus==="unknown").map(a=>a.attemptId),operationalApproval:false,narrativeEvaluation:mode==="prepare"?"not_run":options.testTransport?"deterministic_transport_only":"model_review",directory};
 await writeFile(path.join(directory,"summary.json"),`${JSON.stringify(summary,null,2)}\n`,{mode:0o600});
 return summary;
}
export async function validateStoredReport(artifactPath:string,reviewPath:string|undefined,packet:JsonObject,source:Pwrp71SourcePackage,type:ReportType) {
 const raw=JSON.parse(await readFile(artifactPath,"utf8")) as JsonObject;
 const draft=raw.draft??raw;
 const structural=validatePwrp71ReportDraft({value:draft,reportType:type,snapshotId:String(packet.snapshot_id),packet,source});
 if(!structural.ok) return {structural,semanticReview:"not_evaluated"};
 if(raw.artifact_type&&canonical(raw)!==canonical(structural.value)) return {structural:{ok:false,issues:[{code:"artifact_projection",path:"$",message:"Stored artifact differs from the exact validated draft projection or current source."}]},semanticReview:"not_evaluated"};
 const review=reviewPath?validatePwrp71Review({value:JSON.parse(await readFile(reviewPath,"utf8")),artifact:structural.value,packet,source}):undefined;
 return {structural:{ok:true,issues:[]},semanticReview:review??"not_supplied",operationalApproval:false};
}
