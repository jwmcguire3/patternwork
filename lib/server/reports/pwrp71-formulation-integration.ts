import Ajv2020 from 'ajv/dist/2020.js';
import type { JsonObject, ValidationIssue } from '../../question-engine/types.ts';
import type { Pwrp71SourcePackage } from './pwrp71-source.ts';
import { assertNoRespondentClassification, assertNoRespondentFullNameInGeneratedDraft } from './content-boundary.ts';
import { validatePwrp71ClaimGraph, CLAIM_GRAPH_VERSION } from './pwrp71-claim-graph.ts';
import { digest, FORMULATION_RUNTIME, type Row, type Stage } from './pwrp71-formulation-core.ts';
export function layerKey(reportType:string): 'mapping'|'ifs'|'state'|'attachment'|'synthesis' {
  switch(reportType){case 'MAP':return 'mapping';case 'IFS':return 'ifs';case 'PV':return 'state';case 'ATT':return 'attachment';case 'SYNTHESIS':return 'synthesis';default:throw new Error('Unknown report type');}
}
export function analysisDigest(source:Pwrp71SourcePackage, reportType:string, authoredContext:unknown, scopeGuidance:unknown, acceptedLayerGraphs:unknown = null):string {
  return digest({runtime:FORMULATION_RUNTIME,graph:CLAIM_GRAPH_VERSION,
    shared:source.prompts.shared,analyst:source.prompts.formulation,layer:source.prompts[layerKey(reportType)],
    guide:source.constructGuide,schema:source.schemas.reportFormulation,
    authored_question_context:authoredContext,scope_guidance:scopeGuidance,
    accepted_layer_graphs:reportType === 'SYNTHESIS' ? acceptedLayerGraphs : null});
}
export function stageSystem(source:Pwrp71SourcePackage, reportType:string, stage:Stage, repair=false):string {
  const blocks=stage==='formulation'
    ? [source.prompts.shared,source.constructGuide,source.prompts[layerKey(reportType)],source.prompts.formulation]
    : [source.prompts.voiceCompanion,source.prompts.narrative];
  // Analytical layer instructions stay with the analyst/reviewer, never the narrator.
  if(repair)blocks.push(source.prompts.repair);
  return blocks.join('\n\n');
}
export function createStageChecker(source:Pwrp71SourcePackage, packet:JsonObject):(stage:Stage,value:Row)=>ValidationIssue[] {
  const ajv=new Ajv2020({allErrors:true,strict:false});
  const validators={formulation:ajv.compile(source.schemas.reportFormulation as object),narrative:ajv.compile(source.schemas.reportNarrative as object)};
  return (stage,value)=>{
    const problems:ValidationIssue[]=[];
    try {assertNoRespondentClassification(value);assertNoRespondentFullNameInGeneratedDraft(value);}catch(error){return [{code:'stage_privacy',path:'$',message:String(error)}];}
    const validate=validators[stage];
    if(!validate(value))return (validate.errors??[]).map(e=>({code:'stage_schema',path:e.instancePath||'$',message:e.message||'Stage schema failed.'}));
    if(stage==='formulation')validatePwrp71ClaimGraph(value,packet,problems,false);
    return problems;
  };
}
