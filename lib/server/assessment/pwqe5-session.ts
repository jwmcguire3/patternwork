import { randomUUID } from "node:crypto";
import type { Pwqe5Question, Pwqe5SourcePackage } from "../../question-engine/pwqe5-source.ts";
import {
  compilePwqe5Route,
  type Pwqe5CanonicalResponse,
  type Pwqe5RouterInput,
  type Pwqe5RouterResult,
} from "./pwqe5-router.ts";

export const PWQE5_SESSION_SCHEMA = "PWQE5-AS-1" as const;

export interface Pwqe5CurrentInteraction {
  readonly interactionInstanceId: string;
  readonly questionId: string;
  readonly occurrenceId: string;
  readonly stepId: string;
  readonly variantId?: string;
}

export interface Pwqe5SessionState {
  readonly schemaVersion: typeof PWQE5_SESSION_SCHEMA;
  readonly sourceRelease: string;
  readonly promptRelease: string;
  readonly pass: 1 | 2;
  readonly phase: "mapping" | "deepening" | "finished";
  readonly paused: boolean;
  readonly correctionTargetResponseId?: string;
  readonly responses: readonly Pwqe5CanonicalResponse[];
  readonly occurrenceBindings: Readonly<Record<string, string>>;
  readonly optedInTopics: readonly string[];
  readonly controls: readonly ("end" | "shorten")[];
  readonly routerResult: Pwqe5RouterResult;
  readonly currentInteraction: Pwqe5CurrentInteraction | null;
};

export interface Pwqe5RenderedInteraction {
  readonly interactionInstanceId: string;
  readonly questionId: string;
  readonly bankItemId: string;
  readonly bankItemVersion: string;
  readonly family: "PWQE5";
  readonly stage: "mapping" | "deepening";
  readonly pass: 1 | 2;
  readonly administrationSequence: number;
  readonly title: string;
  readonly prompt: string;
  readonly context: string;
  readonly episodeFamily: string;
  readonly selection: Readonly<Record<string, unknown>>;
  readonly responseControls: readonly { readonly id: string; readonly text: string }[];
  readonly options: readonly { readonly id: string; readonly label: string; readonly exclusive: boolean }[];
}

function canonicalRouteInput(state: Pick<Pwqe5SessionState, "pass" | "responses" | "phase" | "controls" | "optedInTopics" | "occurrenceBindings">): Pwqe5RouterInput {
  return {
    responses: state.responses,
    phase: state.phase === "finished" ? (state.pass === 1 ? "mapping" : "deepening") : state.phase,
    controls: state.controls,
    optedInTopics: state.optedInTopics,
    occurrenceBindings: state.occurrenceBindings,
  };
}

/** Replays the whole answer history and allocates any newly requested episode binding on the server. */
function compileBoundRoute(input: Pwqe5RouterInput, source: Pwqe5SourcePackage): {
  readonly result: Pwqe5RouterResult;
  readonly occurrenceBindings: Readonly<Record<string, string>>;
} {
  let occurrenceBindings = { ...(input.occurrenceBindings ?? {}) };
  let result = compilePwqe5Route({ ...input, occurrenceBindings }, source);
  for (let count = 0; count < 8; count += 1) {
    const candidate = result.next;
    if (!candidate?.bindingRequest) return { result, occurrenceBindings };
    if (candidate.bindingRequest !== "new_actual_occurrence" || !candidate.bindingKey) {
      throw new Error("PWQE 5 router requested an invalid episode binding.");
    }
    if (occurrenceBindings[candidate.bindingKey]) {
      throw new Error("PWQE 5 router returned an unbound occurrence that already has a server binding.");
    }
    occurrenceBindings = {
      ...occurrenceBindings,
      [candidate.bindingKey]: `pwep_${randomUUID()}`,
    };
    result = compilePwqe5Route({ ...input, occurrenceBindings }, source);
  }
  throw new Error("PWQE 5 router exceeded the per-transition episode-binding limit.");
}

function currentFor(
  route: Pwqe5RouterResult,
  prior: Pwqe5CurrentInteraction | null,
): Pwqe5CurrentInteraction | null {
  const candidate = route.next;
  if (!candidate) return null;
  if (!candidate.occurrenceId || candidate.bindingRequest) throw new Error("PWQE 5 candidate was not bound to a server-owned occurrence.");
  if (prior && prior.questionId === candidate.questionId && prior.occurrenceId === candidate.occurrenceId && prior.stepId === candidate.stepId && prior.variantId === candidate.variantId) return prior;
  return {
    interactionInstanceId: `pwi_${randomUUID()}`,
    questionId: candidate.questionId,
    occurrenceId: candidate.occurrenceId,
    stepId: candidate.stepId,
    ...(candidate.variantId ? { variantId: candidate.variantId } : {}),
  };
}

