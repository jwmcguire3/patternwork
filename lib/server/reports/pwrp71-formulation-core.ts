/** Formulation-first reporting. No provider, filesystem, or app-global dependencies.
 * All external effects are injected through the existing journaled generator.
 * IDs/hashes establish provenance, never semantic truth.
 */
import { createHash } from 'node:crypto';
import { portraitFormulationIssues, editorialReviewIssues, isNarratable, PORTRAIT_FACETS } from './pwrp71-portrait-quality.ts';
export type Row = Record<string, any>;
export interface Issue { code: string; path: string; message: string }
export type Stage = 'formulation' | 'narrative';
export const FORMULATION_RUNTIME = 'pwrp71-portrait-first-3';
export interface Binding {
  report_type: string; report_release: string; release_id: string;
  snapshot_id: string; evidence_sha256: string; analysis_sha256: string;
}
export interface FormulationEnvelope {
  contract: 'PWRP-FORMULATION-ENVELOPE-1'; binding: Binding;
  authoring_manifest_sha256: string; formulation: Row; content_sha256: string;
}
export function canonical(value: unknown): string {
  if (value === undefined) throw new Error('Undefined is not canonical JSON.');
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map(k => `${JSON.stringify(k)}:${canonical(row[k])}`).join(',')}}`;
}
export function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function plain(value: unknown): Row { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}; }
export function rows(value: unknown): Row[] { return Array.isArray(value) ? value.map(plain) : []; }
function ids(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []; }
function issue(code: string, path: string, message: string): Issue { return { code, path, message }; }
function index(value: unknown, key: string, path: string, out: Issue[]): Map<string, Row> {
  const result = new Map<string, Row>();
  for (const [i, r] of rows(value).entries()) {
    if (typeof r[key] !== 'string' || !r[key] || result.has(r[key])) out.push(issue('duplicate_id', `${path}[${i}].${key}`, 'IDs must be nonempty and unique.'));
    else result.set(r[key], r);
  }
  return result;
}
export function claimClosure(form: Row, roots: readonly string[]): string[] {
  const claims = new Map(rows(form.claims).map(c => [c.id, c]));
  const done = new Set<string>(), visiting = new Set<string>();
  function visit(id: string): void {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`Claim cycle at ${id}`);
    const claim = claims.get(id); if (!claim) throw new Error(`Unknown claim ${id}`);
    visiting.add(id); ids(claim.depends_on_claim_ids).forEach(visit); visiting.delete(id); done.add(id);
  }
  roots.forEach(visit); return [...done].sort();
}

/** Obvious lexical leakage only; independent review must inspect semantic leakage. */
export function narrativeLeakage(text: string): Issue[] {
  const patterns: [string, RegExp][] = [
    ['assessment_narration', /\byou (?:selected|reported|chose|recalled|described|answered)\b/iu],
    ['scenario_narration', /\b(?:in (?:the|a|one|another|a separate) (?:evaluation|mistake|boundary|help|praise|repair|overload|delayed.message|demanding.day)?\s*(?:situation|scenario|account)|across (?:these |the )?sampled (?:situations|contexts))\b/iu],
    ['evidence_defense', /\b(?:the evidence (?:does not|doesn't|cannot)|not enough evidence|not (?:established|determined)|your (?:responses|answers) suggest)\b/iu],
    ['invented_biography', /\b(?:as a child|growing up|your childhood|your parents taught|you learned long ago|years of .* taught you)\b/iu],
    ['opaque_identifier', /\b(?:pwep_[a-z0-9-]+|O[a-f0-9]{19,})\b/u],
  ];
  return patterns.filter(([, re]) => re.test(text)).map(([code]) => issue(code, '$.reader_text', 'Reader text contains assessment narration, invented history, or private audit language.'));
}

/** Explicit projection. Previous prose is never a source of new formulation. */
export function analystSource(input: Row): Row {
  const { accepted_layers, report_markdown, draft, ...source } = input;
  if (!accepted_layers) return source;
  const accepted_layer_graphs: Row = {};
  for (const [type, value] of Object.entries(plain(accepted_layers))) {
    const d = plain(value);
    accepted_layer_graphs[type] = {
      report_type: d.report_type, evidence_sha256: d.evidence_sha256, snapshot_id: d.snapshot_id,
      claims: d.claims, relationships: d.relationships,
      label_registry: rows(d.name_registry).map(({ name, ...r }) => ({ ...r, label: name })),
    };
  }
  return { ...source, accepted_layer_graphs };
}
/** Validated author-generated name_registry.name -> label, not identity scrubbing. */
export function providerFormulation(form: Row): Row {
  const { name_registry, ...rest } = form;
  return { ...rest, label_registry: rows(name_registry).map(({ name, ...r }) => ({ ...r, label: name })) };
}
export function writerView(form: Row): Row {
  // This is a literal allowlist for first drafts AND repairs. Guardrails are
  // constraints on meaning, not compulsory paragraphs or citable claims.
  const visibleUnits=rows(form.units).filter(isNarratable);
  return {
    report_type: form.report_type,
    units: visibleUnits.map(u => ({ id:u.id, kind:u.kind, statement:u.statement,
      applicability:u.applicability, importance:u.importance, delivery:u.delivery, entity_ids:u.entity_ids })),
    constraints: rows(form.units).filter(u=>!isNarratable(u)).map(u=>({id:u.id,statement:u.statement,applicability:u.applicability})),
    entities: rows(form.name_registry).map(n => ({id:n.name_id,label:n.name,role:n.role,entity_kind:n.entity_kind})),
    portraits: rows(form.portraits).map(p=>({entity_id:p.entity_id,...Object.fromEntries(PORTRAIT_FACETS.map(f=>[`${f}_unit_ids`,ids(p[`${f}_unit_ids`])]))})),
    relationships: rows(form.relationships).map(r => ({id:r.id,from_entity_id:r.from_name_id,
      to_entity_id:r.to_name_id,relation:r.relation,
      unit_ids:visibleUnits.filter(u=>ids(u.claim_ids).some(id=>ids(r.claim_ids).includes(id))).map(u=>u.id)})),
    organizing_unit_ids: form.organizing_unit_ids,
    development_order: rows(form.development_order).map(r=>({purpose:r.purpose,unit_ids:r.unit_ids,reframes_unit_ids:r.reframes_unit_ids})),
  };
}
export function validateFormulationMeaning(form: Row, binding: Binding, source: Row): Issue[] {
  const out: Issue[] = [...portraitFormulationIssues(form)];
  for (const key of ['report_type','report_release','release_id','snapshot_id','evidence_sha256'] as const) {
    if (form[key] !== binding[key]) out.push(issue('formulation_binding', `$.${key}`, 'Formulation must bind to the current assessment and selected report.'));
  }
  const claims = index(form.claims, 'id', '$.claims', out), units = index(form.units, 'id', '$.units', out);
  const names = index(form.name_registry, 'name_id', '$.name_registry', out);
  const relations = index(form.relationships, 'id', '$.relationships', out);
  const settled = (id: string) => ['reported','supported_interpretation'].includes(claims.get(id)?.kind);
  for (const [i, u] of rows(form.units).entries()) {
    for (const id of ids(u.claim_ids)) if (!claims.has(id) || !settled(id)) out.push(issue('unit_open_claim', `$.units[${i}].claim_ids`, 'Narrator units require settled, source-supported premises.'));
    for (const id of ids(u.entity_ids)) if (!names.has(id)) out.push(issue('unit_entity', `$.units[${i}].entity_ids`, 'Unknown entity.'));
    out.push(...narrativeLeakage(`${u.statement} ${u.applicability}`).map(x => ({...x, path:`$.units[${i}]`})));
  }
  for (const id of ids(form.organizing_unit_ids)) if (!units.has(id)) out.push(issue('organizing_unit', '$.organizing_unit_ids', 'Unknown meaning unit.'));
  for (const r of rows(form.development_order)) {
    out.push(...narrativeLeakage(String(r.purpose)));
    for (const id of ids(r.unit_ids)) if (!units.has(id)) out.push(issue('development_unit', '$.development_order', 'Unknown meaning unit.'));
  }
  for (const [id] of names) if (!rows(form.units).some(u => ids(u.entity_ids).includes(id))) out.push(issue('entity_without_meaning', '$.name_registry', 'Every retained entity needs a narrator-safe meaning unit.'));
  for (const [, r] of relations) if (!rows(form.units).some(u => isNarratable(u) && ids(u.claim_ids).some(id => ids(r.claim_ids).includes(id)))) out.push(issue('relationship_without_meaning', '$.relationships', 'A retained relationship requires an explanatory unit.'));
  const observations = new Set(rows(source.observations).map(r => r.id));
  const covered = rows(form.coverage).flatMap(r => ids(r.observation_ids));
  if (covered.length !== observations.size || new Set(covered).size !== covered.length || covered.some(id => !observations.has(id))) out.push(issue('formulation_coverage', '$.coverage', 'Partition the exact current observations once; this does not require narrating them.'));
  for (const a of rows(form.alternatives)) for (const id of ids(a.evidence_ids)) if (!observations.has(id)) out.push(issue('alternative_evidence', '$.alternatives', 'Alternative cites noncurrent evidence.'));
  const assessments = rows(form.exile_assessments);
  for (const [i, a] of assessments.entries()) {
    const examined = new Set(ids(a.examined_claim_ids));
    if (!Array.isArray(a.examined_claim_ids)) out.push(issue('examination_required', `$.exile_assessments[${i}].examined_claim_ids`, 'List the claims explicitly examined by this assessment.'));
    for (const id of examined) {
      if (!claims.has(id)) out.push(issue('examination_reference', `$.exile_assessments[${i}].examined_claim_ids`, `Unknown examined claim "${id}".`));
      else if (!settled(id)) out.push(issue('examination_unsettled', `$.exile_assessments[${i}].examined_claim_ids`, `Examined claim "${id}" must be reported or a supported interpretation.`));
    }
    for (const field of ['affect_claim_ids','exclusion_claim_ids','relationship_claim_ids']) for (const id of ids(a[field])) {
      if (!claims.has(id)) out.push(issue('exile_reference', `$.exile_assessments[${i}].${field}`, 'Unknown claim.'));
      if (!examined.has(id)) out.push(issue('examination_warrant_coverage', `$.exile_assessments[${i}].${field}`, `Warrant claim "${id}" must also appear in this assessment's examined_claim_ids.`));
    }
    for (const id of ids(a.protector_name_ids)) if (!names.has(id)) out.push(issue('exile_reference', `$.exile_assessments[${i}]`, 'Unknown protector.'));
    if (a.decision !== 'earned_exile') continue;
    if (names.get(a.name_id)?.role !== 'exile') out.push(issue('exile_role', `$.exile_assessments[${i}]`, 'An earned Exile must be registered as an Exile, not euphemized.'));
    for (const field of ['affect_claim_ids','exclusion_claim_ids','relationship_claim_ids']) if (!ids(a[field]).length || ids(a[field]).some(id => !settled(id))) out.push(issue('exile_warrant', `$.exile_assessments[${i}].${field}`, 'Earned Exiles require settled present affect, exclusion and protective-relationship warrants.'));
    if (!ids(a.exclusion_claim_ids).some(id => ids(claims.get(id)?.constructs).includes('internal_exclusion'))) out.push(issue('exile_exclusion', `$.exile_assessments[${i}]`, 'Internal exclusion needs explicit formulation, not an inferred age or history.'));
    if (!ids(a.protector_name_ids).some(id => ['manager','firefighter','protective_part','context_dependent'].includes(names.get(id)?.role))) out.push(issue('exile_protector', `$.exile_assessments[${i}]`, 'Identify the protective relationship.'));
    if (!rows(form.units).some(u => u.importance === 'core' && ids(u.entity_ids).includes(a.name_id) && ['need','burden','mechanism'].includes(u.kind))) out.push(issue('exile_development', `$.exile_assessments[${i}]`, 'Earned Exiles need core emotional meaning, not merely a label.'));
  }
  if (form.report_type === 'IFS') {
    // Coverage is an explicit assertion, separate from present Exile warrants.
    // Dependencies do not imply that a later claim has been examined.
    const examined=new Set(assessments.flatMap(a=>ids(a.examined_claim_ids)).filter(settled));
    for(const [i,c] of rows(form.claims).entries())if(settled(c.id)&&ids(c.constructs).some(k=>['vulnerable_theme','vulnerable_part','burden','internal_exclusion','exile'].includes(k))&&!examined.has(c.id)) {
      out.push(issue('unexamined_vulnerability',`$.claims[${i}].constructs`,`Claim "${c.id}" needs explicit coverage in an exile_assessment.examined_claim_ids list. Reuse the matching assessment when its reasoning covers this claim; examine genuinely new vulnerability separately.`));
    }
  }
  for (const [id,n] of names) if (n.role === 'exile' && !assessments.some(a => a.name_id === id && a.decision === 'earned_exile')) out.push(issue('unexamined_exile', '$.name_registry', 'Every Exile requires an earned-Exile decision.'));
  if (form.report_type !== 'IFS' && form.report_type !== 'SYNTHESIS' && (assessments.length || [...names.values()].some(n => n.entity_kind === 'ifs_part'))) out.push(issue('lens_conflation', '$.name_registry', 'This lens must not manufacture an IFS cast.'));
  if (form.report_type === 'SYNTHESIS') {
    const layers = plain(source.accepted_layer_graphs);
    if (Object.keys(layers).sort().join(',') !== 'ATT,IFS,PV') out.push(issue('synthesis_layers', '$.source', 'Exactly IFS, PV and ATT source graphs are required.'));
    for (const [type, layer] of Object.entries(layers)) {
      if (layer.evidence_sha256 !== binding.evidence_sha256 || layer.snapshot_id !== binding.snapshot_id) out.push(issue('synthesis_binding', `$.accepted_layer_graphs.${type}`, 'Layers must share this source snapshot.'));
    }
    const referencedTypes = new Set<string>();
    for (const lr of rows(form.layer_references)) {
      referencedTypes.add(lr.report_type); const c = new Set(rows(layers[lr.report_type]?.claims).map(r => r.id));
      for (const id of ids(lr.claim_ids)) if (!c.has(id)) out.push(issue('layer_claim', '$.layer_references', 'Unknown layer-qualified claim.'));
    }
    if (referencedTypes.size !== 3) out.push(issue('layer_omission', '$.layer_references', 'Inspect all three accepted layer graphs.'));
    const inherited = new Map<string, Row>();
    for (const layer of Object.values(layers)) for (const n of rows(layer.label_registry)) {
      const prior = inherited.get(n.name_id);
      if (prior && (prior.label !== n.label || prior.role !== n.role)) out.push(issue('layer_identity_conflict', '$.source', 'Repair the accepted layer identity upstream.'));
      inherited.set(n.name_id,n);
    }
    for (const n of names.values()) {
      const parent = inherited.get(n.name_id);
      if (parent && (parent.label !== n.name || parent.role !== n.role)) out.push(issue('layer_identity_conflict', '$.name_registry', 'Synthesis cannot rename or reclassify an inherited identity.'));
      if (!parent && n.entity_kind === 'ifs_part') out.push(issue('new_synthesis_part', '$.name_registry', 'Repair/extend the IFS layer first; synthesis cannot add a new IFS part.'));
    }
  } else if (rows(form.layer_references).length) out.push(issue('unexpected_layers', '$.layer_references', 'Only synthesis consumes layer interpretations.'));
  return out;
}
export function sealFormulation(form: Row, binding: Binding, manifest: string): FormulationEnvelope {
  const payload = { contract:'PWRP-FORMULATION-ENVELOPE-1' as const, binding, authoring_manifest_sha256:manifest, formulation:form };
  return { ...payload, content_sha256:digest(payload) };
}
export function seedIssues(seed: FormulationEnvelope, binding: Binding): Issue[] {
  if (!seed || typeof seed !== 'object' || !seed.binding || !seed.formulation || typeof seed.content_sha256 !== 'string') {
    return [issue('formulation_seed_shape','$','Saved formulation envelope is malformed.')];
  }
  const { content_sha256, ...payload } = seed;
  const out: Issue[]=[];
  if (seed.contract !== 'PWRP-FORMULATION-ENVELOPE-1' || digest(payload) !== content_sha256) out.push(issue('formulation_digest','$','Saved formulation has changed.'));
  if (canonical(seed.binding) !== canonical(binding)) out.push(issue('formulation_stale','$','Assessment or analytical contract changed; re-formulate. Voice-only changes may reuse the formulation.'));
  return out;
}
export function narrativeIssues(form: Row, narrative: Row): Issue[] {
  const out: Issue[]=[]; const units=index(form.units,'id','$.units',out); const seen=new Set<string>();
  index(narrative.sections,'id','$.sections',out);
  const refs=[...ids(narrative.title_unit_ids),...rows(narrative.sections).flatMap(s => rows(s.paragraphs).flatMap(p => ids(p.unit_ids)))];
  for (const id of refs) { if (units.has(id)&&!isNarratable(units.get(id)!)) out.push(issue('guardrail_citation','$','A guardrail must constrain the portrait, not become a narrated unit.')); if (!units.has(id)) out.push(issue('narrative_unit','$','Narrator introduced an unknown meaning unit.')); else seen.add(id); }
  for (const u of units.values()) if (!rows(narrative.formulation_requests).length && u.importance==='core' && isNarratable(u) && !seen.has(u.id)) out.push(issue('missing_core_unit','$','Core meaning omitted: '+u.id));
  for(const request of rows(narrative.formulation_requests)){
    if(!ids(request.unit_ids).length||ids(request.unit_ids).some(id=>!units.has(id)))out.push(issue('formulation_request_reference','$.formulation_requests','Request expansion of an existing meaning, not invented material.'));
  }
  const text=[narrative.title,...rows(narrative.sections).flatMap(s => [s.heading,...rows(s.paragraphs).map(p => p.text)])].join('\n\n');
  out.push(...narrativeLeakage(text));
  return out;
}
export function compileNarrative(form: Row, narrative: Row, formulationSha: string): Row {
  if(rows(narrative.formulation_requests).length)throw new Error('A narrative requesting reformulation cannot be compiled for delivery.');
  const problems=narrativeIssues(form,narrative);if(problems.length)throw new Error(JSON.stringify(problems));
  const unitById=new Map(rows(form.units).map(u=>[u.id,u]));
  const names=rows(form.name_registry);
  function supports(unitIds:string[]):string[] {
    const us=unitIds.map(id=>unitById.get(id)!);
    const entityIds=new Set(us.flatMap(u=>ids(u.entity_ids)));
    return claimClosure(form,[...us.flatMap(u=>ids(u.claim_ids)),...names.filter(n=>entityIds.has(n.name_id)).flatMap(n=>ids(n.supporting_claim_ids))]);
  }
  const titleClaims=supports(ids(narrative.title_unit_ids));
  const sections=rows(narrative.sections).map(s=>({id:s.id,heading:s.heading,text:rows(s.paragraphs).map(p=>p.text).join('\n\n'),claim_ids:supports(rows(s.paragraphs).flatMap(p=>ids(p.unit_ids)))}));
  const claimed=new Set([...titleClaims,...sections.flatMap(s=>s.claim_ids)]);
  const usedUnits=[...ids(narrative.title_unit_ids),...rows(narrative.sections).flatMap(s=>rows(s.paragraphs).flatMap(p=>ids(p.unit_ids)))].map(id=>unitById.get(id)!);
  const entityIds=new Set(usedUnits.flatMap(u=>ids(u.entity_ids)));
  const metadata=Object.fromEntries(['report_release','release_id','snapshot_id','evidence_sha256','report_type'].map(k=>[k,form[k]]));
  return {...metadata, formulation_sha256:formulationSha,title:narrative.title,title_claim_ids:titleClaims,content_status:'complete',sections,
    claims:rows(form.claims).filter(c=>claimed.has(c.id)),name_registry:names.filter(n=>entityIds.has(n.name_id)),
    relationships:rows(form.relationships).filter(r=>entityIds.has(r.from_name_id)&&entityIds.has(r.to_name_id)&&ids(r.claim_ids).every(id=>claimed.has(id))),reflection_questions:[]};
}
/** Persist the private formulation without changing the deterministic report identity. */
export function attachFormulation<A extends Row>(artifact:A, envelope:FormulationEnvelope):A {
  const {digests:oldDigests,...contents}=artifact;
  const withFormulation={...contents,formulation:envelope};
  return {...withFormulation,digests:{...oldDigests,artifact_sha256:digest(withFormulation)}} as unknown as A;
}
export function artifactFormulationIssues(artifact:Row):Issue[] {
  const seed=artifact.formulation as FormulationEnvelope;
  if(!seed||!seed.binding)return [issue('missing_formulation','$.formulation','This report requires its private source-bound formulation.')];
  const out=seedIssues(seed,seed.binding);if(out.length)return out;
  const draft=plain(artifact.draft),form=seed.formulation;
  if(draft.formulation_sha256!==seed.content_sha256)out.push(issue('artifact_formulation_binding','$.draft.formulation_sha256','Draft and formulation differ.'));
  for(const k of ['report_type','report_release','release_id','snapshot_id','evidence_sha256'])if(draft[k]!==form[k]||form[k]!==plain(seed.binding)[k])out.push(issue('artifact_formulation_binding',`$.formulation.${k}`,'Formulation must bind to this report and evidence.'));
  for(const [field,key] of [['claims','id'],['name_registry','name_id'],['relationships','id']]){
    const originals=new Map(rows(form[field]).map(r=>[r[key],r]));
    for(const r of rows(draft[field]))if(!originals.has(r[key])||canonical(originals.get(r[key]))!==canonical(r))out.push(issue('compiled_claim_drift',`$.draft.${field}`,'Compiled assertions and identities must be exact projections, never new interpretations.'));
  }
  return out;
}
export function reviewRoutingIssues(review:Row, form:Row, sectionIds:readonly string[]):Issue[] {
  const out:Issue[]=[];
  const units=new Set(rows(form.units).map(u=>u.id));const sections=new Set(sectionIds);
  const tasks=rows(review.narrative_tasks);
  const narrative=review.verdict==='revise'&&review.revision_target==='narrative';
  if(narrative&&tasks.length===0)out.push(issue('missing_narrative_tasks','$.narrative_tasks','A narrative revision requires bounded editorial tasks.'));
  if(!narrative&&tasks.length>0)out.push(issue('unexpected_narrative_tasks','$.narrative_tasks','Only a narrative revision may issue narrator tasks.'));
  for(const t of tasks){
    for(const id of ids(t.unit_ids))if(!units.has(id))out.push(issue('task_unit','$.narrative_tasks','Unknown formulation unit.'));
    for(const id of ids(t.section_ids))if(!sections.has(id))out.push(issue('task_section','$.narrative_tasks','Unknown current section.'));
    if(!ids(t.unit_ids).length&&!ids(t.section_ids).length)out.push(issue('unlocated_narrative_task','$.narrative_tasks','Locate the requested correction.'));
  }
  return out;
}
export interface StageResponse { ok:boolean; output?:Row; finishReason?:string; message?:string }
export interface ReviewResult { ok:boolean; verdict?:'accept'|'revise'|'invalid_input'; review?:Row; issues?:Issue[] }
export interface PipelineOptions<A> {
  binding:Binding; manifest:string; source:Row; seed?:FormulationEnvelope;
  call:(stage:Stage, data:Row, repair:boolean)=>Promise<StageResponse>;
  check:(stage:Stage, value:Row)=>Issue[];
  validateDraft:(draft:Row, envelope:FormulationEnvelope)=>Promise<{ok:true;artifact:A}|{ok:false;issues:Issue[]}>;
  review:(artifact:A, envelope:FormulationEnvelope, revised:boolean)=>Promise<ReviewResult>;
  saveFormulation:(form:FormulationEnvelope)=>Promise<void>;
}
export type PipelineResult<A> = {ok:true;artifact:A;formulation:FormulationEnvelope;narrative:Row}|{ok:false;code:string;issues:Issue[]};
/** Three ordinary calls; <=1 structural correction per stage per pass;
 * <=1 semantic revision pass. No escalation, unbounded repair or silent accept.
 */
