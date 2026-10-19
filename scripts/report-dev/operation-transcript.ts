import Ajv from "ajv";
import { randomUUID } from "node:crypto";
import type { Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import {
  advancePwqe51Session, applyPwqe51ReplayBinding, beginPwqe51Correction, canCompletePwqe51Pass,
  createPwqe51SessionState, endPwqe51Session, pausePwqe51Session, pwqe51FocusChoices,
  renderPwqe51Interaction, resumePwqe51Session, shortenPwqe51Session, startPwqe51Deepening,
  type Pwqe51IdentityFactory, type Pwqe51SessionState,
} from "../../lib/server/assessment/pwqe51-session.ts";
import { assertNoRespondentClassification } from "../../lib/server/reports/content-boundary.ts";
import { canonical, contentHash } from "./source.ts";
import type { AssessmentRecord } from "./assessment.ts";

type AnswerInput = Parameters<typeof advancePwqe51Session>[1];
type BindingInput = Omit<Parameters<typeof applyPwqe51ReplayBinding>[1], "requestSha256">;
type DeepeningContext = Parameters<typeof startPwqe51Deepening>[3];
export type AssessmentOperation =
  | { operation: "create"; input: { initialOptedInTopics?: string[] } }
  | { operation: "answer"; input: AnswerInput & { questionId: string } }
  | { operation: "begin_correction"; input: { responseId: string } }
  | { operation: "pause" | "resume" | "end" | "shorten"; input: Record<string, never> }
  | { operation: "start_deepening"; input: { optedInTopics: readonly string[]; context: DeepeningContext } }
  | { operation: "replay_binding"; input: BindingInput };
export interface AssessmentOperationEntry {
  operation: AssessmentOperation["operation"];
  issued: unknown;
  acceptedInput: AssessmentOperation["input"];
  identities: { kind: "occurrence" | "interaction"; id: string }[];
}

const text = { type: "string", minLength: 1 };
const strings = { type: "array", uniqueItems: true, items: text };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", additionalProperties: false, properties, required });
const identity = { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$" };
const schemas = {
  create: object({ initialOptedInTopics: strings }),
  answer: object({ questionId: text, completionState: { enum: ["COMPLETED", "SKIPPED"] }, responseId: identity,
    selectedOptionIds: strings, status: { enum: ["answered", "none_fit", "not_sure", "no_event", "not_applicable", "skip"] },
    mode: { enum: ["single", "simultaneous", "order_unknown", "ordered"] }, basis: { enum: ["actual_recalled", "reported_typicality"] },
    referentRole: text, supersedesResponseId: identity }, ["questionId", "completionState", "responseId", "selectedOptionIds"]),
  begin_correction: object({ responseId: identity }, ["responseId"]),
  pause: object({}), resume: object({}), end: object({}), shorten: object({}),
  start_deepening: object({ optedInTopics: strings, context: object({ focusOccurrences: strings, details: strings,
    distinctPairs: { type: "array", uniqueItems: true, items: { type: "array", minItems: 2, maxItems: 2, items: text } },
    comparisonDecisions: { type: "array", items: object({ firstOccurrenceId: text, secondOccurrenceId: text,
      relation: { enum: ["different", "same", "cannot_tell"] } }, ["firstOccurrenceId", "secondOccurrenceId", "relation"]) },
  }) }, ["optedInTopics", "context"]),
  replay_binding: object({ decisionId: { type: "string", pattern: "^pwrb_[a-f0-9]{40}$" },
    outcome: { enum: ["different", "same", "unknown", "no_event", "skip"] },
    correctsDecisionId: { type: "string", pattern: "^pwrb_[a-f0-9]{40}$" } }, ["decisionId", "outcome"]),
};
const ajv = new Ajv({ allErrors: true, strict: false });
const validators = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)]));
function parseOperation(value: unknown): AssessmentOperation {
  assertNoRespondentClassification(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid assessment operation.");
  const row = value as Record<string, unknown>, operation = row.operation;
  if (Object.keys(row).some(key => !["operation", "input"].includes(key)) || typeof operation !== "string"
    || !Object.hasOwn(validators, operation) || !validators[operation](row.input)) throw new Error(`Invalid assessment operation input: ${String(operation)}.`);
  return value as AssessmentOperation;
}
function issuedContext(state: Pwqe51SessionState | undefined, source: Pwqe51SourcePackage): unknown {
  if (!state) return null;
  return { pass: state.pass, phase: state.phase, paused: state.paused,
    currentInteraction: state.currentInteraction, interaction: renderPwqe51Interaction(state, source),
    candidate: state.routerResult.next, focusChoices: pwqe51FocusChoices(state),
    correctionTargetResponseId: state.correctionTargetResponseId ?? null,
    replayBindingHistory: state.replayBindingHistory ?? [],
  };
}
function same(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right); }
function requireActive(state: Pwqe51SessionState): void {
  if (state.phase === "finished" || state.paused) throw new Error("Assessment operation requires an active, unpaused session.");
}
/** Apply only public production session operations, including actual issued corrections and replay requests. */
function applyOperation(state: Pwqe51SessionState | undefined, op: AssessmentOperation, source: Pwqe51SourcePackage, ids: Pwqe51IdentityFactory): Pwqe51SessionState {
  if (op.operation === "create") {
    if (state) throw new Error("Assessment creation must be the first operation.");
    return createPwqe51SessionState(source, {}, op.input, ids);
  }
  if (!state) throw new Error("Assessment operation requires session creation.");
  switch (op.operation) {
    case "answer": {
      requireActive(state);
      const { questionId, ...input } = op.input;
      if (state.currentInteraction?.questionId !== questionId) throw new Error("Answer does not match the currently issued question.");
      if (/^(pwi|pwep)_/u.test(input.responseId)) throw new Error("Response identities cannot reuse runtime identity roles.");
      if (input.supersedesResponseId !== undefined && input.supersedesResponseId !== state.correctionTargetResponseId) throw new Error("Correction answer requires its issued correction target.");
      // Missingness must be explicit and cannot conceal options or an episode basis.
      const missing = input.completionState === "SKIPPED" || (input.status !== undefined && input.status !== "answered");
      if (missing && (input.selectedOptionIds.length || input.basis || input.mode && input.mode !== "single")
        || input.completionState === "SKIPPED" && input.status !== undefined && input.status !== "skip") throw new Error("Missingness answer contains conflicting input.");
      return advancePwqe51Session(state, input, source, ids);
    }
    case "begin_correction": requireActive(state); return beginPwqe51Correction(state, op.input.responseId, source, ids);
    case "pause": requireActive(state); return pausePwqe51Session(state);
    case "resume":
      if (!state.paused || state.phase === "finished") throw new Error("Resume requires an issued pause.");
      return resumePwqe51Session(state);
    case "end": requireActive(state); return endPwqe51Session(state, source, ids);
    case "shorten": requireActive(state); return shortenPwqe51Session(state, source, ids);
    case "start_deepening": {
      if (!canCompletePwqe51Pass(state) || state.paused || state.correctionTargetResponseId) throw new Error("Deepening requires a completed Mapping checkpoint.");
      const context = op.input.context ?? {};
      const pairKey = (pair: readonly string[]) => [...pair].sort().join("\0");
      const decisions = context.comparisonDecisions ?? [];
      if (new Set(decisions.map(d => pairKey([d.firstOccurrenceId, d.secondOccurrenceId]))).size !== decisions.length) throw new Error("Comparison decisions contain a duplicate pair.");
      const confirmed = decisions.filter(d => d.relation === "different").map(d => pairKey([d.firstOccurrenceId, d.secondOccurrenceId])).sort();
      if (!same(confirmed, (context.distinctPairs ?? []).map(pairKey).sort())) throw new Error("Distinct pairs must match explicit different comparison decisions.");
      return startPwqe51Deepening(state, op.input.optedInTopics, source, context, ids);
    }
    case "replay_binding": {
      requireActive(state);
      const superseded = new Set((state.replayBindingHistory ?? []).flatMap(d => d.supersedesDecisionId ? [d.supersedesDecisionId] : []));
      const request = op.input.correctsDecisionId
        ? state.replayBindingHistory?.find(d => d.decisionId === op.input.correctsDecisionId && !superseded.has(d.decisionId))
        : state.routerResult.next?.bindingRequest === "confirm_replay_distinctness" ? state.routerResult.next : undefined;
      if (!request) throw new Error("Replay binding requires a current issued request or active correction target.");
      const requestSha256 = contentHash(canonical({ request, outcome: op.input.outcome, correctsDecisionId: op.input.correctsDecisionId ?? null }));
      return applyPwqe51ReplayBinding(state, { ...op.input, requestSha256 }, source, ids);
    }
  }
}

