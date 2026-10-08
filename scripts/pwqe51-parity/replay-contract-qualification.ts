import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadPwqe51SourcePackage, type Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import {
  advancePwqe51Session,
  applyPwqe51ReplayBinding,
  beginPwqe51Correction,
  createPwqe51SessionState,
  endPwqe51Session,
  pausePwqe51Session,
  renderPwqe51Interaction,
  resumePwqe51Session,
  startPwqe51Deepening,
  type Pwqe51SessionState,
} from "../../lib/server/assessment/pwqe51-session.ts";

interface C07Fixture {
  readonly id: string;
  readonly config: {
    readonly topics: readonly string[];
    readonly details: readonly string[];
    readonly people?: Readonly<Record<string, string>>;
    readonly referents?: Readonly<Record<string, string>>;
  };
  readonly answers: Readonly<Record<string, readonly { readonly selected: readonly string[] }[]>>;
  readonly episode_bindings: readonly {
    readonly item_id: string;
    readonly answer_index: number;
    readonly source_item_id: string;
    readonly source_answer_index: number;
    readonly outcome: string;
    readonly relation: string;
    readonly justification: string;
  }[];
}

interface QualificationCase {
  readonly id: string;
  readonly passed: boolean;
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly error?: string;
}

function fixtureAnswer(plan: C07Fixture, used: Map<string, number>, questionId: string): readonly string[] | undefined {
  const index = used.get(questionId) ?? 0;
  const answer = plan.answers[questionId]?.[index];
  if (!answer) return undefined;
  used.set(questionId, index + 1);
  return answer.selected;
}

function fixtureRole(plan: C07Fixture, source: Pwqe51SourcePackage, questionId: string, roleOptions: readonly { readonly id: string }[] | undefined): string | undefined {
  if (!roleOptions?.length) return undefined;
  const prompt = source.questionBank.items.find((question) => question.id === questionId)?.prompt ?? "";
  const slot = prompt.match(/\{([a-z_]+)\}/u)?.[1];
  const personId = slot ? plan.config.referents?.[slot] : undefined;
  const authoredRole = personId ? plan.config.people?.[personId] : undefined;
  return roleOptions.find((option) => option.id === authoredRole)?.id
    ?? roleOptions.find((option) => option.id !== "no_other_person")?.id;
}

function answerCurrent(
  state: Pwqe51SessionState,
  source: Pwqe51SourcePackage,
  plan: C07Fixture,
  used: Map<string, number>,
  responseIndex: number,
): Pwqe51SessionState {
  const current = state.currentInteraction;
  assert.ok(current, "the router must issue a current interaction before an answer");
  const rendered = renderPwqe51Interaction(state, source);
  assert.ok(rendered);
  const selectedOptionIds = fixtureAnswer(plan, used, current.questionId);
  const referentRole = fixtureRole(plan, source, current.questionId, rendered.referentRoleOptions);
  if (!selectedOptionIds) {
    return advancePwqe51Session(state, {
      responseId: `pwqe51-c07-qualification-${responseIndex}`,
      completionState: "SKIPPED",
      selectedOptionIds: [],
      status: "skip",
      ...(referentRole ? { referentRole } : {}),
    }, source);
  }
  return advancePwqe51Session(state, {
    responseId: `pwqe51-c07-qualification-${responseIndex}`,
    completionState: "COMPLETED",
    selectedOptionIds,
    ...(rendered.rootBasisRequired ? { basis: "actual_recalled" as const } : {}),
    ...(referentRole ? { referentRole } : {}),
  }, source);
}

async function loadC07(workspaceRoot: string): Promise<{ readonly plan: C07Fixture; readonly sha256: string }> {
  const raw = await readFile(path.join(workspaceRoot, "specs/patternwork/question-engine-v5.1/qualification/coverage/FICTIONAL_PLANS.json"));
  const document = JSON.parse(raw.toString("utf8")) as { readonly plans: readonly C07Fixture[] };
  const plan = document.plans.find((candidate) => candidate.id === "C07");
  assert.ok(plan, "the original C07 fixture must remain available");
  assert.ok(plan.episode_bindings.some((binding) => binding.item_id === "M02" && binding.answer_index === 1
    && binding.source_item_id === "M02" && binding.source_answer_index === 0 && binding.outcome === "confirm"
    && binding.relation === "different" && binding.justification.trim()), "the second actual occasion and its distinctness must be independently authored");
  return { plan, sha256: createHash("sha256").update(raw).digest("hex") };
}

