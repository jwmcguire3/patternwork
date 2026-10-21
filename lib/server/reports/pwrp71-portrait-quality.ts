/** Editorial contracts for a portrait, not a taxonomy. Deterministic checks validate
 * shape, references and known failure signals; they do not certify psychological
 * truth or literary merit. Semantic judgments remain an independent review task.
 */
type Row = Record<string, any>;
export interface PortraitIssue { code: string; path: string; message: string }
export const EDITORIAL_DIMENSIONS = [
  'recognizable_opening', 'distinctive_throughline', 'human_names',
  'psychological_development', 'emotional_specificity', 'cumulative_structure',
  'plain_language', 'nonrepetition', 'grounded_possibility',
] as const;
export const PORTRAIT_FACETS = ['job','expectation','feared_outcome','cost','felt_experience','longing','release_condition','self_relationship'] as const;
const row = (v:unknown):Row => v && typeof v==='object'&&!Array.isArray(v)? v as Row : {};
const rows = (v:unknown):Row[] => Array.isArray(v)?v.map(row):[];
const ids = (v:unknown):string[] => Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];
const issue = (code:string,path:string,message:string):PortraitIssue => ({code,path,message});
const normalize = (v:unknown):string => String(v??'').replace(/\s+/gu,' ').trim();
export const isNarratable = (u:Row):boolean => u.delivery!=='guardrail';

/** Narrow mechanical bans on role-as-label and technical compound labels.
 * Whether a short name is humane, memorable and accurate is reviewed semantically.
 */
export function technicalPartLabel(label:string):boolean {
  const s=normalize(label).replace(/^the\s+/iu,'');
  return /\b(?:manager|firefighter|protector|exile|pattern|affect|regulation)\b/iu.test(s)
    || /\b(?:low[- ]input|overload[- ]vulnerable|relational caution|vulnerable part)\b/iu.test(s);
}

export function portraitFormulationIssues(form:Row):PortraitIssue[] {
  const out:PortraitIssue[]=[];
  if(form.formulation_contract!=='PWRP-FORMULATION-3')out.push(issue('portrait_contract','$.formulation_contract','This runtime requires a freshly bound version-3 formulation with explicit examination coverage.'));
  const units=new Map(rows(form.units).map(u=>[u.id,u]));
  const entities=new Map(rows(form.name_registry).map(n=>[n.name_id,n]));
  for(const [i,u] of rows(form.units).entries()){
    if(!['develop','embed','guardrail'].includes(u.delivery))out.push(issue('unit_delivery',`$.units[${i}].delivery`,'Choose development, embedded context, or a guardrail.'));
    if(u.delivery==='guardrail'&&u.importance==='core')out.push(issue('guardrail_not_topic',`$.units[${i}]`,'A private limit cannot be a compulsory topic. Express any substantive core meaning separately.'));
  }
  const center=ids(form.organizing_unit_ids).map(id=>units.get(id)).filter(Boolean) as Row[];
  if(!center.some(u=>u.delivery==='develop'&&!['context','contrast'].includes(u.kind)))out.push(issue('portrait_center','$.organizing_unit_ids','Organize around a substantive lived tension, not only distinctions or context.'));
  const previouslyDeveloped=new Set<string>();
  for(const [i,step] of rows(form.development_order).entries()){
    for(const id of [...ids(step.unit_ids),...ids(step.reframes_unit_ids)])if(!units.has(id))out.push(issue('development_reference',`$.development_order[${i}]`,'Development references must resolve to current meanings.'));
    for(const id of ids(step.reframes_unit_ids))if(units.has(id)&&!previouslyDeveloped.has(id))out.push(issue('development_order_reference',`$.development_order[${i}].reframes_unit_ids`,'Reframe a meaning developed in an earlier step, not a future or simultaneous topic.'));
    if(ids(step.unit_ids).length&&!ids(step.unit_ids).some(id=>{const u=units.get(id);return u&&isNarratable(u);}))out.push(issue('guardrail_section',`$.development_order[${i}]`,'Do not plan a section solely to explain classification boundaries.'));
    for(const id of ids(step.unit_ids))previouslyDeveloped.add(id);
  }
  const seen=new Set<string>();
  for(const [i,p] of rows(form.portraits).entries()){
    const path=`$.portraits[${i}]`, entity=entities.get(p.entity_id);
    if(!entity||entity.entity_kind!=='ifs_part'||seen.has(p.entity_id))out.push(issue('portrait_entity',path,'Portraits identify distinct retained IFS parts, not generic pattern groupings.'));
    seen.add(p.entity_id);
    for(const facet of PORTRAIT_FACETS)for(const id of ids(p[`${facet}_unit_ids`])){
      const u=units.get(id);
      if(!u||!isNarratable(u)||!ids(u.entity_ids).includes(p.entity_id))out.push(issue('portrait_facet_reference',`${path}.${facet}_unit_ids`,'A facet must reference a narratable meaning about this part.'));
      if(u&&facet==='self_relationship'&&u.kind!=='possibility')out.push(issue('portrait_possibility',`${path}.${facet}_unit_ids`,'A different relationship to a part is a possibility, not a measured achievement.'));
    }
    if(entity&&['manager','firefighter','protective_part'].includes(entity.role)&&!ids(p.job_unit_ids).length)out.push(issue('portrait_job',path,'A named protector needs a developed protective job.'));
    if(entity?.role==='exile'&&!ids(p.felt_experience_unit_ids).some(id=>{
      const u=units.get(id);return u&&u.delivery==='develop'&&u.importance==='core'&&['need','burden','pattern'].includes(u.kind);
    }))out.push(issue('exile_emotional_portrait',path,'An earned Exile needs a core developed experience, not only a role definition or a generic affect.'));
  }
  // These requirements apply to IFS authoring, not to synthesis silently renaming inherited identities.
  if(form.report_type==='IFS')for(const n of entities.values()){
    if(n.entity_kind==='ifs_part'&&!seen.has(n.name_id))out.push(issue('missing_part_portrait','$.portraits','Each named IFS part needs its unit-linked portrait.'));
    if(technicalPartLabel(n.name))out.push(issue('technical_part_name','$.name_registry','Use a familiar working name; keep the theoretical role in role.'));
  }
  return out;
}

