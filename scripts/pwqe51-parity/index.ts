import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePwqe51Route, type Pwqe51CanonicalResponse, type Pwqe51RouterInput } from "../../lib/server/assessment/pwqe51-router.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { isReplayOperatorItem } from "./classification.ts";

async function main(): Promise<void> {
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const json = async (file: string) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const runCollector = (args: readonly string[] = []) => {
  const result = spawnSync(process.env.PYTHON ?? "python", ["-B", path.join(here, "collect.py"), ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  if (result.status !== 0) throw new Error(`Python replay collector (${args.join(" ") || "original cohort"}) failed (${result.status}): ${(result.stderr || result.stdout).slice(-3000)}`);
  return JSON.parse(result.stdout) as { plans: any[]; legacy_profile_ids: string[]; coverage_ids: string[]; config_policy?: any };
};
const independent = runCollector();
// Keep the published 25-plan corpus intact. This second run is an independently
// collected cohort with only the C04 body_detail permission removed.
const withoutBodyDetail = runCollector(["--without-body-detail"]);
const [worked, coverage, source, parityExceptions, referenceExtensions] = await Promise.all([
  json("specs/patternwork/question-engine-v5/examples/worked_paths.json"),
  json("specs/patternwork/question-engine-v5.1/qualification/coverage/FICTIONAL_PLANS.json"),
  loadPwqe51SourcePackage(root),
  json("scripts/pwqe51-parity/EXCEPTIONS.json"),
  json("scripts/pwqe51-parity/REFERENCE_EXTENSIONS.json"),
]);
const entryPointIds = new Set(source.routingTargets.entry_points.map((entry: any) => String(entry.id)));
const exceptionByKey = new Map<string, string>();
for (const exception of parityExceptions.exceptions ?? []) {
  for (const key of exception.keys ?? []) {
    const [planId, targetId] = String(key).split("|", 3);
    const entryId = targetId?.startsWith("entry:") ? targetId.slice("entry:".length) : "";
    if (exception.mismatch !== "target_state_mismatch" || !entryPointIds.has(entryId)) {
      throw new Error(`Parity exception ${exception.id} is outside its independently justified entry-point scope: ${key}`);
    }
    exceptionByKey.set(`${planId}|${key.split("|").slice(1).join("|")}`, String(exception.id));
  }
}
const pyById = new Map(independent.plans.map((p) => [p.id, p]));
function routeReplay(replay: any, selectionStep?: any, postResponse = false): ReturnType<typeof compilePwqe51Route> {
  const config = replay?.config ?? {};
  const pairs = (postResponse ? selectionStep?.post_distinct_pairs : selectionStep?.pre_distinct_pairs) ?? (replay?.episodes ?? []).flatMap((episode: any) =>
    (episode.distinct_from ?? []).map((prior: string) => [prior, episode.id]));
  const pairMap = new Map<string, [string, string]>();
  for (const pairValue of pairs) {
    const pair = [...pairValue].sort() as [string, string];
    pairMap.set(pair.join("\u0000"), pair);
  }
  const distinctPairs = [...pairMap.values()];
  const allResponses = replay?.canonical_responses ?? [];
  const responseLimit = postResponse
    ? selectionStep?.post_response_count ?? allResponses.length
    : selectionStep?.pre_response_count ?? allResponses.length;
  const prefixResponses = allResponses.slice(0, responseLimit);
  const responses = prefixResponses.map(({ comparisonIds: _comparisonIds, ...response }: any) => response);
  const prefixResponseIds = new Set(prefixResponses.map((response: any) => response.responseId));
  const comparisonIdsByResponseId = Object.fromEntries(Object.entries(replay?.comparison_ids_by_response_id ?? {})
    .filter(([responseId]) => prefixResponseIds.has(responseId))) as NonNullable<Pwqe51RouterInput["comparisonIdsByResponseId"]>;
  const focusOccurrences = (postResponse ? selectionStep?.post_focus_occurrences : selectionStep?.pre_focus_occurrences) ?? replay?.focus_occurrences ?? [];
  const contextFactCount = postResponse ? selectionStep?.post_context_fact_count : selectionStep?.pre_context_fact_count;
  const contextFacts = selectionStep
    ? (replay?.context_facts ?? []).slice(0, contextFactCount ?? (postResponse ? replay?.context_facts?.length : 0))
    : replay?.context_facts ?? [];
  const phase = selectionStep?.phase === "mapping" ? "mapping" : "deepening";
  const input: Pwqe51RouterInput = {
    phase, responses, comparisonIdsByResponseId,
    // Both fields authorize an entry in the Python source. Keep focus_topics
    // separately as focus; topics alone is permission, not extra priority.
    optedInTopics: [...new Set([...(config.topics ?? []), ...(config.focus_topics ?? [])])], details: config.details ?? [],
    focusTopics: [...new Set<string>((config.focus_topics ?? []) as string[])],
    occurrenceBindings: (postResponse ? selectionStep?.post_occurrence_bindings : selectionStep?.pre_occurrence_bindings) ?? {},
    focusOccurrences, contextFacts,
    requestedTargetIds: selectionStep?.pre_requested_target_ids ?? [],
    distinctPairs,
    episodeLinks: (postResponse ? selectionStep?.post_episode_links : selectionStep?.pre_episode_links) ?? replay?.episode_links ?? [],
    closedBindings: (postResponse ? selectionStep?.post_closed_bindings : selectionStep?.pre_closed_bindings) ?? replay?.closed_bindings ?? {},
    // Replay collector currently records only final rejected targets, not the
    // prefix state. Never leak those future rejections into a prefix route.
    rejectedTargetIds: selectionStep ? [] : replay?.rejected_target_ids ?? [],
  };
  return compilePwqe51Route(input, source);
}

function comparePostTargetStates(replay: any, step: any, before: ReturnType<typeof compilePwqe51Route>): any {
  if (!Array.isArray(step?.post_target_states)) return { status: "missing_collector_field", comparable_targets: 0 };
  const pythonRows = (step.post_target_changes ?? []) as any[];
  const pythonStateRows = step.post_target_states as any[];
  const entryRows = pythonStateRows.filter((row) => String(row.target_id ?? "").startsWith("entry:"));
  const key = (target: any) => {
    const pair = target.comparison_ids ?? target.comparisonIds ?? [];
    return `${target.target_id ?? target.targetId}|${target.occurrence_id ?? target.occurrenceId}|${target.step_id ?? target.stepId}|${[...pair].sort().join("|")}`;
  };
  if (step.form_action !== "ask" || !Number.isInteger(step.post_response_count) ||
      step.post_response_count !== (step.pre_response_count ?? 0) + 1) {
    return { status: pythonRows?.length ? "unsupported_without_accepted_response_prefix" : "no_target_change", comparable_targets: 0 };
  }
  const after = routeReplay(replay, step, true);
  const beforeTargets = new Map(before.targets.filter((target) => !target.targetId.startsWith("entry:"))
    .map((target) => [key(target), target]));
  const afterTargetRows = new Map(after.targets.filter((target) => !target.targetId.startsWith("entry:"))
    .map((target) => [key(target), target]));
  const afterTargets = new Map([...afterTargetRows].map(([targetKey, target]) => [targetKey, target.state]));
  const pythonTargets = new Map(pythonStateRows.filter((target) => !String(target.target_id ?? "").startsWith("entry:"))
    .map((target) => [key(target), target.state]));
  const pythonSet = new Set([...pythonTargets].map(([targetKey, state]) => `${targetKey}|${state}`));
  const typescriptSet = new Set([...afterTargets].map(([targetKey, state]) => `${targetKey}|${state}`));
  const missingFromTypeScript = [...pythonSet].filter((change) => !typescriptSet.has(change)).sort();
  const extraInTypeScript = [...typescriptSet].filter((change) => !pythonSet.has(change)).sort();
  const typescriptTargetChanges = [...new Set([...beforeTargets.keys(), ...afterTargetRows.keys()])].sort().flatMap((targetKey) => {
    const prior = beforeTargets.get(targetKey);
    const next = afterTargetRows.get(targetKey);
    if (prior?.state === next?.state) return [];
    const row = next ?? prior!;
    return [{
      target_id: row.targetId, occurrence_id: row.occurrenceId, step_id: row.stepId,
      from: prior?.state ?? null, to: next?.state ?? null,
      reason: next?.reason ?? prior?.reason ?? null,
      source_observation_ids: [...(next?.sourceObservationIds ?? prior?.sourceObservationIds ?? [])].sort(),
      resolution_observation_ids: [...(next?.resolutionObservationIds ?? [])].sort(),
    }];
  });
  return {
    status: "post-response target-state snapshot comparison; Python entry pseudo-targets excluded",
    python_change_count: pythonSet.size, typescript_change_count: typescriptSet.size,
    python_target_changes: pythonRows.filter((row) => !String(row.target_id ?? "").startsWith("entry:")),
    typescript_target_changes: typescriptTargetChanges,
    missing_from_typescript: missingFromTypeScript, extra_in_typescript: extraInTypeScript,
    entry_point_rows_excluded_as_ontology_mismatch: entryRows.length,
    python_invalidated_rows_unsupported: 0,
    typescript_removed_targets_unsupported: 0,
    mismatched: missingFromTypeScript.length > 0 || extraInTypeScript.length > 0,
  };
}

function hasAnsweredOccurrence(replay: any, step: any, occurrenceId: string | null): boolean {
  if (!occurrenceId) return false;
  const prefixCount = step?.pre_response_count ?? replay?.canonical_responses?.length ?? 0;
  return (replay?.canonical_responses ?? []).slice(0, prefixCount)
    .some((response: any) => response.occurrenceId === occurrenceId && (response.status ?? "answered") === "answered");
}

function groupRouteCandidates(candidates: any[], replay: any, step: any): Map<string, any> {
  const grouped = new Map<string, any>();
  for (const candidate of candidates) {
    const occurrence = candidate.occurrence && hasAnsweredOccurrence(replay, step, candidate.occurrence)
      ? candidate.occurrence : null;
    const stepId = candidate.step ?? "first";
    const key = `${candidate.item}|${occurrence ?? ""}|${stepId}`;
    const prior = grouped.get(key) ?? {
      key, item: candidate.item, occurrence, step: stepId,
      targetIds: new Set<string>(), bindingControlNeeded: false, bindingRequest: undefined,
      priority: Number.isFinite(candidate.priority) ? Number(candidate.priority) : undefined,
    };
    if (Number.isFinite(candidate.priority)) prior.priority = prior.priority === undefined
      ? Number(candidate.priority) : Math.min(prior.priority, Number(candidate.priority));
    for (const targetId of candidate.targetIds ?? []) prior.targetIds.add(targetId);
    prior.bindingControlNeeded ||= Boolean(candidate.bindingControlNeeded);
    if (candidate.bindingRequest) prior.bindingRequest = candidate.bindingRequest;
    grouped.set(key, prior);
  }
  for (const candidate of grouped.values()) candidate.targetIds = [...candidate.targetIds].sort();
  return grouped;
}

function compareSelectionSteps(replay: any): any {
  const steps = replay?.selection_steps ?? [];
  let firstDivergence: any = null;
  let comparedAsks = 0;
  let candidatePresenceMismatchSteps = 0;
  let candidateEligibilityMismatchSteps = 0;
  let candidateTargetMismatchSteps = 0;
  let chosenQuestionMismatchSteps = 0;
  let chosenOccurrenceMismatchSteps = 0;
  let chosenReplayStepsUnsupported = 0;
  let choiceMismatchSteps = 0;
  let occurrenceBindingMismatchSteps = 0;
  let firstOccurrenceBindingDifference: any = null;
  let firstCandidateTargetMismatch: any = null;
  let firstChoiceDivergence: any = null;
  let pythonMappingReady = 0;
  let pythonRejectionReasonSteps = 0;
  let pythonRejectedRowsWithoutTypeScriptReason = 0;
  let typeScriptRejectedRowsWithoutPythonReason = 0;
  let comparableRejectedRows = 0;
  let rejectionReasonMismatches = 0;
  let pythonReplayRejectionRowsUnsupported = 0;
  let typeScriptReplayRejectionRowsUnsupported = 0;
  const rejectionReasonMismatchRecords: any[] = [];
  let replayCandidateRows = 0;
  const unsupportedReplayCandidateKeys = new Set<string>();
  let postTargetTransitionSteps = 0;
  let postTargetTransitionMismatchSteps = 0;
  let missingPostTargetTransitionSteps = 0;
  let unsupportedPostTargetTransitionSteps = 0;
  let postTargetEntryRowsUnsupported = 0;
  let postTargetInvalidatedRowsUnsupported = 0;
  let postTargetRemovedTargetsUnsupported = 0;
  let firstPostTargetTransitionDifference: any = null;
  let candidatePriorityMismatchSteps = 0;
  let firstCandidatePriorityDifference: any = null;
  let pythonBindingControlSteps = 0;
  let pythonCompletionStepsNotComparable = 0;
  let routeTrajectoryDiverged = false;
  let firstTrajectoryDivergenceReason: string | null = null;
  let sharedRouteCandidatePresenceMismatchSteps = 0;
  let sharedRouteCandidateEligibilityMismatchSteps = 0;
  let sharedRouteCandidateTargetMismatchSteps = 0;
  let sharedRouteCandidatePriorityMismatchSteps = 0;
  let sharedRouteChoiceMismatchSteps = 0;
  let sharedRoutePostTargetTransitionMismatchSteps = 0;
  let conditionalRouteSelectionMismatchSteps = 0;
  let sharedRouteSelectionMismatchSteps = 0;
  let unsupportedEntryPointCandidateRows = 0;
  let sharedRouteUnsupportedEntryPointCandidateRows = 0;
  let unsupportedEntryPointChoiceSteps = 0;
  let unsupportedEntryPointFinishSteps = 0;
  let sharedRouteFinishedDecisionMismatchSteps = 0;
  let unsupportedFinishSteps = 0;
  const sharedRouteSelectionMismatchOrdinals = new Set<number>();
  const sharedRouteTargetTransitionMismatchOrdinals = new Set<number>();
  let firstTrajectoryDivergenceOrdinal: number | null = null;
  const selectionMismatchOrdinals = new Set<number>();
  const choiceMismatchOrdinals = new Set<number>();
  const targetTransitionMismatchOrdinals = new Set<number>();
  const routeSelectionDecisions: any[] = [];
  const mappingReadyCoverage: any[] = [];
  steps.forEach((step: any) => {
    const decision = step.decision ?? {};
    const pythonCandidates = (decision.candidates ?? []).map((candidate: any, index: number) => ({
      candidate_order: candidate.selector_rank ?? index + 1,
      selector_key: candidate.selector_key ?? null,
      item: candidate.item_id, occurrence: candidate.occurrence_id ?? null,
      step: candidate.step_id ?? "first", selected: Boolean(candidate.selected),
      bindingControlNeeded: Boolean(candidate.binding_control_needed),
      priority: candidate.priority,
      eligibility: "returned by the reference compiler as an eligible candidate",
      focus: Boolean(candidate.focus), new_requirements: candidate.new_requirements ?? null,
      decisions: candidate.decisions ?? null, context: candidate.context ?? null,
      opened_order: candidate.opened_order ?? null, short_block: Boolean(candidate.short_block),
      derived_flags: [...(candidate.derived_flags ?? [])].sort(),
      targetIds: [...(candidate.target_ids ?? [])].sort(),
      replay: Boolean(candidate.replay),
    }));
    replayCandidateRows += pythonCandidates.filter((candidate: any) => candidate.replay).length;
    const actionable = step.form_action === "ask";
    if (step.form_action === "mapping_ready") pythonMappingReady++;
    if (!actionable) {
      if (step.form_action === "bind") {
        pythonBindingControlSteps++;
        const route = routeReplay(replay, step);
        return {
          ordinal: step.ordinal, phase: step.phase, python_action: "bind",
          python_binding_item: decision.item_id ?? step.form_item_id ?? null,
          python_binding_target: decision.target_instance ?? null,
          python_binding_requires_distinctness: Boolean(step.binding_needs_distinctness),
          python_binding_outcome: step.binding_outcome ?? null,
          typescript_candidate: route.next ? {
            item: route.next.questionId, occurrence: route.next.occurrenceId,
            target_ids: [...route.next.targetIds], binding_request: route.next.bindingRequest ?? null,
          } : null,
          trajectory_status: routeTrajectoryDiverged ? "conditional_reference_prefix_after_route_divergence" : "shared_route_prefix_control_step",
          route_comparison_status: "control_step_not_directly_compared; continue comparing the next question on its canonical prefix",
          action_parity: "unsupported: TypeScript compile selector has no explicit bind/identity/distinctness control action",
          typescript_phase: route.phase,
        };
      }
      if (step.form_action === "mapping_ready" || step.form_action === "finished") pythonCompletionStepsNotComparable++;
      if (Array.isArray(step.post_target_changes)) unsupportedPostTargetTransitionSteps++;
      const mappingReadyRoute = step.form_action === "mapping_ready" || step.form_action === "finished" ? routeReplay(replay, step) : null;
      if (step.form_action === "mapping_ready") mappingReadyCoverage.push({
        ordinal: step.ordinal, python_reason: step.form_reason ?? decision.reason ?? null,
        typescript_phase: mappingReadyRoute?.phase ?? null,
        typescript_completion_reason: mappingReadyRoute?.completionReason ?? null,
        typescript_candidate_items: mappingReadyRoute ? [...new Set(mappingReadyRoute.candidates.map((candidate) => candidate.questionId))].sort() : [],
        action_parity: "unavailable: TypeScript compile API has no mapping_ready action",
      });
      if (step.form_action === "finished") {
        const hasUnsupportedEntryPointNext = Boolean(mappingReadyRoute?.next?.targetIds.some((targetId) =>
          targetId.startsWith("entry:") && entryPointIds.has(targetId.slice("entry:".length)))
          && !pythonCandidates.some((candidate: any) => candidate.targetIds.some((targetId: string) =>
            targetId.startsWith("entry:") && mappingReadyRoute?.next?.targetIds.includes(targetId))));
        const directlyComparableFinish = step.form_reason === "no_eligible_material_target"
          || step.form_reason === "remaining_targets_only_low_incremental_value";
        const finishMatches = directlyComparableFinish && !hasUnsupportedEntryPointNext && mappingReadyRoute?.phase === "finished";
        const finishMismatch = directlyComparableFinish && !hasUnsupportedEntryPointNext && mappingReadyRoute?.phase !== "finished";
        const sharedAtFinish = !routeTrajectoryDiverged;
        if (hasUnsupportedEntryPointNext || !sharedAtFinish || !directlyComparableFinish) unsupportedFinishSteps++;
        if (hasUnsupportedEntryPointNext) {
          unsupportedEntryPointFinishSteps++;
          if (sharedAtFinish) sharedRouteUnsupportedEntryPointCandidateRows++;
        }
        if (finishMismatch && sharedAtFinish) {
          sharedRouteFinishedDecisionMismatchSteps++;
          sharedRouteSelectionMismatchOrdinals.add(step.ordinal);
          sharedRouteSelectionMismatchSteps++;
          if (firstTrajectoryDivergenceOrdinal === null) {
            firstTrajectoryDivergenceOrdinal = step.ordinal;
            firstTrajectoryDivergenceReason = "python_stopped_while_typescript_has_an_eligible_question";
          }
        }
        routeSelectionDecisions.push({
          ordinal: step.ordinal, phase: step.phase,
          trajectory_status: sharedAtFinish ? "shared_route_prefix" : "conditional_reference_prefix_after_route_divergence",
          route_comparison_status: !directlyComparableFinish ? "unsupported_python_finish_policy"
            : finishMatches ? "terminal_completion_matched" : "terminal_completion_mismatch",
          python: { action: "finished", reason: step.form_reason ?? null },
          typescript: { action: mappingReadyRoute?.phase ?? null, completion_reason: mappingReadyRoute?.completionReason ?? null,
            next: mappingReadyRoute?.next ? { item: mappingReadyRoute.next.questionId, occurrence: mappingReadyRoute.next.occurrenceId,
              step: mappingReadyRoute.next.stepId, target_ids: [...mappingReadyRoute.next.targetIds] } : null },
          unsupported_python_entry_point_next: hasUnsupportedEntryPointNext,
        });
        if (hasUnsupportedEntryPointNext && sharedAtFinish && firstTrajectoryDivergenceOrdinal === null) {
          firstTrajectoryDivergenceOrdinal = step.ordinal;
          firstTrajectoryDivergenceReason = "python_finish_vs_typescript_entry_point_without_independent_python_route";
          routeTrajectoryDiverged = true;
        }
      }
      return {
      ordinal: step.ordinal, phase: step.phase, python_action: step.form_action,
      python_reason: step.form_reason ?? decision.reason ?? null,
      comparison: step.form_action === "mapping_ready"
        ? "not_comparable: TypeScript compile API exposes mapping candidates/finished phase, not a mapping_ready action"
        : "not_applicable",
      typescript_phase: mappingReadyRoute?.phase ?? null,
      typescript_completion_reason: mappingReadyRoute?.completionReason ?? null,
      typescript_candidate_items: mappingReadyRoute ? [...new Set(mappingReadyRoute.candidates.map((candidate) => candidate.questionId))].sort() : [],
      python_rejected_count: decision.rejected_count ?? 0,
      typescript_rejection_reasons: "available on the TypeScript route result; rejected rows are compared for matching non-entry identities",
      };
    }

    const route = routeReplay(replay, step);
    comparedAsks++;
    // The Python trace also records target-level closure explanations with no
    // item identity. Those describe an outcome, not a rejected candidate, and
    // are kept outside candidate-reason parity.
    const pythonRejected = (decision.rejected ?? []).filter((row: any) => typeof row.item_id === "string").map((row: any) => ({
      item: row.item_id, target_id: row.target_id ?? null, reason: row.reason ?? null,
    }));
    const typeScriptRejected = route.rejectedCandidates.map((row) => ({
      item: row.questionId, target_id: row.targetIds[0] ?? null, reason: row.reason,
    }));
    const rejectionKey = (row: any) => `${row.item}|${row.target_id ?? ""}`;
    const pythonReplayRejections = pythonRejected.filter((row: any) => isReplayOperatorItem(row.item));
    const typeScriptReplayRejections = typeScriptRejected.filter((row: any) => isReplayOperatorItem(row.item));
    pythonReplayRejectionRowsUnsupported += pythonReplayRejections.length;
    typeScriptReplayRejectionRowsUnsupported += typeScriptReplayRejections.length;
    const pythonComparableRejected = pythonRejected.filter((row: any) => !isReplayOperatorItem(row.item));
    const typeScriptComparableRejected = typeScriptRejected.filter((row: any) => !isReplayOperatorItem(row.item));
    const pythonRejectedByKey = new Map<string, any>(pythonComparableRejected.map((row: any): [string, any] => [rejectionKey(row), row]));
    const typeScriptRejectedByKey = new Map<string, any>(typeScriptComparableRejected.map((row: any): [string, any] => [rejectionKey(row), row]));
    const independentEntryCandidate = (row: any) => typeof row.target_id === "string" && row.target_id.startsWith("entry:");
    const pythonUnmatchedRejected = pythonComparableRejected.filter((row: any) => !typeScriptRejectedByKey.has(rejectionKey(row)) && !independentEntryCandidate(row));
    const unsupportedReplayRejections = { python: pythonReplayRejections, typescript: typeScriptReplayRejections };
    const typeScriptUnmatchedRejected = typeScriptRejected.filter((row: any) => !pythonRejectedByKey.has(rejectionKey(row))
      && !independentEntryCandidate(row) && !isReplayOperatorItem(row.item));
    pythonRejectedRowsWithoutTypeScriptReason += pythonUnmatchedRejected.length;
    typeScriptRejectedRowsWithoutPythonReason += typeScriptUnmatchedRejected.length;
    const sharedRejectedKeys = [...pythonRejectedByKey.keys()].filter((key) => typeScriptRejectedByKey.has(key));
    comparableRejectedRows += sharedRejectedKeys.length;
    for (const key of sharedRejectedKeys) {
      const pythonRow = pythonRejectedByKey.get(key)!;
      const typeScriptRow = typeScriptRejectedByKey.get(key)!;
      const knownEquivalentReason = pythonRow.reason === "comparison_requires_two_actual_episodes"
        && typeScriptRow.reason === "missing_derived_flag:two_distinct_actual_episodes";
      if (pythonRow.reason !== typeScriptRow.reason && !knownEquivalentReason) {
        rejectionReasonMismatches++;
        rejectionReasonMismatchRecords.push({ ordinal: step.ordinal, key, python: pythonRow.reason, typescript: typeScriptRow.reason });
      }
    }
    if (pythonRejected.length && sharedRejectedKeys.length === 0) pythonRejectionReasonSteps++;
    const transition = comparePostTargetStates(replay, step, route);
    if (transition.status === "missing_collector_field") missingPostTargetTransitionSteps++;
    else if (transition.status === "unsupported_without_accepted_response_prefix") unsupportedPostTargetTransitionSteps++;
    else if (transition.status === "no_target_change") { /* No post-state transition to compare. */ }
    else {
      postTargetTransitionSteps++;
      postTargetEntryRowsUnsupported += transition.entry_point_rows_excluded_as_ontology_mismatch;
      postTargetInvalidatedRowsUnsupported += transition.python_invalidated_rows_unsupported;
      postTargetRemovedTargetsUnsupported += transition.typescript_removed_targets_unsupported;
      if (transition.mismatched) {
        postTargetTransitionMismatchSteps++;
        targetTransitionMismatchOrdinals.add(step.ordinal);
        if (!firstPostTargetTransitionDifference) firstPostTargetTransitionDifference = {
          ordinal: step.ordinal,
          missing_from_typescript: transition.missing_from_typescript.slice(0, 5),
          extra_in_typescript: transition.extra_in_typescript.slice(0, 5),
          additional_difference_count: Math.max(0, transition.missing_from_typescript.length + transition.extra_in_typescript.length - 10),
          entry_point_rows_excluded_as_ontology_mismatch: transition.entry_point_rows_excluded_as_ontology_mismatch,
          python_invalidated_rows_unsupported: transition.python_invalidated_rows_unsupported,
          typescript_removed_targets_unsupported: transition.typescript_removed_targets_unsupported,
        };
      }
    }
    const configuredTopics = new Set([...(replay?.config?.topics ?? []), ...(replay?.config?.focus_topics ?? [])]);
    const focusedOccurrences = new Set(step.pre_focus_occurrences ?? []);
    const requestedTargets = new Set(step.pre_requested_target_ids ?? []);
    const candidateContext = (candidate: typeof route.candidates[number]) => route.episodes.find((episode) => episode.id === candidate.occurrenceId)?.context
      ?? source.questionBank.items.find((item) => item.id === candidate.questionId)?.context ?? null;
    const candidateFocused = (candidate: typeof route.candidates[number]) => (candidate.occurrenceId !== null && focusedOccurrences.has(candidate.occurrenceId))
      || Boolean(candidate.linkedFrom && focusedOccurrences.has(candidate.linkedFrom))
      || candidate.targetIds.some((targetId) => requestedTargets.has(targetId)
        || (targetId.startsWith("entry:") && configuredTopics.has(targetId.slice("entry:".length))));
    const tsCandidates = route.candidates.map((candidate, index) => ({
      candidate_order: index + 1,
      item: candidate.questionId, occurrence: candidate.occurrenceId,
      step: candidate.stepId, targetIds: [...candidate.targetIds].sort(), priority: candidate.priority,
      eligibility: "returned by the TypeScript router as an eligible candidate",
      focus: candidateFocused(candidate), context: candidateContext(candidate),
      distinct_evidence_requirements: candidate.questionId === "D21" && candidate.targetIds.some((targetId) => targetId.startsWith("need_exposure:")) ? 2 : 1,
      decision_burden: candidate.questionId === "D36" ? 2 : 1,
      selected: index === 0 && Boolean(route.next), linked_from: candidate.linkedFrom ?? null,
      bindingRequest: candidate.bindingRequest,
    }));
    const replayCandidates = pythonCandidates.filter((candidate: any) => candidate.replay);
    for (const candidate of replayCandidates) unsupportedReplayCandidateKeys.add(`${candidate.item}|${candidate.occurrence ?? ""}|${candidate.step}`);
    const comparablePythonCandidates = pythonCandidates.filter((candidate: any) => !candidate.replay);
    const replayGroups = groupRouteCandidates(replayCandidates, replay, step);
    const pyGroups = groupRouteCandidates(comparablePythonCandidates, replay, step);
    const tsGroups = new Map([...groupRouteCandidates(tsCandidates, replay, step)].filter(([key]) => !replayGroups.has(key)));
    const pyKeys = new Set<string>(pyGroups.keys());
    const tsKeys = new Set<string>(tsGroups.keys());
    const unsupportedEntryPointKeys = new Set<string>();
    const unsupportedEntryPointTargetIds = new Map<string, string[]>();
    for (const key of tsKeys) {
      const tsTargets = tsGroups.get(key).targetIds as string[];
      const pyTargets = (pyGroups.get(key)?.targetIds ?? []) as string[];
      const unsupportedIds = tsTargets.filter((targetId) => entryPointIds.has(targetId.replace(/^entry:/, ""))
        && targetId.startsWith("entry:") && !pyTargets.includes(targetId));
      if (unsupportedIds.length) {
        unsupportedEntryPointTargetIds.set(key, unsupportedIds);
        if (!pyKeys.has(key)) unsupportedEntryPointKeys.add(key);
      }
    }
    const missingFromTypeScript = [...pyKeys].filter((key) => !tsKeys.has(key)).sort();
    const extraInTypeScript = [...tsKeys].filter((key) => !pyKeys.has(key) && !unsupportedEntryPointKeys.has(key)).sort();
    unsupportedEntryPointCandidateRows += unsupportedEntryPointTargetIds.size;
    if (!routeTrajectoryDiverged) sharedRouteUnsupportedEntryPointCandidateRows += unsupportedEntryPointTargetIds.size;
    const candidateTargetMismatches = [...pyKeys].filter((key) => tsKeys.has(key)).flatMap((key) => {
      const pythonTargets = pyGroups.get(key).targetIds as string[];
      const typescriptTargets = (tsGroups.get(key).targetIds as string[])
        .filter((targetId) => !unsupportedEntryPointTargetIds.get(key)?.includes(targetId));
      return JSON.stringify(pythonTargets) === JSON.stringify(typescriptTargets)
        ? [] : [{ key, python_target_ids: pythonTargets, typescript_target_ids: typescriptTargets }];
    });
    const pythonChosen = {
      item: decision.item_id ?? step.form_item_id ?? null,
      occurrence: decision.occurrence_id ?? step.form_occurrence_id ?? null,
    };
    const typescriptChosen = route.next ? { item: route.next.questionId, occurrence: route.next.occurrenceId } : null;
    const selectedPythonCandidate = pythonCandidates.find((candidate: any) => candidate.selected);
    const selectedPythonReplay = Boolean(selectedPythonCandidate?.replay);
    if (selectedPythonReplay) chosenReplayStepsUnsupported++;
    const normalizedChosenOccurrence = hasAnsweredOccurrence(replay, step, pythonChosen.occurrence) ? pythonChosen.occurrence : null;
    const normalizedTypescriptOccurrence = hasAnsweredOccurrence(replay, step, typescriptChosen?.occurrence ?? null) ? typescriptChosen?.occurrence : null;
    const typescriptSelectedEntryGap = Boolean(route.next?.targetIds.some((targetId) =>
      targetId.startsWith("entry:") && entryPointIds.has(targetId.slice("entry:".length)))
      && !selectedPythonCandidate?.targetIds?.some((targetId: string) => targetId.startsWith("entry:")
        && entryPointIds.has(targetId.slice("entry:".length))));
    const unsupportedEntryPointChoice = !selectedPythonReplay && typescriptSelectedEntryGap
      && (pythonChosen.item !== typescriptChosen?.item || normalizedChosenOccurrence !== normalizedTypescriptOccurrence);
    if (unsupportedEntryPointChoice) unsupportedEntryPointChoiceSteps++;
    const chosenQuestionMismatch = !selectedPythonReplay && !unsupportedEntryPointChoice && pythonChosen.item !== typescriptChosen?.item;
    const chosenOccurrenceMismatch = !selectedPythonReplay && !unsupportedEntryPointChoice && !chosenQuestionMismatch
      && normalizedChosenOccurrence !== normalizedTypescriptOccurrence;
    const candidateMismatch = missingFromTypeScript.length > 0 || extraInTypeScript.length > 0;
    // Python's binding_control_needed is an explicit user confirmation screen.
    // TS new_actual_occurrence is server-side ID allocation, so these are not
    // equivalent eligibility signals. Explicit bind actions are reported as
    // unsupported interaction coverage above.
    const eligibilityMismatches: any[] = [];
    const priorityMismatches = [...pyKeys].filter((key) => tsKeys.has(key)).flatMap((key) => {
      const pythonPriority = pyGroups.get(key).priority;
      const typescriptPriority = tsGroups.get(key).priority;
      return pythonPriority === undefined || typescriptPriority === undefined || pythonPriority === typescriptPriority
        ? [] : [{ key, python_priority: pythonPriority, typescript_priority: typescriptPriority }];
    });
    if (priorityMismatches.length) {
      candidatePriorityMismatchSteps++;
      if (!firstCandidatePriorityDifference) firstCandidatePriorityDifference = {
        ordinal: step.ordinal, phase: step.phase, mismatches: priorityMismatches.slice(0, 5),
        additional_mismatches: Math.max(0, priorityMismatches.length - 5),
      };
    }
    const selectionMismatch = candidateMismatch || eligibilityMismatches.length > 0 || candidateTargetMismatches.length > 0
      || priorityMismatches.length > 0 || chosenQuestionMismatch || chosenOccurrenceMismatch;
    const chosenTsGroupKey = typescriptChosen
      ? `${typescriptChosen.item}|${normalizedTypescriptOccurrence ?? ""}|${route.next?.stepId ?? "first"}` : "";
    const sharedRoutePrefixAtDecision = !routeTrajectoryDiverged;
    if (selectionMismatch) {
      selectionMismatchOrdinals.add(step.ordinal);
      if (sharedRoutePrefixAtDecision) {
        sharedRouteSelectionMismatchOrdinals.add(step.ordinal);
        sharedRouteSelectionMismatchSteps++;
      } else conditionalRouteSelectionMismatchSteps++;
    }
    routeSelectionDecisions.push({
      ordinal: step.ordinal, phase: step.phase,
      trajectory_status: routeTrajectoryDiverged ? "conditional_reference_prefix_after_route_divergence" : "shared_route_prefix",
      route_comparison_status: unsupportedEntryPointChoice ? "uncomparable_python_reference_entry_point_gap"
        : selectedPythonReplay ? "uncomparable_python_replay_choice"
          : selectionMismatch ? "compared_with_difference" : "compared_match",
      selection_rules: {
        python: decision.reason ?? null,
        typescript: "priority, focused target, context saturation, distinct evidence requirements, decision burden, context recency, target age, stable IDs",
        deterministic_order: "candidate arrays retain emitted order; candidate_order is one-based; no implicit tie is declared equivalent",
      eligibility_comparison: "eligible candidate identities/targets and comparable candidate rejection identities/reasons are compared; entry pseudo-target rejections lack a Python direct-entry representation",
      },
      python_open_targets: (decision.open_targets ?? []).map((target: any) => ({
        id: target.id, target: target.target, occurrence_id: target.occurrence_id ?? null,
        priority: target.priority ?? null, missing_discriminator: [...(target.missing_discriminator ?? [])].sort(),
      })),
      typescript_open_targets: route.targets.filter((target) => target.state === "open").map((target) => ({
        id: target.id, target: target.targetId, occurrence_id: target.occurrenceId,
        step_id: target.stepId, state: target.state, priority: target.priority,
        source_observation_ids: [...target.sourceObservationIds].sort(), candidate_items: [...target.candidateItems].sort(),
      })),
      python_candidates: pythonCandidates,
      typescript_candidates: tsCandidates,
      python: { action: step.form_action, item: pythonChosen.item, occurrence: pythonChosen.occurrence,
        step: selectedPythonCandidate?.step ?? null, target_ids: selectedPythonCandidate?.targetIds ?? [],
        priority: selectedPythonCandidate?.priority ?? null, replay: selectedPythonReplay,
        candidate_order: selectedPythonCandidate?.candidate_order ?? null, selection_rule: decision.reason ?? null },
      typescript: route.next ? { action: "ask", item: route.next.questionId, occurrence: route.next.occurrenceId,
        step: route.next.stepId, target_ids: [...route.next.targetIds], priority: route.next.priority,
        binding_request: route.next.bindingRequest ?? null, candidate_order: 1 } : { action: route.phase, completion_reason: route.completionReason ?? null },
      candidate_priority_mismatches: priorityMismatches.slice(0, 5),
      unsupported_python_entry_point_candidates: unsupportedEntryPointTargetIds.get(chosenTsGroupKey) ?? [],
      unsupported_python_entry_point_choice: unsupportedEntryPointChoice,
      candidate_rejections: {
        python: pythonRejected,
        typescript: typeScriptRejected,
        comparable_shared_rows: sharedRejectedKeys.length,
        python_unmatched_non_entry_rows: pythonUnmatchedRejected,
        typescript_unmatched_non_entry_rows: typeScriptUnmatchedRejected,
        replay_operator_rejections_not_comparable: unsupportedReplayRejections,
        reason_mismatches: rejectionReasonMismatchRecords.filter((row) => row.ordinal === step.ordinal),
        entry_point_rejections_without_reference_equivalent: typeScriptRejected.filter(independentEntryCandidate),
      },
      post_response_target_state: {
        comparable: transition.status === "post-response target-state snapshot comparison; Python entry pseudo-targets excluded",
        mismatched: Boolean(transition.mismatched),
        python_changes: transition.python_target_changes ?? [],
        typescript_changes: transition.typescript_target_changes ?? [],
        missing_from_typescript: transition.missing_from_typescript?.slice(0, 3) ?? [],
        extra_in_typescript: transition.extra_in_typescript?.slice(0, 3) ?? [],
      },
    });
    if (candidateMismatch) {
      candidatePresenceMismatchSteps++;
      if (sharedRoutePrefixAtDecision) sharedRouteCandidatePresenceMismatchSteps++;
    }
    if (eligibilityMismatches.length) {
      candidateEligibilityMismatchSteps++;
      if (sharedRoutePrefixAtDecision) sharedRouteCandidateEligibilityMismatchSteps++;
    }
    if (candidateTargetMismatches.length) {
      candidateTargetMismatchSteps++;
      if (sharedRoutePrefixAtDecision) sharedRouteCandidateTargetMismatchSteps++;
      if (!firstCandidateTargetMismatch) firstCandidateTargetMismatch = {
        ordinal: step.ordinal, phase: step.phase, mismatches: candidateTargetMismatches.slice(0, 3),
        additional_mismatches: Math.max(0, candidateTargetMismatches.length - 3),
      };
    }
    if (chosenQuestionMismatch) chosenQuestionMismatchSteps++;
    if (chosenOccurrenceMismatch) chosenOccurrenceMismatchSteps++;
    if ((chosenQuestionMismatch || chosenOccurrenceMismatch) && sharedRoutePrefixAtDecision) sharedRouteChoiceMismatchSteps++;
    if (priorityMismatches.length && sharedRoutePrefixAtDecision) sharedRouteCandidatePriorityMismatchSteps++;
    const occurrenceBindingMismatches: any[] = [];
    if (occurrenceBindingMismatches.length) {
      occurrenceBindingMismatchSteps++;
      if (!firstOccurrenceBindingDifference) firstOccurrenceBindingDifference = {
        ordinal: step.ordinal, phase: step.phase,
        examples: occurrenceBindingMismatches.slice(0, 3),
        additional_differences: Math.max(0, occurrenceBindingMismatches.length - 3),
      };
    }
    if (chosenQuestionMismatch || chosenOccurrenceMismatch) {
      choiceMismatchSteps++;
      choiceMismatchOrdinals.add(step.ordinal);
      if (sharedRoutePrefixAtDecision && firstTrajectoryDivergenceOrdinal === null) {
        firstTrajectoryDivergenceOrdinal = step.ordinal;
        firstTrajectoryDivergenceReason = "selected_question_or_occurrence_differs";
      }
      routeTrajectoryDiverged = true;
      if (!firstChoiceDivergence) firstChoiceDivergence = {
        ordinal: step.ordinal, phase: step.phase, python_chosen: pythonChosen,
        typescript_chosen: typescriptChosen, python_chosen_replay: selectedPythonReplay,
      };
    }
    if (selectedPythonReplay) {
      if (sharedRoutePrefixAtDecision && firstTrajectoryDivergenceOrdinal === null) {
        firstTrajectoryDivergenceOrdinal = step.ordinal;
        firstTrajectoryDivergenceReason = "python_selected_replay_action_not_supported_by_typescript_selector";
      }
      routeTrajectoryDiverged = true;
    }
    if (unsupportedEntryPointChoice && sharedRoutePrefixAtDecision) {
      if (firstTrajectoryDivergenceOrdinal === null) {
        firstTrajectoryDivergenceOrdinal = step.ordinal;
        firstTrajectoryDivergenceReason = "typescript_selected_entry_point_missing_from_python_reference_candidate_set";
      }
      routeTrajectoryDiverged = true;
    }
    if (transition.mismatched && sharedRoutePrefixAtDecision) {
      sharedRoutePostTargetTransitionMismatchSteps++;
      sharedRouteTargetTransitionMismatchOrdinals.add(step.ordinal);
      if (firstTrajectoryDivergenceOrdinal === null) {
        firstTrajectoryDivergenceOrdinal = step.ordinal;
        firstTrajectoryDivergenceReason = "post_response_target_state_differs";
      }
      routeTrajectoryDiverged = true;
    }
    if (!firstDivergence && selectionMismatch) firstDivergence = {
      ordinal: step.ordinal, phase: step.phase,
      python_action: step.form_action, python_reason: step.form_reason ?? decision.reason ?? null,
      python_chosen: pythonChosen, typescript_chosen: typescriptChosen,
      candidate_keys_missing_from_typescript: missingFromTypeScript,
      candidate_keys_extra_in_typescript: extraInTypeScript,
      candidate_target_mismatches: candidateTargetMismatches.slice(0, 3),
      additional_candidate_target_mismatches: Math.max(0, candidateTargetMismatches.length - 3),
      candidate_priority_mismatches: priorityMismatches.slice(0, 5),
      additional_candidate_priority_mismatches: Math.max(0, priorityMismatches.length - 5),
      unsupported_python_replay_candidates: replayCandidates.map((candidate: any) => `${candidate.item}|${candidate.occurrence ?? ""}|${candidate.step}`),
      candidate_eligibility_mismatches: eligibilityMismatches.slice(0, 3),
      additional_eligibility_mismatches: Math.max(0, eligibilityMismatches.length - 3),
    };
    return null;
  });
  return {
    python_selection_steps: steps.length,
    compared_ask_steps: comparedAsks,
    candidate_presence_mismatch_steps: candidatePresenceMismatchSteps,
    candidate_eligibility_mismatch_steps: candidateEligibilityMismatchSteps,
    candidate_target_mismatch_steps: candidateTargetMismatchSteps,
    candidate_priority_mismatch_steps: candidatePriorityMismatchSteps,
    first_candidate_priority_difference: firstCandidatePriorityDifference,
    chosen_question_mismatch_steps: chosenQuestionMismatchSteps,
    chosen_occurrence_mismatch_steps: chosenOccurrenceMismatchSteps,
    chosen_replay_steps_unsupported: chosenReplayStepsUnsupported,
    choice_mismatch_steps: choiceMismatchSteps,
    selection_mismatch_ordinals: [...selectionMismatchOrdinals].sort((a, b) => a - b),
    choice_mismatch_ordinals: [...choiceMismatchOrdinals].sort((a, b) => a - b),
    shared_route_selection_mismatch_steps: sharedRouteSelectionMismatchSteps,
    conditional_route_selection_mismatch_steps: conditionalRouteSelectionMismatchSteps,
    shared_route_selection_mismatch_ordinals: [...sharedRouteSelectionMismatchOrdinals].sort((a, b) => a - b),
    shared_route_candidate_presence_mismatch_steps: sharedRouteCandidatePresenceMismatchSteps,
    shared_route_candidate_eligibility_mismatch_steps: sharedRouteCandidateEligibilityMismatchSteps,
    shared_route_candidate_target_mismatch_steps: sharedRouteCandidateTargetMismatchSteps,
    shared_route_candidate_priority_mismatch_steps: sharedRouteCandidatePriorityMismatchSteps,
    shared_route_choice_mismatch_steps: sharedRouteChoiceMismatchSteps,
    shared_route_post_target_transition_mismatch_steps: sharedRoutePostTargetTransitionMismatchSteps,
    shared_route_target_transition_mismatch_ordinals: [...sharedRouteTargetTransitionMismatchOrdinals].sort((a, b) => a - b),
    unsupported_python_entry_point_candidate_rows: unsupportedEntryPointCandidateRows,
    shared_route_unsupported_python_entry_point_candidate_rows: sharedRouteUnsupportedEntryPointCandidateRows,
    unsupported_python_entry_point_choice_steps: unsupportedEntryPointChoiceSteps,
    unsupported_python_entry_point_finish_steps: unsupportedEntryPointFinishSteps,
    shared_route_finished_decision_mismatch_steps: sharedRouteFinishedDecisionMismatchSteps,
    unsupported_finish_steps: unsupportedFinishSteps,
    post_target_transition_mismatch_ordinals: [...targetTransitionMismatchOrdinals].sort((a, b) => a - b),
    occurrence_binding_mismatch_steps: occurrenceBindingMismatchSteps,
    unsupported_python_replay_candidate_rows: replayCandidateRows,
    unsupported_python_replay_candidate_keys: [...unsupportedReplayCandidateKeys].sort(),
    replay_selector_coverage: "REPLAY candidates are unsupported by the TS compile selector and excluded from candidate-presence equality",
    python_mapping_ready_steps_not_comparable: pythonMappingReady,
    mapping_ready_coverage: mappingReadyCoverage,
    python_steps_with_rejections_but_no_reason_parity: pythonRejectionReasonSteps,
    comparable_candidate_rejection_rows: comparableRejectedRows,
    python_rejection_rows_without_typescript_reason: pythonRejectedRowsWithoutTypeScriptReason,
    typescript_rejection_rows_without_python_reason: typeScriptRejectedRowsWithoutPythonReason,
    python_replay_rejection_rows_unsupported: pythonReplayRejectionRowsUnsupported,
    typescript_replay_rejection_rows_unsupported: typeScriptReplayRejectionRowsUnsupported,
    candidate_rejection_reason_mismatches: rejectionReasonMismatches,
    candidate_rejection_reason_mismatch_examples: rejectionReasonMismatchRecords.slice(0, 12),
    typescript_rejection_reason_coverage: "compared for shared non-entry candidate rejection identities; independent entry-point rejection rows are separately qualified against the C04 contract",
    first_divergence: firstDivergence,
    first_choice_divergence: firstChoiceDivergence,
    first_candidate_target_mismatch: firstCandidateTargetMismatch,
    route_selection_decisions: routeSelectionDecisions,
    first_trajectory_divergence_ordinal: firstTrajectoryDivergenceOrdinal,
    first_trajectory_divergence_reason: firstTrajectoryDivergenceReason,
    python_binding_control_steps_not_comparable: pythonBindingControlSteps,
    python_completion_steps_not_comparable: pythonCompletionStepsNotComparable,
    first_occurrence_binding_difference: firstOccurrenceBindingDifference,
    post_target_transition_steps_compared: postTargetTransitionSteps,
    post_target_transition_mismatch_steps: postTargetTransitionMismatchSteps,
    post_target_transition_steps_missing_collector_data: missingPostTargetTransitionSteps,
    post_target_transition_steps_unsupported: unsupportedPostTargetTransitionSteps,
    post_target_entry_point_rows_unsupported: postTargetEntryRowsUnsupported,
    post_target_invalidated_rows_unsupported: postTargetInvalidatedRowsUnsupported,
    post_target_typescript_removed_targets_unsupported: postTargetRemovedTargetsUnsupported,
    first_post_target_transition_difference: firstPostTargetTransitionDifference,
  };
}

function compareProjection(python: any, ts: ReturnType<typeof compilePwqe51Route>): any {
  const pyObs = new Set<string>((python?.observations ?? []).map((o: any) => `${o.item_id}|${o.occurrence_id}|${o.step_id}|${o.option_id}`));
  const tsObs = new Set<string>(ts.observations.map((o) => `${o.itemId}|${o.occurrenceId}|${o.stepId}|${o.optionId}`));
  const pyMissing = new Set<string>((python?.missingness ?? []).map((m: any) => `${m.item_id}|${m.occurrence_id}|${m.status}`));
  const tsMissing = new Set<string>(ts.missingness.map((m) => `${m.questionId}|${m.occurrenceId}|${m.status}`));
  const targetKey = (t: any) => {
    const pair = t.comparison_ids ?? t.comparisonIds;
    const base = `${t.target_id ?? t.targetId}|${t.occurrence_id ?? t.occurrenceId}|${t.step_id ?? t.stepId}`;
    return Array.isArray(pair) && pair.length === 2 ? `${base}|${[...pair].sort().join("|")}` : base;
  };
  const pyTargets = new Map<string, string>((python?.targets ?? []).map((t: any) => [targetKey(t), t.state]));
  const tsTargets = new Map<string, string>(ts.targets.map((t) => [targetKey(t), t.state]));
  const pySteps = new Set<string>((python?.steps ?? []).map((s: any) => `${s.occurrence_id}|${s.step_id}`));
  const tsSteps = new Set<string>(ts.steps.map((s) => `${s.occurrenceId}|${s.id.split(":").slice(1).join(":")}`));
  const edgeKey = (e: any) => `${e.occurrence_id ?? e.occurrenceId}|${e.from_step ?? e.fromStep}|${e.to_step ?? e.toStep}|${e.relation}`;
  const pyEdges = new Set<string>((python?.sequence_edges ?? []).map(edgeKey));
  const tsEdges = new Set<string>(ts.sequenceEdges.map(edgeKey));
  const canonicalPair = (a: string, b: string) => [a, b].sort().join("|");
  const pyDistinctPairs: string[] = [...new Set<string>((python?.episodes ?? []).flatMap((episode: any) => (episode.distinct_from ?? []).map((prior: string) => canonicalPair(prior, episode.id))))];
  const tsDistinctPairs: string[] = [...new Set<string>(ts.episodes.flatMap((episode) => (episode.distinctFrom ?? []).map((prior) => canonicalPair(prior, episode.id))))];
  const pyEpisodes = new Map<string, any>((python?.episodes ?? []).map((episode: any) => [episode.id, episode]));
  const tsEpisodes = new Map<string, any>(ts.episodes.map((episode) => [episode.id, episode]));
  const episodeIds = new Set([...pyEpisodes.keys(), ...tsEpisodes.keys()]);
  const episodeMismatches = [...episodeIds].flatMap((id) => {
    const py = pyEpisodes.get(id); const route = tsEpisodes.get(id);
    if (!py || !route) return [{ id, python: py ?? null, typescript: route ?? null }];
    const differing = ["basis", "context", "family"].filter((field) => py[field] !== route[field]);
    return differing.length ? [{ id, fields: differing, python: py, typescript: route }] : [];
  });
  const distinctnessMismatches = pyDistinctPairs.filter((pair) => !tsDistinctPairs.includes(pair))
    .concat(tsDistinctPairs.filter((pair) => !pyDistinctPairs.includes(pair)));
  const keys = new Set([...pyTargets.keys(), ...tsTargets.keys()]);
  const targetStateMismatches = [...keys].filter((key) => pyTargets.get(key) !== tsTargets.get(key));
  return {
    python_observations: pyObs.size, typescript_observations: tsObs.size,
    observation_missing_from_typescript: [...pyObs].filter((key) => !tsObs.has(key)),
    observation_extra_in_typescript: [...tsObs].filter((key) => !pyObs.has(key)),
    python_missingness: pyMissing.size, typescript_missingness: tsMissing.size,
    missingness_missing_from_typescript: [...pyMissing].filter((key) => !tsMissing.has(key)),
    missingness_extra_in_typescript: [...tsMissing].filter((key) => !pyMissing.has(key)),
    python_steps: pySteps.size, typescript_steps: tsSteps.size,
    steps_missing_from_typescript: [...pySteps].filter((key) => !tsSteps.has(key)),
    steps_extra_in_typescript: [...tsSteps].filter((key) => !pySteps.has(key)),
    python_sequence_edges: pyEdges.size, typescript_sequence_edges: tsEdges.size,
    sequence_edges_missing_from_typescript: [...pyEdges].filter((key) => !tsEdges.has(key)),
    sequence_edges_extra_in_typescript: [...tsEdges].filter((key) => !pyEdges.has(key)),
    python_target_instances: pyTargets.size, typescript_target_instances: tsTargets.size,
    target_state_mismatches: targetStateMismatches.map((key) => ({ key, python: pyTargets.get(key) ?? null, typescript: tsTargets.get(key) ?? null })),
    projection_mismatch_count: [...pyObs].filter((key) => !tsObs.has(key)).length + [...tsObs].filter((key) => !pyObs.has(key)).length
      + [...pyMissing].filter((key) => !tsMissing.has(key)).length + [...tsMissing].filter((key) => !pyMissing.has(key)).length
      + [...pySteps].filter((key) => !tsSteps.has(key)).length + [...tsSteps].filter((key) => !pySteps.has(key)).length
      + [...pyEdges].filter((key) => !tsEdges.has(key)).length + [...tsEdges].filter((key) => !pyEdges.has(key)).length
      + distinctnessMismatches.length + episodeMismatches.length + targetStateMismatches.length,
    typescript_final_candidate_items: [...new Set(ts.candidates.map((candidate) => candidate.questionId))].sort(),
    python_trace_candidate_items: python?.trace_candidate_items ?? [],
    python_distinct_pair_count: pyDistinctPairs.length,
    typescript_distinct_pair_count: tsDistinctPairs.length,
    distinctness_forwarded: true,
    distinctness_mismatch: distinctnessMismatches,
    python_episodes: pyEpisodes.size, typescript_episodes: tsEpisodes.size,
    episode_mismatches: episodeMismatches,
    synthetic_binding_count: python?.synthetic_binding_count ?? 0,
  };
}

function stableAuditJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableAuditJson).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableAuditJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

const requiredD41Cases = new Set([
  "d41-no-permission", "d41-permission-needs-actual-episode", "d41-bound-candidate-and-tier",
  "d41-does-not-outrank-a-tier-three-comparison", "d41-answer-is-retained-and-not-reoffered",
  "d41-skip-remains-distinct-from-an-answer", "d41-correction-replaces-the-prior-answer",
]);
const d41CaseIds = new Set<string>((referenceExtensions.cases ?? []).map((item: any) => item.id));
const d41ExtensionPinned = referenceExtensions.format === "pwqe51-independent-reference-extension-v1"
  && stableAuditJson(referenceExtensions.source_binding) === stableAuditJson(source.manifest.source_binding)
  && referenceExtensions.source_manifest_sha256 === source.sourceManifestSha256
  && [...requiredD41Cases].every((id) => d41CaseIds.has(id))
  && d41CaseIds.size === (referenceExtensions.cases ?? []).length;
const d41ExtensionCases = (referenceExtensions.cases ?? []).map((fixture: any) => {
  try {
    const route = compilePwqe51Route(fixture.input as Pwqe51RouterInput, source);
    const actual: Record<string, unknown> = {
      d41_candidate: route.candidates.some((candidate) => candidate.questionId === "D41"),
      d41_rejection_reason: route.rejectedCandidates.find((candidate) => candidate.questionId === "D41")?.reason,
      active_d41_response_ids: route.observations.filter((observation) => observation.itemId === "D41").map((observation) => observation.responseId),
      active_d41_option_ids: route.observations.filter((observation) => observation.itemId === "D41").map((observation) => observation.optionId),
      missingness: route.missingness.map((row) => ({ responseId: row.responseId, status: row.status })),
      superseded_response_ids: route.supersededResponseIds,
      next_question_id: route.next?.questionId,
      next_priority: route.next?.priority,
      d41_priority: route.candidates.find((candidate) => candidate.questionId === "D41")?.priority,
    };
    const candidate = route.candidates.find((item) => item.questionId === "D41");
    if (candidate) actual.candidate = {
      questionId: candidate.questionId, occurrenceId: candidate.occurrenceId, targetIds: candidate.targetIds,
      priority: candidate.priority, stage: candidate.stage,
    };
    const mismatches = Object.entries(fixture.expected ?? {}).flatMap(([key, expected]) =>
      stableAuditJson(actual[key]) === stableAuditJson(expected) ? [] : [{ field: key, expected, actual: actual[key] ?? null }]);
    return { id: fixture.id, passed: d41ExtensionPinned && mismatches.length === 0, mismatches };
  } catch (error) {
    return { id: fixture.id, passed: false, mismatches: [{ field: "execution", expected: "successful contract case", actual: String(error) }] };
  }
});
const d41ExtensionPassed = d41ExtensionPinned && requiredD41Cases.size === d41CaseIds.size
  && d41ExtensionCases.length === requiredD41Cases.size && d41ExtensionCases.every((row: any) => row.passed);

const report: any[] = [];
for (const profile of worked.profiles) {
  const pyPlan = pyById.get(profile.id);
  try {
    const ts = routeReplay(pyPlan);
    report.push({
      id: profile.id, kind: "P", python_replay_ok: pyPlan?.ok ?? false,
      python_asked_count: pyPlan?.asked_items?.length ?? 0,
      python_synthetic_binding_count: pyPlan?.synthetic_binding_count ?? 0,
      parity: "cross-engine final projection plus per-prefix candidate/selection comparison on Python replay traces; differences are reported, not treated as a Python-authoritative verdict",
      selection_comparison: compareSelectionSteps(pyPlan),
      projection: compareProjection(pyPlan, ts),
    });
  } catch (error) {
    report.push({ id: profile.id, kind: "P", error: String(error), python_replay_ok: pyPlan?.ok ?? false });
  }
}
for (const plan of coverage.plans) {
  const pyPlan = pyById.get(plan.id);
  try {
    const asked = new Set<string>(pyPlan?.asked_items ?? []);
    const expected = plan.expected_items ?? [];
    const forbidden = plan.forbidden_items ?? [];
    const ts = routeReplay(pyPlan);
    const selectionComparison = compareSelectionSteps(pyPlan);
    const typescriptAsked = new Set<string>(selectionComparison.route_selection_decisions
      .filter((decision: any) => decision.trajectory_status === "shared_route_prefix"
        && decision.typescript?.action === "ask" && decision.typescript.item)
      .map((decision: any) => decision.typescript.item));
    const hasUncomparableTail = selectionComparison.first_trajectory_divergence_ordinal !== null;
    const typescriptExpectedMissing = expected.filter((x: string) => !typescriptAsked.has(x) && !hasUncomparableTail);
    const typescriptExpectedUnassessed = expected.filter((x: string) => !typescriptAsked.has(x) && hasUncomparableTail);
    report.push({
      id: plan.id, kind: "C", python_replay_ok: pyPlan?.ok ?? false,
      python_expected_items_present: expected.filter((x: string) => asked.has(x)),
      python_expected_items_missing: expected.filter((x: string) => !asked.has(x)),
      python_forbidden_items_present: forbidden.filter((x: string) => asked.has(x)),
      typescript_expected_items_present: expected.filter((x: string) => typescriptAsked.has(x)),
      typescript_expected_items_missing: typescriptExpectedMissing,
      typescript_expected_items_unassessed_after_route_divergence: typescriptExpectedUnassessed,
      typescript_forbidden_items_present: forbidden.filter((x: string) => typescriptAsked.has(x)),
      python_synthetic_binding_count: pyPlan?.synthetic_binding_count ?? 0,
      python_trace_candidate_items: (pyPlan?.trace_candidate_items ?? []).length,
      projection: compareProjection(pyPlan, ts),
      TypeScript_distinctness: pyPlan?.synthetic_binding_count
        ? `forwarded from independent Python replay; ${pyPlan.synthetic_binding_count} replay-driver synthetic binding(s), not fixture-authored`
        : "forwarded from independent Python replay episode state",
      parity: "cross-engine final projection plus per-prefix candidate/selection comparison on Python replay traces; differences are reported, not treated as a Python-authoritative verdict",
      selection_comparison: selectionComparison,
    });
  } catch (error) {
    report.push({ id: plan.id, kind: "C", error: String(error), python_replay_ok: pyPlan?.ok ?? false });
  }
}

const noBodyDetailById = new Map(withoutBodyDetail.plans.map((plan) => [plan.id, plan]));
const noBodyDetailReports = [...worked.profiles.map((profile: any) => profile.id), ...coverage.plans.map((plan: any) => plan.id)].map((id) => {
  const replay = noBodyDetailById.get(id);
  if (!replay?.ok) return { id, replay_ok: false, error: replay?.error ?? "plan missing from separate no-body-detail collection" };
  try {
    const selection = compareSelectionSteps(replay);
    const projection = compareProjection(replay, routeReplay(replay));
    const decisions = selection.route_selection_decisions ?? [];
    const divergenceDecision = decisions.find((decision: any) => decision.ordinal === selection.first_trajectory_divergence_ordinal);
    return {
      id, replay_ok: true, selection_snapshots: selection.compared_ask_steps,
      first_divergence: selection.first_trajectory_divergence_ordinal === null ? null : {
        ordinal: selection.first_trajectory_divergence_ordinal, reason: selection.first_trajectory_divergence_reason,
      },
      first_divergence_decision: divergenceDecision ? {
        route_comparison_status: divergenceDecision.route_comparison_status,
        python: divergenceDecision.python, typescript: divergenceDecision.typescript,
        python_candidate_ids: (divergenceDecision.python_candidates ?? []).map((candidate: any) => candidate.item),
        typescript_candidate_ids: (divergenceDecision.typescript_candidates ?? []).map((candidate: any) => candidate.item),
      } : null,
      shared_route_selection_mismatches: selection.shared_route_selection_mismatch_steps,
      shared_route_selection_mismatch_ordinals: selection.shared_route_selection_mismatch_ordinals,
      shared_route_target_transition_mismatches: selection.shared_route_post_target_transition_mismatch_steps,
      replay_operator_rows_unsupported: selection.unsupported_python_replay_candidate_rows,
      binding_controls_not_comparable: selection.python_binding_control_steps_not_comparable,
      mapping_ready_rows_not_comparable: selection.python_mapping_ready_steps_not_comparable,
      d41_candidate_rows: decisions.reduce((sum: number, decision: any) => sum
        + (decision.python_candidates?.filter((candidate: any) => candidate.item === "D41").length ?? 0)
        + (decision.typescript_candidates?.filter((candidate: any) => candidate.item === "D41").length ?? 0), 0),
      projection_mismatch_count: projection.projection_mismatch_count,
      target_state_mismatches: projection.target_state_mismatches,
      non_target_projection_mismatch_count: projection.projection_mismatch_count - projection.target_state_mismatches.length,
    };
  } catch (error) { return { id, replay_ok: false, error: String(error) }; }
});
const noBodyDetailSummary = {
  cohort: "separately collected original 25 plans with body_detail removed from topics and focus_topics",
  original_corpus_preserved: true,
  input_adaptation_manifest: withoutBodyDetail.config_policy ?? null,
  required_plans: 25,
  plans: noBodyDetailReports,
  replayed_plans: noBodyDetailReports.filter((row: any) => row.replay_ok).length,
  selection_snapshots: noBodyDetailReports.reduce((sum: number, row: any) => sum + (row.selection_snapshots ?? 0), 0),
  shared_route_selection_mismatches: noBodyDetailReports.reduce((sum: number, row: any) => sum + (row.shared_route_selection_mismatches ?? 0), 0),
  shared_route_target_transition_mismatches: noBodyDetailReports.reduce((sum: number, row: any) => sum + (row.shared_route_target_transition_mismatches ?? 0), 0),
  plans_with_no_d41_candidate_rows: noBodyDetailReports.filter((row: any) => row.replay_ok && row.d41_candidate_rows === 0).length,
  plans_with_first_divergence: noBodyDetailReports.filter((row: any) => row.first_divergence).length,
  first_divergences: noBodyDetailReports.flatMap((row: any) => row.first_divergence ? [{ plan: row.id, ...row.first_divergence }] : []),
  d41_opt_out_behavior_verified: noBodyDetailReports.length === 25
    && noBodyDetailReports.every((row: any) => row.replay_ok && row.d41_candidate_rows === 0),
};
const noBodyDetailAppliedExceptionKeys = new Set<string>(noBodyDetailReports.flatMap((row: any) => (row.target_state_mismatches ?? [])
  .map((mismatch: any) => `${row.id}|${mismatch.key}`)
  .filter((key: string) => exceptionByKey.has(key))));
const noBodyDetailUnexplainedTargetStateKeys = noBodyDetailReports.flatMap((row: any) => (row.target_state_mismatches ?? [])
  .map((mismatch: any) => `${row.id}|${mismatch.key}`)
  .filter((key: string) => !exceptionByKey.has(key)));
const noBodyDetailStaleExceptionKeys = [...exceptionByKey.keys()].filter((key) => !noBodyDetailAppliedExceptionKeys.has(key));
const noBodyDetailExceptionScopeMatches = noBodyDetailUnexplainedTargetStateKeys.length === 0
  && noBodyDetailStaleExceptionKeys.length === 0
  && noBodyDetailAppliedExceptionKeys.size === exceptionByKey.size;

const pythonFailures = independent.plans.filter((p) => !p.ok).map((p) => ({ id: p.id, error: p.error }));
const p = report.filter((r) => r.kind === "P");
const c = report.filter((r) => r.kind === "C");
const mismatches = [
  ...c.flatMap((r) => [
    ...(r.python_expected_items_missing ?? []).map((item: string) => ({ id: r.id, kind: "C", item, mismatch: "python_expected_item_not_asked" })),
    ...(r.python_forbidden_items_present ?? []).map((item: string) => ({ id: r.id, kind: "C", item, mismatch: "python_forbidden_item_asked" })),
    ...(r.typescript_expected_items_missing ?? []).map((item: string) => ({ id: r.id, kind: "C", item, mismatch: "typescript_expected_item_not_selected" })),
    ...(r.typescript_forbidden_items_present ?? []).map((item: string) => ({ id: r.id, kind: "C", item, mismatch: "typescript_forbidden_item_selected" })),
  ]),
  ...report.flatMap((r) => {
    const projection = r.projection;
    if (!projection) return [];
    return [
      ...projection.observation_missing_from_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "observation_missing_from_typescript" })),
      ...projection.observation_extra_in_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "observation_extra_in_typescript" })),
      ...projection.missingness_missing_from_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "missingness_missing_from_typescript" })),
      ...projection.missingness_extra_in_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "missingness_extra_in_typescript" })),
      ...projection.steps_missing_from_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "step_missing_from_typescript" })),
      ...projection.steps_extra_in_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "step_extra_in_typescript" })),
      ...projection.sequence_edges_missing_from_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "sequence_edge_missing_from_typescript" })),
      ...projection.sequence_edges_extra_in_typescript.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "sequence_edge_extra_in_typescript" })),
      ...projection.distinctness_mismatch.map((item: string) => ({ id: r.id, kind: r.kind, item, mismatch: "distinctness_projection_mismatch" })),
      ...projection.episode_mismatches.map((item: any) => ({ id: r.id, kind: r.kind, item: item.id, mismatch: "episode_projection_mismatch" })),
      ...projection.target_state_mismatches.map((item: any) => ({ id: r.id, kind: r.kind, item: item.key, mismatch: "target_state_mismatch", python: item.python, typescript: item.typescript })),
    ];
  }),
];
const appliedExceptionKeys = new Set<string>();
for (const mismatch of mismatches) {
  if (mismatch.mismatch !== "target_state_mismatch") continue;
  const key = `${mismatch.id}|${mismatch.item}`;
  const exceptionId = exceptionByKey.get(key);
  if (exceptionId) {
    mismatch.approved_exception_id = exceptionId;
    appliedExceptionKeys.add(key);
  }
}
const staleExceptionKeys = [...exceptionByKey.keys()].filter((key) => !appliedExceptionKeys.has(key));
const coverageCounts = {
  required_plans: 25, python_replayed: independent.plans.filter((p) => p.ok).length,
  P_originals: p.length, C_new: c.length,
  projected_observations: report.reduce((n, r) => n + (r.projection?.python_observations ?? 0), 0),
  typescript_observations: report.reduce((n, r) => n + (r.projection?.typescript_observations ?? 0), 0),
  projected_missingness_rows: report.reduce((n, r) => n + (r.projection?.python_missingness ?? 0), 0),
  typescript_missingness_rows: report.reduce((n, r) => n + (r.projection?.typescript_missingness ?? 0), 0),
  projected_steps: report.reduce((n, r) => n + (r.projection?.python_steps ?? 0), 0),
  typescript_steps: report.reduce((n, r) => n + (r.projection?.typescript_steps ?? 0), 0),
  projected_episodes: report.reduce((n, r) => n + (r.projection?.python_episodes ?? 0), 0),
  typescript_episodes: report.reduce((n, r) => n + (r.projection?.typescript_episodes ?? 0), 0),
  projected_sequence_edges: report.reduce((n, r) => n + (r.projection?.python_sequence_edges ?? 0), 0),
  typescript_sequence_edges: report.reduce((n, r) => n + (r.projection?.typescript_sequence_edges ?? 0), 0),
  projected_target_instances: report.reduce((n, r) => n + (r.projection?.python_target_instances ?? 0), 0),
  typescript_target_instances: report.reduce((n, r) => n + (r.projection?.typescript_target_instances ?? 0), 0),
  synthetic_replay_bindings: report.reduce((n, r) => n + (r.projection?.synthetic_binding_count ?? 0), 0),
  C_expected_checks: c.reduce((n, r) => n + (r.python_expected_items_present?.length ?? 0) + (r.python_expected_items_missing?.length ?? 0), 0),
  C_typescript_expected_checks: c.reduce((n, r) => n + (r.typescript_expected_items_present?.length ?? 0) + (r.typescript_expected_items_missing?.length ?? 0), 0),
  C_typescript_expected_items_unassessed_after_route_divergence: c.reduce((n, r) => n + (r.typescript_expected_items_unassessed_after_route_divergence?.length ?? 0), 0),
  C_forbidden_checks: coverage.plans.reduce((n: number, plan: any) => n + (plan.forbidden_items?.length ?? 0), 0),
  C_typescript_forbidden_checks: c.reduce((n, r) => n + (r.typescript_forbidden_items_present?.length ?? 0), 0),
  observation_projection_mismatches: report.reduce((n, r) => n + (r.projection?.observation_missing_from_typescript.length ?? 0) + (r.projection?.observation_extra_in_typescript.length ?? 0), 0),
  missingness_projection_mismatches: report.reduce((n, r) => n + (r.projection?.missingness_missing_from_typescript.length ?? 0) + (r.projection?.missingness_extra_in_typescript.length ?? 0), 0),
  step_projection_mismatches: report.reduce((n, r) => n + (r.projection?.steps_missing_from_typescript.length ?? 0) + (r.projection?.steps_extra_in_typescript.length ?? 0), 0),
  episode_projection_mismatches: report.reduce((n, r) => n + (r.projection?.episode_mismatches.length ?? 0), 0),
  distinctness_projection_mismatches: report.reduce((n, r) => n + (r.projection?.distinctness_mismatch.length ?? 0), 0),
  sequence_edge_projection_mismatches: report.reduce((n, r) => n + (r.projection?.sequence_edges_missing_from_typescript.length ?? 0) + (r.projection?.sequence_edges_extra_in_typescript.length ?? 0), 0),
  target_state_mismatches: report.reduce((n, r) => n + (r.projection?.target_state_mismatches.length ?? 0), 0),
  approved_target_state_exceptions: appliedExceptionKeys.size,
  approved_representation_exception_keys: exceptionByKey.size,
  expected_approved_representation_exception_keys: 11,
  unexplained_target_state_mismatches: mismatches.filter((mismatch: any) => mismatch.mismatch === "target_state_mismatch" && !mismatch.approved_exception_id).length,
  stale_parity_exception_keys: staleExceptionKeys.length,
  selection_steps_compared: report.reduce((n, r) => n + (r.selection_comparison?.compared_ask_steps ?? 0), 0),
  plans_with_selection_divergence: report.filter((r) => r.selection_comparison?.first_divergence).length,
  candidate_presence_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.candidate_presence_mismatch_steps ?? 0), 0),
  shared_route_candidate_presence_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.shared_route_candidate_presence_mismatch_steps ?? 0), 0),
  candidate_eligibility_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.candidate_eligibility_mismatch_steps ?? 0), 0),
  shared_route_candidate_eligibility_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.shared_route_candidate_eligibility_mismatch_steps ?? 0), 0),
  candidate_target_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.candidate_target_mismatch_steps ?? 0), 0),
  shared_route_candidate_target_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.shared_route_candidate_target_mismatch_steps ?? 0), 0),
  shared_route_candidate_priority_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.shared_route_candidate_priority_mismatch_steps ?? 0), 0),
  chosen_question_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.chosen_question_mismatch_steps ?? 0), 0),
  chosen_occurrence_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.chosen_occurrence_mismatch_steps ?? 0), 0),
  chosen_replay_steps_unsupported: report.reduce((n, r) => n + (r.selection_comparison?.chosen_replay_steps_unsupported ?? 0), 0),
  route_choice_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.choice_mismatch_steps ?? 0), 0),
  shared_route_choice_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.shared_route_choice_mismatch_steps ?? 0), 0),
  shared_route_selection_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.shared_route_selection_mismatch_steps ?? 0), 0),
  conditional_route_selection_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.conditional_route_selection_mismatch_steps ?? 0), 0),
  unsupported_python_entry_point_candidate_rows: report.reduce((n, r) => n + (r.selection_comparison?.unsupported_python_entry_point_candidate_rows ?? 0), 0),
  shared_route_unsupported_python_entry_point_candidate_rows: report.reduce((n, r) => n + (r.selection_comparison?.shared_route_unsupported_python_entry_point_candidate_rows ?? 0), 0),
  unsupported_python_entry_point_choice_steps: report.reduce((n, r) => n + (r.selection_comparison?.unsupported_python_entry_point_choice_steps ?? 0), 0),
  unsupported_python_entry_point_finish_steps: report.reduce((n, r) => n + (r.selection_comparison?.unsupported_python_entry_point_finish_steps ?? 0), 0),
  shared_route_finished_decision_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.shared_route_finished_decision_mismatch_steps ?? 0), 0),
  unsupported_finish_steps: report.reduce((n, r) => n + (r.selection_comparison?.unsupported_finish_steps ?? 0), 0),
  python_binding_control_steps_not_comparable: report.reduce((n, r) => n + (r.selection_comparison?.python_binding_control_steps_not_comparable ?? 0), 0),
  occurrence_binding_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.occurrence_binding_mismatch_steps ?? 0), 0),
  unsupported_python_replay_candidate_rows: report.reduce((n, r) => n + (r.selection_comparison?.unsupported_python_replay_candidate_rows ?? 0), 0),
  post_target_transition_steps_compared: report.reduce((n, r) => n + (r.selection_comparison?.post_target_transition_steps_compared ?? 0), 0),
  post_target_transition_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.post_target_transition_mismatch_steps ?? 0), 0),
  shared_route_post_target_transition_mismatch_steps: report.reduce((n, r) => n + (r.selection_comparison?.shared_route_post_target_transition_mismatch_steps ?? 0), 0),
  post_target_transition_steps_missing_collector_data: report.reduce((n, r) => n + (r.selection_comparison?.post_target_transition_steps_missing_collector_data ?? 0), 0),
  post_target_transition_steps_unsupported: report.reduce((n, r) => n + (r.selection_comparison?.post_target_transition_steps_unsupported ?? 0), 0),
  post_target_entry_point_rows_unsupported: report.reduce((n, r) => n + (r.selection_comparison?.post_target_entry_point_rows_unsupported ?? 0), 0),
  post_target_invalidated_rows_unsupported: report.reduce((n, r) => n + (r.selection_comparison?.post_target_invalidated_rows_unsupported ?? 0), 0),
  post_target_typescript_removed_targets_unsupported: report.reduce((n, r) => n + (r.selection_comparison?.post_target_typescript_removed_targets_unsupported ?? 0), 0),
  python_mapping_ready_steps_not_comparable: report.reduce((n, r) => n + (r.selection_comparison?.python_mapping_ready_steps_not_comparable ?? 0), 0),
  python_rejection_reason_steps_without_typescript_parity: report.reduce((n, r) => n + (r.selection_comparison?.python_steps_with_rejections_but_no_reason_parity ?? 0), 0),
  comparable_candidate_rejection_rows: report.reduce((n, r) => n + (r.selection_comparison?.comparable_candidate_rejection_rows ?? 0), 0),
  python_rejection_rows_without_typescript_reason: report.reduce((n, r) => n + (r.selection_comparison?.python_rejection_rows_without_typescript_reason ?? 0), 0),
  typescript_rejection_rows_without_python_reason: report.reduce((n, r) => n + (r.selection_comparison?.typescript_rejection_rows_without_python_reason ?? 0), 0),
  python_replay_rejection_rows_unsupported: report.reduce((n, r) => n + (r.selection_comparison?.python_replay_rejection_rows_unsupported ?? 0), 0),
  typescript_replay_rejection_rows_unsupported: report.reduce((n, r) => n + (r.selection_comparison?.typescript_replay_rejection_rows_unsupported ?? 0), 0),
  candidate_rejection_reason_mismatches: report.reduce((n, r) => n + (r.selection_comparison?.candidate_rejection_reason_mismatches ?? 0), 0),
  d41_independent_contract_cases_required: requiredD41Cases.size,
  d41_independent_contract_cases_run: d41ExtensionCases.length,
  d41_independent_contract_cases_passed: d41ExtensionCases.filter((row: any) => row.passed).length,
  d41_independent_contract_qualification_complete: d41ExtensionPassed,
  no_body_detail_required_plans: 25,
  no_body_detail_replayed_plans: noBodyDetailSummary.replayed_plans,
  no_body_detail_route_snapshots: noBodyDetailSummary.selection_snapshots,
  no_body_detail_d41_opt_out_verified: noBodyDetailSummary.d41_opt_out_behavior_verified,
  no_body_detail_shared_route_selection_mismatches: noBodyDetailSummary.shared_route_selection_mismatches,
  no_body_detail_shared_target_transition_mismatches: noBodyDetailSummary.shared_route_target_transition_mismatches,
  no_body_detail_exception_scope_matches: noBodyDetailExceptionScopeMatches,
  no_body_detail_approved_representation_exceptions: noBodyDetailAppliedExceptionKeys.size,
  no_body_detail_unexplained_target_state_mismatches: noBodyDetailUnexplainedTargetStateKeys.length,
  no_body_detail_stale_representation_exception_keys: noBodyDetailStaleExceptionKeys.length,
  no_body_detail_projection_mismatches: noBodyDetailSummary.plans.reduce((n: number, row: any) => n + (row.non_target_projection_mismatch_count ?? 0), 0)
    + noBodyDetailUnexplainedTargetStateKeys.length,
  projection_mismatches: report.reduce((n, r) => n + (r.projection?.projection_mismatch_count ?? 0), 0),
  mismatch_records: mismatches.length,
  TypeScript_routes_completed: report.filter((r) => !r.error).length,
};
const strictMode = process.argv.includes("--strict");
const unexplainedDifferenceKeys = new Set<string>();
for (const plan of report) {
  for (const ordinal of plan.selection_comparison?.shared_route_selection_mismatch_ordinals ?? []) unexplainedDifferenceKeys.add(`selection:${plan.id}:${ordinal}`);
  for (const ordinal of plan.selection_comparison?.shared_route_target_transition_mismatch_ordinals ?? []) unexplainedDifferenceKeys.add(`target_state:${plan.id}:${ordinal}`);
  if (plan.error) unexplainedDifferenceKeys.add(`route_error:${plan.id}`);
}
for (const mismatch of mismatches) {
  if (mismatch.approved_exception_id) continue;
  if (["python_expected_item_not_asked", "python_forbidden_item_asked", "typescript_expected_item_not_selected", "typescript_forbidden_item_selected"].includes(mismatch.mismatch)
      || ["observation_missing_from_typescript", "observation_extra_in_typescript", "missingness_missing_from_typescript", "missingness_extra_in_typescript",
        "step_missing_from_typescript", "step_extra_in_typescript", "sequence_edge_missing_from_typescript", "sequence_edge_extra_in_typescript",
        "distinctness_projection_mismatch", "episode_projection_mismatch", "target_state_mismatch"].includes(mismatch.mismatch)) {
    unexplainedDifferenceKeys.add(`projection:${mismatch.id}:${mismatch.mismatch}:${mismatch.item}`);
  }
}
for (const failure of pythonFailures) unexplainedDifferenceKeys.add(`python_failure:${failure.id}`);
for (const key of staleExceptionKeys) unexplainedDifferenceKeys.add(`stale_exception:${key}`);
const unsupportedComparisonCount = coverageCounts.unsupported_python_replay_candidate_rows
  + coverageCounts.shared_route_unsupported_python_entry_point_candidate_rows
  + coverageCounts.unsupported_python_entry_point_choice_steps
  + coverageCounts.unsupported_python_entry_point_finish_steps
  + coverageCounts.unsupported_finish_steps
  + coverageCounts.python_binding_control_steps_not_comparable
  + coverageCounts.python_mapping_ready_steps_not_comparable
  + coverageCounts.python_rejection_rows_without_typescript_reason
  + coverageCounts.typescript_rejection_rows_without_python_reason
  + coverageCounts.python_replay_rejection_rows_unsupported
  + coverageCounts.typescript_replay_rejection_rows_unsupported
  + noBodyDetailReports.reduce((sum: number, row: any) => sum
    + (row.replay_operator_rows_unsupported ?? 0) + (row.binding_controls_not_comparable ?? 0)
    + (row.mapping_ready_rows_not_comparable ?? 0), 0)
  + coverageCounts.post_target_transition_steps_missing_collector_data
  + coverageCounts.post_target_transition_steps_unsupported
  + coverageCounts.post_target_entry_point_rows_unsupported
  + coverageCounts.post_target_invalidated_rows_unsupported
  + coverageCounts.post_target_typescript_removed_targets_unsupported;
