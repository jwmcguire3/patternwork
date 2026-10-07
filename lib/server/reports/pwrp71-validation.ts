import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import type { JsonObject, ReportType, ValidationIssue, ValidationResult } from "../../question-engine/types.ts";
import { PWQE51_RELEASE_IDENTITY } from "../../question-engine/pwqe51-source.ts";
import { PWRP71_RELEASE_MANIFEST_SHA256, type Pwrp71SourcePackage } from "./pwrp71-source.ts";

export interface Pwrp71ReportDraft extends JsonObject {
  readonly report_release: string;
  readonly release_id: string;
  readonly snapshot_id: string;
  readonly evidence_sha256: string;
  readonly report_type: ReportType;
  readonly title: string;
}

export interface Pwrp71ReportArtifact extends JsonObject {
  readonly artifact_type: "pwrp71_report";
  readonly report_release: string;
  readonly source_manifest_sha256: string;
  readonly report_id: string;
  readonly report_type: ReportType;
  readonly release_id: string;
  readonly snapshot_id: string;
  readonly evidence_sha256: string;
  readonly report_markdown: string;
  readonly draft: Pwrp71ReportDraft;
  readonly digests: JsonObject & { readonly artifact_sha256: string; readonly report_markdown_sha256: string };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is Record<string, unknown> => item !== undefined) : [];
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value), "utf8").digest("hex");
}

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function index(rowsValue: readonly Record<string, unknown>[], key: string, label: string, issues: ValidationIssue[], path: string): Map<string, Record<string, unknown>> {
  const output = new Map<string, Record<string, unknown>>();
  rowsValue.forEach((row, i) => {
    const id = row[key];
    if (typeof id !== "string" || id.length === 0 || output.has(id)) issues.push(issue("duplicate_identity", `${path}[${i}].${key}`, `Missing or duplicate ${label} identity.`));
    else output.set(id, row);
  });
  return output;
}

function packetBindingIssues(packet: JsonObject, snapshotId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const p = packet as Record<string, unknown>;
  const { content_sha256: contentSha, ...contents } = p;
  const binding = record(p.source_binding);
  if (p.format !== "patternwork-router-evidence-v1"
    || p.release_id !== PWQE51_RELEASE_IDENTITY.questionRelease
    || p.snapshot_id !== snapshotId
    || binding?.question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || binding?.runtime_version !== PWQE51_RELEASE_IDENTITY.routerVersion
    || binding?.source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256) {
    issues.push(issue("packet_source_binding", "$.packet", "Packet format, source, release, or snapshot does not bind to the pinned PWQE 5.1 source."));
  }
  if (typeof contentSha !== "string" || !/^[a-f0-9]{64}$/u.test(contentSha) || sha256(contents) !== contentSha) {
    issues.push(issue("packet_digest", "$.packet.content_sha256", "Packet content digest does not match its canonical contents."));
  }
  return issues;
}