async function reachC07ReplayRequest(source: Pwqe51SourcePackage, plan: C07Fixture): Promise<{
  readonly state: Pwqe51SessionState;
  readonly used: Map<string, number>;
  readonly firstOccurrenceId: string;
  readonly responseIndex: number;
}> {
  let state = createPwqe51SessionState(source);
  const used = new Map<string, number>();
  let responseIndex = 0;
  for (let attempts = 0; attempts < 24 && !state.responses.some((response) => response.questionId === "M03" && response.status === "answered"); attempts += 1) {
    state = answerCurrent(state, source, plan, used, responseIndex++);
  }
  const firstRoot = state.responses.find((response) => response.questionId === "M02" && response.status === "answered");
  const firstAim = state.responses.find((response) => response.questionId === "M03" && response.status === "answered");
  assert.ok(firstRoot, "the ordinary Mapping route must admit C07's authored M02 root");
  assert.ok(firstAim, "the ordinary Mapping route must administer the attached M03");
  state = endPwqe51Session(state, source);
  state = startPwqe51Deepening(state, plan.config.topics, source, {
    focusOccurrences: [firstRoot.occurrenceId],
    details: plan.config.details,
  });
  for (let attempts = 0; attempts < 24 && state.routerResult.next?.bindingRequest !== "confirm_replay_distinctness"; attempts += 1) {
    state = answerCurrent(state, source, plan, used, responseIndex++);
  }
  assert.equal(state.routerResult.next?.bindingRequest, "confirm_replay_distinctness");
  assert.equal(state.currentInteraction, null, "the replay root must not render before an explicit distinctness decision");
  return { state, used, firstOccurrenceId: firstRoot.occurrenceId, responseIndex };
}

