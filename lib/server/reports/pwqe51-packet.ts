import Ajv2020 from "ajv/dist/2020.js";
import { sha256 } from "../security/crypto.ts";
import { PWQE51_RELEASE_IDENTITY, type Pwqe51SourcePackage } from "../../question-engine/pwqe51-source.ts";
import type { Pwqe51CanonicalResponse, Pwqe51RouterResult } from "../assessment/pwqe51-router.ts";
import type { Pwqe51ComparisonDecision } from "../assessment/pwqe51-session.ts";

type Pwqe51Response = Pwqe51CanonicalResponse;
type Pwqe51Control = "end" | "shorten";

/** Narrow input boundary so report packet construction does not depend on session storage. */
export interface BuildPwqe51PacketInput {
  readonly snapshotId: string;
  readonly responses: readonly Pwqe51Response[];
  readonly routerResult: Pwqe51RouterResult;
  readonly pass: 1 | 2;
  readonly controls: readonly Pwqe51Control[];
  readonly comparisonDecisions?: readonly Pwqe51ComparisonDecision[];
  readonly source: Pwqe51SourcePackage;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function assertCurrentLineage(input: BuildPwqe51PacketInput): void {
  const { responses, routerResult: route, source } = input;
  const binding = source.manifest.source_binding;
  if (source.questionBank.release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || binding.question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || binding.runtime_version !== PWQE51_RELEASE_IDENTITY.routerVersion
    || binding.source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || route.sourceRelease !== PWQE51_RELEASE_IDENTITY.questionRelease) {
    throw new Error("PWQE 5.1 packet rejected stale or mismatched source lineage.");
  }

  const responseById = new Map<string, Pwqe51Response>();
  for (const response of responses) {
    if (!response.responseId || responseById.has(response.responseId)) throw new Error("PWQE 5.1 packet requires unique canonical response IDs.");
    responseById.set(response.responseId, response);
  }
  const superseded = new Set(route.supersededResponseIds);
  const invalidated = new Set(route.invalidatedResponses.map((entry) => entry.responseId));
  const stale = new Set([...superseded, ...invalidated]);
  for (const id of stale) if (!responseById.has(id)) throw new Error(`PWQE 5.1 router lineage references unknown response ${id}.`);

  const questions = new Map(source.questionBank.items.map((question) => [question.id, question]));
  const variants = new Map(source.questionBank.variants.map((variant) => [variant.id, variant]));
  const observed = new Set<string>();
  for (const observation of route.observations) {
    const response = responseById.get(observation.responseId);
    if (!response || stale.has(response.responseId) || response.status && response.status !== "answered") {
      throw new Error(`PWQE 5.1 router observation ${observation.id} is stale or has no canonical answer.`);
    }
    const question = questions.get(response.questionId);
    const variant = response.variantId ? variants.get(response.variantId) : undefined;
    const options = variant && variant.replaces === question?.id ? variant.options : question?.options ?? [];
    const stepId = response.stepId ?? question?.step_binding ?? "first";
    const selected = response.selectedOptionIds ?? [];
    const option = options.find((entry) => entry.id === observation.optionId);
    const expectedBasis = (response.status ?? "answered") !== "answered" ? "missing"
      : ["D05", "D44", "D99"].includes(response.questionId) ? "reported_typicality"
        : ["M09", "D03", "D19", "D48", "D89", "D90"].includes(response.questionId)
          ? (response.basis ?? responses.find((prior) => prior.occurrenceId === response.occurrenceId && (prior.basis === "actual_recalled" || prior.basis === "reported_typicality"))?.basis) === "actual_recalled" ? "remembered_expectation" : "reported_typicality"
          : response.basis ?? responses.find((prior) => prior.occurrenceId === response.occurrenceId && (prior.basis === "actual_recalled" || prior.basis === "reported_typicality"))?.basis;
    if (!question || !option || observation.itemId !== question.id
      || (response.variantId && variant?.replaces !== question.id)
      || observation.occurrenceId !== response.occurrenceId
      || observation.stepId !== stepId
      || !selected.includes(observation.optionId)
      || observation.mode !== (response.mode ?? "single")
      || observation.basis !== expectedBasis
      || observation.capture !== (variant?.captures ?? question.captures)
      || observation.candidateSignals.join("\u0000") !== (option.candidate_signals ?? []).join("\u0000")
      || observation.id !== `${response.responseId}:${observation.optionId}`
      || observation.text !== option.text
      || observation.reportedValue !== (option.reported_value ?? option.text)
      || observation.version !== question.version
      || observed.has(observation.id)) {
      throw new Error(`PWQE 5.1 router observation ${observation.id} does not match the canonical response log and authored source.`);
    }
    observed.add(observation.id);
  }

  // Every currently valid selected option must have exactly one router leaf.
  for (const response of responses) {
    if (stale.has(response.responseId) || (response.status ?? "answered") !== "answered") continue;
    const question = questions.get(response.questionId);
    const variant = response.variantId ? variants.get(response.variantId) : undefined;
    const options = variant && variant.replaces === question?.id ? variant.options : question?.options ?? [];
    for (const optionId of response.selectedOptionIds ?? []) {
      if (!options.some((option) => option.id === optionId)) throw new Error(`PWQE 5.1 response ${response.responseId} contains an option outside its authored source.`);
      if (!observed.has(`${response.responseId}:${optionId}`)) throw new Error(`PWQE 5.1 router omitted current response evidence ${response.responseId}:${optionId}.`);
    }
  }

  for (const missing of route.missingness) {
    const response = responseById.get(missing.responseId);
    if (!response || stale.has(missing.responseId)
      || response.questionId !== missing.questionId || response.occurrenceId !== missing.occurrenceId
      || (response.status ?? "answered") !== missing.status || missing.status === "answered") {
      throw new Error(`PWQE 5.1 missingness ${missing.responseId} does not match the current canonical log.`);
    }
  }
}

/** Builds a source-bound 5.1 packet from canonical response evidence and the matching router result. */
export function buildPwqe51RouterPacket(input: BuildPwqe51PacketInput): Record<string, unknown> {
  const { snapshotId, responses, routerResult: route, source } = input;
  assertCurrentLineage(input);
  const questions = new Map(source.questionBank.items.map((question) => [question.id, question]));
  const responseById = new Map(responses.map((response) => [response.responseId, response]));
  const packetObservationId = new Map(route.observations.map((observation) => [
    observation.id,
    `O${sha256(canonicalize([observation.responseId, observation.optionId])).slice(0, 20)}`,
  ]));
  const packetObservationIds = (ids: readonly string[]) => ids.map((id) => {
    const packetId = packetObservationId.get(id);
    if (!packetId) throw new Error(`PWQE 5.1 router reference ${id} has no current packet observation.`);
    return packetId;
  });

  const observations = route.observations.map((observation) => {
    const response = responseById.get(observation.responseId)!;
    const question = questions.get(response.questionId)!;
    const stepId = response.stepId ?? question.step_binding ?? "first";
    return {
      id: packetObservationId.get(observation.id)!,
      response_id: response.responseId,
      administration_id: response.responseId,
      item_id: question.id,
      option_id: observation.optionId,
      variant: response.variantId ?? "base",
      text: observation.text,
      displayed_text: observation.text,
      reported_value: observation.reportedValue,
      capture: observation.capture,
      occurrence_id: observation.occurrenceId,
      step_id: stepId,
      basis: observation.basis,
      mode: observation.mode,
      dependence_group: observation.occurrenceId,
      selection_reason: "respondent-selected authored option",
      source_version: observation.version,
      person_id: null,
      signals: observation.candidateSignals,
      // The leaf basis remains expectation/typicality where the router assigns it.
      // Episode basis is preserved separately on the episode object below.
    };
  });

  const actualEpisodeIds = new Set(route.episodes.filter((episode) => episode.basis === "actual_recalled").map((episode) => episode.id));
  const comparisonPairKeys = new Set<string>();
  // Comparisons selected at Mapping completion and distinct replay occasions
  // are two legitimate sources of pair evidence. The latter is derived from
  // trusted current router state, never from similarity of chosen responses.
  const reportedDecisions: Pwqe51ComparisonDecision[] = [...(input.comparisonDecisions ?? [])];
  const existingPairs = new Set(reportedDecisions.map((decision) =>
    [decision.firstOccurrenceId, decision.secondOccurrenceId].sort().join("\u0000")));
  for (const episode of route.episodes) {
    for (const sourceId of episode.distinctFrom ?? []) {
      const key = [episode.id, sourceId].sort().join("\u0000");
      if (existingPairs.has(key)) continue;
      if (!actualEpisodeIds.has(episode.id) || !actualEpisodeIds.has(sourceId)) {
        throw new Error("PWQE 5.1 replay distinctness must join two current actual episodes.");
      }
      reportedDecisions.push({ firstOccurrenceId: sourceId, secondOccurrenceId: episode.id, relation: "different" });
      existingPairs.add(key);
    }
  }
  const contextComparisons = reportedDecisions.map((decision) => {
    if (!actualEpisodeIds.has(decision.firstOccurrenceId) || !actualEpisodeIds.has(decision.secondOccurrenceId)
      || decision.firstOccurrenceId === decision.secondOccurrenceId
      || !["different", "same", "cannot_tell"].includes(decision.relation)) {
      throw new Error("PWQE 5.1 context comparison does not bind two current actual recalled episodes.");
    }
    const pairKey = [decision.firstOccurrenceId, decision.secondOccurrenceId].sort().join("\u0000");
    if (comparisonPairKeys.has(pairKey)) throw new Error("PWQE 5.1 context comparisons contain a duplicate pair.");
    comparisonPairKeys.add(pairKey);
    return {
      occurrence_id: decision.secondOccurrenceId,
      distinct_from: decision.relation === "different" ? [decision.firstOccurrenceId] : [],
      linked_from: decision.firstOccurrenceId,
      basis: decision.relation === "different" ? "respondent_confirmed_distinctness"
        : decision.relation === "same" ? "respondent_confirmed_same_occurrence"
          : "respondent_cannot_tell_distinctness",
    };
  });
  const comparisonByOccurrence = new Map(reportedDecisions.map((decision) => [decision.secondOccurrenceId, decision]));

  const episodes = route.episodes.map((episode) => {
    const root = episode.responseIds.map((id) => responseById.get(id)).find((response) => response?.basis === "actual_recalled" || response?.basis === "reported_typicality");
    const rootQuestion = root ? questions.get(root.questionId) : undefined;
    const comparison = comparisonByOccurrence.get(episode.id);
    const distinctFrom = new Set(episode.distinctFrom ?? []);
    if (comparison?.relation === "different") distinctFrom.add(comparison.firstOccurrenceId);
    return {
      id: episode.id,
      family: episode.family,
      context: episode.context,
      root_item_id: rootQuestion?.id ?? "unknown",
      basis: episode.basis,
      status: episode.basis,
      recall_window: "Per-question respondent recall; the source release defines no fixed lookback window.",
      person_id: null,
      role: null,
      topic: null,
      linked_from: episode.linkedFrom ?? comparison?.firstOccurrenceId ?? null,
      distinct_from: [...distinctFrom],
      outside_window: false,
    };
  });

  const steps = route.steps.map((step) => ({
    id: step.id,
    occurrence_id: step.occurrenceId,
    step_id: route.observations.find((observation) => step.observationIds.includes(observation.id))?.stepId ?? "first",
    observation_ids: packetObservationIds(step.observationIds),
  }));

  const sequenceEdges = route.sequenceEdges.map((edge) => ({
    id: edge.id,
    occurrence_id: edge.occurrenceId,
    from_step: edge.fromStep,
    to_step: edge.toStep,
    meaning: edge.meaning,
    relation: edge.relation,
    evidence_ids: packetObservationIds(edge.observationIds),
    first_not_helping: edge.observationIds.some((id) => id.endsWith(":D08.after_failed")),
  }));

  const targetResolutions = route.targets.map((target) => {
    const attempts = responses.filter((response) => response.occurrenceId === target.occurrenceId
      && target.candidateItems.includes(response.questionId)
      && (response.stepId ?? questions.get(response.questionId)?.step_binding ?? "first") === target.stepId).length;
    return {
      id: target.id,
      target_id: target.targetId,
      occurrence_id: target.occurrenceId,
      step_id: target.stepId,
      reason: target.reason,
      state: target.state,
      comparison_ids: target.comparisonIds ?? [],
      source_ids: packetObservationIds(target.sourceObservationIds),
      resolution_ids: packetObservationIds(target.resolutionObservationIds),
      attempts,
    };
  });

  const missingness = route.missingness.map((missing) => ({
    administration_id: missing.responseId,
    response_id: missing.responseId,
    item_id: missing.questionId,
    occurrence_id: missing.occurrenceId,
    status: missing.status,
    reason: missing.status,
  }));
  const corrections = responses.filter((response) => response.supersedesResponseId).map((response) => ({
    administration_id: response.responseId,
    old_response_id: response.supersedesResponseId,
    new_response_id: response.responseId,
    kind: "response_correction",
    occurrence_id: response.occurrenceId,
    aspect: "canonical answer",
    target_id: response.questionId,
    control_id: "response-correction",
    reason: "A later canonical response supersedes the prior response; router evidence is replayed from the active log.",
    destination_occurrence_id: response.occurrenceId,
    seq: responses.indexOf(response) + 1,
  }));
  const unresolvedBindings = route.invalidatedResponses.map((entry) => ({
    administration_id: entry.responseId,
    response_id: entry.responseId,
    reason: entry.reason,
  }));
  const openQuestions = route.targets.filter((target) => ["open", "unresolved", "unavailable", "declined"].includes(target.state)).map((target) => ({
    target_instance: target.id,
    target_id: target.targetId,
    state: target.state,
    reason: target.reason,
  }));
  const actualEpisodes = route.episodes.filter((episode) => episode.basis === "actual_recalled");
  const parentByEpisode = new Map(actualEpisodes.map((episode) => [episode.id, episode.id]));
  const findParent = (episodeId: string): string => {
    const parent = parentByEpisode.get(episodeId);
    if (!parent) return episodeId;
    if (parent === episodeId) return parent;
    const root = findParent(parent);
    parentByEpisode.set(episodeId, root);
    return root;
  };
  for (const decision of reportedDecisions) {
    // Only explicit distinctness supports an independent pair. A same or uncertain answer
    // remains in context_comparisons but cannot add independent occurrence support.
    if (decision.relation === "different") continue;
    const firstRoot = findParent(decision.firstOccurrenceId);
    const secondRoot = findParent(decision.secondOccurrenceId);
    if (firstRoot !== secondRoot) parentByEpisode.set(secondRoot, firstRoot);
  }
  const independentlySupportedOccurrences = new Set(actualEpisodes.map((episode) => findParent(episode.id))).size;
  const mappingCount = responses.filter((response) => questions.get(response.questionId)?.stage === "mapping").length;
  const staleResponseIds = new Set([...route.supersededResponseIds, ...route.invalidatedResponses.map((entry) => entry.responseId)]);
  const administrationProvenance = responses.filter((response) => !staleResponseIds.has(response.responseId)).map((response) => {
    const question = questions.get(response.questionId);
    const variant = response.variantId ? source.questionBank.variants.find((item) => item.id === response.variantId && item.replaces === response.questionId) : undefined;
    const options = variant?.options ?? question?.options ?? [];
    return {
      id: response.responseId,
      item_id: response.questionId,
      variant: response.variantId ?? "base",
      occurrence_id: response.occurrenceId,
      phase: question?.stage ?? "unknown",
      selection_reason: "server-issued authored question",
      option_order: options.map((option) => option.id),
      live_response_id: response.responseId,
    };
  });
  const coverage = Object.fromEntries(route.targets.map((target) => [`${target.targetId}:${target.occurrenceId}:${target.stepId}`, target.state]));
  const hasScopedEvidence = observations.length > 0 && actualEpisodes.length > 0;
  const packetWithoutDigest: Record<string, unknown> = {
    format: "patternwork-router-evidence-v1",
    release_id: PWQE51_RELEASE_IDENTITY.questionRelease,
    snapshot_id: snapshotId,
    packet_id: `pwp51_${snapshotId}`,
    source_binding: {
      question_release: PWQE51_RELEASE_IDENTITY.questionRelease,
      runtime_version: PWQE51_RELEASE_IDENTITY.routerVersion,
      source_sha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
    },
    superseded_response_ids: route.supersededResponseIds,
    invalidated_response_ids: route.invalidatedResponses.map((entry) => entry.responseId),
    assessment_scope: {
      recall_window: "Per-question respondent recall; no fixed lookback window is defined by this source release.",
      report_language: "en",
      phase: input.pass === 1 ? "mapping" : "deepening",
      interpretation_authority: "Respondent selections and deterministic structural derivation; no diagnostic or physiological measurement authority.",
      evidence_basis: "Versioned authored options bound to respondent-recalled occurrences and server-derived routing state.",
      completion_reason: route.completionReason ?? null,
      readiness: {
        mapping_coverage_complete: input.pass === 1 && route.completionReason === "mapping_coverage_complete",
        normal_mapping_ready: hasScopedEvidence,
        applicable_pending_items: route.candidates.map((candidate) => candidate.questionId),
        offered_mapping_items: [...new Set(responses.filter((response) => questions.get(response.questionId)?.stage === "mapping").map((response) => response.questionId))],
        actual_occurrence_ids: actualEpisodes.map((episode) => episode.id),
        sampled_contexts: [...new Set(actualEpisodes.map((episode) => episode.context))],
        closed_coverage: coverage,
        usable_actual_occurrences: independentlySupportedOccurrences,
        unresolved_bindings: route.targets.filter((target) => ["open", "unresolved"].includes(target.state)).length,
        administrations: route.administrationCount,
        mapping_administrations: mappingCount,
        decisions: route.decisionCount,
        controls: route.missingness.length + input.controls.length,
        interpretive_quota: null,
        report_readiness: hasScopedEvidence ? "scoped_evidence_available" : "insufficient_answered_evidence",
      },
    },
    observations,
    episodes,
    steps,
    sequence_edges: sequenceEdges,
    target_resolutions: targetResolutions,
    // Router output is descriptive evidence only; findings and claims belong to report generation/review.
    structural_evidence_summaries: [],
    supported_alternatives: [],
    counterexamples: [],
    secure_capacity_examples: [],
    missingness,
    corrections,
    unresolved_bindings: unresolvedBindings,
    referent_scopes: [],
    context_comparisons: contextComparisons,
    reported_context_controls: [],
    interpretation_disputes: [],
    open_questions: openQuestions,
    // Encrypted snapshot lineage retains current responses; the PWRP adapter strips this journal from provider input.
    administration_provenance: administrationProvenance,
  };
  const packet = { ...packetWithoutDigest, content_sha256: sha256(canonicalize(packetWithoutDigest)) };
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(source.schemas.routerPacket);
  if (!validate(packet)) {
    const issues = (validate.errors ?? []).map((issue) => `${issue.instancePath || "$"} ${issue.message ?? "invalid"}`).join("; ");
    throw new Error(`PWQE 5.1 router packet failed its pinned schema: ${issues}`);
  }
  return packet;
}

/** Recomputes packet content digest without treating it as identity or authorization. */
export function verifyPwqe51PacketDigest(value: unknown): boolean {
  const packet = object(value);
  const { content_sha256: digest, ...content } = packet;
  return typeof digest === "string" && digest === sha256(canonicalize(content));
}