function validateClaimStructure(draft: Record<string, unknown>, packet: Record<string, unknown>, issues: ValidationIssue[]): void {
  const observations = index(rows(packet.observations), "id", "observation", issues, "$.packet.observations");
  const episodes = index(rows(packet.episodes), "id", "occurrence", issues, "$.packet.episodes");
  index(rows(packet.steps), "id", "step", issues, "$.packet.steps");
  const edges = index(rows(packet.sequence_edges), "id", "sequence edge", issues, "$.packet.sequence_edges");
  const people = new Set(rows(packet.referent_scopes).map((row) => row.person_id).filter((id): id is string => typeof id === "string"));
  const invalidated = new Set([...(Array.isArray(packet.superseded_response_ids) ? packet.superseded_response_ids : []), ...(Array.isArray(packet.invalidated_response_ids) ? packet.invalidated_response_ids : [])]);
  const liveResponses = new Set(rows(packet.administration_provenance).map((row) => row.live_response_id).filter((id): id is string => typeof id === "string"));
  const stepByOccurrenceAndName = new Map<string, Record<string, unknown>>();
  const stepNames = (occurrenceId: unknown, stepId: unknown) => `${String(occurrenceId)}\u0000${String(stepId)}`;
  for (const [i, step] of rows(packet.steps).entries()) {
    const key = stepNames(step.occurrence_id, step.step_id);
    if (typeof step.step_id !== "string" || stepByOccurrenceAndName.has(key) || !episodes.has(String(step.occurrence_id))) {
      issues.push(issue("step_lineage", `$.packet.steps[${i}]`, "Step identity is duplicated within its occurrence or its occurrence does not exist."));
    } else stepByOccurrenceAndName.set(key, step);
    const observationIds = Array.isArray(step.observation_ids) ? step.observation_ids : [];
    if (observationIds.some((id) => {
      if (typeof id !== "string") return true;
      const observation = observations.get(id);
      return !observation || observation.occurrence_id !== step.occurrence_id || observation.step_id !== step.step_id;
    })) issues.push(issue("step_observation", `$.packet.steps[${i}].observation_ids`, "Step must reference observations from that same occurrence and step."));
  }
  const beforeGraph = new Map<string, Map<string, Set<string>>>();
  const visitingSteps = new Set<string>();
  const visitedSteps = new Set<string>();
  for (const [i, edge] of rows(packet.sequence_edges).entries()) {
    const from = stepByOccurrenceAndName.get(stepNames(edge.occurrence_id, edge.from_step));
    const to = stepByOccurrenceAndName.get(stepNames(edge.occurrence_id, edge.to_step));
    const refs = Array.isArray(edge.evidence_ids) ? edge.evidence_ids : [];
    if (!from || !to || from.occurrence_id !== edge.occurrence_id || to.occurrence_id !== edge.occurrence_id
      || refs.some((id) => typeof id !== "string" || observations.get(id)?.occurrence_id !== edge.occurrence_id)) {
      issues.push(issue("sequence_lineage", `$.packet.sequence_edges[${i}]`, "Sequence edge must connect same-occurrence steps and current observations."));
    }
    if (edge.relation === "before" && typeof edge.from_step === "string" && typeof edge.to_step === "string") {
      const key = String(edge.occurrence_id);
      const graph = beforeGraph.get(key) ?? new Map<string, Set<string>>();
      graph.set(edge.from_step, new Set([...(graph.get(edge.from_step) ?? []), edge.to_step]));
      beforeGraph.set(key, graph);
    }
  }
  const visitStep = (node: string, graph: Map<string, Set<string>>) => {
    if (visitingSteps.has(node)) return false;
    if (visitedSteps.has(node)) return true;
    visitingSteps.add(node);
    for (const next of graph.get(node) ?? []) if (!visitStep(next, graph)) return false;
    visitingSteps.delete(node);
    visitedSteps.add(node);
    return true;
  };
  for (const [occurrenceId, graph] of beforeGraph) {
    visitingSteps.clear();
    visitedSteps.clear();
    if ([...graph.keys()].some((node) => !visitStep(node, graph))) {
      issues.push(issue("sequence_cycle", "$.packet.sequence_edges", `Reported before edges contain a temporal cycle in occurrence ${occurrenceId}.`));
    }
  }
  for (const [i, observation] of rows(packet.observations).entries()) {
    const step = stepByOccurrenceAndName.get(stepNames(observation.occurrence_id, observation.step_id));
    const listed = Array.isArray(step?.observation_ids) ? step.observation_ids : [];
    if (!step || step.occurrence_id !== observation.occurrence_id || !listed.includes(observation.id)) {
      issues.push(issue("observation_step_lineage", `$.packet.observations[${i}]`, "Observation must bind to its current step and occurrence."));
    }
    if (!episodes.has(String(observation.occurrence_id))) issues.push(issue("observation_occurrence", `$.packet.observations[${i}].occurrence_id`, "Observation occurrence does not exist."));
  }

  const claimRows = rows(draft.claims);
  const claims = index(claimRows, "id", "claim", issues, "$.claims");
  const names = index(rows(draft.name_registry), "name_id", "name", issues, "$.name_registry");
  index(rows(draft.sections), "id", "section", issues, "$.sections");
  index(rows(draft.relationships), "id", "relationship", issues, "$.relationships");
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string) => {
    const claim = claims.get(id);
    if (!claim) { issues.push(issue("claim_dependency", "$.claims", "Claim dependency does not resolve.")); return; }
    if (visiting.has(id)) { issues.push(issue("claim_cycle", `$.claims.${id}.depends_on_claim_ids`, "Claim dependencies must be acyclic.")); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const dependencies = Array.isArray(claim.depends_on_claim_ids) ? claim.depends_on_claim_ids : [];
    for (const dependency of dependencies) {
      if (typeof dependency !== "string") continue;
      visit(dependency);
      const premise = claims.get(dependency);
      if (!premise) continue;
      if (["reported", "supported_interpretation"].includes(String(claim.kind)) && !["reported", "supported_interpretation"].includes(String(premise.kind))) {
        issues.push(issue("open_premise", `$.claims.${id}.depends_on_claim_ids`, "An open premise cannot support a settled claim."));
      }
      for (const field of ["evidence_ids", "counterevidence_ids"] as const) {
        const premiseIds = Array.isArray(premise[field]) ? premise[field] as unknown[] : [];
        const derivedIds = new Set(Array.isArray(claim[field]) ? claim[field] as unknown[] : []);
        if (premiseIds.some((evidenceId) => !derivedIds.has(evidenceId))) issues.push(issue("claim_leaf_evidence", `$.claims.${id}.${field}`, "Derived claims must retain premise leaf evidence and counterevidence."));
      }
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of claims.keys()) visit(id);

  for (const [i, claim] of claimRows.entries()) {
    const scope = record(claim.scope) ?? {};
    const cited = [...(Array.isArray(claim.evidence_ids) ? claim.evidence_ids : []), ...(Array.isArray(claim.counterevidence_ids) ? claim.counterevidence_ids : [])];
    const occurrenceIds = new Set(Array.isArray(scope.occurrence_ids) ? scope.occurrence_ids as unknown[] : []);
    const personIds = new Set(Array.isArray(scope.person_ids) ? scope.person_ids as unknown[] : []);
    const current = new Set<string>();
    for (const [j, evidenceId] of cited.entries()) {
      const observation = typeof evidenceId === "string" ? observations.get(evidenceId) : undefined;
      if (!observation) { issues.push(issue("current_observation", `$.claims[${i}].evidence_ids[${j}]`, "Claim evidence must cite a current packet observation.")); continue; }
      current.add(evidenceId as string);
      if (typeof observation.response_id !== "string" || invalidated.has(observation.response_id) || !liveResponses.has(observation.response_id)) issues.push(issue("stale_observation", `$.claims[${i}].evidence_ids[${j}]`, "Claim cites a stale or noncurrent response."));
      if (!occurrenceIds.has(observation.occurrence_id)) issues.push(issue("evidence_scope", `$.claims[${i}].scope.occurrence_ids`, "Cited observation lies outside the claim's declared occurrence scope."));
      if (typeof observation.person_id === "string" && !personIds.has(observation.person_id)) issues.push(issue("person_scope", `$.claims[${i}].scope.person_ids`, "Cited observation lies outside the claim's declared person scope."));
    }
    for (const id of occurrenceIds) if (typeof id !== "string" || !episodes.has(id)) issues.push(issue("claim_scope", `$.claims[${i}].scope.occurrence_ids`, "Claim scope contains an unknown occurrence."));
    for (const id of personIds) if (typeof id !== "string" || !people.has(id)) issues.push(issue("claim_scope", `$.claims[${i}].scope.person_ids`, "Claim scope contains an unknown person."));
    const kind = String(claim.kind);
    if (["reported", "supported_interpretation"].includes(kind)) {
      const evidenceOccurrences = new Set([...current].map((id) => observations.get(id)?.occurrence_id));
      if ([...occurrenceIds].some((id) => !evidenceOccurrences.has(id))) issues.push(issue("unsupported_scope", `$.claims[${i}].scope.occurrence_ids`, "Settled claim scope cannot include unsupported extra occurrences."));
      const evidencePeople = new Set([...current].map((id) => observations.get(id)?.person_id).filter((id) => typeof id === "string"));
      if ([...personIds].some((id) => typeof id !== "string" || !evidencePeople.has(id))) issues.push(issue("unsupported_scope", `$.claims[${i}].scope.person_ids`, "Settled claim scope cannot include unsupported extra people."));
    }

    const sequenceIds = Array.isArray(claim.sequence_edge_ids) ? claim.sequence_edge_ids : [];
    for (const [j, edgeId] of sequenceIds.entries()) {
      const edge = typeof edgeId === "string" ? edges.get(edgeId) : undefined;
      if (!edge) { issues.push(issue("sequence_reference", `$.claims[${i}].sequence_edge_ids[${j}]`, "Claim sequence reference does not resolve.")); continue; }
      if (!occurrenceIds.has(edge.occurrence_id)) issues.push(issue("sequence_scope", `$.claims[${i}].sequence_edge_ids[${j}]`, "Sequence edge lies outside the claim scope."));
      const leaves = Array.isArray(edge.evidence_ids) ? edge.evidence_ids : [];
      if (leaves.some((id) => !current.has(id))) issues.push(issue("sequence_leaf_evidence", `$.claims[${i}].sequence_edge_ids[${j}]`, "Claim must retain all sequence-edge observation evidence."));
    }
    if (kind === "supported_interpretation" && Array.isArray(claim.constructs) && claim.constructs.includes("handoff")
      && !sequenceIds.some((id) => typeof id === "string" && edges.get(id)?.relation === "before")) {
      issues.push(issue("handoff_sequence", `$.claims[${i}].sequence_edge_ids`, "Handoff interpretation requires a reported before edge."));
    }

    const level = String(scope.level);
    const evidenceRows = [...current].map((id) => observations.get(id)!);
    const isRecurrence = (Array.isArray(claim.constructs) && claim.constructs.includes("recurrence")) || level === "recurring_within_context";
    if (kind === "supported_interpretation" && isRecurrence) {
      const actualOccurrences = new Set(evidenceRows.filter((row) => row.basis !== "reported_typicality").map((row) => row.occurrence_id));
      if (actualOccurrences.size < 2 || [...actualOccurrences].some((id) => episodes.get(String(id))?.basis !== "actual_recalled")) {
        issues.push(issue("recurrence_basis", `$.claims[${i}].evidence_ids`, "Distinct recurrence requires multiple actual recalled occurrences; reported typicality is not another event."));
      } else {
        for (const a of actualOccurrences) for (const b of actualOccurrences) {
          if (a === b) continue;
          const left = episodes.get(String(a)); const right = episodes.get(String(b));
          const distinctLeft = Array.isArray(left?.distinct_from) ? left.distinct_from : [];
          const distinctRight = Array.isArray(right?.distinct_from) ? right.distinct_from : [];
          if (!distinctLeft.includes(b) && !distinctRight.includes(a)) issues.push(issue("recurrence_distinctness", `$.claims[${i}].scope.occurrence_ids`, "Recurrence requires an explicit actual_recalled distinct_from relation."));
        }
      }
    }
    if (level === "reported_tendency" && ["reported", "supported_interpretation"].includes(kind)
      && !evidenceRows.some((row) => row.basis === "reported_typicality")) {
      issues.push(issue("typicality_basis", `$.claims[${i}].evidence_ids`, "Reported tendency requires a cited reported-typicality observation."));
    }
    if (level === "across_sampled_contexts" && ["reported", "supported_interpretation"].includes(kind)
      && new Set([...occurrenceIds].map((id) => episodes.get(String(id))?.context)).size < 2 && new Set(evidenceRows.map((row) => row.person_id).filter(Boolean)).size < 2) {
      issues.push(issue("context_scope", `$.claims[${i}].scope`, "Cross-context claim has only one sampled context or referent."));
    }
    if (kind === "reported" && Array.isArray(claim.constructs)
      && claim.constructs.some((construct) => ["manager", "firefighter", "exile", "vulnerable_part", "self_led_capacity", "unblending", "burden"].includes(String(construct)))) {
      issues.push(issue("modeled_role_as_report", `$.claims[${i}].constructs`, "A modeled role or construct cannot be presented as a literal questionnaire report."));
    }
    // D91.pending establishes a pending response only. An outcome needs an independently cited D92 observation.
    const pendingHelp = evidenceRows.some((row) => row.item_id === "D91" && (row.reported_value === "pending" || row.option_id === "D91.pending"));
    const helpOutcome = evidenceRows.some((row) => row.item_id === "D92");
    if (pendingHelp && (claim.support_basis as unknown[] | undefined)?.includes("reported_effect") && !helpOutcome) {
      issues.push(issue("pending_help_outcome", `$.claims[${i}].evidence_ids`, "A pending help response cannot support an invented outcome; cite the separate D92 outcome observation."));
    }
  }

  const represented = new Set(Array.isArray(draft.title_claim_ids) ? draft.title_claim_ids as unknown[] : []);
  for (const [i, id] of [...represented].entries()) if (typeof id !== "string" || !claims.has(id)) issues.push(issue("title_claim", `$.title_claim_ids[${i}]`, "Title claim reference does not resolve."));
  for (const [i, section] of rows(draft.sections).entries()) {
    const ids = Array.isArray(section.claim_ids) ? section.claim_ids : [];
    for (const [j, id] of ids.entries()) {
      if (typeof id !== "string" || !claims.has(id)) issues.push(issue("section_claim", `$.sections[${i}].claim_ids[${j}]`, "Section claim reference does not resolve."));
      else represented.add(id);
    }
  }
  for (const id of claims.keys()) if (!represented.has(id)) issues.push(issue("unrepresented_claim", `$.claims.${id}`, "Every claim must be represented by title or section claim references."));

  const nameRows = rows(draft.name_registry);
  const nameLabels = new Map<string, string>();
  for (const [i, name] of nameRows.entries()) {
    const id = String(name.name_id);
    const label = String(name.name).trim();
    if (!label || label.toLocaleLowerCase("en-US") === "self") issues.push(issue("name_registry", `$.name_registry[${i}].name`, "Self is represented through claims, not a name-registry entity."));
    const priorId = nameLabels.get(label.toLocaleLowerCase("en-US"));
    if (priorId && priorId !== id) issues.push(issue("name_label_conflict", `$.name_registry[${i}].name`, "The same label cannot identify multiple entities."));
    nameLabels.set(label.toLocaleLowerCase("en-US"), id);
    const support = Array.isArray(name.supporting_claim_ids) ? name.supporting_claim_ids : [];
    for (const [j, claimId] of support.entries()) if (typeof claimId !== "string" || !claims.has(claimId)) issues.push(issue("name_claim", `$.name_registry[${i}].supporting_claim_ids[${j}]`, "Name support claim does not resolve."));
    if (name.author_generated !== true) issues.push(issue("name_origin", `$.name_registry[${i}].author_generated`, "This questionnaire does not collect respondent-authored names."));
    const role = String(name.role);
    if (role !== "descriptive_pattern" && name.entity_kind !== "ifs_part") issues.push(issue("name_role", `$.name_registry[${i}].entity_kind`, "An IFS role must be attached to an IFS part entity."));
    if (["manager", "firefighter", "exile", "vulnerable_part"].includes(role)
      && !support.some((claimId) => { const claim = claims.get(String(claimId)); return claim?.kind === "supported_interpretation" && Array.isArray(claim.constructs) && claim.constructs.includes(role); })) {
      issues.push(issue("name_role_claim", `$.name_registry[${i}].supporting_claim_ids`, "Named IFS role requires a supported interpretation claim with the same role."));
    }
  }
  for (const [i, relationship] of rows(draft.relationships).entries()) {
    const claimIds = Array.isArray(relationship.claim_ids) ? relationship.claim_ids : [];
    if (!names.has(String(relationship.from_name_id)) || !names.has(String(relationship.to_name_id)) || relationship.from_name_id === relationship.to_name_id) {
      issues.push(issue("relationship_names", `$.relationships[${i}]`, "Relationship endpoints must be distinct registered names."));
    }
    if (claimIds.some((id) => typeof id !== "string" || claims.get(id)?.kind !== "supported_interpretation")) issues.push(issue("relationship_claim", `$.relationships[${i}].claim_ids`, "Asserted relationships require supported interpretation claims."));
    if (relationship.relation === "takes_over_from" && !claimIds.some((id) => typeof id === "string" && Array.isArray(claims.get(id)?.constructs) && (claims.get(id)!.constructs as unknown[]).includes("handoff"))) {
      issues.push(issue("relationship_handoff", `$.relationships[${i}].claim_ids`, "Takeover relationship requires a supported handoff claim."));
    }
  }
}

function validateReaderTextDoesNotExposeOccurrenceIds(draft: Record<string, unknown>, packet: Record<string, unknown>, issues: ValidationIssue[]): void {
  const occurrenceIds = rows(packet.episodes).map((episode) => episode.id).filter((id): id is string => typeof id === "string" && id.length > 0);
  const readerText: Array<{ path: string; value: unknown }> = [
    { path: "$.title", value: draft.title },
    ...rows(draft.sections).flatMap((section, index) => [
      { path: `$.sections[${index}].heading`, value: section.heading },
      { path: `$.sections[${index}].text`, value: section.text },
    ]),
    ...rows(draft.claims).flatMap((claim, index) => [
      { path: `$.claims[${index}].text`, value: claim.text },
      { path: `$.claims[${index}].rationale`, value: claim.rationale },
      { path: `$.claims[${index}].scope.description`, value: record(claim.scope)?.description },
      ...(Array.isArray(claim.remaining_uncertainty) ? claim.remaining_uncertainty.map((value, itemIndex) => ({ path: `$.claims[${index}].remaining_uncertainty[${itemIndex}]`, value })) : []),
    ]),
    ...rows(draft.name_registry).map((name, index) => ({ path: `$.name_registry[${index}].name`, value: name.name })),
    ...(Array.isArray(draft.reflection_questions) ? draft.reflection_questions.map((value, index) => ({ path: `$.reflection_questions[${index}]`, value })) : []),
  ];
  for (const { path: textPath, value } of readerText) {
    if (typeof value !== "string") continue;
    for (const occurrenceId of occurrenceIds) {
      const escaped = occurrenceId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const identifierToken = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "iu");
      if (identifierToken.test(value)) {
        issues.push(issue("reader_internal_occurrence_id", textPath, "Reader-facing text must use contextual labels instead of internal occurrence identifiers."));
        break;
      }
    }
  }
}

