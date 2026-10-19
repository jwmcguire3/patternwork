import { assertAssessmentOperations } from "./operation-transcript.ts";
import type { Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { compilePwqe51Route } from "../../lib/server/assessment/pwqe51-router.ts";
import { isPwqe51SessionState } from "../../lib/server/assessment/pwqe51-session.ts";
import type { AssessmentRecord } from "./assessment.ts";
import { canonical } from "./source.ts";

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const equal = (left: unknown, right: unknown) => canonical(left) === canonical(right);

/** Replay the recorded route; a self-consistent file hash alone is not administration evidence. */
export function assertAssessmentRoute(value: AssessmentRecord, source: Pwqe51SourcePackage): void {
  if (value.schema === "patternwork-completed-assessment-2") { assertAssessmentOperations(value, source); return; }
  if (value.questionSourceSha256 !== source.sourceManifestSha256 || !isPwqe51SessionState(value.mapping) || !isPwqe51SessionState(value.deepening)) {
    throw new Error("Assessment question-source or state schema is invalid.");
  }
  const { mapping, deepening, transcript } = value;
  for (const state of [mapping, deepening]) {
    if (!Array.isArray(state.responses) || state.sourceRelease !== source.questionBank.release || state.phase !== "finished"
      || state.currentInteraction !== null || state.paused || state.correctionTargetResponseId
      || !Array.isArray(state.controls) || state.controls.length || (state.replayBindingHistory?.length ?? 0)
      || (state.comparisonDecisions?.length ?? 0)) throw new Error("Assessment contains incomplete state or unrecorded control/correction decisions.");
    const allowed = state.pass === 1 ? ["episodeLinks"] : ["episodeLinks", "focusOccurrences", "details", "distinctPairs"];
    if (Object.keys(record(state.routerInput)).some(key => !allowed.includes(key)) || (state.routerInput.distinctPairs?.length ?? 0)) {
      throw new Error("Assessment contains router controls that this answer-plan transcript cannot substantiate.");
    }
    const rebuilt = compilePwqe51Route({ ...state.routerInput, responses: state.responses, phase: state.pass === 1 ? "mapping" : "deepening",
      controls: state.controls, occurrenceBindings: state.occurrenceBindings, optedInTopics: state.optedInTopics }, source);
    if (!equal(rebuilt, state.routerResult) || rebuilt.invalidatedResponses.length) throw new Error("Assessment router result differs from its canonical response replay.");
  }
  if (mapping.pass !== 1 || deepening.pass !== 2 || !equal(deepening.responses.slice(0, mapping.responses.length), mapping.responses)
    || !Array.isArray(transcript) || transcript.length !== deepening.responses.length) throw new Error("Assessment pass prefix or transcript length is invalid.");
  const ids = new Set<string>();
  for (const [index, response] of deepening.responses.entries()) {
    if (ids.has(response.responseId)) throw new Error(`Duplicate response identity at transcript entry ${index}.`);
    ids.add(response.responseId);
    const state = index < mapping.responses.length ? mapping : deepening;
    const entry = record(transcript[index]), issued = record(entry.issued), input = record(entry.acceptedInput);
    const expectedStatus = input.completionState === "SKIPPED" ? "skip" : input.status ?? "answered";
    if (!["COMPLETED", "SKIPPED"].includes(String(input.completionState)) || input.responseId !== response.responseId
      || issued.questionId !== response.questionId || issued.stepId !== response.stepId || issued.pass !== state.pass
      || issued.administrationSequence !== index + 1 || response.status !== expectedStatus
      || !equal(input.selectedOptionIds, response.selectedOptionIds)) throw new Error(`Assessment transcript/answer mismatch at entry ${index}.`);
    const route = compilePwqe51Route({ ...state.routerInput, responses: deepening.responses.slice(0, index),
      phase: state.pass === 1 ? "mapping" : "deepening", controls: [], occurrenceBindings: state.occurrenceBindings,
      optedInTopics: state.optedInTopics }, source);
    const next = route.next;
    if (!next || next.bindingRequest || next.questionId !== response.questionId || next.occurrenceId !== response.occurrenceId
      || next.stepId !== response.stepId || (next.variantId ?? null) !== (response.variantId ?? null)
      || !equal(next.targetIds ?? [], response.targetIds ?? [])) throw new Error(`Question was not issued at transcript entry ${index}: ${response.questionId}.`);
  }
}