/** A recorder owns its live state; callers submit operations, never completed state. */
export class AssessmentOperationRecorder {
  private live: Pwqe51SessionState | undefined;
  private mappingCheckpoint: Pwqe51SessionState | undefined;
  private entries: AssessmentOperationEntry[] = [];
  private usedIds = new Set<string>();
  constructor(private readonly source: Pwqe51SourcePackage) {}
  get state(): Pwqe51SessionState | undefined { return this.live ? structuredClone(this.live) : undefined; }
  get transcript(): AssessmentOperationEntry[] { return structuredClone(this.entries); }
  issue(value: AssessmentOperation): Pwqe51SessionState {
    const op = parseOperation(value), issued = issuedContext(this.live, this.source);
    const identities: AssessmentOperationEntry["identities"] = [];
    const ids: Pwqe51IdentityFactory = kind => {
      const id = `${kind === "occurrence" ? "pwep" : "pwi"}_${randomUUID()}`;
      identities.push({ kind, id }); return id;
    };
    const next = applyOperation(this.live, op, this.source, ids);
    if (op.operation === "start_deepening") this.mappingCheckpoint = structuredClone(this.live!);
    for (const { id } of identities) {
      if (this.usedIds.has(id)) throw new Error("Duplicate generated assessment identity.");
      this.usedIds.add(id);
    }
    this.entries.push(structuredClone({ operation: op.operation, acceptedInput: op.input, issued, identities }));
    this.live = next;
    return structuredClone(next);
  }
  complete(): AssessmentRecord {
    const mapping = this.mappingCheckpoint, deepening = this.live;
    if (!mapping || !deepening || deepening.pass !== 2 || !canCompletePwqe51Pass(mapping) || !canCompletePwqe51Pass(deepening)
      || deepening.paused || deepening.correctionTargetResponseId) throw new Error("Both operation transcript passes must finish before sealing.");
    const content = { schema: "patternwork-completed-assessment-2" as const, questionSourceSha256: this.source.sourceManifestSha256,
      mapping, deepening, transcript: this.transcript };
    assertNoRespondentClassification(content);
    return { ...content, contentSha256: contentHash(canonical(content)) };
  }
}

