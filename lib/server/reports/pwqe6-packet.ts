import Ajv2020 from "ajv/dist/2020.js";
import { sha256 } from "../security/crypto.ts";
import type { Pwqe5SourcePackage } from "../../question-engine/pwqe5-source.ts";
import type { Pwqe5SessionState } from "../assessment/pwqe5-session.ts";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

function schemaValidator(source: Pwqe5SourcePackage) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile(source.schemas.routerPacket);
}

/** Builds the immutable v6 evidence packet from the encrypted session's canonical answer log. */
export function buildPwqe6RouterPacket(input: {
  readonly snapshotId: string;
  readonly state: Pwqe5SessionState;
  readonly source: Pwqe5SourcePackage;
}): Record<string, unknown> {
  const { snapshotId, state, source } = input;
  const route = state.routerResult;
  const questions = new Map(source.questionBank.items.map((question) => [question.id, question]));
  const responseById = new Map(state.responses.map((response) => [response.responseId, response]));
  const episodeById = new Map(route.episodes.map((episode) => [episode.id, episode]));
  const itemStage = (questionId: string) => questions.get(questionId)?.stage ?? "deepening";
  const findOption = (responseId: string, optionId: string) => {
    const response = responseById.get(responseId);
    const question = response ? questions.get(response.questionId) : undefined;
    const variant = response?.variantId ? source.questionBank.variants.find((item) => item.id === response.variantId) : undefined;
    return variant && variant.replaces === response?.questionId
      ? variant.options.find((option) => option.id === optionId)
      : question?.options.find((option) => option.id === optionId);
  };

  const observations = route.observations.map((observation) => {
    const response = responseById.get(observation.responseId);
    const question = response ? questions.get(response.questionId) : undefined;
    const option = findOption(observation.responseId, observation.optionId);
    if (!response || !question || !option) throw new Error(`PWQE 6 packet cannot resolve observation ${observation.id} to its authored source.`);
    const episode = episodeById.get(response.occurrenceId);
    return {
      id: observation.id,
      response_id: response.responseId,
      administration_id: response.responseId,
      item_id: question.id,
      option_id: option.id,
      variant: response.variantId ?? "base",
      text: option.text,
      displayed_text: option.text,
      reported_value: option.reported_value,
      capture: observation.capture,
      occurrence_id: response.occurrenceId,
      step_id: response.stepId ?? "first",
      basis: episode?.status ?? "actual_recalled",
      mode: response.mode ?? "single",
      dependence_group: response.occurrenceId,
      selection_reason: "respondent-selected authored option",
      source_version: question.version,
      person_id: null,
      signals: option.candidate_signals,
    };
  });

  const episodes = route.episodes.map((episode) => {
    const root = state.responses.find((response) => response.occurrenceId === episode.id);
    const question = root ? questions.get(root.questionId) : undefined;
    return {
      id: episode.id,
      family: episode.family,
      context: episode.context,
      root_item_id: question?.id ?? "unknown",
      basis: episode.status,
      status: episode.status,
      recall_window: "Per-question respondent recall; the source release defines no fixed lookback window.",
      person_id: null,
      role: null,
      topic: null,
      linked_from: null,
      distinct_from: [],
      outside_window: false,
    };
  });

  const steps = route.steps.map((step) => {
    const response = step.responseIds.map((id) => responseById.get(id)).find(Boolean);
    return {
      id: step.id,
      occurrence_id: step.occurrenceId,
      step_id: response?.stepId ?? step.captures[0] ?? "first",
      observation_ids: step.observationIds,
    };
  });

  const sequenceEdges = route.sequenceEdges.map((edge) => ({
    id: edge.id,
    occurrence_id: edge.occurrenceId,
    from_step: edge.fromStep,
    to_step: edge.toStep,
    meaning: edge.firstNotHelping ? "The earlier response was reported as no longer helping." : "Respondent-reported sequence relation.",
    relation: edge.relation,
    evidence_ids: [edge.responseId],
    first_not_helping: edge.firstNotHelping,
  }));

  const targetResolutions = route.targets.map((target) => {
    const authoredTarget = source.routingTargets.targets.find((item) => item.id === target.targetId);
    const attempts = state.responses.filter((response) => response.occurrenceId === target.occurrenceId && authoredTarget?.candidate_items.includes(response.questionId)).length;
    return {
      id: target.id,
      target_id: target.targetId,
      occurrence_id: target.occurrenceId,
      step_id: "first",
      reason: target.reason,
      state: target.state,
      comparison_ids: [],
      source_ids: target.sourceResponseIds,
      resolution_ids: target.resolutionResponseIds,
      attempts,
    };
  });

  const responseSteps = new Map(state.responses.map((response) => [response.responseId, response.stepId ?? "first"]));
  const structuralSummaries = route.findings.map((finding, index) => ({
    id: `${finding.code}:${index + 1}`,
    code: finding.code,
    scope: finding.scope,
    status: "structural_support_requires_report_semantic_review",
    occurrence_ids: finding.occurrenceIds,
    step_ids: [...new Set(finding.responseIds.map((id) => responseSteps.get(id)).filter((step): step is string => Boolean(step)))],
    evidence_ids: route.observations.filter((observation) => finding.responseIds.includes(observation.responseId)).map((observation) => observation.id),
    counterevidence_ids: [],
    missing: [],
  }));

  const missingness = route.missingness.map((missing) => ({
    administration_id: missing.responseId,
    response_id: missing.responseId,
    item_id: missing.questionId,
    occurrence_id: missing.occurrenceId,
    status: missing.status,
    reason: missing.status,
  }));
  const corrections = state.responses.filter((response) => response.supersedesResponseId).map((response) => ({
    administration_id: response.responseId,
    old_response_id: response.supersedesResponseId,
    new_response_id: response.responseId,
    kind: "response_correction",
    occurrence_id: response.occurrenceId,
    aspect: "canonical answer",
    target_id: response.questionId,
    control_id: "response-correction",
    reason: "A later canonical response supersedes the prior response; derived evidence is replayed from the active log.",
    destination_occurrence_id: response.occurrenceId,
    seq: state.responses.indexOf(response) + 1,
  }));
  const unresolvedBindings = route.invalidatedResponses.map((invalidated) => ({
    administration_id: invalidated.responseId,
    response_id: invalidated.responseId,
    reason: invalidated.reason,
  }));
  // This field is reserved by the pinned schema for three authored boolean
  // context facts. Response missingness and assessment controls have their own
  // canonical packet fields and must not be coerced into those facts.
  const reportedControls: unknown[] = [];
  const openQuestions = route.targets.filter((target) => target.state === "open" || target.state === "unresolved" || target.state === "unavailable" || target.state === "declined").map((target) => ({
    target_instance: target.id,
    target_id: target.targetId,
    state: target.state,
    reason: target.reason,
  }));
  const usableEpisodes = route.episodes.filter((episode) => episode.status === "actual_recalled");
  const mappingCount = state.responses.filter((response) => itemStage(response.questionId) === "mapping").length;
  const targetCoverage = Object.fromEntries(route.targets.map((target) => [target.targetId, target.state]));
  const hasScopedEvidence = observations.length > 0 && usableEpisodes.length > 0;

  const packetWithoutDigest: Record<string, unknown> = {
    format: "patternwork-router-evidence-v1",
    release_id: state.sourceRelease,
    snapshot_id: snapshotId,
    packet_id: `pwp6_${snapshotId}`,
    source_binding: {
      question_release: state.sourceRelease,
      runtime_version: source.manifest.routerVersion,
      source_sha256: source.manifest.sourceSha256,
    },
    superseded_response_ids: route.supersededResponseIds,
    invalidated_response_ids: route.invalidatedResponses.map((entry) => entry.responseId),
    assessment_scope: {
      recall_window: "Per-question respondent recall; no fixed lookback window is defined by this source release.",
      report_language: "en",
      phase: state.pass === 1 ? "mapping" : "deepening",
      interpretation_authority: "Respondent selections and deterministic structural derivation; no diagnostic or physiological measurement authority.",
      evidence_basis: "Versioned authored options bound to respondent-recalled occurrences and server-derived routing state.",
      completion_reason: route.completionReason ?? null,
      readiness: {
        mapping_coverage_complete: state.pass === 1 && route.completionReason === "mapping_coverage_complete",
        normal_mapping_ready: hasScopedEvidence,
        applicable_pending_items: route.candidates.map((candidate) => candidate.questionId),
        offered_mapping_items: [...new Set(state.responses.filter((response) => itemStage(response.questionId) === "mapping").map((response) => response.questionId))],
        actual_occurrence_ids: usableEpisodes.map((episode) => episode.id),
        sampled_contexts: [...new Set(usableEpisodes.map((episode) => episode.context))],
        closed_coverage: targetCoverage,
        usable_actual_occurrences: usableEpisodes.length,
        unresolved_bindings: route.targets.filter((target) => ["open", "unresolved"].includes(target.state)).length,
        administrations: route.administrationCount,
        mapping_administrations: mappingCount,
        decisions: route.decisionCount,
        controls: route.missingness.length + state.controls.length,
        interpretive_quota: null,
        report_readiness: hasScopedEvidence ? "scoped_evidence_available" : "insufficient_answered_evidence",
      },
    },
    observations,
    episodes,
    steps,
    sequence_edges: sequenceEdges,
    target_resolutions: targetResolutions,
    structural_evidence_summaries: structuralSummaries,
    supported_alternatives: [],
    counterexamples: [],
    secure_capacity_examples: [],
    missingness,
    corrections,
    unresolved_bindings: unresolvedBindings,
    referent_scopes: [],
    context_comparisons: [],
    reported_context_controls: reportedControls,
    interpretation_disputes: [],
    open_questions: openQuestions,
    administration_provenance: state.responses.map((response) => {
      const question = questions.get(response.questionId);
      return {
        id: response.responseId,
        item_id: response.questionId,
        variant: response.variantId ?? "base",
        occurrence_id: response.occurrenceId,
        phase: question?.stage ?? state.phase,
        selection_reason: `Adaptive selection recorded by the server-side PWQE 5 router.${state.controls.includes("shorten") ? " Respondent requested a shorter Deepening pass; lower-priority candidates were suppressed." : ""}`,
        option_order: response.selectedOptionIds ?? [],
        live_response_id: response.responseId,
      };
    }),
  };
  const packet = {
    ...packetWithoutDigest,
    content_sha256: sha256(canonicalize(packetWithoutDigest)),
  };
  const validate = schemaValidator(source);
  if (!validate(packet)) {
    const issues = (validate.errors ?? []).map((issue) => `${issue.instancePath || "$"} ${issue.message ?? "invalid"}`).join("; ");
    throw new Error(`PWQE 6 router packet failed its pinned schema: ${issues}`);
  }
  return packet;
}