function stageForPass(pass: 1 | 2): "mapping" | "deepening" {
  return pass === 1 ? "mapping" : "deepening";
}

export function createPwqe5SessionState(source: Pwqe5SourcePackage): Pwqe5SessionState {
  const partial = {
    schemaVersion: PWQE5_SESSION_SCHEMA,
    sourceRelease: source.questionBank.release,
    promptRelease: source.manifest.promptRelease,
    pass: 1 as const,
    phase: "mapping" as const,
    paused: false,
    responses: [] as Pwqe5CanonicalResponse[],
    occurrenceBindings: {} as Readonly<Record<string, string>>,
    optedInTopics: [] as string[],
    controls: [] as ("end" | "shorten")[],
  };
  const compiled = compileBoundRoute({ responses: [], phase: "mapping", occurrenceBindings: {} }, source);
  const currentInteraction = currentFor(compiled.result, null);
  return { ...partial, occurrenceBindings: compiled.occurrenceBindings, routerResult: compiled.result, currentInteraction };
}

export function isPwqe5SessionState(value: unknown): value is Pwqe5SessionState {
  return typeof value === "object" && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === PWQE5_SESSION_SCHEMA;
}

export function getPwqe5Question(source: Pwqe5SourcePackage, questionId: string): Pwqe5Question {
  const question = source.questionBank.items.find((item) => item.id === questionId);
  if (!question) throw new Error(`PWQE 5 question ${questionId} is not present in the pinned source release.`);
  return question;
}

export function renderPwqe5Interaction(
  state: Pwqe5SessionState,
  source: Pwqe5SourcePackage,
): Pwqe5RenderedInteraction | null {
  const current = state.currentInteraction;
  if (!current) return null;
  const question = getPwqe5Question(source, current.questionId);
  const context = typeof question.context === "string" ? question.context : String(question.episode_family ?? "reflection");
  const episodeFamily = typeof question.episode_family === "string" ? question.episode_family : context;
  const variant = current.variantId ? source.questionBank.variants.find((candidate) => candidate.id === current.variantId) : undefined;
  const options = variant?.replaces === question.id ? variant.options : question.options;
  const controlText = new Map(source.questionBank.common_response_controls.map((control) => [control.id, control.text]));
  return {
    interactionInstanceId: current.interactionInstanceId,
    questionId: current.questionId,
    bankItemId: question.id,
    bankItemVersion: question.version,
    family: "PWQE5",
    stage: question.stage,
    pass: state.pass,
    administrationSequence: state.responses.length + 1,
    title: question.title,
    prompt: variant?.replaces === question.id ? variant.prompt : question.prompt,
    context,
    episodeFamily,
    selection: typeof question.selection === "object" && question.selection !== null && !Array.isArray(question.selection)
      ? question.selection as Readonly<Record<string, unknown>>
      : {},
    responseControls: question.response_controls.map((id) => ({ id, text: controlText.get(id) ?? id })),
    options: options.map((option) => ({ id: option.id, label: option.text, exclusive: option.exclusive === true })),
  };
}

export function advancePwqe5Session(
  state: Pwqe5SessionState,
  input: {
    readonly completionState: "COMPLETED" | "SKIPPED";
    readonly responseId: string;
    readonly selectedOptionIds: readonly string[];
    readonly status?: Pwqe5CanonicalResponse["status"];
    readonly mode?: Pwqe5CanonicalResponse["mode"];
    readonly supersedesResponseId?: string;
  },
  source: Pwqe5SourcePackage,
): Pwqe5SessionState {
  if (state.paused || state.phase === "finished" || !state.currentInteraction) throw new Error("PWQE 5 session is not accepting an answer.");
  const current = state.currentInteraction;
  const status = input.completionState === "SKIPPED" ? "skip" : input.status ?? "answered";
  const selectedOptionIds = status === "answered" ? [...input.selectedOptionIds] : [];
  const supersedesResponseId = input.supersedesResponseId ?? state.correctionTargetResponseId;
  const response: Pwqe5CanonicalResponse = {
    responseId: input.responseId,
    questionId: current.questionId,
    occurrenceId: current.occurrenceId,
    stepId: current.stepId,
    selectedOptionIds,
    status,
    mode: status === "answered" ? input.mode ?? "single" : "single",
    ...(current.variantId ? { variantId: current.variantId } : {}),
    ...(supersedesResponseId ? { supersedesResponseId } : {}),
  };
  const responses = [...state.responses, response];
  const partial = { ...state, responses };
  const compiled = compileBoundRoute(canonicalRouteInput(partial), source);
  const currentInteraction = currentFor(compiled.result, null);
  return {
    ...partial,
    occurrenceBindings: compiled.occurrenceBindings,
    routerResult: compiled.result,
    phase: compiled.result.phase,
    currentInteraction,
    correctionTargetResponseId: undefined,
  };
}

