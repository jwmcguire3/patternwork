/** Run via `npx tsx scripts/experiment-pwrp71-narrative/verify-production.ts --output-dir <path>` from repo root. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPwrp71SourcePackage } from '../../lib/server/reports/pwrp71-source.ts';
import { validatePwrp71ReportDraft } from '../../lib/server/reports/pwrp71-validation.ts';

const option = (name: string): string | undefined => { const at=process.argv.indexOf(name); return at<0?undefined:process.argv[at+1]; };
const output = path.resolve(option('--output-dir') ?? 'qualification/pwrp71/narrative-c01-c02-v1/output');
const workspace = process.cwd();
const source = await loadPwrp71SourcePackage(workspace);
const results: Array<{ profileId:string; validated:boolean; issues:unknown[] }> = [];
for (const profileId of ['C01','C02']) {
  const [artifact, fixture] = await Promise.all([
    readFile(path.join(output,`${profileId}_IFS.candidate.json`),'utf8').then(JSON.parse),
    readFile(path.join(workspace,`qualification/pwrp71/route_replays_v5/${profileId}.json`),'utf8').then(JSON.parse),
  ]);
  const packet = fixture.packets.IFS.packet;
  if (artifact.evidence_sha256 !== packet.content_sha256 || artifact.snapshot_id !== packet.snapshot_id) {
    throw new Error(`${profileId} candidate does not match current pinned fictional packet`);
  }
  const result = validatePwrp71ReportDraft({ value:artifact.draft, reportType:'IFS',snapshotId:packet.snapshot_id,packet,source });
  if (!result.ok || result.value.digests.artifact_sha256 !== artifact.digests.artifact_sha256
    || result.value.report_markdown !== artifact.report_markdown) {
    throw new Error(`${profileId} production draft validation failed: ${JSON.stringify(result.ok ? [{code:'artifact_mismatch'}] : result.issues)}`);
  }
  results.push({profileId,validated:true,issues:[]});
}
const receipt={schemaVersion:'PWRP71-NARRATIVE-EXPERIMENT-VALIDATION-V1',status:'PRODUCTION_DRAFT_VALIDATOR_PASSED_NOT_REVIEWED',results};
await writeFile(path.join(output,'production-validation.json'),`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify(receipt,null,2));
