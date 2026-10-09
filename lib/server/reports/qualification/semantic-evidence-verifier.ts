import type { Pwqe51SourcePackage } from "../../../question-engine/pwqe51-source.ts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record).filter((entry): entry is JsonRecord => !!entry) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function equalStringArrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizedPair(left: string, right: string): string {
  return [left, right].sort().join("\u0000");
}

function responseProvenanceLabel(origin: unknown): string | undefined {
  switch (origin) {
    case "original_authored_fictional_answer": return "original_authored_fictional_response";
    case "new_synthetic_mapping_answer": return "new_synthetic_mapping_response";
    case "new_synthetic_deepening_answer": return "new_synthetic_deepening_answer";
    case "new_fictional_control_outcome": return "new_fictional_control_outcome";
    default: return undefined;
  }
}

export interface SemanticEvidenceVerification {
  readonly profileId: string;
  readonly packetObservationCount: number;
  readonly currentResponseCount: number;
  readonly checkedTargets: number;
  readonly checkedSequenceEdges: number;
  readonly checkedDistinctnessDecisions: number;
  readonly failures: readonly string[];
  readonly status: "pass" | "fail";
}

/**
 * Contract-level verifier for a retained full-session replay. It uses the
 * authored source, canonical responses, packet references, and respondent
 * decisions; it does not use adapterAccepted or the manifest's summary flags.
 */