/** Exact replay uses only captured server-generated identity slots. No state/answer/source field is rewritten. */
export function assertAssessmentOperations(value: AssessmentRecord, source: Pwqe51SourcePackage): void {
  if (value.schema !== "patternwork-completed-assessment-2" || value.questionSourceSha256 !== source.sourceManifestSha256
    || !Array.isArray(value.transcript) || !value.transcript.length || value.transcript.length > 1200) throw new Error("Invalid assessment operation transcript envelope.");
  assertNoRespondentClassification(value);
  let state: Pwqe51SessionState | undefined, mapping: Pwqe51SessionState | undefined;
  const used = new Set<string>();
  for (const [index, raw] of value.transcript.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid operation transcript entry ${index}.`);
    const entry = raw as AssessmentOperationEntry;
    if (!same(Object.keys(entry).sort(), ["operation", "issued", "acceptedInput", "identities"].sort()) || !Array.isArray(entry.identities)) throw new Error(`Invalid operation transcript fields at ${index}.`);
    const op = parseOperation({ operation: entry.operation, input: entry.acceptedInput });
    if (!same(issuedContext(state, source), entry.issued)) throw new Error(`Issued operation context mismatch at entry ${index}.`);
    let cursor = 0;
    const ids: Pwqe51IdentityFactory = kind => {
      const identity = entry.identities[cursor++];
      const prefix = kind === "occurrence" ? "pwep" : "pwi";
      if (!identity || !same(Object.keys(identity).sort(), ["id", "kind"]) || identity.kind !== kind
        || typeof identity.id !== "string" || !new RegExp(`^${prefix}_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`, "u").test(identity.id)
        || used.has(identity.id)) throw new Error(`Invalid, duplicated, or wrong-role runtime identity at entry ${index}.`);
      used.add(identity.id); return identity.id;
    };
    const next = applyOperation(state, op, source, ids);
    if (cursor !== entry.identities.length) throw new Error(`Unconsumed runtime identities at entry ${index}.`);
    if (op.operation === "start_deepening") {
      if (mapping) throw new Error("Duplicate Mapping checkpoint.");
      mapping = state;
    }
    state = next;
  }
  if (!mapping || !state || mapping.pass !== 1 || state.pass !== 2 || !canCompletePwqe51Pass(mapping) || !canCompletePwqe51Pass(state)
    || state.paused || state.correctionTargetResponseId || !same(mapping, value.mapping) || !same(state, value.deepening)) throw new Error("Assessment operation replay differs from completed pass checkpoints.");
  if (!same(state.responses.slice(0, mapping.responses.length), mapping.responses)) throw new Error("Operation replay lost the Mapping response prefix.");
  const { contentSha256, ...body } = value;
  if (!same(Object.keys(body).sort(), ["schema", "questionSourceSha256", "mapping", "deepening", "transcript"].sort())
    || contentHash(canonical(body)) !== contentSha256) throw new Error("Assessment operation content hash or envelope fields are invalid.");
}
