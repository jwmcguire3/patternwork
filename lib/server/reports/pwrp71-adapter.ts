import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import type { JsonObject, ReportType, ValidationIssue, ValidationResult } from "../../question-engine/types.ts";
import {
  PWQE51_RELEASE_IDENTITY,
  type Pwqe51SourcePackage,
} from "../../question-engine/pwqe51-source.ts";
import type { Pwqe51CanonicalResponse } from "../assessment/pwqe51-router.ts";
import type { Pwrp71SourcePackage } from "./pwrp71-source.ts";
import type { Pwrp71CanonicalResponseEvidence } from "./pwrp71-response-evidence.ts";
import { validatePwrp71ReportDraft } from "./pwrp71-validation.ts";

const PROVIDER_PACKET_FIELDS = [
  "release_id", "snapshot_id", "source_binding", "observations", "episodes", "steps",
  "sequence_edges", "target_resolutions", "structural_evidence_summaries",
  "supported_alternatives", "counterexamples", "missingness", "unresolved_bindings",
  "referent_scopes", "context_comparisons", "reported_context_controls",
  "interpretation_disputes", "open_questions", "corrections",
] as const;

const PROVIDER_SCOPE_FIELDS = ["recall_window", "report_language", "phase", "completion_reason", "evidence_basis"] as const;
const REPORT_TYPES = new Set<ReportType>(["MAP", "IFS", "PV", "ATT", "SYNTHESIS"]);

export interface Pwrp71PreparedRequest {
  readonly system: string;
  readonly user_data: JsonObject;
  readonly response_schema: JsonObject;
  readonly binding: {
    readonly report_release: string;
    readonly report_type: ReportType;
    readonly snapshot_id: string;
    readonly evidence_sha256: string;
    readonly prompt_sha256: string;
  };
}

