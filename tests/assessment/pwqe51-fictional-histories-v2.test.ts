import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";

type Answer = {
  responseId: string; questionId: string; occurrenceId: string; stepId: string;
  selectedOptionIds: string[]; status: "answered"; mode: string;
  basis?: string; variantId?: string; replayOfOccurrenceId?: string;
  targetIds?: string[]; comparisonIds?: string[];
};
interface FictionalHistory {
  profile: { id: string; fictional: true };
  source: { questionRelease: string };
  qualification: { currentSessionReplayed: false; serverIssued: false };
  mappingResponses: Answer[];
  deepeningResponses: Answer[];
  combinedCanonicalResponses: Answer[];
  originalAuthoredResponses: Answer[];
  syntheticMappingResponses: Answer[];
  responseProvenance: { responseId: string; origin: string; authoredSourceRef: string | null }[];
  withheldAuthoredAnswers: { sourceAnswerRef: string; questionId: string }[];
  intendedDeepeningContext: { optedInTopics: string[]; mappingExceptionFocusOccurrenceId: string };
  episodes: { occurrenceId: string }[];
  distinctnessIntents: { kind: string; sourceOccurrenceId: string; otherOccurrenceId: string }[];
}
const root = path.join(process.cwd(), "qualification/pwrp71/constructed_histories_v2");
const ids = [
  ...Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`),
];
async function readJson(p: string): Promise<unknown> { return JSON.parse(await readFile(p, "utf8")); }
async function histories(): Promise<FictionalHistory[]> {
  return Promise.all(ids.map(async (id) => await readJson(path.join(root, `${id}.json`)) as FictionalHistory));
}

test("v2 fictional histories contain exact 30-question Mapping scaffolds and no forged server evidence", async () => {
  const source = await loadPwqe51SourcePackage();
  const bank = new Map(source.questionBank.items.map((item) => [item.id, item]));
  const observable = source.questionBank.variants.find((item) => item.id === "M10.observable");
  assert.ok(observable);
  const entries = await histories();
  assert.equal(entries.length, 25);
  let synthetic = 0;
  for (const entry of entries) {
    assert.equal(entry.qualification.serverIssued, false);
    assert.equal(entry.qualification.currentSessionReplayed, false);
    assert.equal(entry.source.questionRelease, source.questionBank.release);
    assert.equal(entry.mappingResponses.length, 30, entry.profile.id);
    assert.equal(new Set(entry.mappingResponses.map((r) => r.questionId)).size, 30, entry.profile.id);
    assert.ok(entry.combinedCanonicalResponses.length <= 56);
    assert.deepEqual(entry.combinedCanonicalResponses, [...entry.mappingResponses, ...entry.deepeningResponses]);
    assert.equal(entry.responseProvenance.length, entry.combinedCanonicalResponses.length);
    const episodes = new Set(entry.episodes.map((e) => e.occurrenceId));
    assert.ok(episodes.has(entry.intendedDeepeningContext.mappingExceptionFocusOccurrenceId));
    const initialized = new Set<string>();
    const administrations = new Set<string>();
    for (const r of entry.combinedCanonicalResponses) {
      const question = bank.get(r.questionId);
      assert.ok(question, `${entry.profile.id}: ${r.questionId} not in source`);
      assert.equal(r.status, "answered");
      assert.ok(episodes.has(r.occurrenceId));
      assert.equal(r.basis, initialized.has(r.occurrenceId) ? undefined : "actual_recalled");
      initialized.add(r.occurrenceId);
      assert.equal(r.targetIds, undefined);
      assert.equal(r.comparisonIds, undefined);
      const administration = [r.occurrenceId, r.questionId, r.stepId].join("|");
      assert.ok(!administrations.has(administration), administration);
      administrations.add(administration);
      const options = r.variantId === "M10.observable" ? observable.options : question.options;
      assert.ok(r.selectedOptionIds.length > 0 && r.selectedOptionIds.length <= question.selection.max_select);
      for (const selectedId of r.selectedOptionIds)
        assert.ok(options.some((option) => option.id === selectedId), `${entry.profile.id}: invalid ${selectedId}`);
      if (question.selection.mode === "single") {
        assert.equal(r.mode, "single");
        assert.equal(r.selectedOptionIds.length, 1);
      }
      if (question.selection.mode === "partial_order" && r.selectedOptionIds.length > 1)
        assert.equal(r.mode, "ordered");
      if (question.eligibility.topic_opt_in)
        assert.ok(entry.intendedDeepeningContext.optedInTopics.includes(question.eligibility.topic_opt_in));
      if (r.replayOfOccurrenceId)
        assert.ok(entry.distinctnessIntents.some((d) => d.kind === "controlled_replay"
          && d.otherOccurrenceId === r.occurrenceId && d.sourceOccurrenceId === r.replayOfOccurrenceId));
    }
    const syntheticIds = new Set(entry.syntheticMappingResponses.map((r) => r.responseId));
    for (const responseId of syntheticIds)
      assert.ok(entry.responseProvenance.some((p) => p.responseId === responseId && p.origin === "new_synthetic_mapping_answer"));
    synthetic += syntheticIds.size;
  }
  assert.equal(synthetic, 698);
});

test("every original authored answer is retained exactly or explicitly withheld by a forbidden-item contract", async () => {
  const entries = await histories();
  const p = await readJson(path.join(process.cwd(), "qualification/pwrp71/authored_worked_paths.json")) as {
    profiles: { id: string; answers: { id: string; item_id: string; selected: string[] }[] }[];
  };
  const c = await readJson(path.join(process.cwd(), "specs/patternwork/question-engine-v5.1/qualification/coverage/FICTIONAL_PLANS.json")) as {
    plans: { id: string; answers: Record<string, { selected: string[] }[]>; forbidden_items: string[] }[];
  };
  let retained = 0, withheld = 0;
  for (const entry of entries) {
    const prov = new Map(entry.responseProvenance.map((r) => [r.responseId, r]));
    const answerBySource = new Map(entry.originalAuthoredResponses.map((r) => [prov.get(r.responseId)?.authoredSourceRef, r]));
    const original = entry.profile.id.startsWith("P")
      ? p.profiles.find((f) => f.id === entry.profile.id)!.answers.map((r) => ({
          ref: r.id, question: r.item_id, selected: r.selected, forbidden: false,
        }))
      : Object.entries(c.plans.find((f) => f.id === entry.profile.id)!.answers).flatMap(([question, answers]) =>
          answers.map((r, index) => ({
            ref: `${entry.profile.id}.${question}[${index}]`, question,
            selected: r.selected,
            forbidden: c.plans.find((f) => f.id === entry.profile.id)!.forbidden_items.includes(question),
          })));
    for (const row of original) {
      const matched = answerBySource.get(row.ref);
      if (row.forbidden) {
        assert.equal(matched, undefined, row.ref);
        assert.ok(entry.withheldAuthoredAnswers.some((w) => w.sourceAnswerRef === row.ref));
        assert.ok(!entry.combinedCanonicalResponses.some((answer) => answer.questionId === row.question));
        withheld += 1;
      } else {
        assert.ok(matched, row.ref);
        assert.equal(matched.questionId, row.question);
        assert.deepEqual(matched.selectedOptionIds, row.selected);
        retained += 1;
      }
    }
  }
  assert.equal(retained, 206);
  assert.equal(withheld, 3);
});
