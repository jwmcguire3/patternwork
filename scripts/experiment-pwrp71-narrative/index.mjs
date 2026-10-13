import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeNarrativeExperiment, EXPERIMENT_VERSION } from './compose.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '../..');
const argument = (flag) => { const at = process.argv.indexOf(flag); return at >= 0 ? process.argv[at+1] : undefined; };
const profileSource = { C01:argument('--c01'), C02:argument('--c02') };
const out = path.resolve(argument('--output-dir') ?? path.join(project,'qualification/pwrp71/narrative-c01-c02-v1/output'));
const specRoot = path.resolve(argument('--spec-dir') ?? path.join(project,'qualification/pwrp71/narrative-c01-c02-v1'));
if (!profileSource.C01 || !profileSource.C02) {
  throw new Error('Supply --c01 <original C01_IFS.json> --c02 <original C02_IFS.json> [--output-dir ...]. No provider calls are made.');
}
await mkdir(out, { recursive:true });
const index = {schemaVersion:EXPERIMENT_VERSION, kind:'curated_no_dispatch_narrative_comparison', productionValidation:'PENDING', results:[]};
for (const id of ['C01','C02']) {
  const source = JSON.parse(await readFile(profileSource[id], 'utf8'));
  const spec = JSON.parse(await readFile(path.join(specRoot, `${id}.json`), 'utf8'));
  const { artifact, readerPreview, audit } = composeNarrativeExperiment(source,spec);
  for (const [filename, content] of [
    [`${id}_IFS.candidate.json`,`${JSON.stringify(artifact,null,2)}\n`],
    [`${id}_IFS.canonical.md`,artifact.report_markdown],
    [`${id}_IFS.reader-preview.md`,readerPreview],
    [`${id}_IFS.audit.json`,`${JSON.stringify(audit,null,2)}\n`],
  ]) await writeFile(path.join(out,filename),content,'utf8');
  index.results.push({profileId:id,original: audit.baseline, candidate:audit.candidate});
}
await writeFile(path.join(out,'index.json'),`${JSON.stringify(index,null,2)}\n`,'utf8');
console.log(JSON.stringify({out,status:'COMPOSED_UNREVIEWED_NO_DISPATCH',profiles:index.results.map(x=>x.profileId),providerCalls:0},null,2));