export interface EditorialSignal { code:string; dimension:typeof EDITORIAL_DIMENSIONS[number]; section_id:string; quote:string }
/** Known, high-specificity regressions. No general ban on contrasts, negative
 * sentences, long words or conditional language; substantive differences matter.
 */
export function editorialSignals(draft:Row):EditorialSignal[]{
  const signals:EditorialSignal[]=[], sections=rows(draft.sections);
  const add=(code:string,dimension:EditorialSignal['dimension'],s:Row,quote:string)=>signals.push({code,dimension,section_id:s.id,quote});
  const first=sections[0];
  if(first){
    const opening=String(first.text??'').split(/\n\s*\n/u)[0];
    const labels=rows(draft.name_registry).filter(n=>opening.includes(n.name));
    if(labels.length>=3)add('cast_list_opening','recognizable_opening',first,opening);
  }
  const patterns:[string,RegExp][]=[
    ['opaque_affect',/[^.!?\n]*(?:associated affect|hard-to-bear affect|protected from internal contact)[^.!?\n]*[.!?]?/iu],
    ['classification_defense',/[^.!?\n]*(?:grouping them all|neither should be collapsed|does not give the self-criticism|the relief aim belongs to the explanation|do not reduce to one all-purpose)[^.!?\n]*[.!?]?/iu],
    ['opaque_position',/[^.!?\n]*changes the function of explanation with your position[^.!?\n]*[.!?]?/iu],
  ];
  const seen=new Map<string,{section:Row;text:string}>();
  for(const s of sections){
    for(const [code,re] of patterns){const hit=String(s.text??'').match(re);if(hit)add(code,'plain_language',s,hit[0].trim());}
    for(const paragraph of String(s.text??'').split(/\n\s*\n/u)){
      const key=normalize(paragraph).toLowerCase();
      if(key.length>80&&seen.has(key))add('duplicate_paragraph','nonrepetition',s,paragraph);
      seen.set(key,{section:s,text:paragraph});
    }
  }
  for(const n of rows(draft.name_registry))if(technicalPartLabel(n.name)){
    const s=sections.find(s=>String(s.text??'').includes(n.name)||String(s.heading??'').includes(n.name));
    if(s)add('technical_part_name','human_names',s,n.name);
  }
  return signals;
}