export async function runFormulationPipeline<A>(o:PipelineOptions<A>):Promise<PipelineResult<A>> {
  const fail=(code:string,issues:Issue[]=[]):PipelineResult<A>=>({ok:false,code,issues});
  let envelope=o.seed; let narrative:Row|undefined;
  let target:'formulation'|'narrative'='formulation';let feedback:Row|undefined;
  if(envelope){const bad=seedIssues(envelope,o.binding);if(bad.length)return fail('formulation_seed_rejected',bad);const errors=[...o.check('formulation',envelope.formulation),...validateFormulationMeaning(envelope.formulation,o.binding,o.source)];if(errors.length)return fail('formulation_seed_rejected',errors);}
  for(let pass=0;pass<2;pass++){
    if(!envelope|| (pass>0&&target==='formulation')){
      let previous:Row|undefined;let errors:Issue[]=[];let accepted:Row|undefined;
      for(let attempt=0;attempt<2;attempt++){
        const response=await o.call('formulation',{source:o.source,binding:o.binding,...(feedback?{feedback}:{}),...(previous?{rejected_output:previous,validator_feedback:errors}: {})},pass>0||attempt>0);
        if(!response.ok||response.finishReason!=='stop'||!response.output)return fail('incomplete_or_failed_formulation');
        previous=response.output;errors=[...o.check('formulation',previous),...validateFormulationMeaning(previous,o.binding,o.source)];
        if(!errors.length){accepted=previous;break;}
      }
      if(!accepted)return fail('formulation_validation',errors);
      envelope=sealFormulation(accepted,o.binding,o.manifest);await o.saveFormulation(envelope);
    }
    const form=envelope.formulation;let errors:Issue[]=[];let written:Row|undefined;
    // A formulation revision discards the old prose to avoid stale-meaning anchoring.
    if(target==='formulation')narrative=undefined;
    for(let attempt=0;attempt<2;attempt++){
      const response=await o.call('narrative',{writer_view:writerView(form),...(target==='narrative'&&feedback?{editorial_feedback:feedback}:{}),...(narrative?{previous_narrative:narrative}:{}),...(errors.length?{validator_feedback:errors}: {})},pass>0||attempt>0);
      if(!response.ok||response.finishReason!=='stop'||!response.output)return fail('incomplete_or_failed_narrative');
      narrative=response.output; errors=[...o.check('narrative',narrative),...narrativeIssues(form,narrative)];
      if(!errors.length){written=narrative;break;}
    }
    if(!written)return fail('narrative_validation',errors);
    if(rows(written.formulation_requests).length){
      if(pass===1)return fail('formulation_expansion_limit');
      target='formulation';
      feedback={narrator_requests:rows(written.formulation_requests).map(r=>({aspect:r.aspect,unit_ids:ids(r.unit_ids)})),
        previous_formulation:providerFormulation(form),
        instruction:'Examine the requested missing meaning against source. Develop what is earned; narrow or omit what is not. Do not invent to satisfy a facet.'};
      continue;
    }
    const compiled=compileNarrative(form,written,envelope.content_sha256);
    const built=await o.validateDraft(compiled,envelope);
    if(!built.ok)return fail('compiled_draft_validation',built.issues);
    const reviewed=await o.review(built.artifact,envelope,pass>0);
    if(!reviewed.ok||!reviewed.review)return fail('review_validation',reviewed.issues??[]);
    const r=reviewed.review;
    const routing=reviewRoutingIssues({...r,verdict:reviewed.verdict},form,rows(written.sections).map(s=>s.id));
    if(routing.length)return fail('review_route_validation',routing);
    const editorial=editorialReviewIssues({...r,verdict:reviewed.verdict},compiled);
    if(editorial.length)return fail('review_editorial_validation',editorial);
    if(r.reviewed_formulation_sha256!==envelope.content_sha256)return fail('review_formulation_binding');
    if(reviewed.verdict==='accept'){
      if(r.revision_target!=='none')return fail('review_route_mismatch');
      return {ok:true,artifact:built.artifact,formulation:envelope,narrative:written};
    }
    if(reviewed.verdict==='invalid_input')return fail('review_invalid_input');
    if(pass===1)return fail('review_not_accepted');
    if(!['formulation','narrative'].includes(r.revision_target))return fail('review_route_mismatch');
    target=r.revision_target;
    // Narrative repair receives no free-form reviewer/source text: section/unit IDs
    // and typed editorial tasks only. Full review remains in the journal.
    feedback=target==='narrative'?{
      tasks:rows(r.narrative_tasks).map(t=>({action:t.action,section_ids:ids(t.section_ids),unit_ids:ids(t.unit_ids)})),
      instruction:'Recheck the flagged sections against writer_view. Remove assessment leakage and unauthorized assertions; preserve conditions; develop core meanings; remove repetition. Do not change the formulation.',
    }:{review:r,previous_formulation:providerFormulation(form)};
  }
  return fail('repair_limit');
}