export async function runPwqe51ReplayContractQualification(workspaceRoot = process.cwd()) {
  const source = await loadPwqe51SourcePackage(workspaceRoot);
  const { plan, sha256: fixtureSha256 } = await loadC07(workspaceRoot);
  const cases: QualificationCase[] = [];
  const check = (id: string, run: () => Readonly<Record<string, unknown>>) => {
    try { cases.push({ id, passed: true, evidence: run() }); }
    catch (error) { cases.push({ id, passed: false, error: error instanceof Error ? error.message : String(error) }); }
  };

  let pending: Awaited<ReturnType<typeof reachC07ReplayRequest>> | undefined;
  try {
    pending = await reachC07ReplayRequest(source, plan);
    cases.push({
      id: "c07-original-session-reaches-router-issued-replay-request",
      passed: true,
      evidence: { sourceItem: "M02", sourceOccurrenceIsServerBound: true, fixtureBinding: "confirm/different", responseCount: pending.state.responses.length },
    });
  } catch (error) {
    cases.push({
      id: "c07-original-session-reaches-router-issued-replay-request",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!pending || !cases[0]?.passed) {
    return { status: "failed" as const, sourceBinding: source.manifest.source_binding, sourceManifestSha256: source.sourceManifestSha256, fixtureSha256, cases };
  }

  check("binding-outcomes-preserve-target-meaning-and-never-create-an-episode", () => {
    const targetId = pending!.state.routerResult.next!.targetIds[0]!;
    const expected = { different: "open", same: "resolved_descriptively", unknown: "unresolved", no_event: "unavailable", skip: "declined" } as const;
    for (const [index, outcome] of (["different", "same", "unknown", "no_event", "skip"] as const).entries()) {
      const next = applyPwqe51ReplayBinding(pending!.state, {
        decisionId: `pwrb_${String(index + 1).padStart(40, "0")}`,
        requestSha256: String(index + 1).padStart(64, "0"),
        outcome,
      }, source);
      assert.equal(next.routerResult.targets.find((target) => target.id === targetId)?.state, expected[outcome], outcome);
      assert.equal(next.responses.length, pending!.state.responses.length, "a binding choice is a control decision");
      assert.equal(next.routerResult.episodes.filter((episode) => episode.actual).length, 1, "confirmation alone cannot establish the second actual occurrence");
    }
    assert.throws(() => applyPwqe51ReplayBinding(createPwqe51SessionState(source), {
      decisionId: `pwrb_${"9".repeat(40)}`, requestSha256: "9".repeat(64), outcome: "different",
    }, source), /no current server-issued replay binding/u);
    return { outcomes: Object.keys(expected), forgedScopeRejected: true };
  });

  let state: Pwqe51SessionState | undefined;
  let replayOccurrenceId: string | undefined;
  check("different-binding-creates-root-only-on-recalled-answer-and-resumes-safely", () => {
    state = applyPwqe51ReplayBinding(pending!.state, {
      decisionId: `pwrb_${"a".repeat(40)}`, requestSha256: "b".repeat(64), outcome: "different",
    }, source);
    assert.equal(state.currentInteraction?.questionId, "M02");
    replayOccurrenceId = state.currentInteraction!.occurrenceId;
    assert.notEqual(replayOccurrenceId, pending!.firstOccurrenceId);
    assert.equal(state.routerResult.episodes.filter((episode) => episode.actual).length, 1);
    assert.equal(renderPwqe51Interaction(state, source)?.rootBasisRequired, true);
    state = resumePwqe51Session(JSON.parse(JSON.stringify(pausePwqe51Session(state))) as Pwqe51SessionState);
    assert.equal(state.currentInteraction?.occurrenceId, replayOccurrenceId);
    state = answerCurrent(state, source, plan, pending!.used, pending!.responseIndex);
    const root = state.responses.find((response) => response.questionId === "M02" && response.occurrenceId === replayOccurrenceId);
    assert.equal(root?.basis, "actual_recalled");
    assert.equal(root?.replayOfOccurrenceId, pending!.firstOccurrenceId);
    assert.equal(state.routerResult.episodes.filter((episode) => episode.actual).length, 2);
    assert.equal(state.currentInteraction?.questionId, "M03");
    assert.equal(state.currentInteraction?.occurrenceId, replayOccurrenceId);
    return { replayRoot: root?.responseId, attachedChild: state.currentInteraction.questionId, occurrenceCount: state.routerResult.episodes.filter((episode) => episode.actual).length };
  });
  if (!state || !replayOccurrenceId || !cases.at(-1)?.passed) {
    return { status: "failed" as const, sourceBinding: source.manifest.source_binding, sourceManifestSha256: source.sourceManifestSha256, fixtureSha256, cases };
  }

  check("attached-child-and-comparison-lineage-stay-on-the-confirmed-pair", () => {
    state = answerCurrent(state!, source, plan, pending!.used, pending!.responseIndex + 1);
    let responseIndex = pending!.responseIndex + 2;
    for (let attempts = 0; attempts < 60 && !state!.responses.some((response) => response.questionId === "D77" && response.status === "answered"); attempts += 1) {
      state = answerCurrent(state!, source, plan, pending!.used, responseIndex++);
    }
    const active = (questionId: string) => state!.responses.filter((response) => response.questionId === questionId && !state!.responses.some((candidate) => candidate.supersedesResponseId === response.responseId));
    const replayRoot = active("M02").find((response) => response.occurrenceId === replayOccurrenceId);
    const replayChild = active("M03").find((response) => response.occurrenceId === replayOccurrenceId);
    const d77 = active("D77")[0];
    assert.ok(replayRoot && replayChild && d77);
    assert.ok(active("D56")[0] && active("D57")[0]);
    const sortedPair = [pending!.firstOccurrenceId, replayOccurrenceId!].sort();
    for (const response of [active("D56")[0]!, active("D57")[0]!, d77]) {
      assert.deepEqual([...state!.routerInput.comparisonIdsByResponseId![response.responseId]!].sort(), sortedPair, `${response.questionId} comparison scope`);
    }
    const target = state!.routerResult.targets.find((row) => row.targetId === "coverage_pattern_continuity" && row.comparisonIds?.includes(replayOccurrenceId!));
    assert.equal(target?.state, "resolved_descriptively");
    assert.ok(target?.sourceObservationIds.includes(`${replayRoot.responseId}:M02.rehearse`));
    assert.ok(target?.sourceObservationIds.some((id) => id.startsWith(`${active("D56")[0]!.responseId}:D56.same`)));
    assert.ok(target?.sourceObservationIds.some((id) => id.startsWith(`${active("D57")[0]!.responseId}:D57.same`)));
    return { answers: ["D56", "D57", "D77"], comparisonPairVerified: true, targetState: target?.state, noPartIdentityInference: true };
  });
  if (!cases.at(-1)?.passed) {
    return { status: "failed" as const, sourceBinding: source.manifest.source_binding, sourceManifestSha256: source.sourceManifestSha256, fixtureSha256, cases };
  }

  check("corrections-invalidate-only-evidence-whose-support-was-withdrawn", () => {
    const activeReplayRoot = state!.responses.find((response) => response.questionId === "M02" && response.occurrenceId === replayOccurrenceId
      && !state!.responses.some((candidate) => candidate.supersedesResponseId === response.responseId))!;
    const priorD77 = state!.responses.find((response) => response.questionId === "D77" && response.status === "answered")!;
    const child = state!.responses.find((response) => response.questionId === "M03" && response.occurrenceId === replayOccurrenceId)!;
    const rootCorrection = advancePwqe51Session(beginPwqe51Correction(state!, activeReplayRoot.responseId, source), {
      responseId: "pwqe51-c07-replay-root-correction", completionState: "COMPLETED", selectedOptionIds: ["M02.none"],
    }, source);
    assert.ok(rootCorrection.routerResult.invalidatedResponses.some((row) => row.responseId === priorD77.responseId && row.reason === "comparison_support_removed"));
    assert.ok(rootCorrection.routerResult.observations.some((row) => row.responseId === child.responseId), "the still-supported M03 remains literal evidence");
    const binding = rootCorrection.replayBindingHistory![0]!;
    const withdrawn = applyPwqe51ReplayBinding(rootCorrection, {
      decisionId: `pwrb_${"c".repeat(40)}`, requestSha256: "d".repeat(64), outcome: "same", correctsDecisionId: binding.decisionId,
    }, source);
    assert.equal(withdrawn.routerResult.episodes.some((episode) => episode.id === replayOccurrenceId && episode.actual), false);
    assert.ok(withdrawn.routerResult.invalidatedResponses.some((row) => row.responseId === child.responseId));
    assert.ok(withdrawn.routerResult.invalidatedResponses.some((row) => row.reason === "episode_root_removed"));
    const restored = applyPwqe51ReplayBinding(withdrawn, {
      decisionId: `pwrb_${"e".repeat(40)}`, requestSha256: "f".repeat(64), outcome: "different", correctsDecisionId: withdrawn.replayBindingHistory!.at(-1)!.decisionId,
    }, source);
    assert.equal(restored.routerResult.episodes.filter((episode) => episode.id === replayOccurrenceId && episode.actual).length, 1);
    assert.equal(restored.responses.filter((response) => response.occurrenceId === replayOccurrenceId && response.questionId === "M02").length, 2);
    return { correctedTarget: "M02", withdrawnOccurrence: true, sameServerOccurrenceRestored: true, noDuplicateReplayRoot: true };
  });

  return {
    status: cases.every((qualificationCase) => qualificationCase.passed) ? "passed" as const : "failed" as const,
    sourceBinding: source.manifest.source_binding,
    sourceManifestSha256: source.sourceManifestSha256,
    fixtureSha256,
    cases,
  };
}