export function verifySemanticEvidencePacket(input: {
  readonly artifact: JsonRecord;
  readonly history: JsonRecord;
  readonly questionSource: Pwqe51SourcePackage;
  readonly requirePacketProvenance?: boolean;
}): SemanticEvidenceVerification {
  const { artifact, history, questionSource } = input;
  const profileId = typeof artifact.profileId === "string" ? artifact.profileId : "unknown";
  const failures: string[] = [];
  const state = record(record(artifact.replay)?.state) ?? {};
  const replay = record(artifact.replay) ?? {};
  const canonicalResponses = records(state.responses);
  const canonicalById = new Map(canonicalResponses.map((response) => [response.responseId, response]));
  const superseded = new Set([...strings(replay.supersededResponseIds), ...strings(state.routerResult && record(state.routerResult)?.supersededResponseIds)]);
  const invalidated = new Set([
    ...records(replay.invalidatedResponses).map((entry) => entry.responseId),
    ...records(state.routerResult && record(state.routerResult)?.invalidatedResponses).map((entry) => entry.responseId),
  ]);
  const activeIds = new Set(canonicalResponses.map((response) => response.responseId).filter((id): id is string => typeof id === "string" && !superseded.has(id) && !invalidated.has(id)));
  const listedCurrent = new Set(records(replay.currentResponses).map((response) => response.responseId).filter((id): id is string => typeof id === "string"));
  for (const id of activeIds) if (!listedCurrent.has(id)) failures.push(`current_response_list_missing:${id}`);
  for (const id of listedCurrent) if (!activeIds.has(id)) failures.push(`current_response_list_contains_stale:${id}`);

  const submitted = records(replay.submittedSourceToRuntimeResponses);
  const submittedByRuntimeId = new Map(submitted.map((row) => [row.runtimeResponseId, row]));
  const provenance = records(replay.completeResponseProvenance);
  const provenanceBySourceId = new Map(provenance.map((row) => [row.sourceResponseId, row]));
  const authoredSourceProvenance = records(history.responseProvenance);
  const authoredOriginBySourceId = new Map(authoredSourceProvenance.map((row) => [row.responseId, row.origin]));
  const responseObservations = new Map<string, JsonRecord[]>();
  const allObservations: JsonRecord[] = [];
  const packetRows = record(artifact.packets) ?? {};
  const packets = Object.entries(packetRows).flatMap(([packetType, value]) => {
    const packet = record(record(value)?.packet);
    return packet ? [{ packetType, packet }] : [];
  });
  for (const { packetType, packet } of packets) {
    const packetStale = new Set([...strings(packet.superseded_response_ids), ...strings(packet.invalidated_response_ids)]);
    for (const observation of records(packet.observations)) {
      allObservations.push(observation);
      const responseId = observation.response_id;
      if (typeof responseId !== "string") {
        failures.push(`${packetType}:observation_without_response_id:${String(observation.id)}`);
        continue;
      }
      responseObservations.set(responseId, [...(responseObservations.get(responseId) ?? []), observation]);
      const response = canonicalById.get(responseId);
      if (!response || !activeIds.has(responseId) || packetStale.has(responseId)) {
        failures.push(`${packetType}:observation_not_current:${responseId}`);
        continue;
      }
      const submittedRow = submittedByRuntimeId.get(responseId);
      if (!submittedRow) failures.push(`${packetType}:observation_missing_session_submission:${responseId}`);
      if (response.status !== "answered") failures.push(`${packetType}:claim_observation_from_non_answer:${responseId}`);
      if (observation.item_id !== response.questionId) failures.push(`${packetType}:question_mismatch:${responseId}`);
      const sourceQuestion = questionSource.questionBank.items.find((item) => item.id === response.questionId);
      const observationStepMatches = observation.step_id === response.stepId
        || (sourceQuestion?.selection.mode === "partial_order" && typeof observation.step_id === "string" && observation.step_id.startsWith(`${String(response.stepId)}/`));
      if (observation.occurrence_id !== response.occurrenceId || !observationStepMatches) failures.push(`${packetType}:lineage_mismatch:${responseId}`);
      const optionId = observation.option_id;
      const selectedOptionIds = strings(response.selectedOptionIds);
      if (typeof optionId !== "string" || !selectedOptionIds.includes(optionId)) failures.push(`${packetType}:observation_option_not_selected:${responseId}`);
      const question = questionSource.questionBank.items.find((item) => item.id === response.questionId);
      const variantId = typeof response.variantId === "string" ? response.variantId : undefined;
      const variant = variantId ? questionSource.questionBank.variants.find((entry) => entry.id === variantId && entry.replaces === response.questionId) : undefined;
      const optionSource = variant?.options ?? question?.options ?? [];
      if (!question || (variantId && !variant) || typeof optionId !== "string" || !optionSource.some((option) => option.id === optionId)) {
        failures.push(`${packetType}:observation_option_outside_pinned_source:${responseId}`);
      }
      if (typeof responseId === "string" && typeof submittedRow?.sourceResponseId === "string") {
        const sourceLine = provenanceBySourceId.get(submittedRow.sourceResponseId);
        if (!sourceLine || sourceLine.accepted !== true) failures.push(`${packetType}:source_provenance_missing_or_unaccepted:${responseId}`);
        const sourceOrigin = authoredOriginBySourceId.get(submittedRow.sourceResponseId) ?? sourceLine?.origin;
        const expectedProvenance = responseProvenanceLabel(sourceOrigin);
        if (expectedProvenance && submittedRow.provenance !== expectedProvenance) {
          failures.push(`${packetType}:submitted_provenance_does_not_match_source_origin:${responseId}`);
        }
        if (sourceLine && expectedProvenance && responseProvenanceLabel(sourceLine.origin) !== expectedProvenance) {
          failures.push(`${packetType}:runtime_provenance_does_not_match_authored_source_origin:${responseId}`);
        }
        const expectedSelectionReason = `source provenance: ${String(expectedProvenance ?? submittedRow.provenance)}; fictional qualification evidence, not real participant data`;
        if (input.requirePacketProvenance !== false && observation.selection_reason !== expectedSelectionReason) {
          failures.push(`${packetType}:response_provenance_not_visible_in_packet:${responseId}`);
        }
        if (submittedRow.phase === "mapping" && expectedProvenance === "new_synthetic_mapping_response"
          && (sourceLine?.origin !== "new_synthetic_mapping_answer" || authoredOriginBySourceId.get(submittedRow.sourceResponseId) !== "new_synthetic_mapping_answer")) {
          failures.push(`${packetType}:synthetic_mapping_origin_not_preserved:${responseId}`);
        }
      }
    }
  }

  const allObservationIds = new Set(allObservations.map((observation) => observation.id).filter((id): id is string => typeof id === "string"));
  let checkedTargets = 0;
  let checkedSequenceEdges = 0;
  const packetSteps = packets.flatMap(({ packetType, packet }) => records(packet.steps).map((step) => ({ packetType, step })));
  for (const { packetType, packet } of packets) {
    for (const target of records(packet.target_resolutions)) {
      checkedTargets += 1;
      for (const observationId of [...strings(target.source_observation_ids), ...strings(target.resolution_observation_ids)]) {
        if (!allObservationIds.has(observationId)) failures.push(`${packetType}:target_references_missing_observation:${String(target.id)}:${observationId}`);
      }
    }
    for (const edge of records(packet.sequence_edges)) {
      checkedSequenceEdges += 1;
      const occurrenceId = edge.occurrence_id;
      const fromStep = edge.from_step;
      const toStep = edge.to_step;
      const edgeObservations = strings(edge.evidence_ids).map((id) => allObservations.find((row) => row.id === id));
      if (typeof occurrenceId !== "string" || edgeObservations.length === 0 || edgeObservations.some((observation) => !observation
        || observation.occurrence_id !== occurrenceId)) failures.push(`${packetType}:sequence_edge_crosses_occurrence_or_lacks_evidence:${String(edge.id)}`);
      for (const observation of edgeObservations) {
        const evidenceResponseId = observation?.response_id;
        if (typeof evidenceResponseId !== "string" || !activeIds.has(evidenceResponseId)) failures.push(`${packetType}:sequence_edge_has_stale_response:${String(edge.id)}`);
        const response = typeof evidenceResponseId === "string" ? canonicalById.get(evidenceResponseId) : undefined;
        if (response?.mode === "order_unknown" && edge.relation !== "order_unknown") failures.push(`${packetType}:unknown_order_became_observed_sequence:${String(edge.id)}`);
      }
      const fromExists = packetSteps.some(({ step }) => step.occurrence_id === occurrenceId && step.step_id === fromStep);
      const toExists = packetSteps.some(({ step }) => step.occurrence_id === occurrenceId && step.step_id === toStep);
      if (!fromExists || !toExists) failures.push(`${packetType}:sequence_edge_step_not_in_same_occurrence:${String(edge.id)}`);
    }
  }

  const context = record(replay.contextDecisions) ?? {};
  const comparisonPairs = new Set(records(state.comparisonDecisions).map((decision) => {
    const first = decision.firstOccurrenceId;
    const second = decision.secondOccurrenceId;
    return typeof first === "string" && typeof second === "string" ? normalizedPair(first, second) : "";
  }).filter(Boolean));
  const statePairs = record(state.routerInput)?.distinctPairs;
  const declaredPairs = new Set((Array.isArray(statePairs) ? statePairs : []).map((pair) => Array.isArray(pair) && pair.length === 2
    && pair.every((value) => typeof value === "string") ? normalizedPair(pair[0] as string, pair[1] as string) : "").filter(Boolean));
  const declaredControls = record(artifact.declaredFictionalDecisions) ?? {};
  const explicitSourceDistinctness = records(declaredControls.distinctnessIntents);
  const replayDecisions = records(replay.replayAndDistinctnessDecisions);
  let checkedDistinctnessDecisions = 0;
  for (const decision of records(context.distinctness)) {
    if (decision.status !== "applied") continue;
    checkedDistinctnessDecisions += 1;
    const first = decision.sourceOccurrenceId;
    const second = decision.otherOccurrenceId;
    if (typeof first !== "string" || typeof second !== "string" || first === second) {
      failures.push(`distinctness_applied_without_two_bound_occurrences:${String(decision.sourceReference)}`);
      continue;
    }
    if (decision.basis === "router_replay_binding") {
      const explicit = replayDecisions.some((row) => row.outcome === "different" && row.sourceOccurrenceId === first && row.replayOccurrenceId === second);
      if (!explicit) failures.push(`distinctness_lacks_explicit_replay_decision:${first}:${second}`);
    } else if (decision.basis === "pass_two_context") {
      const sourceIntent = explicitSourceDistinctness.find((intent) => intent.sourceOccurrenceId === decision.sourceReference
        && intent.otherOccurrenceId === decision.otherReference && intent.outcome === "different" && intent.requiresTrustedSimulatedConfirmation === true);
      if ((!declaredPairs.has(normalizedPair(first, second)) && !comparisonPairs.has(normalizedPair(first, second))) || !sourceIntent) {
        failures.push(`distinctness_lacks_confirmed_pair_control:${first}:${second}`);
      }
    } else if (decision.basis === "router_explicit_different_event_prompt") {
      const explicitD42 = submitted.some((row) => row.questionId === "D42" && row.occurrenceId === second && row.status === "answered" && row.basis === "actual_recalled")
        && questionSource.questionBank.items.find((item) => item.id === "D42")?.prompt.includes("different time") === true;
      if (!explicitD42) failures.push(`distinctness_lacks_explicit_different-event-response:${first}:${second}`);
    } else {
      failures.push(`distinctness_applied_without_respondent_decision_basis:${String(decision.basis)}`);
    }
  }

  const withheld = records(history.withheldAuthoredAnswers);
  for (const answer of withheld) {
    const itemId = answer.questionId;
    const options = strings(answer.selectedOptionIds);
    for (const observation of allObservations) {
      if (observation.item_id === itemId && typeof observation.option_id === "string" && options.includes(observation.option_id)) {
        failures.push(`withheld_negative_control_became_packet_evidence:${profileId}:${String(itemId)}:${observation.option_id}`);
      }
    }
  }

  const forbiddenKey = /^(private_?notes?|email|phone|full_name|legal_name|date_of_birth|raw_identity|address|ssn)$/iu;
  const inspectPrivateFields = (value: unknown, prefix: string): void => {
    const row = record(value);
    if (row) {
      for (const [key, child] of Object.entries(row)) {
        if (forbiddenKey.test(key) && child !== null && child !== undefined && child !== "") failures.push(`unauthorized_identity_or_private_field:${prefix}.${key}`);
        if (key === "person_id" && child !== null && child !== undefined) failures.push(`unauthorized_identity_or_private_field:${prefix}.${key}`);
        inspectPrivateFields(child, `${prefix}.${key}`);
      }
    } else if (Array.isArray(value)) value.forEach((child, index) => inspectPrivateFields(child, `${prefix}[${index}]`));
  };
  for (const { packetType, packet } of packets) inspectPrivateFields(packet, packetType);

  return {
    profileId,
    packetObservationCount: allObservations.length,
    currentResponseCount: activeIds.size,
    checkedTargets,
    checkedSequenceEdges,
    checkedDistinctnessDecisions,
    failures,
    status: failures.length ? "fail" : "pass",
  };
}