const unsupportedCoverageReasons = [
  ["python_replay_candidate_rows", coverageCounts.unsupported_python_replay_candidate_rows],
  ["typescript_entry_point_candidates_without_python_equivalent", coverageCounts.shared_route_unsupported_python_entry_point_candidate_rows],
  ["typescript_entry_point_choices_without_python_equivalent", coverageCounts.unsupported_python_entry_point_choice_steps],
  ["typescript_entry_point_finishes_without_python_equivalent", coverageCounts.unsupported_python_entry_point_finish_steps],
  ["other_finish_rows_after_divergence_or_outside_policy", coverageCounts.unsupported_finish_steps],
  ["python_binding_control_steps", coverageCounts.python_binding_control_steps_not_comparable],
  ["python_mapping_ready_steps", coverageCounts.python_mapping_ready_steps_not_comparable],
  ["unmatched_candidate_rejection_rows", coverageCounts.python_rejection_rows_without_typescript_reason + coverageCounts.typescript_rejection_rows_without_python_reason],
  ["python_REPLAY_rejection_rows_without_comparable_selector", coverageCounts.python_replay_rejection_rows_unsupported],
  ["typescript_REPLAY_rejection_rows_without_comparable_selector", coverageCounts.typescript_replay_rejection_rows_unsupported],
  ["separate_no_body_detail_cohort_replay_or_control_gaps", noBodyDetailReports.reduce((sum: number, row: any) => sum
    + (row.replay_operator_rows_unsupported ?? 0) + (row.binding_controls_not_comparable ?? 0) + (row.mapping_ready_rows_not_comparable ?? 0), 0)],
  ["post_target_rows_without_accepted_response_transition", coverageCounts.post_target_transition_steps_unsupported],
  ["post_target_entry_point_pseudo_rows", coverageCounts.post_target_entry_point_rows_unsupported],
].filter(([, count]) => Number(count) > 0).map(([surface, count]) => ({ surface, count }));
const structuralMismatchCount = coverageCounts.observation_projection_mismatches + coverageCounts.missingness_projection_mismatches
  + coverageCounts.step_projection_mismatches + coverageCounts.episode_projection_mismatches
  + coverageCounts.distinctness_projection_mismatches + coverageCounts.sequence_edge_projection_mismatches
  + coverageCounts.no_body_detail_projection_mismatches;