export interface PreparePwrp71RequestInput {
  /** Packet must come from the authenticated/decrypted server snapshot boundary. */
  readonly packet: JsonObject;
  readonly reportType: ReportType;
  readonly questionSource: Pwqe51SourcePackage;
  readonly reportSource: Pwrp71SourcePackage;
  /** Trusted response/currentness source from the same immutable snapshot when D36 evidence is present. */
  readonly canonicalResponseEvidence?: Pwrp71CanonicalResponseEvidence;
  /** Accepted, structurally validated layer drafts from the trusted artifact store; never client input. */
  readonly acceptedLayers?: Readonly<Record<string, JsonObject>>;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function rows(value: unknown): Record<string, unknown>[] | undefined {
  return Array.isArray(value) ? value.map(object) as Record<string, unknown>[] : undefined;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function addUniqueIndex(items: readonly Record<string, unknown>[], key: string, label: string, issues: ValidationIssue[], path: string): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  items.forEach((item, position) => {
    const id = item[key];
    if (typeof id !== "string" || !id || index.has(id)) issues.push(issue("packet_identity", `${path}[${position}].${key}`, `Missing or duplicate ${label} identity.`));
    else index.set(id, item);
  });
  return index;
}

function validateD36SequenceEvidence(
  packet: JsonObject,
  observations: readonly Record<string, unknown>[],
  edges: readonly Record<string, unknown>[],
  source: Pwqe51SourcePackage,
  canonicalResponseEvidence: Pwrp71CanonicalResponseEvidence | undefined,
  issues: ValidationIssue[],
): void {
  const byResponse = new Map<string, Record<string, unknown>[]>();
  for (const observation of observations) {
    if (observation.item_id !== "D36" || typeof observation.response_id !== "string") continue;
    byResponse.set(observation.response_id, [...(byResponse.get(observation.response_id) ?? []), observation]);
  }

  if (byResponse.size > 0 && !canonicalResponseEvidence) {
    issues.push(issue("recovery_sequence_response_source", "$.canonicalResponseEvidence", "D36 evidence requires current canonical responses and routing state from the same immutable snapshot."));
  }
  if (canonicalResponseEvidence) {
    const responseById = new Map<string, Pwqe51CanonicalResponse>();
    for (const response of canonicalResponseEvidence.responses) {
      if (!response.responseId || responseById.has(response.responseId)) {
        issues.push(issue("recovery_sequence_response_source", "$.canonicalResponseEvidence.responses", "Canonical response IDs must be present and unique."));
        continue;
      }
      responseById.set(response.responseId, response);
    }
    const stale = new Set([
      ...canonicalResponseEvidence.supersededResponseIds,
      ...canonicalResponseEvidence.invalidatedResponseIds,
    ]);
    const packetSuperseded = Array.isArray(packet.superseded_response_ids) ? packet.superseded_response_ids : [];
    const packetInvalidated = Array.isArray(packet.invalidated_response_ids) ? packet.invalidated_response_ids : [];
    const sameIdSet = (left: readonly unknown[], right: readonly string[]) => left.length === right.length
      && new Set(left).size === left.length
      && left.every((id) => typeof id === "string" && right.includes(id));
    if (!sameIdSet(packetSuperseded, canonicalResponseEvidence.supersededResponseIds)
      || !sameIdSet(packetInvalidated, canonicalResponseEvidence.invalidatedResponseIds)) {
      issues.push(issue("recovery_sequence_currentness", "$.packet", "D36 packet stale-response metadata must match the same snapshot's trusted routing state."));
    }

    const currentD36 = canonicalResponseEvidence.responses.filter((response) => response.questionId === "D36"
      && (response.status ?? "answered") === "answered" && !stale.has(response.responseId)
      && (response.selectedOptionIds?.length ?? 0) > 0);
    if (currentD36.length !== byResponse.size) {
      issues.push(issue("recovery_sequence_response_binding", "$.packet.observations", "D36 observations must correspond one-to-one with active answered D36 canonical responses."));
    }
    for (const [responseId, selected] of byResponse) {
      const response = responseById.get(responseId);
      const selection = response?.selectedOptionIds ?? [];
      const selectedOrder = response?.mode === "ordered" ? selection : [...selection].sort();
      const packetOrder = selected.map((observation) => observation.option_id);
      const baseStep = response?.stepId ?? source.questionBank.items.find((question) => question.id === "D36")?.step_binding ?? "first";
      if (!response || response.questionId !== "D36" || stale.has(responseId)
        || (response.status ?? "answered") !== "answered"
        || selectedOrder.length !== packetOrder.length
        || selectedOrder.some((optionId, index) => optionId !== packetOrder[index])
        || selected.some((observation) => observation.occurrence_id !== response.occurrenceId
          || observation.mode !== (response.mode ?? "single")
          || observation.step_id !== (selected.length > 1 ? `${baseStep}/${String(observation.option_id)}` : baseStep))) {
        issues.push(issue("recovery_sequence_response_binding", `$.packet.observations[${String(selected[0]?.id ?? responseId)}]`, "D36 packet observations must preserve the current canonical selected option order, response mode, occurrence, and step."));
      }
    }
  }
  const expected: { id: string; occurrenceId: string; fromStep: string; toStep: string; relation: string; evidenceIds: string[] }[] = [];
  for (const [responseId, selected] of byResponse) {
    if (selected.length < 2) continue;
    const first = selected[0]!;
    const mode = first.mode;
    const relation = mode === "ordered" ? "before"
      : mode === "simultaneous" ? "simultaneous"
        : mode === "order_unknown" ? "order_unknown" : undefined;
    if (!relation || selected.some((observation) => observation.mode !== mode || observation.occurrence_id !== first.occurrence_id)) {
      issues.push(issue("recovery_sequence_mode", "$.packet.sequence_edges", `D36 response ${responseId} does not retain one supported selection mode and occurrence.`));
      continue;
    }
    for (let index = 0; index < selected.length - 1; index += 1) {
      const from = selected[index]!;
      const to = selected[index + 1]!;
      if (typeof from.option_id !== "string" || typeof to.option_id !== "string"
        || typeof from.step_id !== "string" || typeof to.step_id !== "string") continue;
      expected.push({
        id: `recovery:${responseId}:${from.option_id}:${to.option_id}`,
        occurrenceId: String(first.occurrence_id),
        fromStep: from.step_id,
        toStep: to.step_id,
        relation,
        evidenceIds: [String(from.id), String(to.id)],
      });
    }
  }
  const recoveryEdges = edges.filter((edge) => edge.meaning === "reported_recovery_order");
  const d36ObservationIds = new Set(observations.filter((observation) => observation.item_id === "D36")
    .map((observation) => observation.id).filter((id): id is string => typeof id === "string"));
  const edgesTouchingD36 = edges.filter((edge) => Array.isArray(edge.evidence_ids)
    && (edge.evidence_ids as unknown[]).some((id) => typeof id === "string" && d36ObservationIds.has(id)));
  if (recoveryEdges.length !== expected.length || edgesTouchingD36.length !== expected.length
    || recoveryEdges.some((edge, index) => {
      const row = expected[index];
      const evidence = Array.isArray(edge.evidence_ids) ? edge.evidence_ids : [];
      return !row || edge.id !== row.id || edge.occurrence_id !== row.occurrenceId
        || edge.from_step !== row.fromStep || edge.to_step !== row.toStep || edge.relation !== row.relation
        || evidence.length !== row.evidenceIds.length || evidence.some((id, evidenceIndex) => id !== row.evidenceIds[evidenceIndex]);
    })) {
    issues.push(issue("recovery_sequence_semantics", "$.packet.sequence_edges", "D36 sequence edges must preserve the selected adjacent option order, response mode, occurrence, and exact observations."));
  }
}

function validateSourceBindings(input: PreparePwrp71RequestInput, issues: ValidationIssue[]): void {
  const { questionSource, reportSource } = input;
  if (questionSource.manifest.source_binding.question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || questionSource.manifest.source_binding.runtime_version !== PWQE51_RELEASE_IDENTITY.routerVersion
    || questionSource.manifest.source_binding.source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256) {
    issues.push(issue("question_source_binding", "$.questionSource", "Loaded question source does not match the pinned PWQE 5.1 release identity."));
  }
  if (reportSource.policy.release !== PWQE51_RELEASE_IDENTITY.reportRelease
    || reportSource.policy.compatible_question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || reportSource.policy.compatible_router_format !== "patternwork-router-evidence-v1"
    || reportSource.policy.compatible_router_source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || reportSource.policy.prompt_composition !== "shared_plus_selected_layer_only") {
    issues.push(issue("report_source_binding", "$.reportSource", "Loaded report source is not compatible with the pinned PWQE 5.1/PWRP 7.1 candidate pair."));
  }
}

function validatePacket(
  packet: JsonObject,
  source: Pwqe51SourcePackage,
  canonicalResponseEvidence: Pwrp71CanonicalResponseEvidence | undefined,
  issues: ValidationIssue[],
): void {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  let validate: ReturnType<typeof ajv.compile>;
  try {
    validate = ajv.compile(source.schemas.routerPacket as object);
  } catch (error) {
    issues.push(issue("router_packet_schema", "$.packet", `PWQE 5.1 packet schema could not be compiled: ${String(error)}`));
    return;
  }
  if (!validate(packet)) {
    for (const error of validate.errors ?? []) issues.push(issue("router_packet_schema", error.instancePath || "$.packet", error.message ?? "Packet schema validation failed."));
    return;
  }

  const sourceBinding = object(packet.source_binding);
  const expected = source.manifest.source_binding;
  if (packet.format !== "patternwork-router-evidence-v1"
    || packet.release_id !== expected.question_release
    || sourceBinding?.question_release !== expected.question_release
    || sourceBinding?.runtime_version !== expected.runtime_version
    || sourceBinding?.source_sha256 !== expected.source_sha256) {
    issues.push(issue("router_packet_source", "$.packet.source_binding", "Packet format or source binding does not match PWQE 5.1."));
  }
  const { content_sha256: contentDigest, ...content } = packet;
  if (typeof contentDigest !== "string" || contentDigest !== sha256(canonical(content))) {
    issues.push(issue("router_packet_digest", "$.packet.content_sha256", "Packet content digest does not match its canonical contents."));
  }

  const observations = rows(packet.observations) ?? [];
  const episodes = rows(packet.episodes) ?? [];
  const steps = rows(packet.steps) ?? [];
  const edges = rows(packet.sequence_edges) ?? [];
  const targets = rows(packet.target_resolutions) ?? [];
  const summaries = rows(packet.structural_evidence_summaries) ?? [];
  const administrations = rows(packet.administration_provenance) ?? [];
  const observationIndex = addUniqueIndex(observations, "id", "observation", issues, "$.packet.observations");
  const episodeIndex = addUniqueIndex(episodes, "id", "occurrence", issues, "$.packet.episodes");
  const stepIndex = addUniqueIndex(steps, "id", "step", issues, "$.packet.steps");
  const liveResponses = new Set(administrations.map((entry) => entry.live_response_id).filter((id): id is string => typeof id === "string" && id.length > 0));
  const staleResponses = new Set([
    ...(Array.isArray(packet.superseded_response_ids) ? packet.superseded_response_ids : []),
    ...(Array.isArray(packet.invalidated_response_ids) ? packet.invalidated_response_ids : []),
  ].filter((id): id is string => typeof id === "string"));
  for (const [index, observation] of observations.entries()) {
    const path = `$.packet.observations[${index}]`;
    const item = source.questionBank.items.find((candidate) => candidate.id === observation.item_id);
    const variant = observation.variant === "base" ? undefined : source.questionBank.variants.find((candidate) => candidate.id === observation.variant);
    const question = variant && variant.replaces === observation.item_id ? { ...item, options: variant.options } : item;
    const option = question?.options.find((candidate) => candidate.id === observation.option_id);
    const expectedCapture = variant && variant.replaces === observation.item_id && typeof variant.captures === "string" ? variant.captures : item?.captures;
    if (!item || !option || observation.text !== option.text || observation.reported_value !== option.reported_value
      || observation.capture !== expectedCapture || observation.source_version !== item.version) {
      issues.push(issue("observation_source", path, "Observation does not match an authored PWQE 5.1 item, option, and source version."));
    }
    const expectedId = typeof observation.response_id === "string" && typeof observation.option_id === "string"
      ? `O${sha256(canonical([observation.response_id, observation.option_id])).slice(0, 20)}`
      : undefined;
    if (observation.id !== expectedId
      || typeof observation.response_id !== "string" || !liveResponses.has(observation.response_id) || staleResponses.has(observation.response_id)
      || typeof observation.occurrence_id !== "string" || !episodeIndex.has(observation.occurrence_id)
      || observation.dependence_group !== observation.occurrence_id) {
      issues.push(issue("observation_lineage", path, "Observation identity or current response/occurrence lineage is invalid."));
    }
  }
  validateD36SequenceEvidence(packet, observations, edges, source, canonicalResponseEvidence, issues);

  const observationIds = new Set(observationIndex.keys());
  const episodeIds = new Set(episodeIndex.keys());
  const stepByOccurrenceAndName = new Map<string, Record<string, unknown>>();
  const stepKey = (occurrenceId: unknown, stepId: unknown) => `${String(occurrenceId)}\u0000${String(stepId)}`;
  for (const [index, step] of steps.entries()) {
    const path = `$.packet.steps[${index}]`;
    const key = stepKey(step.occurrence_id, step.step_id);
    const observationRefs = Array.isArray(step.observation_ids) ? step.observation_ids : [];
    if (typeof step.occurrence_id !== "string" || !episodeIds.has(step.occurrence_id)
      || typeof step.step_id !== "string" || stepByOccurrenceAndName.has(key)
      || !Array.isArray(step.observation_ids)
      || observationRefs.some((id) => {
        const observation = typeof id === "string" ? observationIndex.get(id) : undefined;
        return !observation || observation.occurrence_id !== step.occurrence_id || observation.step_id !== step.step_id;
      })) {
      issues.push(issue("step_lineage", path, "Step identity and every observation reference must bind to the same existing occurrence and step."));
    } else stepByOccurrenceAndName.set(key, step);
  }
  for (const [index, observation] of observations.entries()) {
    const step = stepByOccurrenceAndName.get(stepKey(observation.occurrence_id, observation.step_id));
    const refs = Array.isArray(step?.observation_ids) ? step.observation_ids : [];
    if (!step || !refs.includes(observation.id)) {
      issues.push(issue("observation_step_lineage", `$.packet.observations[${index}]`, "Observation must be listed by its current occurrence and step."));
    }
  }
  const beforeGraph = new Map<string, Map<string, Set<string>>>();
  for (const [index, edge] of edges.entries()) {
    const from = stepByOccurrenceAndName.get(stepKey(edge.occurrence_id, edge.from_step));
    const to = stepByOccurrenceAndName.get(stepKey(edge.occurrence_id, edge.to_step));
    const evidence = Array.isArray(edge.evidence_ids) ? edge.evidence_ids : [];
    if (!from || !to || !stepIndex.has(String(from.id)) || !stepIndex.has(String(to.id))
      || evidence.length === 0 || evidence.some((id) => {
        const observation = typeof id === "string" ? observationIndex.get(id) : undefined;
        return !observation || observation.occurrence_id !== edge.occurrence_id;
      })) {
      issues.push(issue("sequence_lineage", `$.packet.sequence_edges[${index}]`, "Sequence edge must bind same-occurrence steps and current observation evidence."));
    }
    if (edge.relation === "before" && typeof edge.occurrence_id === "string" && typeof edge.from_step === "string" && typeof edge.to_step === "string") {
      const graph = beforeGraph.get(edge.occurrence_id) ?? new Map<string, Set<string>>();
      graph.set(edge.from_step, new Set([...(graph.get(edge.from_step) ?? []), edge.to_step]));
      beforeGraph.set(edge.occurrence_id, graph);
    }
  }
  for (const [occurrenceId, graph] of beforeGraph) {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (stepId: string): boolean => {
      if (visiting.has(stepId)) return false;
      if (visited.has(stepId)) return true;
      visiting.add(stepId);
      for (const next of graph.get(stepId) ?? []) if (!visit(next)) return false;
      visiting.delete(stepId);
      visited.add(stepId);
      return true;
    };
    if ([...graph.keys()].some((stepId) => !visit(stepId))) {
      issues.push(issue("sequence_cycle", "$.packet.sequence_edges", `Reported before edges contain a temporal cycle in occurrence ${occurrenceId}.`));
    }
  }
  const targetIds = new Set(source.routingTargets.targets.map((target) => target.id).filter((id): id is string => typeof id === "string"));
  // comparison_ids in a target are *occurrence IDs*, not IDs of entries in
  // context_comparisons (which has no id field in the pinned router schema).
  // An independent comparison requires a source-confirmed distinct pair.
  const confirmedPairs = new Set<string>();
  for (const episode of episodes) {
    if (typeof episode.id !== "string" || episode.basis !== "actual_recalled") continue;
    for (const otherId of Array.isArray(episode.distinct_from) ? episode.distinct_from : []) {
      const other = typeof otherId === "string" ? episodeIndex.get(otherId) : undefined;
      if (other?.basis !== "actual_recalled" || otherId === episode.id) continue;
      confirmedPairs.add([episode.id, otherId].sort().join("\u0000"));
    }
  }
  // For an explicitly recorded 'same' or 'cannot tell' pair there is no
  // independently confirmed contrast, regardless of matching actions.
  for (const relation of rows(packet.context_comparisons) ?? []) {
    if (relation.basis === "respondent_confirmed_distinctness"
      && typeof relation.occurrence_id === "string"
      && Array.isArray(relation.distinct_from)) {
      for (const otherId of relation.distinct_from) if (typeof otherId === "string") {
        const pair = [relation.occurrence_id, otherId].sort().join("\u0000");
        if (confirmedPairs.has(pair)) continue;
        issues.push(issue("comparison_lineage", "$.packet.context_comparisons", "A declared distinctness comparison must match current actual episode lineage."));
      }
    }
  }
  const targetInstances = new Set<string>();
  for (const [index, target] of targets.entries()) {
    const refs = [...(Array.isArray(target.source_ids) ? target.source_ids : []), ...(Array.isArray(target.resolution_ids) ? target.resolution_ids : [])];
    const path = `$.packet.target_resolutions[${index}]`;
    const pair = Array.isArray(target.comparison_ids) ? target.comparison_ids : [];
    const hasPair = pair.length === 2 && pair.every((id) => typeof id === "string" && episodeIndex.get(id)?.basis === "actual_recalled")
      && pair[0] !== pair[1] && pair.includes(target.occurrence_id)
      && confirmedPairs.has([...pair].sort().join("\u0000"));
    const invalidComparisons = pair.length > 0 && !hasPair;
    const permittedOccurrences = hasPair ? new Set(pair) : new Set([target.occurrence_id]);
    const invalidObservation = refs.some((id) => {
      const observation = typeof id === "string" ? observationIndex.get(id) : undefined;
      return !observation || !permittedOccurrences.has(observation.occurrence_id);
    });
    // An open evidence target can point at a *prospective* step before any
    // substantive answer exists at that step. Only observed/resolved targets
    // are required to refer to an existing observation-backed step.
    const isProspective = ["open", "unresolved", "unavailable", "declined", "abandoned_low_value"].includes(String(target.state))
      && (!Array.isArray(target.resolution_ids) || target.resolution_ids.length === 0);
    const targetStepExists = stepByOccurrenceAndName.has(stepKey(target.occurrence_id, target.step_id));
    if (typeof target.id !== "string" || !target.id || targetInstances.has(target.id)
      || typeof target.target_id !== "string" || !targetIds.has(target.target_id)
      || typeof target.occurrence_id !== "string" || !episodeIds.has(target.occurrence_id)
      || (typeof target.step_id !== "string" || !target.step_id)
      || (!targetStepExists && !isProspective)
      || invalidObservation || invalidComparisons) {
      issues.push(issue("target_lineage", path, "Target resolution identity, definition, step, occurrence, comparisons, or source observations are not bound to current packet evidence."));
    } else targetInstances.add(target.id);
  }
  for (const [index, summary] of summaries.entries()) {
    const refs = [...(Array.isArray(summary.evidence_ids) ? summary.evidence_ids : []), ...(Array.isArray(summary.counterevidence_ids) ? summary.counterevidence_ids : [])];
    if (refs.some((id) => typeof id !== "string" || !observationIds.has(id))
      || !Array.isArray(summary.occurrence_ids) || summary.occurrence_ids.some((id) => typeof id !== "string" || !episodeIds.has(id))) {
      issues.push(issue("summary_lineage", `$.packet.structural_evidence_summaries[${index}]`, "Summary cites unknown observations or occurrences."));
    }
  }
}

function validateAcceptedLayers(layers: Readonly<Record<string, JsonObject>>, packet: JsonObject, source: Pwrp71SourcePackage, issues: ValidationIssue[]): void {
  const expectedLayers = new Set(["IFS", "PV", "ATT"]);
  if (Object.keys(layers).length !== expectedLayers.size || Object.keys(layers).some((layer) => !expectedLayers.has(layer))) {
    issues.push(issue("accepted_layer_set", "$.accepted_layers", "Synthesis requires exactly one accepted IFS, PV, and ATT draft."));
  }
  const knownNames = new Map<string, { name: string; entity_kind: string; role: string }>();
  const labels = new Map<string, string>();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(source.schemas.reportDraft as object);
  for (const [layer, draft] of Object.entries(layers)) {
    const path = `$.accepted_layers.${layer}`;
    if (!(new Set(["IFS", "PV", "ATT"])).has(layer) || draft.report_type !== layer) {
      issues.push(issue("accepted_layer_type", path, "Synthesis accepts only matching IFS, PV, and ATT layer drafts."));
      continue;
    }
    if (!validate(draft)) {
      for (const error of validate.errors ?? []) issues.push(issue("accepted_layer_schema", `${path}${error.instancePath || ""}`, error.message ?? "Layer draft schema validation failed."));
      continue;
    }
    if (draft.report_release !== PWQE51_RELEASE_IDENTITY.reportRelease || draft.release_id !== packet.release_id
      || draft.snapshot_id !== packet.snapshot_id || draft.evidence_sha256 !== packet.content_sha256) {
      issues.push(issue("accepted_layer_binding", path, "Synthesis layer draft does not bind to this PWRP release, packet, and snapshot."));
    }
    const fullValidation = validatePwrp71ReportDraft({
      value: draft,
      reportType: layer as ReportType,
      snapshotId: String((packet as Record<string, unknown>).snapshot_id),
      packet,
      source,
    });
    if (!fullValidation.ok) {
      for (const entry of fullValidation.issues) issues.push(issue("accepted_layer_validation", `${path}${entry.path === "$" ? "" : entry.path.slice(1)}`, entry.message));
      continue;
    }
    for (const candidate of Array.isArray(draft.name_registry) ? draft.name_registry : []) {
      const name = object(candidate);
      if (!name || typeof name.name_id !== "string" || typeof name.name !== "string" || typeof name.entity_kind !== "string" || typeof name.role !== "string") continue;
      const definition = { name: name.name, entity_kind: name.entity_kind, role: name.role };
      const prior = knownNames.get(name.name_id);
      if (prior && (prior.name !== definition.name || prior.entity_kind !== definition.entity_kind || prior.role !== definition.role)) {
        issues.push(issue("accepted_layer_name_conflict", path, "Cross-layer name identity conflict requires reconciliation."));
      }
      const priorId = labels.get(name.name.toLocaleLowerCase("en-US"));
      if (priorId && priorId !== name.name_id) issues.push(issue("accepted_layer_label_conflict", path, "The same label has conflicting entity identities across layers."));
      knownNames.set(name.name_id, definition);
      labels.set(name.name.toLocaleLowerCase("en-US"), name.name_id);
    }
  }
}

/** Builds the PWRP 7.1 provider view from an authenticated server-owned PWQE 5.1 packet. */
export function preparePwrp71Request(input: PreparePwrp71RequestInput): ValidationResult<Pwrp71PreparedRequest> {
  const issues: ValidationIssue[] = [];
  validateSourceBindings(input, issues);
  if (!REPORT_TYPES.has(input.reportType) || !(input.reportType in input.reportSource.policy.layer_prompts)) {
    issues.push(issue("report_type", "$.report_type", "Unknown PWRP 7.1 report type."));
  }
  const layers = input.acceptedLayers ?? {};
  if (input.reportType !== "SYNTHESIS" && Object.keys(layers).length > 0) issues.push(issue("accepted_layers_scope", "$.accepted_layers", "Accepted layer claims may only be supplied to synthesis."));
  if (input.reportType === "SYNTHESIS" && Object.keys(layers).length === 0) issues.push(issue("synthesis_layers_missing", "$.accepted_layers", "Synthesis requires accepted layer artifacts from trusted storage."));
  validatePacket(input.packet, input.questionSource, input.canonicalResponseEvidence, issues);
  if (input.reportType === "SYNTHESIS" && Object.keys(layers).length > 0) validateAcceptedLayers(layers, input.packet, input.reportSource, issues);
  if (issues.length > 0) return { ok: false, issues };

  const promptKey = input.reportType === "MAP" ? "mapping"
    : input.reportType === "IFS" ? "ifs"
      : input.reportType === "PV" ? "state"
        : input.reportType === "ATT" ? "attachment" : "synthesis";
  const system = `${input.reportSource.prompts.shared}\n\n${input.reportSource.prompts[promptKey]}`;
  const packetRecord = input.packet as Record<string, unknown>;
  const scope = object(packetRecord.assessment_scope)!;
  const view: Record<string, unknown> = {};
  for (const key of PROVIDER_PACKET_FIELDS) view[key] = structuredClone(packetRecord[key]);
  const scopeView: Record<string, unknown> = {};
  for (const key of PROVIDER_SCOPE_FIELDS) scopeView[key] = structuredClone(scope[key]);
  view.assessment_scope = scopeView;
  view.evidence_sha256 = packetRecord.content_sha256;
  view.report_release = input.reportSource.policy.release;
  view.report_type = input.reportType;
  view.accepted_layers = structuredClone(layers);
  view.interpretation_note = "Structural summaries are non-exhaustive; current source observations control.";
  const request: Pwrp71PreparedRequest = {
    system,
    user_data: view as JsonObject,
    response_schema: structuredClone(input.reportSource.schemas.reportDraft) as JsonObject,
    binding: {
      report_release: input.reportSource.policy.release,
      report_type: input.reportType,
      snapshot_id: String(packetRecord.snapshot_id),
      evidence_sha256: String(packetRecord.content_sha256),
      prompt_sha256: sha256(system),
    },
  };
  return { ok: true, value: request, issues: [] };
}
