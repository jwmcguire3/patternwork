import { assertAssessmentRoute } from "./verify-assessment.ts";
import Ajv from "ajv";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { advancePwqe51Session, canCompletePwqe51Pass, createPwqe51SessionState, isPwqe51SessionState, pwqe51FocusChoices, renderPwqe51Interaction, startPwqe51Deepening, type Pwqe51SessionState } from "../../lib/server/assessment/pwqe51-session.ts";
import { assertNoRespondentClassification } from "../../lib/server/reports/content-boundary.ts";
import { canonical, contentHash } from "./source.ts";

export interface AnswerPlan {
 schema: "patternwork-answer-plan-1"; id: string;
 rootBasis: "actual_recalled" | "reported_typicality"; referentRole: string;
 optedInTopics: string[]; focus: "all"; details: string[];
 missingStatus?: "not_sure";
 answers: {phase:"mapping"|"deepening";questionId:string;optionText?:string;optionIds?:string[];status?:"skip"|"not_sure"|"no_event"|"not_applicable";occurrenceId?:string;stepId?:string}[];
}
const planSchema = {
 type:"object",additionalProperties:false,required:["schema","id","rootBasis","referentRole","optedInTopics","focus","details","answers"],
 properties:{schema:{const:"patternwork-answer-plan-1"},id:{type:"string",pattern:"^[a-z0-9][a-z0-9_-]{0,63}$"},rootBasis:{enum:["actual_recalled","reported_typicality"]},referentRole:{type:"string",minLength:1},optedInTopics:{type:"array",uniqueItems:true,items:{type:"string"}},focus:{const:"all"},details:{type:"array",uniqueItems:true,items:{enum:["state","body","urge","feeling","texture","recurrence","contrast"]}},missingStatus:{const:"not_sure"},answers:{type:"array",minItems:1,items:{type:"object",additionalProperties:false,required:["phase","questionId"],properties:{phase:{enum:["mapping","deepening"]},questionId:{type:"string",minLength:1},optionText:{type:"string",minLength:1},optionIds:{type:"array",minItems:1,uniqueItems:true,items:{type:"string",minLength:1}},status:{enum:["skip","not_sure","no_event","not_applicable"]},occurrenceId:{type:"string",minLength:1},stepId:{type:"string",minLength:1}},oneOf:[{required:["optionText"],not:{anyOf:[{required:["status"]},{required:["optionIds"]}]}},{required:["optionIds"],not:{anyOf:[{required:["status"]},{required:["optionText"]}]}},{required:["status"],not:{anyOf:[{required:["optionText"]},{required:["optionIds"]}]}}]}}}
};
export function parseAnswerPlan(value: unknown): AnswerPlan {
 assertNoRespondentClassification(value);
 const validate = new Ajv({allErrors:true,strict:false}).compile(planSchema);
 if (!validate(value)) throw new Error(`Invalid answer plan: ${validate.errors?.map(e => `${e.instancePath} ${e.message}`).join("; ")}`);
 return value as unknown as AnswerPlan;
}
export interface AssessmentRecord {
 schema:"patternwork-completed-assessment-1"; questionSourceSha256:string;
 mapping:Pwqe51SessionState; deepening:Pwqe51SessionState;
 transcript:unknown[]; contentSha256:string;
}
export class AssessmentPlanError extends Error {
 constructor(message:string, readonly state:Pwqe51SessionState,readonly transcript:unknown[]) {super(message);this.name="AssessmentPlanError";}
}
export function sealAssessment(input:Omit<AssessmentRecord,"schema"|"contentSha256">):AssessmentRecord {
 assertNoRespondentClassification(input);
 if (input.mapping.pass !== 1 || input.deepening.pass !== 2 || !canCompletePwqe51Pass(input.mapping) || !canCompletePwqe51Pass(input.deepening)) throw new Error("Both passes must be completed by the engine before sealing.");
 if (canonical(input.deepening.responses.slice(0,input.mapping.responses.length)) !== canonical(input.mapping.responses)) throw new Error("Deepening must retain the exact completed Mapping response prefix.");
 const content = {schema:"patternwork-completed-assessment-1" as const,...input};
 return {...content,contentSha256:contentHash(canonical(content))};
}
export function runAssessmentPlan(value:unknown,source:Pwqe51SourcePackage):AssessmentRecord {
 const plan = parseAnswerPlan(value), known = new Set(source.questionBank.items.map(q=>q.id));
 if (plan.answers.some(a=>!known.has(a.questionId))) throw new Error("Answer plan references a question outside the current bank.");
 let state=createPwqe51SessionState(source), mapping:Pwqe51SessionState|undefined;
 const transcript:unknown[]=[];
 for(let index=0;index<300;index++) {
  if (canCompletePwqe51Pass(state)) {
   if(state.pass===2) {
    if(!mapping) throw new Error("Mapping checkpoint missing.");
    return sealAssessment({mapping,deepening:state,transcript,questionSourceSha256:source.sourceManifestSha256});
   }
   mapping=structuredClone(state);
   state=startPwqe51Deepening(state,plan.optedInTopics,source,{focusOccurrences:pwqe51FocusChoices(state).map(x=>x.occurrenceId),details:plan.details});
  }
  const issued=renderPwqe51Interaction(state,source);
  if(!issued) throw new AssessmentPlanError("The engine requires a binding/control decision not represented by this plan. No answer was invented.",state,transcript);
  const context=issued as unknown as Record<string,unknown>;
  const candidates=plan.answers.filter(a=>a.phase===(state.pass===1?"mapping":"deepening")&&a.questionId===issued.questionId&&(!a.occurrenceId||a.occurrenceId===context.occurrenceId)&&(!a.stepId||a.stepId===context.stepId));
  if(new Set(candidates.map(a=>canonical({optionText:a.optionText??null,optionIds:a.optionIds??null,status:a.status??null}))).size>1) throw new AssessmentPlanError(`Ambiguous answer plan at issued question ${issued.questionId}; bind the alternatives to occurrence and step.`,state,transcript);
  const answer=candidates[0]??(plan.missingStatus?{status:plan.missingStatus}:undefined);
  if(!answer) throw new AssessmentPlanError(`No answer for issued question ${issued.questionId}. Add a choice or explicit missingness.`,state,transcript);
  const ids="optionIds" in answer&&answer.optionIds ? answer.optionIds : "optionText" in answer&&answer.optionText ? issued.options.filter(o=>o.label===answer.optionText).map(o=>o.id) : [];
  if (!answer.status && (!ids.length || ids.some(id=>!issued.options.some(o=>o.id===id)))) throw new AssessmentPlanError(`Selected answer does not match the issued variant of ${issued.questionId}.`,state,transcript);
  const responseId=`devr_${randomUUID()}`;
  const response = {completionState:answer.status==="skip"?"SKIPPED" as const:"COMPLETED" as const,responseId,selectedOptionIds:ids,...(answer.status?{status:answer.status}:{}),...(issued.rootBasisRequired&&!answer.status?{basis:plan.rootBasis}:{}),...(issued.referentSlotRequired&&!answer.status?{referentRole:plan.referentRole}:{})};
  transcript.push({issued,acceptedInput:response});
  try { state=advancePwqe51Session(state,response,source); }
  catch(error) { throw new AssessmentPlanError(error instanceof Error?error.message:"Engine rejected the answer.",state,transcript); }
 }
 throw new AssessmentPlanError("Assessment exceeded the harness safety limit without engine completion.",state,transcript);
}
export async function writeImmutableJson(file:string,value:unknown):Promise<void> {
 assertNoRespondentClassification(value);
 await mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const text=`${JSON.stringify(value,null,2)}\n`;
 try {await writeFile(file,text,{flag:"wx",mode:0o600});}
 catch(error) {
  if((error as NodeJS.ErrnoException).code!=="EEXIST") throw error;
  if(await readFile(file,"utf8")!==text) throw new Error(`Immutable artifact already exists with different bytes: ${file}`);
 }
}
export async function loadAssessment(file:string,source:Pwqe51SourcePackage):Promise<AssessmentRecord> {
 const value=JSON.parse(await readFile(file,"utf8")) as AssessmentRecord;
 assertNoRespondentClassification(value);
 const {contentSha256,...content}=value;
 if(value.schema!=="patternwork-completed-assessment-1"||contentHash(canonical(content))!==contentSha256||value.questionSourceSha256!==source.sourceManifestSha256||!isPwqe51SessionState(value.mapping)||!isPwqe51SessionState(value.deepening)) throw new Error("Assessment content, structure, or question-source binding is invalid.");
 const verified=sealAssessment({mapping:value.mapping,deepening:value.deepening,transcript:value.transcript,questionSourceSha256:value.questionSourceSha256});
 if(verified.contentSha256!==contentSha256) throw new Error("Assessment has unknown envelope fields.");
 assertAssessmentRoute(value,source);
 return value;
}