/** Opens a server-bound edit of one still-active canonical response. */
export function beginPwqe5Correction(
  state: Pwqe5SessionState,
  responseId: string,
  source: Pwqe5SourcePackage,
): Pwqe5SessionState {
  if (state.paused || state.phase === "finished") throw new Error("PWQE 5 session is not accepting a correction.");
  const superseded = new Set(state.responses.flatMap((response) => response.supersedesResponseId ? [response.supersedesResponseId] : []));
  const target = state.responses.find((response) => response.responseId === responseId && !superseded.has(response.responseId));
  if (!target) throw new Error("PWQE 5 correction target is not an active response in this session.");
  if (state.correctionTargetResponseId === responseId && state.currentInteraction?.questionId === target.questionId) return state;
  getPwqe5Question(source, target.questionId);
  return {
    ...state,
    correctionTargetResponseId: target.responseId,
    currentInteraction: {
      interactionInstanceId: `pwi_${randomUUID()}`,
      questionId: target.questionId,
      occurrenceId: target.occurrenceId,
      stepId: target.stepId ?? "first",
      ...(target.variantId ? { variantId: target.variantId } : {}),
    },
  };
}

export function endPwqe5Session(state: Pwqe5SessionState, source: Pwqe5SourcePackage): Pwqe5SessionState {
  const controls = [...new Set([...state.controls, "end" as const])];
  const compiled = compileBoundRoute(canonicalRouteInput({ ...state, controls }), source);
  return { ...state, controls, phase: compiled.result.phase, routerResult: compiled.result, currentInteraction: null, occurrenceBindings: compiled.occurrenceBindings };
}

/** Applies the respondent's explicit request to remove optional deepening candidates. */
export function shortenPwqe5Session(state: Pwqe5SessionState, source: Pwqe5SourcePackage): Pwqe5SessionState {
  if (state.pass !== 2 || state.phase === "finished") throw new Error("PWQE 5 can only shorten an active Deepening pass.");
  const controls = [...new Set([...state.controls, "shorten" as const])];
  const compiled = compileBoundRoute(canonicalRouteInput({ ...state, controls }), source);
  const currentInteraction = currentFor(compiled.result, state.currentInteraction);
  return { ...state, controls, phase: compiled.result.phase, routerResult: compiled.result, currentInteraction, occurrenceBindings: compiled.occurrenceBindings };
}

export function pausePwqe5Session(state: Pwqe5SessionState, paused: boolean): Pwqe5SessionState {
  return { ...state, paused };
}

export function startPwqe5Deepening(
  state: Pwqe5SessionState,
  optedInTopics: readonly string[],
  source: Pwqe5SourcePackage,
): Pwqe5SessionState {
  if (state.pass !== 1 || state.phase !== "finished") throw new Error("PWQE 5 Mapping must be complete before Deepening starts.");
  const nextBase = {
    ...state,
    pass: 2 as const,
    phase: "deepening" as const,
    paused: false,
    optedInTopics: [...new Set(optedInTopics)],
    controls: [] as ("end" | "shorten")[],
  };
  const compiled = compileBoundRoute(canonicalRouteInput(nextBase), source);
  const currentInteraction = currentFor(compiled.result, null);
  return {
    ...nextBase,
    occurrenceBindings: compiled.occurrenceBindings,
    routerResult: compiled.result,
    phase: compiled.result.phase,
    currentInteraction,
  };
}

export function canCompletePwqe5Pass(state: Pwqe5SessionState): boolean {
  return state.phase === "finished" && state.routerResult.phase === "finished";
}

export function pwqe5StageForState(state: Pwqe5SessionState): string {
  return stageForPass(state.pass);
}
