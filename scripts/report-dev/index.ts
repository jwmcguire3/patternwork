import { readFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import { AssessmentPlanError, loadAssessment, runAssessmentPlan, writeImmutableJson } from "./assessment.ts";
import { canonical, contentHash } from "./source.ts";
import { packetFor, REPORT_ORDER, runReportBatch, validateStoredReport, developmentModelPolicy } from "./workflow.ts";
import type { ReportType } from "../../lib/question-engine/types.ts";

const HELP=`Patternwork reporting development

Default: offline preparation. No provider call without --mode generate and --allow-spend.

  npm run reports:dev -- --case mara --mode assess
  npm run reports:dev -- --case ellis --reports all
  npm run reports:dev -- --assessment .report-dev/assessments/<digest>.json --reports IFS
  npm run reports:dev -- --assessment <file> --reports all --mode generate --allow-spend --budget 3.00 --per-call 0.30
  npm run reports:dev -- --assessment <file> --mode validate --reports IFS --artifact <artifact.json> --review <review.json>
  npm run reports:dev -- --mode compare --left <run-directory> --right <run-directory>
  npm run reports:dev -- --mode inspect --run <run-directory>
  npm run reports:source -- --sync --change prose|interpretation|schema

--plan <JSON> loads another answer plan. --case uses scripts/report-dev/cases/<id>.json.
--output <directory> changes the isolated output root (default .report-dev).
--reports accepts MAP, IFS, PV, ATT, SYNTHESIS or all; synthesis adds required IFS/PV/ATT layers.
--mode assess records a complete engine-issued assessment. Reuse its printed --assessment path.
--mode prepare validates packets and saves provider inputs; synthesis awaits accepted generated layers.
--mode validate checks structure and an existing bound review, not new semantic judgment.
Live generation uses OPENROUTER_API_KEY and the existing configured model tiers. Old authorizations are never read.
`;
function argumentsMap(argv:string[]) {
 const flags=new Map<string,string|boolean>();
 const valued=new Set(["case","plan","assessment","mode","reports","output","budget","per-call","artifact","review","left","right","run"]);
 for(let i=0;i<argv.length;i++) {
  const key=argv[i].replace(/^--/u,"");
  if(!argv[i].startsWith("--")||flags.has(key)) throw new Error("Use unique --named options; see --help.");
  if(["allow-spend","help"].includes(key)) flags.set(key,true);
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
 if(!["assess","prepare","generate","validate","compare","inspect"].includes(mode)) throw new Error("Unknown mode. See --help.");
 if(mode!=="generate"&&(flags.has("allow-spend")||flags.has("budget")||flags.has("per-call"))) throw new Error("Spending flags are valid only in generate mode.");
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
 if(mode==="validate"&&(types.length!==1||!string("artifact"))) throw new Error("Validate requires one report type and --artifact.");
 let aggregateMicros:number|undefined,perCallMicros:number|undefined;
 if(mode==="generate") {
  if(!flags.has("allow-spend")) throw new Error("No paid call authorized. Add --allow-spend with explicit --budget and --per-call for this run.");
  aggregateMicros=dollarMicros(string("budget"));perCallMicros=dollarMicros(string("per-call"));
  if(perCallMicros>aggregateMicros) throw new Error("Per-call limit cannot exceed aggregate budget.");
  if(!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured; no provider was called.");
 }
 const source=await loadPwqe51SourcePackage();
 const inputs=["assessment","case","plan"].filter(key=>flags.has(key));
 if(inputs.length!==1) throw new Error("Select exactly one --case, --plan, or --assessment. See --help.");
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
 const runHash=contentHash(canonical({assessment:assessment.contentSha256,source:reportSource.manifestSha256,types,modelPolicy:developmentModelPolicy(),mode}));
 const directory=path.join(root,"runs",`${mode}-${runHash.slice(0,24)}`);
 const summary=await runReportBatch({assessment,types,questionSource:source,reportSource,directory,mode:mode as "prepare"|"generate",aggregateMicros,perCallMicros,...(mode==="generate"?{transport:new OpenRouterClient()}: {})});
 console.log(JSON.stringify(summary,null,2));
 if(summary.failed) process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{
 // Provider transports already redact upstream details. Do not dump arbitrary objects or environment values.
 console.error(error instanceof Error?error.message:"Reporting development command failed.");process.exitCode=1;
});
