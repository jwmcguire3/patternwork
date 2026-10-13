import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeNarrativeExperiment, EXPERIMENT_VERSION, digest, renderCanonicalMarkdown } from './compose.mjs';

const basic = () => {
  const draft = {
    report_release:'PWRP-7.1.0-candidate.1', release_id:'PWQE-5.1.0-candidate.1',
    snapshot_id:'fictional-C01-deepening', evidence_sha256:'f'.repeat(64),report_type:'IFS',
    title:'Old title', title_claim_ids:['K1'], content_status:'complete',
    sections:[{id:'S1',heading:'Before',text:'A supported fact about the person.',claim_ids:['K1']}],
    claims:[{id:'K1',text:'A supported fact',kind:'supported_interpretation',evidence_ids:['O1']}],
    name_registry:[{name_id:'N1',name:'Old Label',entity_kind:'ifs_part',role:'manager',author_generated:true,supporting_claim_ids:['K1']}],
    relationships:[],reflection_questions:[]
  };
  const source={artifact_type:'pwrp71_report',report_release:draft.report_release,source_manifest_sha256:'e'.repeat(64),report_id:'pwrp71_test',report_type:'IFS',release_id:draft.release_id,snapshot_id:draft.snapshot_id,evidence_sha256:draft.evidence_sha256,report_markdown:renderCanonicalMarkdown(draft),draft};
  return {...source,digests:{artifact_sha256:digest(source),report_markdown_sha256:digest(source.report_markdown)}};
};
const specFor = source => ({
  schemaVersion:EXPERIMENT_VERSION,profileId:'C01',sourceReportId:source.report_id,
  sourceArtifactSha256:source.digests.artifact_sha256,sourceEvidenceSha256:source.evidence_sha256,
  title:'An actual observation',titleClaimIds:['K1'],
  nameChanges:[{nameId:'N1',from:'Old Label',to:'Minimizer'}],
  sections:[{id:'S1',heading:'What happened',text:'The Minimizer made a smaller request in this particular situation.',claimIds:['K1']}],
  reflectionQuestions:[]
});

test('makes a new candidate but preserves all claim/relationship evidence and identity roles', () => {
  const original=basic(), before=digest(original);
  const {artifact,readerPreview,audit}=composeNarrativeExperiment(original,specFor(original));
  assert.equal(digest(original),before);
  assert.deepEqual(artifact.draft.claims,original.draft.claims);
  assert.deepEqual(artifact.draft.relationships,original.draft.relationships);
  assert.equal(artifact.draft.name_registry[0].role,'manager');
  assert.equal(artifact.draft.name_registry[0].name,'Minimizer');
  assert.notEqual(artifact.report_id,original.report_id);
  assert.equal(artifact.digests.report_markdown_sha256,digest(artifact.report_markdown));
  const {digests,...payload}=artifact;
  assert.equal(digests.artifact_sha256,digest(payload));
  assert.ok(readerPreview.includes('Minimizer'));
  assert.equal(audit.productionValidation,'PENDING_EXPLICIT_CHECK');
  assert.equal(audit.providerCalls,0);
});

test('rejects fabricated source identities and changed source bytes', () => {
  const original=basic(),spec=specFor(original);
  assert.throws(()=>composeNarrativeExperiment(original,{...spec,sourceArtifactSha256:'a'.repeat(64)}),/SHA does not match/);
  const altered=structuredClone(original); altered.draft.claims[0].text='Rewritten';
  assert.throws(()=>composeNarrativeExperiment(altered,spec),/source artifact hash/);
});

test('rejects unsupported claims and unrepresented original claims',()=>{
  const original=basic(),spec=specFor(original);
  assert.throws(()=>composeNarrativeExperiment(original,{...spec,sections:[{...spec.sections[0],claimIds:['INVENTED']}]}),/unknown claim/);
  assert.throws(()=>composeNarrativeExperiment(original,{...spec,sections:[{...spec.sections[0],claimIds:[]}]}),/no evidence claims/);
});

test('rejects role renaming that fabricates identity or produces audit voice',()=>{
  const original=basic(),spec=specFor(original);
  assert.throws(()=>composeNarrativeExperiment(original,{...spec,nameChanges:[{nameId:'NEW',from:'Nobody',to:'Fixer'}]}),/unexpected original name/);
  assert.throws(()=>composeNarrativeExperiment(original,{...spec,nameChanges:[{nameId:'N1',from:'Old Label',to:'The IFS manager'}]}),/concise single functional word/);
  assert.throws(()=>composeNarrativeExperiment(original,{...spec,sections:[{...spec.sections[0],text:'In IFS terms, the Minimizer is a construct in this theoretical formulation.'}]}),/auditor\/report-writer language/);
});

const c01=process.env.PWRP71_C01_IFS_SOURCE;
const c02=process.env.PWRP71_C02_IFS_SOURCE;
if(c01 && c02){
 test('C01/C02 actual live artifacts: frozen claims, counterexample contrast, and distinct naming',async()=>{
   const dirname=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../qualification/pwrp71/narrative-c01-c02-v1');
   const result={};
   for(const [id,file] of [['C01',c01],['C02',c02]]){
     const source=JSON.parse(await readFile(file,'utf8'));
     const spec=JSON.parse(await readFile(path.join(dirname,`${id}.json`),'utf8'));
     const {artifact,audit}=composeNarrativeExperiment(source,spec);
     assert.equal(audit.immutable.source_unchanged,true);
     assert.equal(audit.composition.source_claims_count,audit.composition.source_claims_represented);
     assert.deepEqual(artifact.draft.claims,source.draft.claims);
     result[id]=artifact;
   }
   assert.ok(result.C01.draft.name_registry.some(x=>x.role==='firefighter'&&x.name==='Suppressor'));
   assert.ok(result.C01.draft.name_registry.some(x=>x.role==='exile'));
   assert.ok(!result.C02.draft.name_registry.some(x=>x.role==='firefighter'||x.role==='exile'));
   assert.ok(!result.C02.report_markdown.includes('Suppressor'));
   assert.ok(result.C01.report_markdown.includes('didn\'t say so'));
   assert.ok(result.C02.report_markdown.includes('you said so'));
 });
}