/** A pass needs a concrete, exact prose anchor. Failures cannot be averaged away.
 * This binds judgments to this text; it still does not prove a judge is correct.
 */
export function editorialReviewIssues(review:Row,draft:Row):PortraitIssue[]{
  if(review.verdict==='invalid_input')return []; // source failures are not a literary judgment
  const out:PortraitIssue[]=[], assessment=row(review.editorial_assessment);
  const sections=rows(draft.sections), sectionMap=new Map(sections.map(s=>[s.id,s]));
  let hasFailure=false, requiresFormulation=false;
  for(const dimension of EDITORIAL_DIMENSIONS){
    const a=row(assessment[dimension]), path=`$.editorial_assessment.${dimension}`;
    if(!['pass','revise','not_applicable'].includes(a.status)||!normalize(a.rationale)){
      out.push(issue('editorial_judgment_required',path,'Each editorial dimension needs an explicit anchored judgment.'));continue;
    }
    const anchors=rows(a.anchors);
    for(const anchor of anchors){
      const s=sectionMap.get(anchor.section_id),q=normalize(anchor.quote);
      if(!s||q.length<8||!normalize(`${s.heading}\n${s.text}`).includes(q))out.push(issue('editorial_anchor',path,'Quote an exact, substantive passage in the indicated current section.'));
    }
    if(a.status==='pass'){
      if(!anchors.length)out.push(issue('editorial_anchor_required',path,'A positive judgment must identify the passage that earns it.'));
      if(a.repair_owner!=='none')out.push(issue('editorial_owner',path,'Passing judgments have no repair owner.'));
      if(dimension==='recognizable_opening'&&!anchors.some(a=>a.section_id===sections[0]?.id))out.push(issue('editorial_opening_anchor',path,'Assess the opening, not a stronger passage later.'));
      if(dimension==='cumulative_structure'&&sections.length>1&&new Set(anchors.map(a=>a.section_id)).size<2)out.push(issue('editorial_progression_anchor',path,'Show how an earlier and later section develop understanding.'));
    }else if(a.status==='revise'){
      hasFailure=true;
      if(!['formulation','narrative'].includes(a.repair_owner))out.push(issue('editorial_owner',path,'An editorial failure needs a stage-specific repair owner.'));
      if(a.repair_owner==='formulation')requiresFormulation=true;
      // Missing material can be located by an issue rather than a nonexistent quotation.
      if(!anchors.length&&!rows(review.issues).some(i=>ids(i.section_ids).length||ids(i.evidence_ids).length))out.push(issue('editorial_failure_location',path,'Locate a deficient passage or the source-supported omission.'));
    }else{
      if(!['human_names','emotional_specificity','grounded_possibility'].includes(dimension))out.push(issue('editorial_na',path,'This editorial dimension always applies to a report.'));
      if(dimension==='human_names'&&rows(draft.name_registry).length)out.push(issue('editorial_na',path,'Names exist and must be evaluated.'));
      if(dimension==='emotional_specificity'&&rows(draft.name_registry).some(n=>['exile','vulnerable_part'].includes(n.role)))out.push(issue('editorial_na',path,'A named vulnerable part or Exile requires emotional development.'));
      if(a.repair_owner!=='none')out.push(issue('editorial_owner',path,'Not-applicable judgments have no repair owner.'));
    }
  }
  for(const signal of editorialSignals(draft)){
    if(row(assessment[signal.dimension]).status!=='revise')out.push(issue('unresolved_editorial_signal',`$.editorial_assessment.${signal.dimension}`,`Known regression ${signal.code} requires revision, not an adequacy declaration.`));
    if(signal.code==='technical_part_name')requiresFormulation=true;
  }
  if(hasFailure&&(review.verdict!=='revise'||row(row(review.quality_assessment).narrative_quality).status!=='revise'))out.push(issue('editorial_verdict','$.verdict','Any failed editorial dimension requires revision and a deficient narrative-quality judgment.'));
  if(requiresFormulation&&review.revision_target!=='formulation')out.push(issue('editorial_route','$.revision_target','Changed names or meanings require formulation repair, not a synonym in prose.'));
  return out;
}
