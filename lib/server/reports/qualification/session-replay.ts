import { sha256 } from "../../security/crypto.ts";
import type { Pwqe51SourcePackage } from "../../../question-engine/pwqe51-source.ts";
import type { Pwqe51CanonicalResponse, Pwqe51RouteCandidate } from "../../assessment/pwqe51-router.ts";
import {
  advancePwqe51Session,
  applyPwqe51ReplayBinding,
  canCompletePwqe51Pass,
  createPwqe51SessionState,
  renderPwqe51Interaction,
  startPwqe51Deepening,
  type Pwqe51ReplayBindingOutcome,
  type Pwqe51SessionState,
} from "../../assessment/pwqe51-session.ts";
import { buildPwqe51RouterPacket } from "../pwqe51-packet.ts";
import { preparePwrp71Request } from "../pwrp71-adapter.ts";
import type { Pwrp71SourcePackage } from "../pwrp71-source.ts";

export type FictionalAnswerProvenance = "original_authored_fictional_response" | "new_synthetic_mapping_response" | "new_fictional_control_outcome";
export interface FictionalResponse extends Pwqe51CanonicalResponse {
  readonly provenance?: FictionalAnswerProvenance;
  readonly sourceRef?: string;
}
export interface FictionalHistoryV2 {
  readonly schemaVersion: "PWQE51-FICTIONAL-HISTORY-V2";
  readonly profile: { readonly id: string };
  readonly source?: Readonly<Record<string, unknown>>;
  readonly responseProvenance?: readonly { readonly responseId: string; readonly origin: string; readonly authoredSourceRef?: string | null; readonly usage?: string; readonly note?: string }[];
  readonly episodes?: readonly { readonly occurrenceId: string; readonly episodeFamily: string; readonly basis: string; readonly origin: string; readonly archivedOccurrenceId?: string }[];
  readonly mappingResponses: readonly FictionalResponse[];
  readonly deepeningResponses: readonly FictionalResponse[];
  readonly topicPermissionEvents?: readonly { readonly topic: string; readonly outcome: string; readonly provenance?: string }[];
  readonly syntheticReferentRoles?: readonly { readonly occurrenceId: string; readonly slot: string; readonly role: string }[];
  readonly originalConfiguredReferentRoles?: readonly { readonly occurrenceId: string; readonly slot: string; readonly role: string }[];
  readonly distinctnessIntents?: readonly { readonly sourceOccurrenceId: string; readonly otherOccurrenceId: string; readonly outcome: string; readonly kind?: string }[];
  readonly comparisonBindingIntents?: readonly { readonly responseId: string; readonly comparisonOccurrenceIds: readonly [string, string] }[];
  readonly intendedDeepeningContext?: { readonly optedInTopics?: readonly string[]; readonly focusTopics?: readonly string[]; readonly details?: readonly string[]; readonly focusOccurrenceId?: string };
  readonly mappingControls?: readonly { readonly kind: string; readonly effectiveBeforeQuestion?: string; readonly occurrenceId?: string; readonly provenance?: string }[];
}