function markdown(draft: Record<string, unknown>): string {
  const lines = [`# ${String(draft.title)}`, "", "*Patternwork is nonclinical self-reflection. Parts and state names are working interpretations, not diagnoses or physiological measurements.*", ""];
  for (const section of rows(draft.sections)) {
    if (typeof section.heading === "string" && section.heading) lines.push(`## ${section.heading}`, "");
    lines.push(String(section.text), "");
  }
  const questions = Array.isArray(draft.reflection_questions) ? draft.reflection_questions : [];
  if (questions.length) {
    lines.push("## To notice", "");
    for (const question of questions) lines.push(String(question), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** Validates structural evidence bindings and renders an artifact; this does not provide semantic approval. */
export function validatePwrp71ReportDraft(input: {
  readonly value: unknown;
  readonly reportType: ReportType;
  readonly snapshotId: string;
  readonly packet: JsonObject;
  readonly source: Pwrp71SourcePackage;
}): ValidationResult<Pwrp71ReportArtifact> {
  const issues: ValidationIssue[] = [];
  const reportSource = input.source;
  if (reportSource.manifestSha256 !== PWRP71_RELEASE_MANIFEST_SHA256
    || reportSource.manifest.report_release !== PWQE51_RELEASE_IDENTITY.reportRelease
    || reportSource.policy.release !== PWQE51_RELEASE_IDENTITY.reportRelease
    || reportSource.policy.compatible_question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || reportSource.policy.compatible_router_source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || reportSource.manifest.content_binding !== sha256(reportSource.manifest.files)) {
    issues.push(issue("report_source_binding", "$.source", "PWRP 7.1 source manifest or compatibility binding is not pinned."));
  }
  const packet = input.packet as Record<string, unknown>;
  issues.push(...packetBindingIssues(input.packet, input.snapshotId));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(reportSource.schemas.reportDraft as object);
  if (!validate(input.value)) {
    for (const error of validate.errors ?? []) issues.push(issue("report_schema", error.instancePath || "$", error.message ?? "PWRP 7.1 draft schema validation failed."));
    return { ok: false, issues };
  }
  const draft = input.value as Pwrp71ReportDraft;
  if (draft.report_release !== reportSource.policy.release || draft.release_id !== packet.release_id
    || draft.snapshot_id !== input.snapshotId || draft.evidence_sha256 !== packet.content_sha256 || draft.report_type !== input.reportType) {
    issues.push(issue("draft_binding", "$", "Draft release, report type, packet, evidence, or snapshot does not match its prepared source."));
  }
  validateClaimStructure(draft, packet, issues);
  validateReaderTextDoesNotExposeOccurrenceIds(draft, packet, issues);
  if (issues.length) return { ok: false, issues };

  const reportMarkdown = markdown(draft);
  const identity = { report_release: draft.report_release, release_id: draft.release_id, snapshot_id: draft.snapshot_id, report_type: draft.report_type, evidence_sha256: draft.evidence_sha256, draft };
  const reportId = `pwrp71_${sha256(identity).slice(0, 28)}`;
  const withoutDigests = {
    artifact_type: "pwrp71_report" as const,
    report_release: draft.report_release,
    source_manifest_sha256: reportSource.manifestSha256,
    report_id: reportId,
    report_type: draft.report_type,
    release_id: draft.release_id,
    snapshot_id: draft.snapshot_id,
    evidence_sha256: draft.evidence_sha256,
    report_markdown: reportMarkdown,
    draft,
  };
  return { ok: true, issues: [], value: {
    ...withoutDigests,
    digests: { artifact_sha256: sha256(withoutDigests), report_markdown_sha256: sha256(reportMarkdown) },
  } as Pwrp71ReportArtifact };
}
