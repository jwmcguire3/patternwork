import { PWRP71_QUESTION_CONTEXT_VERSION } from "../../lib/server/reports/pwrp71-question-context.ts";
import { PWRP71_REFERENCE_SCHEMA_VERSION } from "../../lib/server/reports/pwrp71-reference-schema.ts";
import { readFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import { QUALIFICATION_MODEL_ORDER, REPORT_OUTPUT_TOKEN_LIMIT, REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2, reportDevCandidate } from "../../lib/server/openrouter/policy.ts";
import { reportBillingBasisSha256, reportDevProviderPolicy } from "../../lib/server/openrouter/qualification-budget.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { AssessmentPlanError, loadAssessment, runAssessmentPlan, writeImmutableJson } from "./assessment.ts";
import { canonical, contentHash } from "./source.ts";
import { packetFor, REPORT_ORDER, runReportBatch, validateStoredReport, developmentModelPolicy, loadPwrp71ContinuationSeed, loadPwrp71RecoverySeed, loadPwrp71ReviewRetrySeed, citationClosureBinding } from "./workflow.ts";
import { loadPwrp71CitationClosureSeed } from "./citation-recovery.ts";
import { loadPrivacyIdentityContext } from "./privacy-identities.ts";
import { PWRP71_INPUT_GUIDANCE_VERSION, PWRP71_REPAIR_STRATEGY_VERSION, PWRP71_GENERATION_REPAIR_VERSION, PWRP71_SCOPE_GUIDANCE_VERSION } from "../../lib/server/reports/generator.ts";
import { recoveryProfileBinding } from "./recovery-profile.ts";
import type { ReportType } from "../../lib/question-engine/types.ts";

const HELP=`Patternwork reporting development

Default: offline preparation. No provider call without --mode generate and --allow-spend.

  npm run reports:dev -- --case mara --mode assess
  npm run reports:dev -- --case ellis --reports all
  npm run reports:dev -- --assessment .report-dev/assessments/<digest>.json --reports IFS
  npm run reports:dev -- --assessment <file> --reports all --mode generate --allow-spend --budget 3.00 --per-call 0.30 --identity-file <reviewed-local-identities.json> --pdf
  npm run reports:dev -- --assessment <file> --reports IFS --mode generate --allow-spend --budget 0.50 --per-call 0.50 --identity-file <local-identities.json>
  npm run reports:dev -- --assessment <file> --reports IFS --mode continue --candidate report-dev-luna-high-128k-v2 --continue-from <completed-generate-run> --output <same-output-root> --allow-spend --budget 0.50 --per-call 0.50 --identity-file <local-identities.json>
  npm run reports:dev -- --assessment <file> --mode validate --reports IFS --artifact <artifact.json> --review <review.json>
  npm run reports:dev -- --mode compare --left <run-directory> --right <run-directory>
  npm run reports:dev -- --mode inspect --run <run-directory>
  npm run reports:source -- --sync --change prose|interpretation|schema

--pdf exports accepted generated reports with the application canonical PDF renderer and text/raster verification.
--plan <JSON> loads another answer plan. --case uses scripts/report-dev/cases/<id>.json.
--output <directory> changes the isolated output root (default .report-dev).
--reports accepts MAP, IFS, PV, ATT, SYNTHESIS or all; synthesis adds required IFS/PV/ATT layers.
--mode assess records a complete engine-issued assessment. Reuse its printed --assessment path.
--mode prepare validates packets and saves provider inputs; synthesis awaits accepted generated layers.
--mode validate checks structure and an existing bound review, not new semantic judgment.
--candidate report-dev-luna-high-128k-v2 selects the active fixed Luna/high/128,000-token IFS configuration (also the fresh IFS default). Historical 20k candidates are read-only; arbitrary model/effort overrides are rejected.
Active 128k continuation requires the same fixed candidate's completed generation and valid final revision review. It permits one repair and one fresh review without structural correction. One final voice-only continuation may follow the first continuation; depth three is rejected.
--recovery-profile report-dev-luna-high-128k-bounded-structure-v1 explicitly permits one semantic repair, at most one structural correction and one fresh full review from a strictly reloaded current-v2 generation only. Maximum new aggregate budget is $0.25, within the original source authorization. Every failure is terminal; no recovery run can seed this profile. Ordinary continuation remains unchanged.
Live generation, continuation, and review retry require --identity-file. The local-only JSON must set identityInventoryReviewed to true and include respondentNames, accountIds, emails, and otherIdentityTokens arrays (use [] when a category is absent). Values are checked locally and never stored in run artifacts.
Live generation uses OPENROUTER_API_KEY and the existing configured model tiers unless that fixed candidate is explicitly selected. Old authorizations are never read.
`;
function argumentsMap(argv:string[]) {
 const flags=new Map<string,string|boolean>();
 const valued=new Set(["case","plan","assessment","mode","reports","output","budget","per-call","artifact","review","left","right","run","candidate","continue-from","recovery-profile","review-retry-from","review-closure-from","identity-file"]);
 for(let i=0;i<argv.length;i++) {
  const key=argv[i].replace(/^--/u,"");
  if(!argv[i].startsWith("--")||flags.has(key)) throw new Error("Use unique --named options; see --help.");
  if(["allow-spend","help","pdf"].includes(key)) flags.set(key,true);
  else if(valued.has(key)&&argv[i+1]&&!argv[i+1].startsWith("--")) flags.set(key,argv[++i]);
  else throw new Error(`Unknown or incomplete option --${key}.`);
 }
 return flags;
}
export function dollarMicros(value:unknown):number {
 if(typeof value!=="string"||!/^\d+(?:\.\d{1,6})?$/u.test(value)) throw new Error("Spending limits must be positive dollar amounts with at most six decimals.");
 const [whole,fraction=""]=value.split("."); const result=Number(whole)*1_000_000+Number(fraction.padEnd(6,"0"));
 if(!Number.isSafeInteger(result)||result<=0) throw new Error("Spending limits must be positive safe amounts.");
 return result;
}
async function main() {
 process.umask(0o077);
 const flags=argumentsMap(process.argv.slice(2));
 if(flags.has("help")) {console.log(HELP);return;}
 const string=(key:string)=>typeof flags.get(key)==="string"?flags.get(key) as string:undefined;
 const mode=string("mode")??"prepare",root=path.resolve(string("output")??".report-dev");
 if(!["assess","prepare","generate","continue","review-retry","review-closure","validate","compare","inspect"].includes(mode)) throw new Error("Unknown mode. See --help.");
 const continuationSource=string("continue-from");
 if((mode==="continue")!==Boolean(continuationSource)) throw new Error("--continue-from is required only with --mode continue.");
 const reviewRetrySource=string("review-retry-from");
 if((mode==="review-retry")!==Boolean(reviewRetrySource)) throw new Error("--review-retry-from is required only with --mode review-retry.");
 const closureSource=string("review-closure-from");
 if((mode==="review-closure")!==Boolean(closureSource)) throw new Error("--review-closure-from is required only with --mode review-closure.");
 if(flags.has("pdf")&&mode!=="generate")throw new Error("--pdf is supported only with --mode generate.");
 const liveMode=mode==="generate"||mode==="continue"||mode==="review-retry"||mode==="review-closure";
 if(flags.has("identity-file")&&!liveMode) throw new Error("--identity-file is valid only for live generation modes.");
 if(liveMode&&!flags.has("identity-file")) throw new Error("Live generation requires --identity-file with a reviewed local identity inventory; no provider was called.");
 if(!liveMode&&(flags.has("allow-spend")||flags.has("budget")||flags.has("per-call"))) throw new Error("Spending flags are valid only in generation modes.");
 const candidateId=string("candidate")??((mode==="generate"||mode==="prepare")&&(string("reports")??"all").toUpperCase()==="IFS"?REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.id:undefined);
 const recoveryProfileId=string("recovery-profile");
 const recovery=recoveryProfileId?recoveryProfileBinding(recoveryProfileId):undefined;
 if(recovery&&(mode!=="continue"||candidateId!==recovery.recoveryProfile.candidateId))throw new Error("--recovery-profile requires --mode continue and the current fixed 128k candidate.");
 const candidate=candidateId?reportDevCandidate(candidateId):undefined;
 if(candidateId!==undefined&&!candidate) throw new Error("Unknown report-dev candidate; arbitrary model and effort overrides are not supported.");
 if(liveMode&&candidate&&candidate.maxOutputTokens!==REPORT_OUTPUT_TOKEN_LIMIT) throw new Error("Historical 20k candidates are read-only. New calls require report-dev-luna-high-128k-v2.");
 if(candidate!==undefined&&"unsuccessfulResponsePolicy" in candidate&&mode!=="prepare"&&mode!=="generate"&&!(candidate.id===REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.id&&mode==="continue")) throw new Error("This candidate does not support the selected recovery mode.");
 if(candidateId&&mode!=="prepare"&&!liveMode) throw new Error("The experimental candidate is available only for no-cost preparation or report generation.");
 if(mode==="inspect") {
  if(!string("run")) throw new Error("Inspect requires --run <directory>.");
  const directory=path.resolve(string("run")!);
  console.log(await readFile(path.join(directory,"summary.json"),"utf8"));
  console.log("Files:",await readdir(directory));return;
 }
 if(mode==="compare") {
  if(!string("left")||!string("right")) throw new Error("Compare requires --left and --right run directories.");
  const left=JSON.parse(await readFile(path.join(string("left")!,"summary.json"),"utf8"));
  const right=JSON.parse(await readFile(path.join(string("right")!,"summary.json"),"utf8"));
  if(left.assessmentSha256!==right.assessmentSha256) throw new Error("These runs use different assessments; they are not a controlled prompt comparison.");
  console.log(JSON.stringify({sameAssessment:true,leftSource:left.reportSourceSha256,rightSource:right.reportSourceSha256,leftReports:left.reports,rightReports:right.reports,leftEvaluation:left.narrativeEvaluation,rightEvaluation:right.narrativeEvaluation,note:"Counts and review receipts are not independent proof of narrative quality."},null,2));return;
 }
 const targets=(string("reports")??"all").toUpperCase();
 let types=targets==="ALL"?[...REPORT_ORDER]:targets.split(",") as ReportType[];
 if(types.some(t=>!REPORT_ORDER.includes(t))) throw new Error("Unknown report type. Use MAP, IFS, PV, ATT, SYNTHESIS, or all.");
 if(mode!=="validate"&&types.includes("SYNTHESIS")) types=[...new Set<ReportType>([...types,"IFS","PV","ATT"])];
 types=REPORT_ORDER.filter(t=>types.includes(t));
 if(candidateId&&(types.length!==1||types[0]!=="IFS")) throw new Error("The experimental candidate is restricted to one IFS report per run.");
 if(mode==="validate"&&(types.length!==1||!string("artifact"))) throw new Error("Validate requires one report type and --artifact.");
 let aggregateMicros:number|undefined,perCallMicros:number|undefined;
 if(liveMode) {
  if(!flags.has("allow-spend")) throw new Error("No paid call authorized. Add --allow-spend with explicit --budget and --per-call for this run.");
  aggregateMicros=dollarMicros(string("budget"));perCallMicros=dollarMicros(string("per-call"));
  if(perCallMicros>aggregateMicros) throw new Error("Per-call limit cannot exceed aggregate budget.");
  if(mode==="continue"&&(aggregateMicros>500_000||perCallMicros>500_000)) throw new Error("A one-repair continuation is capped at $0.50 aggregate and $0.50 per provider call.");
  if(mode==="review-retry"&&(aggregateMicros>500_000||perCallMicros>500_000)) throw new Error("A one-call review retry is capped at $0.50 aggregate and $0.50 per provider call.");
  if(mode==="review-closure"&&(aggregateMicros>500_000||perCallMicros>500_000)) throw new Error("A citation review is capped at $0.50 aggregate and per provider call.");
  if(!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured; no provider was called.");
 }
 const source=await loadPwqe51SourcePackage();
 const privacyIdentityContext=string("identity-file")?await loadPrivacyIdentityContext(string("identity-file")!):undefined;
 const inputs=["assessment","case","plan"].filter(key=>flags.has(key));
 if(inputs.length!==1) throw new Error("Select exactly one --case, --plan, or --assessment. See --help.");
 if(mode==="continue"&&(!flags.has("assessment")||flags.has("case")||flags.has("plan")||!candidateId)) throw new Error("Continuation requires the original --assessment and fixed IFS candidate.");
 if(mode==="review-retry"&&(!flags.has("assessment")||flags.has("case")||flags.has("plan")||!candidateId||types.length!==1||types[0]!=="IFS")) throw new Error("Review retry requires the original --assessment, --reports IFS, and fixed candidate.");
 if(mode==="review-closure"&&(!flags.has("assessment")||!candidateId||types.length!==1||types[0]!=="IFS")) throw new Error("Citation review requires the original assessment and fixed IFS candidate.");
 await mkdir(root,{recursive:true,mode:0o700});
 let assessment,assessmentPath=string("assessment");
 if(assessmentPath) assessment=await loadAssessment(assessmentPath,source);
 else {
  const id=string("case");
  if(id&&!/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(id)) throw new Error("Invalid case ID.");
  const planFile=string("plan")??path.join("scripts/report-dev/cases",`${id}.json`);
  const plan=JSON.parse(await readFile(planFile,"utf8"));
  try {assessment=runAssessmentPlan(plan,source);}
  catch(error) {
   if(error instanceof AssessmentPlanError) {
    const failedPath=path.join(root,"assessment-failures",`${Date.now()}.json`);
    await writeImmutableJson(failedPath,{stage:"assessment",message:error.message,state:error.state,transcript:error.transcript});
    console.error(`Partial state retained: ${failedPath}`);
   }
   throw error;
  }
  assessmentPath=path.join(root,"assessments",`${assessment.contentSha256}.json`);
  await writeImmutableJson(assessmentPath,assessment);
 }
 console.log(`Assessment: ${assessmentPath}`);
 console.log(`Mapping: ${assessment.mapping.responses.length} responses; Deepening total: ${assessment.deepening.responses.length}; completion: ${assessment.deepening.routerResult.completionReason}`);
 if(mode==="assess") return;
 const reportSource=await loadPwrp71SourcePackage();
 if(mode==="validate") {
  const result=await validateStoredReport(string("artifact")!,string("review"),packetFor(assessment,types[0],source),reportSource,types[0]);
  console.log(JSON.stringify(result,null,2));
  if (!result.structural.ok || (typeof result.semanticReview === "object" && (!result.semanticReview.ok || result.semanticReview.value.verdict !== "accept"))) process.exitCode = 1;
  return;
 }
 const modelPolicy=developmentModelPolicy(candidateId);
 const providerPolicy=reportDevProviderPolicy(candidate?.model??modelPolicy.IFS.model);
 const billingBasisSha256=reportBillingBasisSha256(candidate?.model??modelPolicy.IFS.model);
 const candidateConfiguration=candidate?{candidate,candidateSha256:sha256Canonical(candidate)}:{qualifiedCandidateOrderSha256:sha256Canonical(QUALIFICATION_MODEL_ORDER)};
 const recoverySource=recovery?{sourceRunDirectory:path.resolve(continuationSource!),outputRoot:root}:undefined;
 const continuation=mode==="continue"?await (recovery?loadPwrp71RecoverySeed:loadPwrp71ContinuationSeed)({sourceRunDirectory:path.resolve(continuationSource!),outputRoot:root,assessment,questionSource:source,reportSource,candidateId:candidate?.id,recoveryProfileId:recoveryProfileId!,aggregateMicros,perCallMicros}):undefined;
 const continuationStructuralRepair=recovery!==undefined||mode==="continue"&&candidate?.id!==REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.id;
 const reviewRetry=mode==="review-retry"?await loadPwrp71ReviewRetrySeed({sourceRunDirectory:path.resolve(reviewRetrySource!),outputRoot:root,assessment,questionSource:source,reportSource}):undefined;
 const citationClosure=mode==="review-closure"?await loadPwrp71CitationClosureSeed({sourceRunDirectory:path.resolve(closureSource!),outputRoot:root,assessment,questionSource:source,reportSource}):undefined;
 const closureBinding=citationClosure?citationClosureBinding(citationClosure):undefined;
 const continuationBinding=continuation?{sourceRunBindingSha256:continuation.sourceRunBindingSha256,sourceDraftSha256:continuation.sourceDraftSha256,sourceReviewSha256:continuation.sourceReviewSha256,sourceDraftAttemptId:continuation.sourceDraftAttemptId,sourceReviewAttemptId:continuation.sourceReviewAttemptId}:undefined;
 const reviewRetryBinding=reviewRetry?{sourceRunBindingSha256:reviewRetry.sourceRunBindingSha256,sourceDraftSha256:reviewRetry.sourceDraftSha256,sourceDraftAttemptId:reviewRetry.sourceDraftAttemptId,sourceReviewAttemptId:reviewRetry.sourceReviewAttemptId,validationIssues:reviewRetry.validationIssues.map(({code,path})=>({code,path}))}:undefined;
 const runHash=contentHash(canonical({...(recovery??{}),...(flags.has("pdf")?{exportPdfs:true}:{}),...(mode==="generate"?{generationRepairVersion:PWRP71_GENERATION_REPAIR_VERSION,reviewReplacementStructuralRepairLimit:1}:{}),...(candidate!==undefined&&"unsuccessfulResponsePolicy" in candidate?{unsuccessfulResponsePolicy:candidate.unsuccessfulResponsePolicy}:{}),schema:"patternwork-report-dev-run-2",inputGuidanceVersion:PWRP71_INPUT_GUIDANCE_VERSION,questionContextVersion:PWRP71_QUESTION_CONTEXT_VERSION,scopeGuidanceVersion:PWRP71_SCOPE_GUIDANCE_VERSION,referenceSchemaVersion:PWRP71_REFERENCE_SCHEMA_VERSION,...(mode==="continue"?{repairStrategyVersion:PWRP71_REPAIR_STRATEGY_VERSION,structuralRepairLimit:continuationStructuralRepair?1:0}:{}),assessment:assessment.contentSha256,questionSource:source.sourceManifestSha256,reportSource:reportSource.manifestSha256,types,modelPolicy,candidateConfiguration,providerPolicy,billingBasisSha256,mode,aggregateMicros:aggregateMicros??0,perCallMicros:perCallMicros??0,...(continuationBinding?{continuation:continuationBinding}:{}),...(reviewRetryBinding?{reviewRetry:reviewRetryBinding}:{}),...(closureBinding?{citationClosure:closureBinding}:{})}));
 const directory=path.join(root,"runs",`${mode}-${runHash.slice(0,24)}`);
 const summary=await runReportBatch({...(flags.has("pdf")?{exportPdfs:true}:{}),assessment,types,questionSource:source,reportSource,directory,mode:mode as "prepare"|"generate"|"continue"|"review-retry"|"review-closure",...(candidate?{candidateId:candidate.id}:{}),...(recovery?{recoveryProfileId,recoverySource}:continuation?{continuation,continuationStructuralRepair}:{}),...(reviewRetry?{reviewRetry}:{}),...(citationClosure?{citationClosure}:{}),...(privacyIdentityContext?{privacyIdentityContext}:{}),aggregateMicros,perCallMicros,...(liveMode?{transport:new OpenRouterClient()}: {})});
 console.log(JSON.stringify(summary,null,2));
 if(summary.failed) process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{
 // Provider transports already redact upstream details. Do not dump arbitrary objects or environment values.
 console.error(error instanceof Error?error.message:"Reporting development command failed.");process.exitCode=1;
});