export interface FictionalSessionReplayResult {
  readonly profileId: string;
  readonly state: Pwqe51SessionState;
  readonly occurrenceReferenceToServerId: Readonly<Record<string, string>>;
  readonly submitted: readonly { readonly sourceResponseId: string; readonly runtimeResponseId: string; readonly questionId: string; readonly occurrenceId: string; readonly stepId: string; readonly variantId?: string; readonly selectedOptionIds: readonly string[]; readonly status: string; readonly mode: string; readonly basis?: string; readonly targetIds: readonly string[]; readonly replayOfOccurrenceId?: string; readonly administrationSequence: number; readonly phase: "mapping" | "deepening"; readonly provenance: FictionalAnswerProvenance }[];
  readonly routingTrace: readonly { readonly phase: "mapping" | "deepening"; readonly candidate: Pwqe51RouteCandidate; readonly renderedQuestionId: string; readonly result: "accepted" | "replay_binding" | "diverged"; readonly sourceResponseId?: string; readonly reason?: string }[];
  readonly replayDecisions: readonly { readonly decisionId: string; readonly sourceOccurrenceId: string; readonly replayOccurrenceId?: string; readonly outcome: Pwqe51ReplayBindingOutcome; readonly sourceOccurrenceReference: string }[];
  readonly responseProvenance: readonly { readonly sourceResponseId: string; readonly runtimeResponseId?: string; readonly origin: string; readonly authoredSourceRef?: string | null; readonly usage?: string; readonly accepted: boolean }[];
  readonly episodeRegistry: readonly { readonly fixtureOccurrenceReference: string; readonly serverOccurrenceId?: string; readonly episodeFamily?: string; readonly origin?: string }[];
  readonly missingness: Pwqe51SessionState["routerResult"]["missingness"];
  readonly sequenceGraph: Pwqe51SessionState["routerResult"]["sequenceEdges"];
  readonly finalTargetResolutions: Pwqe51SessionState["routerResult"]["targets"];
  readonly contextDecisions: { readonly optedInTopics: readonly string[]; readonly details: readonly string[]; readonly focusOccurrenceId?: string; readonly focusTopics: readonly string[]; readonly focusTopicsApplied: boolean; readonly reason?: string; readonly distinctness: readonly { readonly sourceReference: string; readonly otherReference: string; readonly outcome: string; readonly status: "applied" | "unavailable"; readonly sourceOccurrenceId?: string; readonly otherOccurrenceId?: string; readonly reason?: string }[]; readonly comparisonBindings: readonly { readonly responseId: string; readonly occurrenceIds: readonly [string, string]; readonly applied: boolean }[] };
  readonly referentRoleBindings: readonly { readonly fixtureOccurrenceReference: string; readonly serverOccurrenceId?: string; readonly slot: string; readonly role: string; readonly origin: string }[];
  readonly fictionalControlHistory: { readonly declaredMappingControls: FictionalHistoryV2["mappingControls"]; readonly runtimeControls: Pwqe51SessionState["controls"]; readonly runtimeMissingness: Pwqe51SessionState["routerResult"]["missingness"] };
  readonly unreachedOriginalAnswers: readonly { readonly responseId: string; readonly questionId: string; readonly occurrenceId: string; readonly classification: "eligible_but_not_reached" | "ineligible_in_current_context" | "intentionally_forbidden" | "source_contract_mismatch" | "implementation_defect"; readonly reason: string }[];
  readonly firstDivergence?: string;
  readonly mappingComplete: boolean;
  readonly deepeningStarted: boolean;
  readonly deepeningComplete: boolean;
  readonly packets: Readonly<Partial<Record<"MAP" | "IFS" | "PV" | "ATT", { readonly packet: Record<string, unknown>; readonly adapterAccepted: boolean; readonly issues: readonly unknown[] }>>>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
const runtimeResponseId = (profileId: string, phase: string, sourceId: string, occurrenceId: string) => `pwr_${sha256(`${profileId}:${phase}:${sourceId}:${occurrenceId}`).slice(0, 40)}`;
const roleFor = (history: FictionalHistoryV2, fixtureOccurrence: string, slot: string) =>
  [...(history.originalConfiguredReferentRoles ?? []), ...(history.syntheticReferentRoles ?? [])]
    .find((role) => role.occurrenceId === fixtureOccurrence && role.slot === slot)?.role;
const responseSlot = (prompt: string) => [...prompt.matchAll(/\{([a-z_]+)\}/gu)].map((match) => match[1]).find((slot) => ["evaluator", "boundary_person", "close_person", "support_person", "repair_person", "conflict_person", "family_person"].includes(slot));

function matches(candidate: Pwqe51RouteCandidate, response: FictionalResponse, occurrence: string | undefined, occurrenceMap: Readonly<Record<string, string>>, source: Pwqe51SourcePackage, expectedComparison?: readonly [string, string]): boolean {
  if (candidate.questionId !== response.questionId || candidate.stepId !== response.stepId || (candidate.variantId ?? "") !== (response.variantId ?? "")) return false;
  if (occurrence && occurrence !== candidate.occurrenceId) return false;
  if (Boolean(response.replayOfOccurrenceId) !== Boolean(candidate.replayOfOccurrenceId)) return false;
  if (response.replayOfOccurrenceId && candidate.replayOfOccurrenceId !== occurrenceMap[response.replayOfOccurrenceId]) return false;
  if (expectedComparison && (!candidate.comparisonIds || [...candidate.comparisonIds].sort().join("\u0000") !== [...expectedComparison].sort().join("\u0000"))) return false;
  if (occurrence) return occurrence === candidate.occurrenceId;
  const expectedFamily = source.questionBank.items.find((question) => question.id === response.questionId)?.episode_family;
  return !!expectedFamily && source.questionBank.items.find((question) => question.id === candidate.questionId)?.episode_family === expectedFamily;
}

/** Drives a fictional v2 profile through the production session lifecycle. */
export function replayFictionalPwqe51Session(input: {
  readonly history: FictionalHistoryV2;
  readonly questionSource: Pwqe51SourcePackage;
  readonly reportSource?: Pwrp71SourcePackage;
  readonly maxAdministrations?: number;
  readonly startDeepening?: boolean;
  /** JSON-safe checkpoint inputs for a deterministic resume. */
  readonly initialState?: Pwqe51SessionState;
  readonly initialOccurrenceReferenceToServerId?: Readonly<Record<string, string>>;
}): FictionalSessionReplayResult {
  const { history, questionSource } = input;
  if (history.schemaVersion !== "PWQE51-FICTIONAL-HISTORY-V2") throw new Error("Unsupported fictional history schema.");
  const max = input.maxAdministrations ?? 160;
  const authoredFocusTopics = history.intendedDeepeningContext?.focusTopics ?? [];
  let state = input.initialState ?? createPwqe51SessionState(questionSource, { focusTopics: [...authoredFocusTopics] });
  const occurrenceMap: Record<string, string> = { ...(input.initialOccurrenceReferenceToServerId ?? {}) };
  const submitted: FictionalSessionReplayResult["submitted"] extends readonly (infer T)[] ? T[] : never = [];
  const trace: FictionalSessionReplayResult["routingTrace"] extends readonly (infer T)[] ? T[] : never = [];
  const replayDecisions: FictionalSessionReplayResult["replayDecisions"] extends readonly (infer T)[] ? T[] : never = [];
  const sourceProvenance = new Map((history.responseProvenance ?? []).map((entry) => [entry.responseId, entry]));
  const sourceContractMismatches = new Map<string, string>();
  let divergence: string | undefined;
  let attempts = 0;

  const drive = (phase: "mapping" | "deepening", rows: readonly FictionalResponse[]) => {
    while (state.phase === phase && attempts < max) {
      attempts += 1;
      const candidate = state.routerResult.next;
      if (!candidate) break;
      if (candidate.bindingRequest === "confirm_replay_distinctness") {
        const sourceRef = Object.entries(occurrenceMap).find(([, runtime]) => runtime === candidate.replayOfOccurrenceId)?.[0];
        const intent = sourceRef ? history.distinctnessIntents?.find((entry) => entry.sourceOccurrenceId === sourceRef
          && ["different", "same", "unknown", "no_event", "skip"].includes(entry.outcome)) : undefined;
        if (!intent) {
          const reason = `Replay request for ${candidate.replayOfOccurrenceId} has no authored distinctness decision.`;
          trace.push({ phase, candidate, renderedQuestionId: candidate.questionId, result: "diverged", reason });
          divergence ??= reason;
          break;
        }
        const outcome = intent.outcome as Pwqe51ReplayBindingOutcome;
        const idempotency = `${history.profile.id}:${sourceRef}:${intent.otherOccurrenceId}:replay`;
        const decisionId = `pwrb_${sha256(`fictional:${idempotency}`).slice(0, 40)}`;
        const requestSha256 = sha256(canonical({ outcome, correctionOfBindingRef: null }));
        state = applyPwqe51ReplayBinding(state, { decisionId, requestSha256, outcome }, questionSource);
        const applied = state.replayBindingHistory?.find((decision) => decision.decisionId === decisionId);
        if (applied?.replayOccurrenceId) occurrenceMap[intent.otherOccurrenceId] = applied.replayOccurrenceId;
        replayDecisions.push({ decisionId, sourceOccurrenceId: applied?.sourceOccurrenceId ?? candidate.replayOfOccurrenceId!, ...(applied?.replayOccurrenceId ? { replayOccurrenceId: applied.replayOccurrenceId } : {}), outcome, sourceOccurrenceReference: sourceRef! });
        trace.push({ phase, candidate, renderedQuestionId: candidate.questionId, result: "replay_binding" });
        continue;
      }
      const rendered = renderPwqe51Interaction(state, questionSource);
      if (!state.currentInteraction || !rendered) break;
      const mapped = occurrenceMap;
      const possible = rows.filter((response) => {
        const intent = history.comparisonBindingIntents?.find((binding) => binding.responseId === response.responseId);
        if (candidate.comparisonIds && ["D56", "D57", "D77"].includes(candidate.questionId) && !intent) return false;
        const expectedComparison = intent?.comparisonOccurrenceIds.map((reference) => mapped[reference]) as [string, string] | undefined;
        if (expectedComparison?.some((occurrenceId) => !occurrenceId)) return false;
        return matches(candidate, response, mapped[response.occurrenceId], mapped, questionSource, expectedComparison);
      });
      let response = possible.find((item) => !state.responses.some((prior) => prior.responseId === runtimeResponseId(history.profile.id, phase, item.responseId, candidate.occurrenceId ?? "")));
      if (!response && phase === "mapping" && candidate.questionId === "M10" && candidate.variantId === "M10.observable") {
        const sourceRow = rows.find((row) => row.questionId === "M10" && row.stepId === candidate.stepId
          && (!mapped[row.occurrenceId] || mapped[row.occurrenceId] === candidate.occurrenceId)
          && (["new_synthetic_mapping_answer", "original_authored_fictional_answer"].includes(sourceProvenance.get(row.responseId)?.origin ?? "")
            || row.provenance === "new_synthetic_mapping_response"));
        const variant = questionSource.questionBank.variants.find((entry) => entry.id === candidate.variantId && entry.replaces === "M10");
        const option = variant?.options[0];
        if (sourceRow && option) {
          const sourceOrigin = sourceProvenance.get(sourceRow.responseId)?.origin ?? "";
          if (sourceOrigin === "original_authored_fictional_answer") {
            sourceContractMismatches.set(sourceRow.responseId, `The authored M10 response selects ${sourceRow.selectedOptionIds?.join(", ") ?? "no option"}, which does not match the router-issued M10.observable variant. The answer is preserved unchanged; a separate synthetic Mapping response completes the structural route.`);
          }
          response = {
            ...sourceRow,
            responseId: `${sourceRow.responseId}-ROUTER-${candidate.variantId}`,
            variantId: candidate.variantId,
            selectedOptionIds: [option.id],
            provenance: "new_synthetic_mapping_response",
            sourceRef: `derived_from:${sourceRow.responseId};router_variant:${candidate.variantId};option:${option.id}`,
          };
        }
      }
      if (!response) {
        const authoredMismatch = phase === "mapping" && candidate.questionId === "M10" && candidate.variantId === "M10.observable"
          ? rows.find((row) => row.questionId === "M10" && row.stepId === candidate.stepId
            && sourceProvenance.get(row.responseId)?.origin === "original_authored_fictional_answer")
          : undefined;
        const reason = authoredMismatch
          ? `Source-contract mismatch: the router issued M10.observable, while original authored response ${authoredMismatch.responseId} selects ${authoredMismatch.selectedOptionIds?.join(", ") ?? "no option"}; the authored response is preserved as unreached.`
          : `Router issued ${candidate.questionId}/${candidate.stepId}${candidate.variantId ? `/${candidate.variantId}` : ""} at ${candidate.occurrenceId}; no matching ${phase} answer with satisfied occurrence, target, and variant prerequisites.`;
        trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "diverged", reason });
        divergence ??= reason;
        break;
      }
      if (!candidate.occurrenceId) break;
      const prior = occurrenceMap[response.occurrenceId];
      if (prior && prior !== candidate.occurrenceId) {
        const reason = `Fixture occurrence ${response.occurrenceId} was already bound to a different server occurrence.`;
        trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "diverged", sourceResponseId: response.responseId, reason });
        divergence ??= reason;
        break;
      }
      occurrenceMap[response.occurrenceId] = candidate.occurrenceId;
      const slot = responseSlot(questionSource.questionBank.items.find((item) => item.id === response.questionId)?.prompt ?? "");
      const referentRole = slot ? roleFor(history, response.occurrenceId, slot) : undefined;
      if (slot && !referentRole) {
        const reason = `Question ${response.questionId} requires a ${slot} role, but fixture occurrence ${response.occurrenceId} has no authored/configured role.`;
        trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "diverged", sourceResponseId: response.responseId, reason });
        divergence ??= reason;
        break;
      }
      const provenance = response.provenance ?? (response.responseId.includes("SYN") ? "new_synthetic_mapping_response" : "original_authored_fictional_response");
      if (phase === "deepening" && provenance === "new_synthetic_mapping_response") {
        const reason = "Synthetic Mapping authorization cannot supply a Deepening answer.";
        trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "diverged", sourceResponseId: response.responseId, reason });
        divergence ??= reason;
        break;
      }
      const id = runtimeResponseId(history.profile.id, phase, response.responseId, candidate.occurrenceId);
      state = advancePwqe51Session(state, {
        completionState: response.status === "skip" ? "SKIPPED" : "COMPLETED",
        responseId: id,
        selectedOptionIds: response.selectedOptionIds ?? [],
        ...(response.status ? { status: response.status } : {}),
        ...(response.mode ? { mode: response.mode } : {}),
        ...(rendered.rootBasisRequired && response.basis ? { basis: response.basis as "actual_recalled" | "reported_typicality" } : {}),
        ...(referentRole ? { referentRole } : {}),
      }, questionSource);
      submitted.push({ sourceResponseId: response.responseId, runtimeResponseId: id, questionId: response.questionId, occurrenceId: candidate.occurrenceId, stepId: candidate.stepId,
        ...(candidate.variantId ? { variantId: candidate.variantId } : {}), selectedOptionIds: response.selectedOptionIds ?? [], status: response.status ?? "answered", mode: response.mode ?? "single",
        ...(rendered.rootBasisRequired && response.basis ? { basis: response.basis } : {}), targetIds: candidate.targetIds, ...(candidate.replayOfOccurrenceId ? { replayOfOccurrenceId: candidate.replayOfOccurrenceId } : {}),
        administrationSequence: state.responses.length, phase, provenance });
      trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "accepted", sourceResponseId: response.responseId });
    }
  };

  drive("mapping", history.mappingResponses);
  const mappingComplete = state.pass === 2 || canCompletePwqe51Pass(state);
  const completedMapping = state.pass === 1 && canCompletePwqe51Pass(state)
    ? { responses: state.responses, routerResult: state.routerResult, controls: state.controls }
    : undefined;
  let deepeningStarted = state.pass === 2;
  let deepeningComplete = state.pass === 2 && canCompletePwqe51Pass(state);
  if (state.pass === 1 && mappingComplete && input.startDeepening !== false) {
    const context = history.intendedDeepeningContext ?? {};
    const focusOccurrence = context.focusOccurrenceId ? occurrenceMap[context.focusOccurrenceId] : undefined;
    const topics = [...new Set([...(context.optedInTopics ?? []), ...(history.topicPermissionEvents ?? []).filter((event) => event.outcome === "opt_in").map((event) => event.topic)])];
    const controlledReplayRefs = new Set((history.distinctnessIntents ?? []).filter((intent) => intent.kind === "controlled_replay").map((intent) => `${intent.sourceOccurrenceId}\u0000${intent.otherOccurrenceId}`));
    const distinctPairs = (history.distinctnessIntents ?? []).flatMap((intent) => {
      const first = occurrenceMap[intent.sourceOccurrenceId];
      const second = occurrenceMap[intent.otherOccurrenceId];
      if (intent.outcome !== "different" || !first || !second || controlledReplayRefs.has(`${intent.sourceOccurrenceId}\u0000${intent.otherOccurrenceId}`)) return [];
      return [[first, second] as const];
    });
    const confirmedPairKeys = new Set([
      ...(state.routerInput.distinctPairs ?? []),
      ...distinctPairs,
    ].map((pair) => [...pair].sort().join("\u0000")));
    const comparisonDecisions = (history.comparisonBindingIntents ?? []).flatMap((intent) => {
      const [firstRef, secondRef] = intent.comparisonOccurrenceIds;
      const first = occurrenceMap[firstRef];
      const second = occurrenceMap[secondRef];
      if (!first || !second || !confirmedPairKeys.has([first, second].sort().join("\u0000"))) return [];
      return [{ firstOccurrenceId: first, secondOccurrenceId: second, relation: "different" as const }];
    });
    state = startPwqe51Deepening(state, topics, questionSource, {
      ...(focusOccurrence ? { focusOccurrences: [focusOccurrence] } : {}),
      ...(context.details ? { details: context.details } : {}),
      distinctPairs,
      comparisonDecisions,
    });
    deepeningStarted = true;
    drive("deepening", history.deepeningResponses);
    deepeningComplete = canCompletePwqe51Pass(state);
  } else if (state.pass === 2 && !deepeningComplete) {
    drive("deepening", history.deepeningResponses);
    deepeningComplete = canCompletePwqe51Pass(state);
  }

  const packets: Partial<Record<"MAP" | "IFS" | "PV" | "ATT", { packet: Record<string, unknown>; adapterAccepted: boolean; issues: readonly unknown[] }>> = {};
  if (mappingComplete && completedMapping) {
    const packet = buildPwqe51RouterPacket({ snapshotId: `fictional-${history.profile.id}-mapping`, responses: completedMapping.responses, routerResult: completedMapping.routerResult, pass: 1, controls: completedMapping.controls, source: questionSource });
    const prepared = input.reportSource ? preparePwrp71Request({ packet: packet as never, reportType: "MAP", questionSource, reportSource: input.reportSource }) : undefined;
    packets.MAP = { packet, adapterAccepted: prepared?.ok ?? false, issues: prepared?.ok === false ? prepared.issues : [] };
  }
  if (deepeningComplete) {
    const packet = buildPwqe51RouterPacket({ snapshotId: `fictional-${history.profile.id}-deepening`, responses: state.responses, routerResult: state.routerResult, pass: 2, controls: state.controls, comparisonDecisions: state.comparisonDecisions, source: questionSource });
    for (const type of ["IFS", "PV", "ATT"] as const) {
      const prepared = input.reportSource ? preparePwrp71Request({ packet: packet as never, reportType: type, questionSource, reportSource: input.reportSource }) : undefined;
      packets[type] = { packet, adapterAccepted: prepared?.ok ?? false, issues: prepared?.ok === false ? prepared.issues : [] };
    }
  }

  const reachedIds = new Set(submitted.map((row) => row.sourceResponseId));
  const provenanceByResponse = sourceProvenance;
  const allSourceAnswers = [...history.mappingResponses, ...history.deepeningResponses];
  const unreachedOriginalAnswers = allSourceAnswers
    .filter((response) => !reachedIds.has(response.responseId)
      && !provenanceByResponse.get(response.responseId)?.origin.includes("synthetic_mapping_answer")
      && response.provenance !== "new_synthetic_mapping_response")
    .map((response) => {
      const rejected = state.routerResult.rejectedCandidates.find((candidate) => candidate.questionId === response.questionId);
      const phase = history.mappingResponses.some((entry) => entry.responseId === response.responseId) ? "mapping" : "deepening";
      const runtimeOccurrence = occurrenceMap[response.occurrenceId];
      const phaseRouterResult = phase === "mapping" && completedMapping ? completedMapping.routerResult : state.routerResult;
      const issued = trace.find((entry) => entry.phase === phase && entry.candidate.questionId === response.questionId
        && (!runtimeOccurrence || entry.candidate.occurrenceId === runtimeOccurrence));
      const comparisonIntent = history.comparisonBindingIntents?.find((intent) => intent.responseId === response.responseId);
      const expectedComparison = comparisonIntent?.comparisonOccurrenceIds.map((reference) => occurrenceMap[reference]) as [string, string] | undefined;
      const validUnreached = !!runtimeOccurrence && !expectedComparison?.some((occurrenceId) => !occurrenceId)
        && phaseRouterResult.candidates.some((candidate) => {
          if (candidate.comparisonIds && ["D56", "D57", "D77"].includes(response.questionId) && !comparisonIntent) return false;
          return matches(candidate, response, runtimeOccurrence, occurrenceMap, questionSource, expectedComparison);
        });
      const mismatch = sourceContractMismatches.has(response.responseId)
        || (response.questionId === "M10" && state.routerResult.next?.questionId === "M10" && state.routerResult.next.variantId === "M10.observable"
          && sourceProvenance.get(response.responseId)?.origin === "original_authored_fictional_answer");
      const forbidden = history.mappingControls?.some((control) => /forbidden|do_not_administer|exclude/iu.test(control.kind)
        && (control as { questionId?: string }).questionId === response.questionId) ?? false;
      const classification = forbidden ? "intentionally_forbidden" as const
        : mismatch ? "source_contract_mismatch" as const
          : validUnreached ? "eligible_but_not_reached" as const
            : "ineligible_in_current_context" as const;
      return { responseId: response.responseId, questionId: response.questionId, occurrenceId: response.occurrenceId, classification,
        reason: forbidden ? "The source fixture explicitly marks this question forbidden in the current route."
          : mismatch ? (sourceContractMismatches.get(response.responseId) ?? divergence ?? "The router-selected M10.observable variant does not contain the original authored option.")
            : validUnreached ? "This authored answer matches a server-eligible candidate for the correct occurrence, but the router ranked another candidate first before the replay stopped."
              : rejected?.reason ?? (divergence ?? (issued ? "The emitted question did not match the authored occurrence, step, variant, or replay parent binding." : runtimeOccurrence ? "No route-issued candidate or explicit eligible decision supports administering this authored response in the current context." : "The fixture occurrence has no server-issued counterpart in the current session context.")) };
    });
  const responseProvenance = allSourceAnswers.map((response) => {
    const entry = provenanceByResponse.get(response.responseId);
    const origin = entry?.origin ?? response.provenance ?? (response.responseId.includes("SYN") ? "new_synthetic_mapping_answer" : "original_authored_fictional_answer");
    return { sourceResponseId: response.responseId, ...(submitted.find((answer) => answer.sourceResponseId === response.responseId) ? { runtimeResponseId: submitted.find((answer) => answer.sourceResponseId === response.responseId)!.runtimeResponseId } : {}), origin, ...(entry && "authoredSourceRef" in entry ? { authoredSourceRef: entry.authoredSourceRef } : {}), ...(entry?.usage ? { usage: entry.usage } : {}), accepted: reachedIds.has(response.responseId) };
  });
  for (const answer of submitted.filter((entry) => entry.sourceResponseId.includes("-ROUTER-M10.observable"))) {
    responseProvenance.push({ sourceResponseId: answer.sourceResponseId, runtimeResponseId: answer.runtimeResponseId, origin: "new_synthetic_mapping_answer_variant_completion", authoredSourceRef: answer.sourceResponseId.split("-ROUTER-")[0] ?? null, usage: "structural_full_session_scaffold_only", accepted: true });
  }
  const episodeRegistry = (history.episodes ?? []).map((episode) => ({ fixtureOccurrenceReference: episode.occurrenceId, ...(occurrenceMap[episode.occurrenceId] ? { serverOccurrenceId: occurrenceMap[episode.occurrenceId] } : {}), episodeFamily: episode.episodeFamily, origin: episode.origin }));
  const context = history.intendedDeepeningContext ?? {};
  const decisionPairs = new Set((state.routerInput.distinctPairs ?? []).map((pair) => [...pair].sort().join("\u0000")));
  const contextDecisions = {
    optedInTopics: [...new Set([...(context.optedInTopics ?? []), ...(history.topicPermissionEvents ?? []).filter((event) => event.outcome === "opt_in").map((event) => event.topic)])],
    details: [...(context.details ?? [])], ...(context.focusOccurrenceId ? { focusOccurrenceId: context.focusOccurrenceId } : {}),
    focusTopics: [...(context.focusTopics ?? [])],
    focusTopicsApplied: (state.routerInput.focusTopics ?? []).length === (context.focusTopics ?? []).length
      && (context.focusTopics ?? []).every((topic) => (state.routerInput.focusTopics ?? []).includes(topic)),
    ...((context.focusTopics?.length ?? 0) > 0 && !(context.focusTopics ?? []).every((topic) => (state.routerInput.focusTopics ?? []).includes(topic))
      ? { reason: "An authored focus topic was not present in the production session router input." } : {}),
    distinctness: (history.distinctnessIntents ?? []).map((intent) => {
      const first = occurrenceMap[intent.sourceOccurrenceId];
      const second = occurrenceMap[intent.otherOccurrenceId];
      const controlled = replayDecisions.some((decision) => decision.sourceOccurrenceReference === intent.sourceOccurrenceId && decision.outcome === intent.outcome);
      const applied = controlled || (!!first && !!second && decisionPairs.has([first, second].sort().join("\u0000")));
      return { sourceReference: intent.sourceOccurrenceId, otherReference: intent.otherOccurrenceId, outcome: intent.outcome, status: applied ? "applied" as const : "unavailable" as const,
        ...(first ? { sourceOccurrenceId: first } : {}), ...(second ? { otherOccurrenceId: second } : {}),
        ...(!applied ? { reason: first && second ? "The intended pair was not passed through the current production distinctness binding." : "The production session could not bind both fixture references to server-issued occurrences when the pass context was established." } : {}) };
    }),
    comparisonBindings: (history.comparisonBindingIntents ?? []).map((intent) => {
      const [firstRef, secondRef] = intent.comparisonOccurrenceIds;
      const first = occurrenceMap[firstRef];
      const second = occurrenceMap[secondRef];
      return { responseId: intent.responseId, occurrenceIds: [first ?? firstRef, second ?? secondRef] as [string, string], applied: !!first && !!second && decisionPairs.has([first, second].sort().join("\u0000")) };
    }),
  };
  const referentRoleBindings = [...(history.originalConfiguredReferentRoles ?? []), ...(history.syntheticReferentRoles ?? [])].map((entry) => ({
    fixtureOccurrenceReference: entry.occurrenceId, ...(occurrenceMap[entry.occurrenceId] ? { serverOccurrenceId: occurrenceMap[entry.occurrenceId] } : {}), slot: entry.slot, role: entry.role,
    origin: (entry as { origin?: string }).origin ?? "unspecified_fixture_configuration",
  }));

  return { profileId: history.profile.id, state, occurrenceReferenceToServerId: occurrenceMap, submitted, routingTrace: trace, replayDecisions, responseProvenance, episodeRegistry,
    missingness: state.routerResult.missingness, sequenceGraph: state.routerResult.sequenceEdges, finalTargetResolutions: state.routerResult.targets, contextDecisions, referentRoleBindings,
    fictionalControlHistory: { declaredMappingControls: history.mappingControls ?? [], runtimeControls: state.controls, runtimeMissingness: state.routerResult.missingness },
    unreachedOriginalAnswers, ...(divergence ? { firstDivergence: divergence } : {}), mappingComplete, deepeningStarted, deepeningComplete, packets };
}