for (const row of d41ExtensionCases as any[]) if (!row.passed) unexplainedDifferenceKeys.add(`d41_contract_case:${row.id}`);
if (!d41ExtensionPinned || !d41ExtensionPassed) unexplainedDifferenceKeys.add("d41_contract_extension_binding_or_required_cases_incomplete");
if (coverageCounts.approved_representation_exception_keys !== 11 || coverageCounts.stale_parity_exception_keys !== 0) unexplainedDifferenceKeys.add("entry_point_representation_exception_scope_changed");
if (!noBodyDetailSummary.d41_opt_out_behavior_verified || noBodyDetailSummary.replayed_plans !== 25) unexplainedDifferenceKeys.add("no_body_detail_cohort_incomplete_or_d41_opt_out_failed");
if (!noBodyDetailExceptionScopeMatches) unexplainedDifferenceKeys.add("no_body_detail_entry_point_exception_scope_changed");
for (const row of noBodyDetailReports as any[]) {
  if (!row.replay_ok) unexplainedDifferenceKeys.add(`no_body_detail_route_error:${row.id}`);
  if ((row.non_target_projection_mismatch_count ?? 0) > 0) unexplainedDifferenceKeys.add(`no_body_detail_projection:${row.id}`);
  for (const ordinal of row.selection_comparison?.shared_route_selection_mismatch_ordinals ?? []) unexplainedDifferenceKeys.add(`no_body_detail_selection:${row.id}:${ordinal}`);
}
for (const key of noBodyDetailUnexplainedTargetStateKeys) unexplainedDifferenceKeys.add(`no_body_detail_target_state:${key}`);
for (const row of report) for (const mismatch of row.selection_comparison?.candidate_rejection_reason_mismatch_examples ?? []) {
  unexplainedDifferenceKeys.add(`rejection_reason:${row.id}:${mismatch.ordinal}:${mismatch.key}`);
}
for (const row of noBodyDetailReports as any[]) for (const ordinal of row.shared_route_selection_mismatch_ordinals ?? []) {
  unexplainedDifferenceKeys.add(`no_body_detail_selection:${row.id}:${ordinal}`);
}
const strictStatus = unexplainedDifferenceKeys.size > 0
  ? "blocked_by_unexplained_differences"
  : unsupportedComparisonCount > 0
    ? "incomplete_unsupported_coverage"
    : "pass_on_full_declared_comparison_surface";
