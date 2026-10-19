import { PWRP71_QUESTION_CONTEXT_VERSION } from "../../lib/server/reports/pwrp71-question-context.ts";
import { PWRP71_REFERENCE_SCHEMA_VERSION } from "../../lib/server/reports/pwrp71-reference-schema.ts";
import { assertAssessmentRoute } from "./verify-assessment.ts";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, ReportType } from "../../lib/question-engine/types.ts";
import type { Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import type { Pwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { QUALIFICATION_MODEL_ORDER, REPORT_OUTPUT_TOKEN_LIMIT, REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1, REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2, reportDevCandidate, type ActivatedReportModelPolicy, type ReportDevCandidateAdmission } from "../../lib/server/openrouter/policy.ts";
import type { OpenRouterTransport, ProviderPrivacyIdentityContext } from "../../lib/server/openrouter/types.ts";
import { REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT } from "../../lib/server/openrouter/privacy-boundary.ts";
import { GPT6_LUNA_BILLING_BASIS_SHA256, GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY, reportBillingBasisSha256, reportDevProviderPolicy } from "../../lib/server/openrouter/qualification-budget.ts";
import { buildPwqe51RouterPacket } from "../../lib/server/reports/pwqe51-packet.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { pwrp71CanonicalResponseEvidenceFromRoute } from "../../lib/server/reports/pwrp71-response-evidence.ts";
import { generateCanonicalReport, PWRP71_INPUT_GUIDANCE_VERSION, PWRP71_REPAIR_STRATEGY_VERSION, PWRP71_GENERATION_REPAIR_VERSION, PWRP71_SCOPE_GUIDANCE_VERSION, type Pwrp71ContinuationSeed, type Pwrp71ReviewRetrySeed, type Pwrp71CitationClosureSeed } from "../../lib/server/reports/generator.ts";
import { derivePwrp71Citations } from "../../lib/server/reports/pwrp71-citation-derivation.ts";
import { validatePwrp71Review } from "../../lib/server/reports/pwrp71-review.ts";
import { validatePwrp71ReportDraft, type Pwrp71ReportArtifact } from "../../lib/server/reports/pwrp71-validation.ts";
import { FileQualificationAttemptStore, JournaledPwrp71Transport } from "../../lib/server/reports/qualification/attempt-store.ts";
import { assertNoRespondentClassification, assertNoRespondentFullName, assertNoRespondentFullNameInGeneratedDraft, assertNoRespondentFullNameInPwrp71ModelInput } from "../../lib/server/reports/content-boundary.ts";
import { canonical, contentHash } from "./source.ts";
import { type AssessmentRecord, writeImmutableJson } from "./assessment.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { buildOpenRouterWirePayload } from "../../lib/server/openrouter/wire.ts";
import { renderAndVerifyCanonicalPdf, type PdfVerificationBoundary } from "../../lib/server/pdf/index.ts";

export const REPORT_ORDER:ReportType[]=["MAP","IFS","PV","ATT","SYNTHESIS"];
/** Existing configured tiers, or the one fixed unqualified IFS development candidate. */
export function developmentModelPolicy(candidateId?:string):ActivatedReportModelPolicy {
 const policy=Object.fromEntries(REPORT_ORDER.map(type=>{
  const tier=type==="MAP"?0:type==="IFS"||type==="PV"?1:2;
  return [type,{pinnedTier:tier,model:QUALIFICATION_MODEL_ORDER[tier].model,reasoningEffort:QUALIFICATION_MODEL_ORDER[tier].reasoningEffort,escalationTier:tier+1,escalationModel:QUALIFICATION_MODEL_ORDER[tier+1].model,escalationReasoningEffort:QUALIFICATION_MODEL_ORDER[tier+1].reasoningEffort,maxOutputTokens:REPORT_OUTPUT_TOKEN_LIMIT}];
 })) as ActivatedReportModelPolicy;
 if(candidateId===undefined)return policy;
 const candidate=reportDevCandidate(candidateId);
 if(!candidate)throw new Error("Unknown report-dev candidate; model and effort overrides are not supported.");
 const base=candidate.maxOutputTokens===REPORT_OUTPUT_TOKEN_LIMIT?policy:Object.fromEntries(REPORT_ORDER.map(type=>[type,{...policy[type],maxOutputTokens:type==="MAP"||type==="SYNTHESIS"?16000:20000}])) as ActivatedReportModelPolicy;
 return {...base,IFS:{pinnedTier:1,model:candidate.model,reasoningEffort:candidate.reasoningEffort,escalationTier:1,escalationModel:candidate.model,escalationReasoningEffort:candidate.reasoningEffort,maxOutputTokens:candidate.maxOutputTokens}};
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
 mode:"prepare"|"generate"|"continue"|"review-retry"|"review-closure"; aggregateMicros?:number; perCallMicros?:number; transport?:OpenRouterTransport;
 /** Local-only comparison values; never written to run artifacts or provider requests. */
 privacyIdentityContext?:ProviderPrivacyIdentityContext;
 candidateId?:ReportDevCandidateAdmission["candidateId"];
 continuation?:Pwrp71ContinuationSeed;
 continuationStructuralRepair?:boolean;
 reviewRetry?:Pwrp71ReviewRetrySeed;
 citationClosure?:Pwrp71CitationClosureSeed;
 /** Injected deterministic transports are allowed only by tests, never exposed by the CLI. */
 testTransport?:boolean;
 /** Use the application's canonical renderer and text/raster verification. */
 exportPdfs?:boolean;
 /** Verification injection requires the explicit deterministic test transport. */
 pdfVerification?:PdfVerificationBoundary;
}

function object(value:unknown):Record<string,unknown>|undefined {
 return typeof value==="object"&&value!==null&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
}

function isJsonObject(value:unknown):value is JsonObject {
 return object(value)!==undefined;
}

function assertSame(left:unknown,right:unknown,message:string):void {
 if(canonical(left)!==canonical(right))throw new Error(message);
}

/** Reconstruct only the final, journaled review-rejected IFS draft after proving every current source binding. */
export async function loadPwrp71ContinuationSeed(input:{
 sourceRunDirectory:string; outputRoot:string; assessment:AssessmentRecord; questionSource:Pwqe51SourcePackage; reportSource:Pwrp71SourcePackage; candidateId?:string;
}):Promise<Pwrp71ContinuationSeed> {
 const root=await realpath(input.outputRoot),sourceDirectory=await realpath(input.sourceRunDirectory);
 const relative=path.relative(root,sourceDirectory);
 if(relative===".."||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error("Continuation source must be a completed run inside the selected report output root.");
 const readJson=async(file:string)=>JSON.parse(await readFile(path.join(sourceDirectory,file),"utf8")) as unknown;
 const binding=object(await readJson("binding.json")),summary=object(await readJson("summary.json"));
 const active128k=object(binding?.candidate)?.id===REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.id;
 if(input.candidateId===REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.id&&!active128k)throw new Error("The active 128k continuation requires a source from the same fixed 128k candidate.");
 if(active128k&&binding?.mode!=="generate"&&binding?.mode!=="continue")throw new Error("The active 128k continuation requires a direct generation or one bounded first continuation.");
 if(binding?.mode==="review-closure") {
  const {loadPwrp71ContinuationFromCitationReview}=await import("./citation-continuation.ts");
  return loadPwrp71ContinuationFromCitationReview(input);
 }
 if(binding?.mode==="review-retry")return loadPwrp71ContinuationFromReviewRetry({root,sourceDirectory,assessment:input.assessment,questionSource:input.questionSource,reportSource:input.reportSource});
 if(binding?.mode==="continue")return loadPwrp71ContinuationFromContinue({root,sourceDirectory,assessment:input.assessment,questionSource:input.questionSource,reportSource:input.reportSource});
 const attemptFile=object(await readJson("provider/attempts.json"));
 const priorPacket=await readJson("IFS/packet.json"),priorPrepared=await readJson("IFS/prepared.json");
 const eventsValue=await readJson("IFS/events.json"),events=Array.isArray(eventsValue)?eventsValue.map(object).filter((row):row is Record<string,unknown>=>row!==undefined):[];
 if(!binding||!summary||!attemptFile||!Array.isArray(attemptFile.attempts))throw new Error("Continuation source run records are incomplete.");
 const attempts=attemptFile.attempts.map(object).filter((row):row is Record<string,unknown>=>row!==undefined);
 const bindingSha256=contentHash(canonical(binding));
 const expectedCandidate=active128k?REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2:REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1;
 const expectedCandidateSha256=sha256Canonical(expectedCandidate);
 const expectedPolicy=developmentModelPolicy(expectedCandidate.id);
 if(active128k) {
  const versions={inputGuidanceVersion:PWRP71_INPUT_GUIDANCE_VERSION,questionContextVersion:PWRP71_QUESTION_CONTEXT_VERSION,scopeGuidanceVersion:PWRP71_SCOPE_GUIDANCE_VERSION,referenceSchemaVersion:PWRP71_REFERENCE_SCHEMA_VERSION,generationRepairVersion:PWRP71_GENERATION_REPAIR_VERSION,reviewReplacementStructuralRepairLimit:1,unsuccessfulResponsePolicy:REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.unsuccessfulResponsePolicy};
  for(const [key,value] of Object.entries(versions))if(binding[key]!==value||summary[key]!==value)throw new Error("The 128k continuation source has stale generation or interpretation versions.");
  if(attemptFile.schemaVersion!==1)throw new Error("The 128k continuation journal version is unsupported.");
 }
 const summaryReports=object(summary.reports),ifsSummary=object(summaryReports?.IFS),ifsFailure=object(ifsSummary?.failure);
 const summaryDirectory=typeof summary.directory==="string"?path.resolve(summary.directory):"";
 if(binding.schema!=="patternwork-report-dev-run-2"
  ||binding.mode!=="generate"||binding.assessmentSha256!==input.assessment.contentSha256
  ||binding.questionSourceSha256!==input.questionSource.sourceManifestSha256
  ||binding.reportSourceSha256!==input.reportSource.manifestSha256
  ||canonical(binding.types)!==canonical(["IFS"])
  ||canonical(binding.modelPolicy)!==canonical(expectedPolicy)
  ||canonical(binding.candidate)!==canonical(expectedCandidate)
  ||binding.candidateSha256!==expectedCandidateSha256
  ||canonical(binding.providerPolicy)!==canonical(GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY)
  ||binding.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256
  ||binding.operationalApproval!==false
  ||typeof binding.aggregateMicros!=="number"||binding.aggregateMicros<=0||binding.aggregateMicros>1_000_000
  ||typeof binding.perCallMicros!=="number"||binding.perCallMicros<=0||binding.perCallMicros>500_000
  ||summaryDirectory!==sourceDirectory||summary.mode!=="generate"
  ||summary.assessmentSha256!==input.assessment.contentSha256
  ||summary.questionSourceSha256!==input.questionSource.sourceManifestSha256
  ||summary.reportSourceSha256!==input.reportSource.manifestSha256
  ||canonical(summary.types)!==canonical(["IFS"])
  ||summary.candidateSha256!==expectedCandidateSha256
  ||summary.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256
  ||summary.aggregateMicros!==binding.aggregateMicros||summary.perCallMicros!==binding.perCallMicros
  ||summary.operationalApproval!==false
  ||ifsSummary?.status!=="failed"||ifsFailure?.code!=="review_not_accepted"
  ||summary.failed!==true||!Array.isArray(summary.unknownAttempts)||summary.unknownAttempts.length>0
  ||attempts.length===0||summary.providerAttempts!==attempts.length) {
  throw new Error("Continuation source is not a completed, same-assessment report-dev IFS run rejected only at review.");
 }
 assertSame(summary.modelPolicy,expectedPolicy,"Continuation source model policy differs from the fixed report-dev candidate.");
 assertSame(summary.providerPolicy,GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,"Continuation source provider privacy policy differs from the current no-collection route.");
 const spent=attempts.reduce((total,attempt)=>{
  const usage=object(attempt.usage),cost=usage?.costMicros;
  const request=object(attempt.request),admission=object(attempt.candidateAdmission);
  if(attempt.status!=="completed"||attempt.usageStatus!=="reported"||!Number.isSafeInteger(cost)||typeof cost!=="number"||cost<0
   ||typeof attempt.maximumCallCostMicros!=="number"||attempt.maximumCallCostMicros>500_000
   ||request?.idempotencyKey!==attempt.attemptId||request?.requestedModel!==expectedCandidate.model
   ||request?.requestedReasoningEffort!==expectedCandidate.reasoningEffort
   ||request?.maxOutputTokens!==expectedCandidate.maxOutputTokens
   ||admission?.scope!=="report-dev-experimental-v1"||admission.candidateId!==expectedCandidate.id
   ||admission.candidateSha256!==expectedCandidateSha256||admission.runBindingSha256!==bindingSha256)throw new Error("Continuation source has unsettled, mismatched, or over-cap provider attempts.");
  return total+cost;
 },0);
 if(spent!==summary.settledCostMicros||spent>binding.aggregateMicros)throw new Error("Continuation source spend does not reconcile to its attempt journal.");

 const current=prepareReport(input.assessment,"IFS",input.questionSource,input.reportSource);
 if(!current.request.ok)throw new Error("Current IFS assessment cannot be prepared for continuation.");
 assertNoRespondentFullName(current.packet);
 assertNoRespondentFullNameInPwrp71ModelInput(current.request.value.user_data);
 assertSame(priorPacket,current.packet,"Continuation packet differs from the original run evidence.");
 assertSame(priorPrepared,current.request,"Continuation prepared input differs from the original run input.");

 const parentPrefix=`dev:${bindingSha256}:IFS:`;
 const reviewAttempts=attempts.filter((attempt)=>{
  const request=object(attempt.request),id=typeof attempt.attemptId==="string"?attempt.attemptId:"";
  return request?.schemaName==="patternwork_ifs_pwrp71_review_candidate_3"
   &&id.startsWith(`${parentPrefix}review_after_repair:${expectedCandidate.id}:attempt-`);
 });
 if(reviewAttempts.length!==1)throw new Error("Continuation source does not have exactly one final fresh-review attempt.");
 const finalReviewAttempt=reviewAttempts[0],reviewResult=object(finalReviewAttempt.providerResult),receipt=object(finalReviewAttempt.reviewReceipt);
 if(active128k&&attempts.at(-1)!==finalReviewAttempt)throw new Error("The 128k continuation must use the final journaled review.");
 if(finalReviewAttempt.status!=="completed"||reviewResult?.ok!==true||receipt?.verdict!=="revise"
  ||receipt.reviewed_draft_sha256===undefined||!isJsonObject(receipt.review))throw new Error("Continuation source final review is not a durable revision receipt.");
 const reviewOutput=object(reviewResult.output);
 if(!reviewOutput)throw new Error("Continuation source final reviewer output is missing.");
 assertSame(reviewOutput,receipt.review,"Continuation source review receipt differs from its provider result.");
 const reviewEvent=events.filter((event)=>event.type==="review_receipt"&&event.attemptId===finalReviewAttempt.attemptId);
 if(reviewEvent.length!==1)throw new Error("Continuation source final review event is missing or ambiguous.");
 assertSame(reviewEvent[0].receipt,receipt,"Continuation source review event differs from its journal receipt.");

 const draftAttempts=attempts.filter((attempt)=>{
  const request=object(attempt.request),validation=object(attempt.validation),id=typeof attempt.attemptId==="string"?attempt.attemptId:"";
  return request?.schemaName==="patternwork_ifs_pwrp71_candidate_1"&&validation?.ok===true
   &&validation.draftSha256===receipt.reviewed_draft_sha256
   &&id.startsWith(`${parentPrefix}repair:${expectedCandidate.id}:attempt-`);
 });
 if(draftAttempts.length!==1)throw new Error("Continuation source cannot identify one exact final validated draft for the review.");
 const finalDraftAttempt=draftAttempts[0],draftResult=object(finalDraftAttempt.providerResult),draftOutput=object(draftResult?.output);
 if(active128k&&(attempts.indexOf(finalDraftAttempt)>=attempts.indexOf(finalReviewAttempt)||attempts.slice(attempts.indexOf(finalDraftAttempt)+1).some(attempt=>object(attempt.request)?.schemaName==="patternwork_ifs_pwrp71_candidate_1")))throw new Error("The 128k continuation review must cover the final writer output.");
 if(finalDraftAttempt.status!=="completed"||draftResult?.ok!==true||!draftOutput)throw new Error("Continuation source final draft is not durably available.");
 const draftEvent=events.filter((event)=>event.type==="draft_validation"&&event.attemptId===finalDraftAttempt.attemptId&&event.ok===true&&event.draftSha256===receipt.reviewed_draft_sha256);
 if(draftEvent.length!==1)throw new Error("Continuation source final structural validation event is missing or ambiguous.");

 assertNoRespondentFullNameInGeneratedDraft(draftOutput);
 assertNoRespondentFullName(receipt.review);
 assertNoRespondentClassification(receipt.review);
 const artifact=validatePwrp71ReportDraft({value:draftOutput,reportType:"IFS",snapshotId:String((current.packet as Record<string,unknown>).snapshot_id),packet:current.packet,source:input.reportSource});
 if(!artifact.ok||sha256Canonical(artifact.value.draft)!==receipt.reviewed_draft_sha256)throw new Error("Continuation source final draft no longer validates against current evidence.");
 const validatedReview=validatePwrp71Review({value:receipt.review,artifact:artifact.value,packet:current.packet,source:input.reportSource});
 if(!validatedReview.ok||validatedReview.value.verdict!=="revise")throw new Error("Continuation source final review no longer validates against current evidence.");
 const sourceReviewSha256=sha256Canonical(validatedReview.value.review);
 if(sourceReviewSha256!==receipt.review_sha256)throw new Error("Continuation source review digest does not match its durable receipt.");

 return {
  previousDraft:artifact.value.draft,
  previousReview:validatedReview.value.review,
  sourceRunBindingSha256:bindingSha256,
  sourceDraftSha256:receipt.reviewed_draft_sha256,
  sourceReviewSha256,
  sourceDraftAttemptId:String(finalDraftAttempt.attemptId),
  sourceReviewAttemptId:String(finalReviewAttempt.attemptId),
 };
}

/** Reconstruct only the final structurally validated draft from a review-validation failure. */
export async function loadPwrp71ReviewRetrySeed(input:{
 sourceRunDirectory:string; outputRoot:string; assessment:AssessmentRecord; questionSource:Pwqe51SourcePackage; reportSource:Pwrp71SourcePackage;
}):Promise<Pwrp71ReviewRetrySeed> {
 const root=await realpath(input.outputRoot),sourceDirectory=await realpath(input.sourceRunDirectory);
 const relative=path.relative(root,sourceDirectory);
 if(relative===".."||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error("Review-retry source must be a completed run inside the selected report output root.");
 const readJson=async(file:string)=>JSON.parse(await readFile(path.join(sourceDirectory,file),"utf8")) as unknown;
 const binding=object(await readJson("binding.json")),summary=object(await readJson("summary.json"));
 const attemptFile=object(await readJson("provider/attempts.json"));
 const priorPacket=await readJson("IFS/packet.json"),priorPrepared=await readJson("IFS/prepared.json");
 const eventsValue=await readJson("IFS/events.json"),events=Array.isArray(eventsValue)?eventsValue.map(object).filter((row):row is Record<string,unknown>=>row!==undefined):[];
 if(!binding||!summary||!attemptFile||attemptFile.schemaVersion!==1||!Array.isArray(attemptFile.attempts))throw new Error("Review-retry source run records are incomplete.");
 const attempts=attemptFile.attempts.map(object).filter((row):row is Record<string,unknown>=>row!==undefined);
 const bindingSha256=contentHash(canonical(binding));
 const expectedCandidateSha256=sha256Canonical(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1);
 const expectedPolicy=developmentModelPolicy(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id);
 const summaryReports=object(summary.reports),ifsSummary=object(summaryReports?.IFS),ifsFailure=object(ifsSummary?.failure);
 const summaryDirectory=typeof summary.directory==="string"?path.resolve(summary.directory):"";
 if(binding.schema!=="patternwork-report-dev-run-2"
  ||binding.mode!=="generate"||binding.assessmentSha256!==input.assessment.contentSha256
  ||binding.questionSourceSha256!==input.questionSource.sourceManifestSha256
  ||binding.reportSourceSha256!==input.reportSource.manifestSha256
  ||canonical(binding.types)!==canonical(["IFS"])
  ||canonical(binding.modelPolicy)!==canonical(expectedPolicy)
  ||canonical(binding.candidate)!==canonical(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1)
  ||binding.candidateSha256!==expectedCandidateSha256
  ||canonical(binding.providerPolicy)!==canonical(GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY)
  ||binding.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256
  ||binding.operationalApproval!==false
  ||typeof binding.aggregateMicros!=="number"||binding.aggregateMicros<=0||binding.aggregateMicros>1_000_000
  ||typeof binding.perCallMicros!=="number"||binding.perCallMicros<=0||binding.perCallMicros>500_000
  ||summaryDirectory!==sourceDirectory||summary.mode!=="generate"
  ||summary.assessmentSha256!==input.assessment.contentSha256
  ||summary.questionSourceSha256!==input.questionSource.sourceManifestSha256
  ||summary.reportSourceSha256!==input.reportSource.manifestSha256
  ||canonical(summary.types)!==canonical(["IFS"])
  ||summary.candidateSha256!==expectedCandidateSha256
  ||summary.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256
  ||summary.aggregateMicros!==binding.aggregateMicros||summary.perCallMicros!==binding.perCallMicros
  ||summary.operationalApproval!==false
  ||ifsSummary?.status!=="failed"||ifsFailure?.code!=="review_validation_failed"
  ||summary.failed!==true||!Array.isArray(summary.unknownAttempts)||summary.unknownAttempts.length!==0
  ||attempts.length===0||summary.providerAttempts!==attempts.length) {
  throw new Error("Review-retry source is not a completed same-assessment IFS run that failed only reviewer validation.");
 }
 assertSame(summary.modelPolicy,expectedPolicy,"Review-retry source model policy differs from the fixed report-dev candidate.");
 assertSame(summary.providerPolicy,GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,"Review-retry source provider privacy policy differs from the current route.");
 const sourceAggregateMicros=binding.aggregateMicros as number;
 const sourcePerCallMicros=binding.perCallMicros as number;
 const spent=attempts.reduce((total,attempt)=>{
  const usage=object(attempt.usage),cost=usage?.costMicros;
  const request=object(attempt.request),admission=object(attempt.candidateAdmission);
  const id=typeof attempt.attemptId==="string"?attempt.attemptId:"";
  const keyPrefix=`dev:${bindingSha256}:IFS:`;
  if(attempt.status!=="completed"||attempt.usageStatus!=="reported"||!Number.isSafeInteger(cost)||typeof cost!=="number"||cost<0
   ||typeof attempt.maximumCallCostMicros!=="number"||attempt.maximumCallCostMicros<=0||attempt.maximumCallCostMicros>sourcePerCallMicros||attempt.maximumCallCostMicros>500_000
   ||attempt.aggregateCostCapMicros!==sourceAggregateMicros||attempt.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256
   ||cost>attempt.maximumCallCostMicros||request?.idempotencyKey!==id||!id.startsWith(keyPrefix)
   ||!new RegExp(`^(?:initial|repair|escalation|review|review_after_repair):${REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id}:attempt-[1-9][0-9]*$` ,"u").test(id.slice(keyPrefix.length))
   ||request?.requestedModel!==REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.model
   ||request?.requestedReasoningEffort!==REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.reasoningEffort
   ||request?.maxOutputTokens!==REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.maxOutputTokens
   ||admission?.scope!=="report-dev-experimental-v1"||admission.candidateId!==REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id
   ||admission.candidateSha256!==expectedCandidateSha256||admission.runBindingSha256!==bindingSha256)throw new Error("Review-retry source has unsettled, mismatched, or over-cap provider attempts.");
  return total+cost;
 },0);
 if(spent!==summary.settledCostMicros||spent>sourceAggregateMicros)throw new Error("Review-retry source spend does not reconcile to its attempt journal.");

 const current=prepareReport(input.assessment,"IFS",input.questionSource,input.reportSource);
 if(!current.request.ok)throw new Error("Current IFS assessment cannot be prepared for review retry.");
 assertNoRespondentFullName(current.packet);
 assertNoRespondentFullNameInPwrp71ModelInput(current.request.value.user_data);
 assertSame(priorPacket,current.packet,"Review-retry packet differs from the original run evidence.");
 assertSame(priorPrepared,current.request,"Review-retry prepared input differs from the original run input.");

 const reviewValidationEvents=events.map((event,index)=>({event,index})).filter(({event})=>event.type==="review_validation");
 if(reviewValidationEvents.length!==1)throw new Error("Review-retry source must have exactly one failed review-validation event.");
 const {event:reviewEvent,index:reviewEventIndex}=reviewValidationEvents[0];
 const reviewIssues=Array.isArray(reviewEvent.issues)?reviewEvent.issues.map(object).filter((issue):issue is Record<string,unknown>=>issue!==undefined):[];
 const issuePaths=reviewIssues.map((issue)=>({code:issue.code,path:issue.path}));
 if(reviewEvent.ok!==false||reviewEvent.reportType!=="IFS"||typeof reviewEvent.attemptId!=="string"||reviewIssues.length===0
  ||reviewIssues.some((issue)=>issue.code!=="review_coverage_omission"||typeof issue.path!=="string"||!/^\$\.evidence_coverage\[\d+\]$/u.test(issue.path))) {
  throw new Error("Review-retry source failure is outside the one sanitized coverage-omission case.");
 }
 const failureIssues=Array.isArray(ifsFailure?.issues)?ifsFailure.issues.map(object).filter((issue):issue is Record<string,unknown>=>issue!==undefined):[];
 if(canonical(failureIssues.map((issue)=>({code:issue.code,path:issue.path})))!==canonical(issuePaths))throw new Error("Review-retry failure summary does not match the sanitized review event.");
 const reviewAttemptId=reviewEvent.attemptId;
 const reviewAttempts=attempts.map((attempt,index)=>({attempt,index})).filter(({attempt})=>attempt.attemptId===reviewAttemptId);
 if(reviewAttempts.length!==1)throw new Error("Review-retry source does not identify exactly one failed review attempt.");
 const {attempt:reviewAttempt,index:reviewAttemptIndex}=reviewAttempts[0];
 const reviewRequest=object(reviewAttempt.request),reviewResult=object(reviewAttempt.providerResult),reviewValidation=object(reviewAttempt.validation);
 const journalReviewIssues=Array.isArray(reviewValidation?.issues)?reviewValidation.issues.map(object).filter((issue):issue is Record<string,unknown>=>issue!==undefined).map((issue)=>({code:issue.code,path:issue.path})):[];
 if(reviewAttemptIndex!==attempts.length-1||reviewEventIndex!==events.length-1
  ||reviewAttempt.status!=="completed"||reviewAttempt.usageStatus!=="reported"||reviewRequest?.schemaName!=="patternwork_ifs_pwrp71_review_candidate_3"
  ||reviewAttempt.finishReason!=="stop"||reviewResult?.ok!==true||reviewValidation?.ok!==false
  ||canonical(journalReviewIssues)!==canonical(issuePaths)||reviewAttempt.reviewReceipt!==undefined
  ||events.some((event)=>event.type==="review_receipt"&&event.attemptId===reviewAttemptId)) {
  throw new Error("Review-retry source final failed-review attempt is incomplete or inconsistent.");
 }

 const priorEvents=events.slice(0,reviewEventIndex).filter((event)=>event.type==="draft_validation");
 const finalDraftEvent=priorEvents.at(-1);
 if(!finalDraftEvent||finalDraftEvent.ok!==true||typeof finalDraftEvent.attemptId!=="string"||typeof finalDraftEvent.draftSha256!=="string"||!/^[a-f0-9]{64}$/u.test(finalDraftEvent.draftSha256)) {
  throw new Error("Review-retry source has no final successful draft validation before its failed review.");
 }
 const draftAttempts=attempts.map((attempt,index)=>({attempt,index})).filter(({attempt})=>attempt.attemptId===finalDraftEvent.attemptId);
 if(draftAttempts.length!==1)throw new Error("Review-retry source does not identify exactly one final draft attempt.");
 const {attempt:draftAttempt,index:draftAttemptIndex}=draftAttempts[0];
 const draftRequest=object(draftAttempt.request),draftResult=object(draftAttempt.providerResult),draftValidation=object(draftAttempt.validation);
 const draftOutput=object(draftResult?.output);
 const draftSchemaName="patternwork_ifs_pwrp71_candidate_1";
 if(draftAttemptIndex>=reviewAttemptIndex||draftAttempt.status!=="completed"||draftAttempt.usageStatus!=="reported"
  ||draftRequest?.schemaName!==draftSchemaName||draftAttempt.finishReason!=="stop"||draftResult?.ok!==true||!draftOutput
  ||draftValidation?.ok!==true||draftValidation.draftSha256!==finalDraftEvent.draftSha256
  ||events.filter((event)=>event.type==="draft_validation"&&event.attemptId===finalDraftEvent.attemptId&&event.ok===true&&event.draftSha256===finalDraftEvent.draftSha256).length!==1) {
  throw new Error("Review-retry source final draft attempt is incomplete or inconsistent.");
 }
 const parentPrefix=`dev:${bindingSha256}:IFS:`;
 if(typeof draftAttempt.attemptId!=="string"||!draftAttempt.attemptId.startsWith(parentPrefix)
  ||typeof reviewAttemptId!=="string"||!reviewAttemptId.startsWith(parentPrefix))throw new Error("Review-retry source attempt IDs are not bound to its run.");
 assertNoRespondentFullNameInGeneratedDraft(draftOutput);
 assertNoRespondentClassification(draftOutput);
 const artifact=validatePwrp71ReportDraft({value:draftOutput,reportType:"IFS",snapshotId:String((current.packet as Record<string,unknown>).snapshot_id),packet:current.packet,source:input.reportSource});
 if(!artifact.ok||sha256Canonical(artifact.value.draft)!==finalDraftEvent.draftSha256)throw new Error("Review-retry source final draft no longer validates against current evidence.");

 return {
  previousDraft:artifact.value.draft,
  sourceRunBindingSha256:bindingSha256,
  sourceDraftSha256:finalDraftEvent.draftSha256,
  sourceDraftAttemptId:String(draftAttempt.attemptId),
  sourceReviewAttemptId:reviewAttemptId,
  validationIssues:issuePaths as Pwrp71ReviewRetrySeed["validationIssues"],
 };
}

/** Continue only from a fully validated revise receipt produced by a bounded review-retry run. */
async function loadPwrp71ContinuationFromReviewRetry(input:{
 root:string; sourceDirectory:string; assessment:AssessmentRecord; questionSource:Pwqe51SourcePackage; reportSource:Pwrp71SourcePackage;
}):Promise<Pwrp71ContinuationSeed> {
 const withinRuns=path.relative(path.join(input.root,"runs"),input.sourceDirectory);
 if(withinRuns===".."||withinRuns.startsWith(`..${path.sep}`)||path.isAbsolute(withinRuns)||withinRuns===""||withinRuns.includes(path.sep))throw new Error("Review-retry continuation must reference one run directly inside the selected output root.");
 const readJson=async(file:string)=>JSON.parse(await readFile(path.join(input.sourceDirectory,file),"utf8")) as unknown;
 const binding=object(await readJson("binding.json")),summary=object(await readJson("summary.json"));
 const attemptFile=object(await readJson("provider/attempts.json"));
 const priorPacket=await readJson("IFS/packet.json"),priorPrepared=await readJson("IFS/prepared.json");
 const eventsValue=await readJson("IFS/events.json"),events=Array.isArray(eventsValue)?eventsValue.map(object).filter((row):row is Record<string,unknown>=>row!==undefined):[];
 if(!binding||!summary||!attemptFile||attemptFile.schemaVersion!==1||!Array.isArray(attemptFile.attempts))throw new Error("Review-retry continuation records are incomplete.");
 const attempts=attemptFile.attempts.map(object).filter((row):row is Record<string,unknown>=>row!==undefined);
 const bindingSha256=contentHash(canonical(binding));
 const expectedCandidateSha256=sha256Canonical(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1);
 const expectedPolicy=developmentModelPolicy(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id);
 const continuationSource=object(binding.reviewRetry);
 const summaryReports=object(summary.reports),ifsSummary=object(summaryReports?.IFS),ifsFailure=object(ifsSummary?.failure);
 const summaryDirectory=typeof summary.directory==="string"?path.resolve(summary.directory):"";
 if(binding.schema!=="patternwork-report-dev-run-2"||binding.mode!=="review-retry"
  ||binding.assessmentSha256!==input.assessment.contentSha256
  ||binding.questionSourceSha256!==input.questionSource.sourceManifestSha256
  ||binding.reportSourceSha256!==input.reportSource.manifestSha256
  ||canonical(binding.types)!==canonical(["IFS"])
  ||canonical(binding.modelPolicy)!==canonical(expectedPolicy)
  ||canonical(binding.candidate)!==canonical(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1)
  ||binding.candidateSha256!==expectedCandidateSha256
  ||canonical(binding.providerPolicy)!==canonical(GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY)
  ||GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY.data_collection!=="deny"
  ||binding.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256
  ||binding.operationalApproval!==false
  ||typeof binding.aggregateMicros!=="number"||binding.aggregateMicros<=0||binding.aggregateMicros>500_000
  ||typeof binding.perCallMicros!=="number"||binding.perCallMicros<=0||binding.perCallMicros>500_000
  ||summaryDirectory!==input.sourceDirectory||summary.mode!=="review-retry"
  ||summary.assessmentSha256!==input.assessment.contentSha256
  ||summary.questionSourceSha256!==input.questionSource.sourceManifestSha256
  ||summary.reportSourceSha256!==input.reportSource.manifestSha256
  ||canonical(summary.types)!==canonical(["IFS"])
  ||summary.candidateSha256!==expectedCandidateSha256
  ||summary.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256
  ||summary.aggregateMicros!==binding.aggregateMicros||summary.perCallMicros!==binding.perCallMicros
  ||summary.operationalApproval!==false
  ||ifsSummary?.status!=="failed"||ifsFailure?.code!=="review_retry_not_accepted"
  ||summary.failed!==true||!Array.isArray(summary.unknownAttempts)||summary.unknownAttempts.length!==0
  ||attemptFile.attempts.length!==1||attempts.length!==1||summary.providerAttempts!==1) {
  throw new Error("Continuation source is not a completed, same-assessment, bounded review-retry run with a revision receipt.");
 }
 assertSame(summary.modelPolicy,expectedPolicy,"Continuation source model policy differs from the fixed report-dev candidate.");
 assertSame(summary.providerPolicy,GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,"Continuation source provider privacy policy differs from the current no-collection route.");
 if(!continuationSource||typeof continuationSource.sourceRunBindingSha256!=="string"||!/^[a-f0-9]{64}$/u.test(continuationSource.sourceRunBindingSha256)
  ||typeof continuationSource.sourceDraftSha256!=="string"||!/^[a-f0-9]{64}$/u.test(continuationSource.sourceDraftSha256)
  ||typeof continuationSource.sourceDraftAttemptId!=="string"||typeof continuationSource.sourceReviewAttemptId!=="string"
  ||!Array.isArray(continuationSource.validationIssues))throw new Error("Continuation source does not bind a complete original review-retry seed.");

 const current=prepareReport(input.assessment,"IFS",input.questionSource,input.reportSource);
 if(!current.request.ok)throw new Error("Current IFS assessment cannot be prepared for continuation.");
 assertNoRespondentFullName(current.packet);
 assertNoRespondentFullNameInPwrp71ModelInput(current.request.value.user_data);
 assertSame(priorPacket,current.packet,"Continuation packet differs from the current assessment evidence.");
 assertSame(priorPrepared,current.request,"Continuation prepared input differs from the current report input.");

 // Resolve the exact failed-review source by its immutable binding digest; duplicate matches fail closed.
 const runsDirectory=path.join(input.root,"runs"),runEntries=await readdir(runsDirectory,{withFileTypes:true}).catch(()=>[]);
 const matchingDirectories:string[]=[];
 for(const entry of runEntries) {
  if(!entry.isDirectory())continue;
  const candidateDirectory=path.join(runsDirectory,entry.name);
  try {
   const candidateReal=await realpath(candidateDirectory),relative=path.relative(input.root,candidateReal);
   if(relative===".."||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))continue;
   const candidateBinding=object(JSON.parse(await readFile(path.join(candidateReal,"binding.json"),"utf8")) as unknown);
   if(candidateBinding&&contentHash(canonical(candidateBinding))===continuationSource.sourceRunBindingSha256)matchingDirectories.push(candidateReal);
  } catch { /* A non-run or incomplete directory is not a candidate source. */ }
 }
 if(matchingDirectories.length!==1)throw new Error("Continuation source's original failed-review run is missing or ambiguous in the selected output root.");
 const original=await loadPwrp71ReviewRetrySeed({sourceRunDirectory:matchingDirectories[0],outputRoot:input.root,assessment:input.assessment,questionSource:input.questionSource,reportSource:input.reportSource});
 if(original.sourceRunBindingSha256!==continuationSource.sourceRunBindingSha256
  ||original.sourceDraftSha256!==continuationSource.sourceDraftSha256
  ||original.sourceDraftAttemptId!==continuationSource.sourceDraftAttemptId
  ||original.sourceReviewAttemptId!==continuationSource.sourceReviewAttemptId
  ||canonical(original.validationIssues)!==canonical(continuationSource.validationIssues))throw new Error("Continuation source's original validated draft binding differs from the review-retry run.");

 const attempt=attempts[0],request=object(attempt.request),admission=object(attempt.candidateAdmission),usage=object(attempt.usage),cost=usage?.costMicros;
 const id=typeof attempt.attemptId==="string"?attempt.attemptId:"";
 const expectedPrefix=`dev:${bindingSha256}:IFS:review_retry:${REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id}:attempt-`;
 const attemptNumber=id.startsWith(expectedPrefix)?id.slice(expectedPrefix.length):"";
 if(attempt.status!=="completed"||attempt.usageStatus!=="reported"||!Number.isSafeInteger(cost)||typeof cost!=="number"||cost<0
  ||typeof attempt.maximumCallCostMicros!=="number"||attempt.maximumCallCostMicros<=0||attempt.maximumCallCostMicros>binding.perCallMicros||attempt.maximumCallCostMicros>500_000
  ||attempt.aggregateCostCapMicros!==binding.aggregateMicros||attempt.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256||cost>attempt.maximumCallCostMicros
  ||request?.idempotencyKey!==id||!id.startsWith(expectedPrefix)||attemptNumber!=="1"
  ||request?.schemaName!=="patternwork_ifs_pwrp71_review_candidate_3"
  ||request?.requestedModel!==REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.model
  ||request?.requestedReasoningEffort!==REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.reasoningEffort
  ||request?.maxOutputTokens!==REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.maxOutputTokens
  ||admission?.scope!=="report-dev-experimental-v1"||admission.candidateId!==REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id
  ||admission.candidateSha256!==expectedCandidateSha256||admission.runBindingSha256!==bindingSha256)throw new Error("Continuation source has unsettled, mismatched, or over-cap provider attempts.");
 if(cost!==summary.settledCostMicros||cost>binding.aggregateMicros)throw new Error("Continuation source spend does not reconcile to its attempt journal.");
 const result=object(attempt.providerResult),receipt=object(attempt.reviewReceipt),resultOutput=object(result?.output);
 const receiptEvents=events.filter((event)=>event.type==="review_receipt"&&event.attemptId===id);
 if(attempt.finishReason!=="stop"||result?.ok!==true||!resultOutput||!receipt||receiptEvents.length!==1
  ||events.length!==1||receipt.verdict!=="revise"||receipt.reviewed_draft_sha256!==original.sourceDraftSha256
  ||receipt.reviewed_evidence_sha256!==(current.packet as Record<string,unknown>).content_sha256
  ||receipt.receipt_type!=="pwrp71_structural_review_receipt"
  ||receipt.report_release!==input.reportSource.policy.release
  ||receipt.source_manifest_sha256!==input.reportSource.manifestSha256
  ||typeof receipt.review_sha256!=="string"||!/^[a-f0-9]{64}$/u.test(receipt.review_sha256)
  ||!isJsonObject(receipt.review))throw new Error("Continuation source does not contain one final, fresh revision receipt bound to the original draft and current evidence.");
 assertSame(resultOutput,receipt.review,"Continuation review receipt differs from its provider result.");
 assertSame(receiptEvents[0].receipt,receipt,"Continuation review event differs from its journal receipt.");
 assertNoRespondentFullName(receipt.review);
 assertNoRespondentClassification(receipt.review);
 const artifactCheck=validatePwrp71ReportDraft({value:original.previousDraft,reportType:"IFS",snapshotId:String((current.packet as Record<string,unknown>).snapshot_id),packet:current.packet,source:input.reportSource});
 if(!artifactCheck.ok)throw new Error("Continuation source draft no longer validates against current evidence.");
 const validatedReview=validatePwrp71Review({value:receipt.review,artifact:artifactCheck.value,packet:current.packet,source:input.reportSource});
 if(receipt.report_id!==artifactCheck.value.report_id||!validatedReview.ok||validatedReview.value.verdict!=="revise"||validatedReview.value.review_sha256!==receipt.review_sha256
  ||validatedReview.value.reviewed_draft_sha256!==original.sourceDraftSha256)throw new Error("Continuation source fresh review receipt no longer validates against current evidence.");
 return {previousDraft:original.previousDraft,previousReview:validatedReview.value.review,sourceRunBindingSha256:bindingSha256,sourceDraftSha256:original.sourceDraftSha256,sourceReviewSha256:validatedReview.value.review_sha256,sourceDraftAttemptId:original.sourceDraftAttemptId,sourceReviewAttemptId:id};
}

/** Reconstruct a bounded continuation; active 128k permits one final voice repair rooted directly in generation. */
async function loadPwrp71ContinuationFromContinue(input:{
 root:string; sourceDirectory:string; assessment:AssessmentRecord; questionSource:Pwqe51SourcePackage; reportSource:Pwrp71SourcePackage;
}):Promise<Pwrp71ContinuationSeed> {
 const withinRuns=path.relative(path.join(input.root,"runs"),input.sourceDirectory);
 if(withinRuns===".."||withinRuns.startsWith(`..${path.sep}`)||path.isAbsolute(withinRuns)||withinRuns===""||withinRuns.includes(path.sep))throw new Error("Continuation source must be one run directly inside the selected output root.");
 const readJson=async(file:string)=>JSON.parse(await readFile(path.join(input.sourceDirectory,file),"utf8")) as unknown;
 const binding=object(await readJson("binding.json")),summary=object(await readJson("summary.json"));
 const attemptFile=object(await readJson("provider/attempts.json"));
 const priorPacket=await readJson("IFS/packet.json"),priorPrepared=await readJson("IFS/prepared.json");
 const eventsValue=await readJson("IFS/events.json"),events=Array.isArray(eventsValue)?eventsValue.map(object).filter((row):row is Record<string,unknown>=>row!==undefined):[];
 if(!binding||!summary||!attemptFile||attemptFile.schemaVersion!==1||!Array.isArray(attemptFile.attempts))throw new Error("Continuation run records are incomplete.");
 const attempts=attemptFile.attempts.map(object).filter((row):row is Record<string,unknown>=>row!==undefined);
 const bindingSha256=contentHash(canonical(binding));
 const active128k=object(binding.candidate)?.id===REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.id;
 const expectedCandidate=active128k?REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2:REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1;
 const expectedCandidateSha256=sha256Canonical(expectedCandidate);
 const expectedPolicy=developmentModelPolicy(expectedCandidate.id);
 const continuationSource=object(binding.continuation);
 const summaryReports=object(summary.reports),ifsSummary=object(summaryReports?.IFS),ifsFailure=object(ifsSummary?.failure);
 const summaryDirectory=typeof summary.directory==="string"?path.resolve(summary.directory):"";
 if(binding.schema!=="patternwork-report-dev-run-2"||binding.mode!=="continue"
  ||binding.assessmentSha256!==input.assessment.contentSha256
  ||binding.questionSourceSha256!==input.questionSource.sourceManifestSha256
  ||binding.reportSourceSha256!==input.reportSource.manifestSha256
  ||canonical(binding.types)!==canonical(["IFS"])
  ||canonical(binding.modelPolicy)!==canonical(expectedPolicy)
  ||canonical(binding.candidate)!==canonical(expectedCandidate)
  ||binding.candidateSha256!==expectedCandidateSha256
  ||canonical(binding.providerPolicy)!==canonical(GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY)
  ||binding.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256
  ||binding.operationalApproval!==false
  ||typeof binding.aggregateMicros!=="number"||binding.aggregateMicros<=0||binding.aggregateMicros>500_000
  ||typeof binding.perCallMicros!=="number"||binding.perCallMicros<=0||binding.perCallMicros>500_000
  ||!Number.isSafeInteger(binding.aggregateMicros)||!Number.isSafeInteger(binding.perCallMicros)||binding.perCallMicros>binding.aggregateMicros
  ||summaryDirectory!==input.sourceDirectory||summary.mode!=="continue"
  ||summary.assessmentSha256!==input.assessment.contentSha256
  ||summary.questionSourceSha256!==input.questionSource.sourceManifestSha256
  ||summary.reportSourceSha256!==input.reportSource.manifestSha256
  ||canonical(summary.types)!==canonical(["IFS"])
  ||summary.candidateSha256!==expectedCandidateSha256
  ||summary.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256
  ||summary.aggregateMicros!==binding.aggregateMicros||summary.perCallMicros!==binding.perCallMicros
  ||summary.operationalApproval!==false
  ||ifsSummary?.status!=="failed"||ifsFailure?.code!=="review_not_accepted"
  ||summary.failed!==true||!Array.isArray(summary.unknownAttempts)||summary.unknownAttempts.length!==0
  ||attemptFile.attempts.length!==2||attempts.length!==2||summary.providerAttempts!==2
  ||!continuationSource||typeof continuationSource.sourceRunBindingSha256!=="string"||!/^[a-f0-9]{64}$/u.test(continuationSource.sourceRunBindingSha256)
  ||typeof continuationSource.sourceDraftSha256!=="string"||!/^[a-f0-9]{64}$/u.test(continuationSource.sourceDraftSha256)
  ||typeof continuationSource.sourceReviewSha256!=="string"||!/^[a-f0-9]{64}$/u.test(continuationSource.sourceReviewSha256)
  ||typeof continuationSource.sourceDraftAttemptId!=="string"||typeof continuationSource.sourceReviewAttemptId!=="string") {
  throw new Error("Continuation source is not a completed, bounded IFS run rejected only at fresh review.");
 }
 assertSame(summary.modelPolicy,expectedPolicy,"Continuation source model policy differs from the fixed report-dev candidate.");
 assertSame(summary.providerPolicy,GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,"Continuation source provider privacy policy differs from the current no-collection route.");

 // Resolve the parent by exact immutable binding digest, and permit only the already validated review-retry lineage.
 const runsDirectory=path.join(input.root,"runs"),runEntries=await readdir(runsDirectory,{withFileTypes:true}).catch(()=>[]);
 const matchingDirectories:string[]=[];
 for(const entry of runEntries) {
  if(!entry.isDirectory())continue;
  const candidateDirectory=path.join(runsDirectory,entry.name);
  try {
   const candidateReal=await realpath(candidateDirectory),relative=path.relative(input.root,candidateReal);
   if(relative===".."||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))continue;
   const candidateBinding=object(JSON.parse(await readFile(path.join(candidateReal,"binding.json"),"utf8")) as unknown);
   if(candidateBinding&&contentHash(canonical(candidateBinding))===continuationSource.sourceRunBindingSha256)matchingDirectories.push(candidateReal);
  } catch { /* Incomplete or unrelated run directories cannot establish parentage. */ }
 }
 if(matchingDirectories.length!==1)throw new Error("Continuation parent is missing or ambiguous in the selected output root.");
 const parentBinding=object(JSON.parse(await readFile(path.join(matchingDirectories[0],"binding.json"),"utf8")) as unknown);
 if(active128k) {
  if(parentBinding?.mode!=="generate")throw new Error("The active 128k continuation depth cannot exceed two; its first continuation must be rooted directly in generation.");
  const versions={inputGuidanceVersion:PWRP71_INPUT_GUIDANCE_VERSION,questionContextVersion:PWRP71_QUESTION_CONTEXT_VERSION,scopeGuidanceVersion:PWRP71_SCOPE_GUIDANCE_VERSION,referenceSchemaVersion:PWRP71_REFERENCE_SCHEMA_VERSION,repairStrategyVersion:PWRP71_REPAIR_STRATEGY_VERSION,structuralRepairLimit:0,unsuccessfulResponsePolicy:REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.unsuccessfulResponsePolicy};
  for(const [key,value] of Object.entries(versions))if(binding[key]!==value||summary[key]!==value)throw new Error("The final 128k continuation source has stale versions or permits an extra correction.");
 } else if(parentBinding?.mode!=="review-retry"&&parentBinding?.mode!=="review-closure")throw new Error("Continuation parent must be a bounded fresh review run.");
 const parent=active128k
  ?await loadPwrp71ContinuationSeed({sourceRunDirectory:matchingDirectories[0],outputRoot:input.root,assessment:input.assessment,questionSource:input.questionSource,reportSource:input.reportSource,candidateId:expectedCandidate.id})
  :parentBinding.mode==="review-retry"
  ?await loadPwrp71ContinuationFromReviewRetry({root:input.root,sourceDirectory:matchingDirectories[0],assessment:input.assessment,questionSource:input.questionSource,reportSource:input.reportSource})
  :await loadPwrp71ContinuationSeed({sourceRunDirectory:matchingDirectories[0],outputRoot:input.root,assessment:input.assessment,questionSource:input.questionSource,reportSource:input.reportSource});
 const expectedContinuation={sourceRunBindingSha256:parent.sourceRunBindingSha256,sourceDraftSha256:parent.sourceDraftSha256,sourceReviewSha256:parent.sourceReviewSha256,sourceDraftAttemptId:parent.sourceDraftAttemptId,sourceReviewAttemptId:parent.sourceReviewAttemptId};
 assertSame(continuationSource,expectedContinuation,"Continuation binding differs from its reconstructed review-retry parent seed.");
 assertSame(summary.continuation,expectedContinuation,"Continuation summary differs from its immutable binding.");

 const current=prepareReport(input.assessment,"IFS",input.questionSource,input.reportSource);
 if(!current.request.ok)throw new Error("Current IFS assessment cannot be prepared for continuation.");
 assertNoRespondentFullName(current.packet);
 assertNoRespondentFullNameInPwrp71ModelInput(current.request.value.user_data);
 assertSame(priorPacket,current.packet,"Continuation packet differs from current assessment evidence.");
 assertSame(priorPrepared,current.request,"Continuation prepared input differs from current report input.");

 assertSame(summary.modelPolicy,expectedPolicy,"Continuation source model policy differs from the fixed report-dev candidate.");
 const sourcePerCallMicros=binding.perCallMicros as number;
 const spent=attempts.reduce((total,attempt,index)=>{
  const usage=object(attempt.usage),cost=usage?.costMicros,request=object(attempt.request),admission=object(attempt.candidateAdmission);
  const id=typeof attempt.attemptId==="string"?attempt.attemptId:"",phase=index===0?"repair":"review_after_repair";
  const schema=phase==="repair"?"patternwork_ifs_pwrp71_candidate_1":"patternwork_ifs_pwrp71_review_candidate_3";
  const expectedId=`dev:${bindingSha256}:IFS:${phase}:${expectedCandidate.id}:attempt-${index+1}`;
  if(attempt.attemptId!==expectedId||attempt.status!=="completed"||attempt.usageStatus!=="reported"
   ||attempt.endpoint!=="https://openrouter.ai/api/v1/chat/completions"||usage?.model!==expectedCandidate.model
   ||!Number.isSafeInteger(cost)||typeof cost!=="number"||cost<0
   ||typeof attempt.maximumCallCostMicros!=="number"||!Number.isSafeInteger(attempt.maximumCallCostMicros)||attempt.maximumCallCostMicros<=0||attempt.maximumCallCostMicros>sourcePerCallMicros||attempt.maximumCallCostMicros>500_000
   ||attempt.aggregateCostCapMicros!==binding.aggregateMicros||attempt.billingBasisSha256!==GPT6_LUNA_BILLING_BASIS_SHA256||cost>attempt.maximumCallCostMicros
   ||attempt.finishReason!=="stop"||request?.idempotencyKey!==id||request?.schemaName!==schema
   ||request?.requestedModel!==expectedCandidate.model
   ||request?.requestedReasoningEffort!==expectedCandidate.reasoningEffort
   ||request?.maxOutputTokens!==expectedCandidate.maxOutputTokens
   ||admission?.scope!=="report-dev-experimental-v1"||admission.candidateId!==expectedCandidate.id
   ||admission.candidateSha256!==expectedCandidateSha256||admission.runBindingSha256!==bindingSha256)throw new Error("Continuation source has unsettled, mismatched, or over-cap provider attempts.");
  const result=object(attempt.providerResult);
  if(result?.ok!==true||!object(result.output))throw new Error("Continuation source has a missing or failed provider output.");
  return total+cost;
 },0);
 if(spent!==summary.settledCostMicros||spent>binding.aggregateMicros)throw new Error("Continuation source spend does not reconcile to its attempt journal.");

 const draftAttempt=attempts[0],reviewAttempt=attempts[1],draftResult=object(draftAttempt.providerResult),draftOutput=object(draftResult?.output);
 const validation=object(draftAttempt.validation),receipt=object(reviewAttempt.reviewReceipt),reviewResult=object(reviewAttempt.providerResult),reviewOutput=object(reviewResult?.output);
 const draftId=String(draftAttempt.attemptId),reviewId=String(reviewAttempt.attemptId);
 const draftEvents=events.filter(event=>event.type==="draft_validation"&&event.attemptId===draftId);
 const reviewEvents=events.filter(event=>event.type==="review_receipt"&&event.attemptId===reviewId);
 if(events.length!==2||draftEvents.length!==1||reviewEvents.length!==1
  ||events[0]!==draftEvents[0]||events[1]!==reviewEvents[0]||draftEvents[0].reportType!=="IFS"||reviewEvents[0].reportType!=="IFS"
  ||validation?.ok!==true||typeof validation.draftSha256!=="string"||!/^[a-f0-9]{64}$/u.test(validation.draftSha256)
  ||draftEvents[0].ok!==true||draftEvents[0].draftSha256!==validation.draftSha256
  ||!receipt||receipt.verdict!=="revise"||receipt.reviewed_draft_sha256!==validation.draftSha256
  ||receipt.reviewed_evidence_sha256!==(current.packet as Record<string,unknown>).content_sha256
  ||receipt.receipt_type!=="pwrp71_structural_review_receipt"
  ||receipt.report_release!==input.reportSource.policy.release
  ||receipt.source_manifest_sha256!==input.reportSource.manifestSha256
  ||typeof receipt.review_sha256!=="string"||!/^[a-f0-9]{64}$/u.test(receipt.review_sha256)
  ||!isJsonObject(receipt.review)||!reviewOutput)throw new Error("Continuation source lacks one exact validated replacement and fresh revision receipt.");
 assertSame(reviewOutput,receipt.review,"Continuation review receipt differs from its provider result.");
 assertSame(reviewEvents[0].receipt,receipt,"Continuation review event differs from its journal receipt.");
 if(reviewEvents[0].verdict!=="revise")throw new Error("Continuation review event verdict differs from its receipt.");
 assertNoRespondentFullNameInGeneratedDraft(draftOutput);
 assertNoRespondentFullName(receipt.review);
 assertNoRespondentClassification(receipt.review);
 const artifact=validatePwrp71ReportDraft({value:draftOutput,reportType:"IFS",snapshotId:String((current.packet as Record<string,unknown>).snapshot_id),packet:current.packet,source:input.reportSource});
 if(!artifact.ok||sha256Canonical(artifact.value.draft)!==validation.draftSha256||receipt.report_id!==artifact.value.report_id)throw new Error("Continuation replacement draft no longer validates against current evidence.");
 const validatedReview=validatePwrp71Review({value:receipt.review,artifact:artifact.value,packet:current.packet,source:input.reportSource});
 if(!validatedReview.ok||validatedReview.value.verdict!=="revise"||validatedReview.value.review_sha256!==receipt.review_sha256
  ||validatedReview.value.reviewed_draft_sha256!==validation.draftSha256)throw new Error("Continuation fresh review receipt no longer validates against current evidence.");
 if(active128k) {
  const review=validatedReview.value.review,issues=Array.isArray(review.issues)?review.issues:[],quality=object(review.quality_assessment);
  if(issues.length===0||issues.some(issue=>object(issue)?.category!=="voice")
   ||object(quality?.source_fidelity)?.status!=="adequate"||object(quality?.semantic_completeness)?.status!=="adequate"
   ||object(quality?.narrative_quality)?.status!=="revise")throw new Error("The final 128k continuation requires only an actionable voice revision with adequate source fidelity and completeness.");
 }
 return {previousDraft:artifact.value.draft,previousReview:validatedReview.value.review,sourceRunBindingSha256:bindingSha256,sourceDraftSha256:validation.draftSha256,sourceReviewSha256:validatedReview.value.review_sha256,sourceDraftAttemptId:draftId,sourceReviewAttemptId:reviewId};
}

export function citationClosureBinding(seed:Pwrp71CitationClosureSeed) {
 return {sourceRunBindingSha256:seed.sourceRunBindingSha256,sourceDraftAttemptId:seed.sourceDraftAttemptId,rawDraftSha256:seed.derivation.raw_draft_sha256,normalizedDraftSha256:seed.derivation.normalized_draft_sha256,normalizationVersion:seed.derivation.normalization_version,derivationSha256:sha256Canonical(seed.derivation)};
}

export async function runReportBatch(options:RunReportBatchOptions) {
 const {assessment,types,questionSource,reportSource,directory,mode}=options;
 const privacyIdentityContext=options.privacyIdentityContext??(options.testTransport?REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT:undefined);
 if(mode!=="prepare"&&!options.testTransport
  &&privacyIdentityContext?.identityInventoryReviewed!==true) {
  throw new Error("Live report-dev generation requires a reviewed local identity inventory before provider dispatch.");
 }
 assertAssessmentRoute(assessment,questionSource);
 const candidate=options.candidateId?reportDevCandidate(options.candidateId):undefined;
 if(options.candidateId&&!candidate)throw new Error("Unknown fixed development candidate.");
 if(mode!=="prepare"&&candidate&&candidate.maxOutputTokens!==REPORT_OUTPUT_TOKEN_LIMIT)throw new Error("Historical 20k candidates cannot make new calls; select the active 128k Luna candidate.");
 if(candidate!==undefined&&"unsuccessfulResponsePolicy" in candidate&&mode!=="prepare"&&mode!=="generate"&&!(candidate.id===REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.id&&mode==="continue"))throw new Error("This candidate does not support the selected recovery mode.");
 if(candidate?.id===REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.id&&mode==="continue"&&options.continuationStructuralRepair===true)throw new Error("The active 128k continuation permits one repair and one fresh review only.");
 if(candidate&&(types.length!==1||types[0]!=="IFS"))throw new Error("The unqualified report-dev candidate is restricted to one IFS report per run.");
 if((mode==="continue")!==Boolean(options.continuation))throw new Error("Continuation mode requires one validated continuation seed, and other modes reject continuation seeds.");
 if((mode==="review-retry")!==Boolean(options.reviewRetry))throw new Error("Review-retry mode requires one validated review-retry seed, and other modes reject review-retry seeds.");
 if((mode==="review-closure")!==Boolean(options.citationClosure))throw new Error("Citation review requires exactly one source-bound derivation seed.");
 if([options.continuation,options.reviewRetry,options.citationClosure].filter(Boolean).length>1)throw new Error("Recovery seeds cannot be combined.");
 if(mode==="continue"&&(!candidate||types.length!==1||types[0]!=="IFS"))throw new Error("Continuation is restricted to one fixed-candidate IFS report.");
 if(mode==="review-retry"&&(!candidate||types.length!==1||types[0]!=="IFS"))throw new Error("Review retry is restricted to one fixed-candidate IFS report.");
 if(mode==="review-closure"&&(!candidate||types.length!==1||types[0]!=="IFS"))throw new Error("Citation review is restricted to one fixed-candidate IFS report.");
 const modelPolicy=developmentModelPolicy(options.candidateId);
 const providerPolicy=reportDevProviderPolicy(candidate?.model??modelPolicy.IFS.model);
 const billingBasisSha256=reportBillingBasisSha256(candidate?.model??modelPolicy.IFS.model);
 const candidateSha256=candidate?sha256Canonical(candidate):undefined;
 const continuation=options.continuation;
 const reviewRetry=options.reviewRetry;
 const citationClosure=options.citationClosure;
 const closureBinding=citationClosure?citationClosureBinding(citationClosure):undefined;
 const continuationBinding=continuation?{
  sourceRunBindingSha256:continuation.sourceRunBindingSha256,
  sourceDraftSha256:continuation.sourceDraftSha256,
  sourceReviewSha256:continuation.sourceReviewSha256,
  sourceDraftAttemptId:continuation.sourceDraftAttemptId,
  sourceReviewAttemptId:continuation.sourceReviewAttemptId,
 }:undefined;
 const reviewRetryBinding=reviewRetry?{sourceRunBindingSha256:reviewRetry.sourceRunBindingSha256,sourceDraftSha256:reviewRetry.sourceDraftSha256,sourceDraftAttemptId:reviewRetry.sourceDraftAttemptId,sourceReviewAttemptId:reviewRetry.sourceReviewAttemptId,validationIssues:reviewRetry.validationIssues.map(({code,path})=>({code,path}))}:undefined;
 const binding={...(options.exportPdfs?{exportPdfs:true}:{}),...(mode==="generate"?{generationRepairVersion:PWRP71_GENERATION_REPAIR_VERSION,reviewReplacementStructuralRepairLimit:1}:{}),...(candidate!==undefined&&"unsuccessfulResponsePolicy" in candidate?{unsuccessfulResponsePolicy:candidate.unsuccessfulResponsePolicy}:{}),schema:"patternwork-report-dev-run-2",assessmentSha256:assessment.contentSha256,questionSourceSha256:questionSource.sourceManifestSha256,reportSourceSha256:reportSource.manifestSha256,types,modelPolicy,...(candidate?{candidate,candidateSha256}:{}),providerPolicy,billingBasisSha256,inputGuidanceVersion:PWRP71_INPUT_GUIDANCE_VERSION,questionContextVersion:PWRP71_QUESTION_CONTEXT_VERSION,scopeGuidanceVersion:PWRP71_SCOPE_GUIDANCE_VERSION,referenceSchemaVersion:PWRP71_REFERENCE_SCHEMA_VERSION,...(mode==="continue"?{repairStrategyVersion:PWRP71_REPAIR_STRATEGY_VERSION,structuralRepairLimit:options.continuationStructuralRepair===true?1:0}:{}),mode,aggregateMicros:options.aggregateMicros??0,perCallMicros:options.perCallMicros??0,operationalApproval:false,...(continuationBinding?{continuation:continuationBinding}:{}),...(reviewRetryBinding?{reviewRetry:reviewRetryBinding}:{}),...(closureBinding?{citationClosure:closureBinding}:{})};
 const runBindingSha256=contentHash(canonical(binding));
 const candidateAdmission:ReportDevCandidateAdmission|undefined=candidate&&candidateSha256?{scope:"report-dev-experimental-v1",candidateId:candidate.id,candidateSha256,runBindingSha256}:undefined;
 await writeImmutableJson(path.join(directory,"binding.json"),binding);
 const store=new FileQualificationAttemptStore(path.join(directory,"provider"));
 if(options.pdfVerification&&!options.testTransport)throw new Error("PDF verification overrides require an explicit deterministic test transport.");
 const provider=options.transport?new JournaledPwrp71Transport({store,transport:options.transport,maxCallCostMicros:options.perCallMicros,aggregateCostCapMicros:options.aggregateMicros,usageStatus:options.testTransport?"mock":"reported",providerPolicy,...(privacyIdentityContext?{privacyIdentityContext}:{}),...(candidateAdmission?{candidateAdmission}:{}),onRequest:async(request,wireRequest)=>{
  // This sink receives only requests that passed the local identity and content
  // boundaries. Keep exact compiled prompts and wire payloads beside raw outputs.
  await writeImmutableJson(path.join(directory,"provider","requests",`${contentHash(request.idempotencyKey)}.json`),{
   attemptId:request.idempotencyKey,request,wirePayload:buildOpenRouterWirePayload(wireRequest),
  });
 },onResult:(_request,result)=>{
  if(!options.testTransport&&result.usage.model==="offline/mock") throw new Error("A live development run cannot accept a mock provider response.");
 }}):undefined;
 if(mode!=="prepare"&&(!provider||!Number.isSafeInteger(options.aggregateMicros)||!Number.isSafeInteger(options.perCallMicros)||options.aggregateMicros!<=0||options.perCallMicros!<=0)) throw new Error("Generation requires a transport and explicit positive aggregate/per-call limits.");
 const layers:Record<string,JsonObject>={}, reports:Record<string,unknown>={};
 let failed=false,independentReviewCount=0;
 for(const type of REPORT_ORDER.filter(t=>types.includes(t))) {
  const sub=path.join(directory,type); await mkdir(sub,{recursive:true,mode:0o700});
  try {
   if(type==="SYNTHESIS"&&["IFS","PV","ATT"].some(t=>!layers[t])) {
    reports[type]={stage:"dependencies",status:mode==="prepare"?"awaiting_generated_layers":"blocked",required:["IFS","PV","ATT"],providerCalled:false};
    if(mode!=="prepare") failed=true;
    await writeImmutableJson(path.join(sub,"dependency-status.json"),reports[type]); continue;
   }
   const {packet,request}=prepareReport(assessment,type,questionSource,reportSource,layers);
   assertNoRespondentFullName(packet);
   await writeImmutableJson(path.join(sub,"packet.json"),packet);
   await writeImmutableJson(path.join(sub,"prepared.json"),request);
   if(!request.ok) {reports[type]={stage:"adapter",status:"failed",issues:request.issues,providerCalled:false};failed=true;continue;}
   assertNoRespondentFullNameInPwrp71ModelInput(request.value.user_data);
   if(mode==="prepare") {reports[type]={stage:"prepared",status:"ready_for_generation",providerCalled:false,observations:(packet.observations as unknown[]).length,claimsEvaluated:0};continue;}
   if(citationClosure) {
    const closed=derivePwrp71Citations({value:citationClosure.rawDraft,previousDraft:citationClosure.previousDraft,referenceRestoration:citationClosure.referenceRestoration,reportType:type,snapshotId:request.value.binding.snapshot_id,packet,source:reportSource});
    assertSame(closed.derivation,citationClosure.derivation,"Citation derivation changed before review.");
    await writeImmutableJson(path.join(sub,"citation-derivation.json"),{...closureBinding,derivation:closed.derivation,structuralValidation:{ok:true},rawValidationIssues:closed.rawValidationIssues});
    await writeImmutableJson(path.join(sub,"normalized-draft.json"),closed.artifact.draft);
   }
   const events:JsonObject[]=[];
   const outcome=await generateCanonicalReport({reportType:type,input:request.value.user_data,packets:[packet],provider:provider!,privacyIdentityContext,invocationKey:`dev:${runBindingSha256}`,spentMicros:0,costCapMicros:options.aggregateMicros!,modelPolicy,contractVersion:"v7.1",reviewReplacementStructuralRepair:mode==="generate",stopOnUnsuccessfulProviderResponse:candidate!==undefined&&"unsuccessfulResponsePolicy" in candidate,...(candidate?{requestIdentityLabel:candidate.id}:{}),...(continuation?{continuation,continuationStructuralRepair:options.continuationStructuralRepair===true}:{}),...(reviewRetry?{reviewRetry}:{}),...(citationClosure?{citationClosure}:{}),beforeProviderRequest:({assessmentData,previousOutput})=>{assertNoRespondentFullNameInPwrp71ModelInput(assessmentData);if(previousOutput)assertNoRespondentFullNameInGeneratedDraft(previousOutput);},pwrp71:{request:request.value,packet,source:reportSource,questionSource},onPwrp71Event:async event=>{assertNoRespondentClassification(event);assertNoRespondentFullName(event);events.push(event as unknown as JsonObject);await store.recordGenerationEvent(event);}});
   if(events.some((event)=>event.type==="review_receipt"||event.type==="review_validation")) independentReviewCount++;
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
   if(options.exportPdfs) {
    const state=type==="MAP"?assessment.mapping:assessment.deepening;
    const pdf=await renderAndVerifyCanonicalPdf({reportType:type,artifact,routerPacket:packet,
     canonicalResponseEvidence:pwrp71CanonicalResponseEvidenceFromRoute(state.responses,state.routerResult),
     ...(type==="SYNTHESIS"?{acceptedLayers:layers}:{}),snapshotId:String(packet.snapshot_id),contractVersion:"v7.1",
     ...(options.pdfVerification?{verification:options.pdfVerification}:{})});
    // PDF metadata contains a creation date, so retain an existing verified
    // export rather than replacing its bytes during a settled-call resume.
    const pdfPath=path.join(sub,"report.pdf");
    try {await writeFile(pdfPath,pdf.bytes,{flag:"wx",mode:0o600});}
    catch(error) {if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;
     const existing=await readFile(pdfPath);
     const receipt=JSON.parse(await readFile(path.join(sub,"pdf-verification.json"),"utf8"));
     if(contentHash(existing)!==receipt.sha256||receipt.sourceMarkdownSha256!==pdf.sourceMarkdownSha256)throw new Error("Existing PDF export differs from its source-bound verification receipt.");
    }
    const existing=await readFile(pdfPath);
    await writeImmutableJson(path.join(sub,"pdf-verification.json"),{sha256:contentHash(existing),sourceMarkdownSha256:pdf.sourceMarkdownSha256,pageCount:pdf.pageCount,pngPageCount:pdf.pngPageCount});
   }
   if(["IFS","PV","ATT"].includes(type)) layers[type]=artifact.draft;
   reports[type]={stage:"reviewed",status:"accepted_for_this_development_run",structurallyValid:true,review:validated.value.verdict,quality:(review as JsonObject).quality_assessment,words:markdown.trim().split(/\s+/u).length,sections:(artifact.draft.sections as unknown[]).length,operationalApproval:false};
  } catch(error) {
   failed=true; const failure={stage:"runtime",status:"failed",code:error&&typeof error==="object"&&"code" in error?String(error.code):"runtime_failure",message:error instanceof Error?error.message:"Unknown runtime failure"};
   reports[type]=failure; await writeFile(path.join(sub,"failure.json"),JSON.stringify(failure,null,2),{mode:0o600});
  }
 }
 const attempts=await store.list();
 const summary={...binding,reports,failed,providerAttempts:attempts.length,settledCostMicros:attempts.reduce((n,a)=>n+(a.usage?.costMicros??0),0),unknownAttempts:attempts.filter(a=>a.usageStatus==="unknown").map(a=>a.attemptId),operationalApproval:false,narrativeEvaluation:mode==="prepare"?"not_run":options.testTransport?"deterministic_transport_only":independentReviewCount===0?"not_reached":independentReviewCount===types.length?"model_review":"partial_model_review",directory};
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