export function verifyAuthoredResponsePacketBinding(input: {
  readonly history: JsonRecord;
  readonly artifact: JsonRecord;
}): readonly string[] {
  const failures: string[] = [];
  const replay = record(input.artifact.replay) ?? {};
  const occurrenceMap = record(replay.occurrenceReferenceToServerId) ?? {};
  const submitted = records(replay.submittedSourceToRuntimeResponses);
  const allSourceAnswers = [...records(input.history.mappingResponses), ...records(input.history.deepeningResponses)];
  const bySourceId = new Map(allSourceAnswers.map((answer) => [answer.responseId, answer]));
  const observationRows = Object.values(record(input.artifact.packets) ?? {}).flatMap((value) => records(record(value)?.packet && record(record(value)?.packet)?.observations));
  for (const row of submitted) {
    const sourceId = row.sourceResponseId;
    if (typeof sourceId !== "string") continue;
    const source = bySourceId.get(sourceId);
    if (!source) continue; // Newly synthetic control and Deepening answers have their own provenance records.
    const runtimeId = row.runtimeResponseId;
    if (typeof runtimeId !== "string") continue;
    const isMappingOrDeepeningPacket = observationRows.some((observation) => observation.response_id === runtimeId);
    if (!isMappingOrDeepeningPacket) continue;
    const sourceOccurrenceId = typeof source.occurrenceId === "string" ? occurrenceMap[source.occurrenceId] : undefined;
    if (row.questionId !== source.questionId || row.stepId !== source.stepId
      || row.occurrenceId !== sourceOccurrenceId
      || !equalStringArrays(strings(row.selectedOptionIds), strings(source.selectedOptionIds))) {
      failures.push(`authored_response_changed_during_replay:${sourceId}`);
    }
  }
  return failures;
}