const unexplainedDifferenceCount = unexplainedDifferenceKeys.size;
const structuralMismatchCountFinal = structuralMismatchCount;
const outcome = {
  replay_and_projection_executed_successfully: independent.plans.every((plan) => plan.ok) && coverageCounts.TypeScript_routes_completed === 25,
  structural_observations_matched: structuralMismatchCountFinal === 0,
  target_semantics_matched_on_comparable_targets: coverageCounts.unexplained_target_state_mismatches === 0,
  route_selection_behavior_matched_on_shared_route_prefix: coverageCounts.shared_route_candidate_presence_mismatch_steps === 0
    && coverageCounts.shared_route_candidate_eligibility_mismatch_steps === 0
    && coverageCounts.shared_route_candidate_target_mismatch_steps === 0
    && coverageCounts.shared_route_candidate_priority_mismatch_steps === 0
    && coverageCounts.shared_route_choice_mismatch_steps === 0
    && coverageCounts.shared_route_post_target_transition_mismatch_steps === 0
    && noBodyDetailSummary.shared_route_selection_mismatches === 0
    && noBodyDetailSummary.shared_route_target_transition_mismatches === 0
    && coverageCounts.occurrence_binding_mismatch_steps === 0,
  full_applicable_parity_established: strictStatus === "pass_on_full_declared_comparison_surface",
};
console.log(JSON.stringify({
  audit_status: "completed; not a parity-pass assertion",
  strict_mode: strictMode,
  strict_status: strictStatus,
  strict_unexplained_difference_count: unexplainedDifferenceCount,
  strict_unexplained_difference_keys: [...unexplainedDifferenceKeys].sort(),
  strict_unsupported_comparison_count: unsupportedComparisonCount,
  strict_unsupported_comparison_count_is_unique_rows: false,
  strict_unsupported_comparison_count_note: "This additive total counts unsupported comparison surfaces, not unique rows; the category counts below are the reviewable breakdown and may overlap.",
  strict_unsupported_coverage_reasons: unsupportedCoverageReasons,
  outcome,
  d41_independent_contract_qualification: {
    source_binding_verified: d41ExtensionPinned,
    coverage_status: d41ExtensionPassed ? "passed" : "failed_or_incomplete",
    required_behaviors: ["topic authorization", "actual-episode candidate admission", "tier/priority ordering", "answered response retention", "skip/missingness", "correction supersession"],
    required_cases: [...requiredD41Cases].sort(),
    cases: d41ExtensionCases,
    classification: "independent contract-based qualification; not Python/TypeScript cross-engine parity",
  },
  no_body_detail_cohort: noBodyDetailSummary,
  approved_target_state_exception_ids: [...new Set(mismatches.flatMap((mismatch: any) => mismatch.approved_exception_id ? [mismatch.approved_exception_id] : []))],
  coverage_counts: coverageCounts, python_failures: pythonFailures, mismatches, plans: report,
}, null, 2));
if (strictMode && strictStatus !== "pass_on_full_declared_comparison_surface") process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
