import { createHash } from 'node:crypto';

// Deliberately pure: no provider dispatch, no production DB, no mutable fixture state.
export const EXPERIMENT_VERSION = 'PWRP71-C01-C02-NARRATIVE-EXPERIMENT-V1';

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value), 'utf8').digest('hex');

function ensure(ok, message) { if (!ok) throw new Error(`Narrative experiment rejected: ${message}`); }
const clone = value => structuredClone(value);
const ids = list => list.map(row => row.id);

export function renderCanonicalMarkdown(draft) {
  const lines = [
    `# ${draft.title}`, '',
    '*Patternwork is nonclinical self-reflection. Parts and state names are working interpretations, not diagnoses or physiological measurements.*', '',
  ];
  for (const section of draft.sections) {
    if (section.heading) lines.push(`## ${section.heading}`, '');
    lines.push(section.text, '');
  }
  if (draft.reflection_questions.length) {
    lines.push('## To notice', '');
    for (const question of draft.reflection_questions) lines.push(question, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderReaderPreview(draft) {
  const lines = [`# ${draft.title}`, ''];
  for (const section of draft.sections) {
    if (section.heading) lines.push(`## ${section.heading}`, '');
    lines.push(section.text, '');
  }
  if (draft.reflection_questions.length) {
    lines.push('## Something to notice', '');
    for (const question of draft.reflection_questions) lines.push(question, '');
  }
  lines.push('---', '', '*A personal reflection based on your responses, not a diagnosis.*', '');
  return lines.join('\n');
}

export function validateComposition(source, spec) {
  ensure(source?.artifact_type === 'pwrp71_report' && source.report_type === 'IFS', 'input must be an accepted PWRP 7.1 IFS artifact');
  ensure(source.draft?.content_status === 'complete', 'source draft must be complete');
  const { artifact_sha256: oldArtifactHash } = source.digests ?? {};
  const { digests: _oldDigests, ...withoutDigests } = source;
  ensure(oldArtifactHash === digest(withoutDigests), 'source artifact hash does not match immutable bytes');
  ensure(source.digests.report_markdown_sha256 === digest(source.report_markdown), 'source Markdown hash does not match');
  ensure(spec.schemaVersion === EXPERIMENT_VERSION, 'unknown experiment version');
  ensure(spec.profileId === source.snapshot_id.match(/^fictional-(C01|C02)-deepening$/)?.[1], 'profile ID/snapshot mismatch');
  ensure(spec.sourceArtifactSha256 === oldArtifactHash, 'source artifact SHA does not match frozen baseline');
  ensure(spec.sourceReportId === source.report_id, 'source report ID does not match frozen baseline');
  ensure(spec.sourceEvidenceSha256 === source.evidence_sha256, 'packet evidence SHA does not match frozen baseline');
  ensure(typeof spec.title === 'string' && spec.title.trim().length > 0, 'missing proposed title');
  ensure(Array.isArray(spec.sections) && spec.sections.length > 0, 'missing composition sections');
  const sourceClaimIds = new Set(ids(source.draft.claims));
  const sourceNames = new Map(source.draft.name_registry.map(name => [name.name_id, name]));
  ensure(spec.nameChanges.length <= sourceNames.size, 'cannot introduce new part identities');
  ensure(new Set(spec.nameChanges.map(change => change.nameId)).size === spec.nameChanges.length, 'duplicate name change');
  for (const change of spec.nameChanges) {
    const current = sourceNames.get(change.nameId);
    ensure(current && current.name === change.from, `unexpected original name for ${change.nameId}`);
    ensure(typeof change.to === 'string' && /^[A-Z][\p{L}\p{M}-]{2,30}$/u.test(change.to), `name must be a concise single functional word: ${change.to}`);
  }
  const newNames = source.draft.name_registry.map(name => ({
    ...name,
    name: spec.nameChanges.find(change => change.nameId === name.name_id)?.to ?? name.name,
  }));
  ensure(new Set(newNames.map(name => name.name.toLowerCase())).size === newNames.length, 'name collision');
  const referenced = new Set(spec.titleClaimIds);
  ensure(spec.titleClaimIds.length > 0, 'title must have supported claim IDs');
  for (const c of spec.titleClaimIds) ensure(sourceClaimIds.has(c), `unrecognized title claim ${c}`);
  const sectionIds = new Set();
  for (const section of spec.sections) {
    ensure(section.id && !sectionIds.has(section.id), 'missing/duplicate section ID');
    sectionIds.add(section.id);
    ensure(typeof section.text === 'string' && section.text.trim().length > 30, `section ${section.id} has no substantive prose`);
    ensure(Array.isArray(section.claimIds) && section.claimIds.length > 0, `section ${section.id} has no evidence claims`);
    for (const claimId of section.claimIds) {
      ensure(sourceClaimIds.has(claimId), `section ${section.id} refers to unknown claim ${claimId}`);
      referenced.add(claimId);
    }
  }
  ensure(referenced.size === sourceClaimIds.size, `not all frozen claims are represented (${[...sourceClaimIds].filter(x => !referenced.has(x)).join(', ')})`);
  const prose = `${spec.title}\n${spec.sections.map(section => `${section.heading}\n${section.text}`).join('\n')}`;
  for (const change of spec.nameChanges) ensure(new RegExp(`\\b${change.to}\\b`, 'u').test(prose), `registered name ${change.to} never appears in narrative`);
  const leaked = /\b(in IFS terms|event-scoped formulation|the evidence (supports|establishes)|the packet|the assessment|this report|as a language model)\b/iu;
  ensure(!leaked.test(prose), 'auditor/report-writer language leaked into narrative');
  ensure(!/\bpwep_[0-9a-f-]+\b/iu.test(prose), 'server occurrence ID leaked into prose');
  ensure(spec.reflectionQuestions?.length === 0 || spec.reflectionQuestions?.every(q => typeof q === 'string'), 'bad reflection question value');
  return newNames;
}

export function composeNarrativeExperiment(source, spec) {
  const renamedNames = validateComposition(source, spec);
  const draft = {
    ...clone(source.draft),
    title: spec.title,
    title_claim_ids: clone(spec.titleClaimIds),
    sections: spec.sections.map(s => ({ id:s.id, heading:s.heading, text:s.text, claim_ids:clone(s.claimIds) })),
    name_registry: clone(renamedNames),
    reflection_questions: clone(spec.reflectionQuestions ?? []),
  };
  // Explicit contract: the original interpretation, roles, identity links, and evidence IDs are frozen.
  ensure(canonical(draft.claims) === canonical(source.draft.claims), 'interpretive claims changed');
  ensure(canonical(draft.relationships) === canonical(source.draft.relationships), 'part relationships changed');
  ensure(draft.name_registry.every((n, i) => {
    const { name:_new, ...same } = n;
    const { name:_old, ...original } = source.draft.name_registry[i];
    return canonical(same) === canonical(original);
  }), 'name-role or supporting claim changed');
  for (const field of ['report_release','release_id','snapshot_id','evidence_sha256','report_type','content_status']) {
    ensure(draft[field] === source.draft[field], `source-bound field ${field} changed`);
  }
  const reportMarkdown = renderCanonicalMarkdown(draft);
  const identity = {report_release:draft.report_release, release_id:draft.release_id, snapshot_id:draft.snapshot_id, report_type:draft.report_type, evidence_sha256:draft.evidence_sha256, draft};
  const withoutDigests = {
    artifact_type:'pwrp71_report', report_release:source.report_release,
    source_manifest_sha256:source.source_manifest_sha256,
    report_id:`pwrp71_${digest(identity).slice(0,28)}`,
    report_type:source.report_type, release_id:source.release_id,
    snapshot_id:source.snapshot_id, evidence_sha256:source.evidence_sha256,
    report_markdown:reportMarkdown, draft,
  };
  const newArtifact = { ...withoutDigests, digests:{artifact_sha256:digest(withoutDigests), report_markdown_sha256:digest(reportMarkdown)} };
  const audit = {
    schemaVersion:EXPERIMENT_VERSION, profileId:spec.profileId,
    status:'CURATED_EXPERIMENT_NOT_PRODUCTION_APPROVED',
    baseline:{report_id:source.report_id,artifact_sha256:source.digests.artifact_sha256,draft_sha256:digest(source.draft),evidence_sha256:source.evidence_sha256},
    candidate:{report_id:newArtifact.report_id,artifact_sha256:newArtifact.digests.artifact_sha256,draft_sha256:digest(draft),markdown_sha256:newArtifact.digests.report_markdown_sha256},
    immutable:{claims_sha256:digest(draft.claims),relationships_sha256:digest(draft.relationships),source_unchanged:true,part_roles_and_support_unchanged:true},
    composition:{new_names:spec.nameChanges,source_claims_count:source.draft.claims.length,source_claims_represented:[...new Set([...spec.titleClaimIds,...spec.sections.flatMap(x=>x.claimIds)])].length},
    productionValidation:'PENDING_EXPLICIT_CHECK',
    independentSemanticReview:'PENDING', providerCalls:0, productionActivation:false,
  };
  return { artifact:newArtifact, readerPreview:renderReaderPreview(draft), audit };
}
