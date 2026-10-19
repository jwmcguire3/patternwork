import { writeHistoricalRunFixture } from "./historical-run-fixture.ts";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { structuralReviewFixture } from "../../lib/server/reports/qualification/review-fixture.ts";
import { validatePwrp71ReportDraft } from "../../lib/server/reports/pwrp71-validation.ts";
import { runAssessmentPlan } from "../../scripts/report-dev/assessment.ts";
import { loadPwrp71ReferenceRecoverySeed } from "../../scripts/report-dev/reference-recovery.ts";
import { loadPwrp71ContinuationSeed, prepareReport } from "../../scripts/report-dev/workflow.ts";

async function json(file: string): Promise<JsonObject> { return JSON.parse(await readFile(file, "utf8")) as JsonObject; }
async function put(file: string, value: unknown): Promise<void> { await writeFile(file, JSON.stringify(value)); }
async function tempRoot(): Promise<string> {
  const directory = path.join(process.cwd(), ".codex-temp", "reference-recovery-tests");
  await mkdir(directory, { recursive: true });
  return mkdtemp(path.join(directory, "fixture-"));
}

async function fixture(root: string) {
  const [questionSource, reportSource] = await Promise.all([loadPwqe51SourcePackage(), loadPwrp71SourcePackage()]);
  const assessment = runAssessmentPlan(await json("scripts/report-dev/cases/ellis.json"), questionSource);
  const input = { assessment, questionSource, reportSource };
  const { packet } = prepareReport(assessment, "IFS", questionSource, reportSource);
  const observations = packet.observations as JsonObject[];
  const first = observations[0];
  const claim = (id: string, observation: JsonObject): JsonObject => ({
    id, text: "A selected response was retained.", kind: "reported", constructs: [],
    scope: { level: "occurrence", occurrence_ids: [observation.occurrence_id], person_ids: typeof observation.person_id === "string" ? [observation.person_id] : [], description: "One recorded occurrence." },
    evidence_ids: [observation.id], counterevidence_ids: [], sequence_edge_ids: [], depends_on_claim_ids: [], support_basis: ["direct_report"], rationale: "Fixture only.", remaining_uncertainty: [],
  });
  const draft: JsonObject = {
    report_release: reportSource.policy.release, release_id: packet.release_id, snapshot_id: packet.snapshot_id, evidence_sha256: packet.content_sha256,
    report_type: "IFS", title: "Isolated citation lineage fixture", title_claim_ids: [], content_status: "complete",
    sections: [{ id: "s1", heading: "Recorded response", text: "Selected responses were retained.", claim_ids: ["c1", "c2"] }],
    claims: [claim("c1", first), claim("c2", first)], name_registry: [], relationships: [], reflection_questions: [],
  };
  (draft.claims as JsonObject[])[0].counterevidence_ids = [first.id];
  const revision = structuralReviewFixture({ source: reportSource, packet, draft, verdict: "revise", issues: [{
    id: "i1", category: "voice", claim_ids: ["c2"], section_ids: ["s1"], name_ids: [], relationship_ids: [], evidence_ids: [],
    reason: "Clarify the fixture wording.", requested_change: "Retain scope while clarifying the sentence.",
  }] });
  (revision.quality_assessment as JsonObject).narrative_quality = { status: "revise", rationale: "Clarify fixture wording." };
  const runs = path.join(root, "runs"); await mkdir(runs);
  const parentDirectory = path.join(runs, "parent");
  const markReported = async (directory: string) => {
    const file = path.join(directory, "provider/attempts.json"), attempts = await json(file);
    for (const attempt of attempts.attempts as JsonObject[]) attempt.usageStatus = "reported";
    await put(file, attempts);
  };
  const initial = await writeHistoricalRunFixture({ ...input, directory: parentDirectory, mode: "generate", steps: [{phase:"initial",output:draft},{phase:"review",output:revision},{phase:"repair",output:draft},{phase:"review_after_repair",output:revision}] });
  assert.equal((initial.reports.IFS as JsonObject).status, "failed", JSON.stringify(initial.reports));
  assert.equal(((initial.reports.IFS as JsonObject).failure as JsonObject | undefined)?.code, "review_not_accepted", JSON.stringify(initial.reports));
  await markReported(parentDirectory);
  const parentAttempts = (await json(path.join(parentDirectory, "provider/attempts.json"))).attempts as JsonObject[];
  assert.ok(parentAttempts.some(attempt => String(attempt.attemptId).includes(":repair:") && (attempt.validation as JsonObject | undefined)?.ok === true), JSON.stringify(parentAttempts.map(attempt => ({ attemptId: attempt.attemptId, validation: attempt.validation }))));
  const continuation = await loadPwrp71ContinuationSeed({ ...input, sourceRunDirectory: parentDirectory, outputRoot: root });
  const raw = structuredClone(draft);
  (raw.claims as JsonObject[])[0].evidence_ids = [String(first.id).slice(0, -1)];
  const rawValidation = validatePwrp71ReportDraft({ value: raw, reportType: "IFS", snapshotId: String(packet.snapshot_id), packet, source: reportSource });
  assert.equal(rawValidation.ok, false);
  if (!rawValidation.ok) assert.deepEqual(rawValidation.issues.map(issue => issue.code), ["current_observation"], JSON.stringify(rawValidation.issues));
  const sourceDirectory = path.join(runs, "failed-writer");
  await writeHistoricalRunFixture({ ...input, directory: sourceDirectory, mode: "continue", continuation, structuralRepair: true, steps: [{phase:"repair",output:{...raw,title:""}},{phase:"repair",output:raw}] });
  await markReported(sourceDirectory);
  const summaryPath = path.join(sourceDirectory, "summary.json"), summary = await json(summaryPath);
  summary.narrativeEvaluation = "not_reached";
  await put(summaryPath, summary);
  return { input, parentDirectory, sourceDirectory, raw };
}

test("typed reference recovery proves both failed attempts and derives only the latest raw writer result", async () => {
  const root = await tempRoot();
  try {
    const f = await fixture(root);
    const attemptsPath = path.join(f.sourceDirectory, "provider/attempts.json"), before = await readFile(attemptsPath, "utf8");
    const seed = await loadPwrp71ReferenceRecoverySeed({ ...f.input, sourceRunDirectory: f.sourceDirectory, outputRoot: root });
    assert.equal(seed.referenceRestoration, true);
    assert.deepEqual(seed.rawDraft, f.raw);
    assert.match(seed.sourceRunBindingSha256, /^[a-f0-9]{64}$/u);
    assert.match(seed.sourceDraftAttemptId, /:repair:report-dev-luna-medium-v1:attempt-2$/u);
    assert.notEqual(seed.derivation.raw_draft_sha256, seed.derivation.normalized_draft_sha256);
    assert.equal(await readFile(attemptsPath, "utf8"), before);
    const attempts = (await json(attemptsPath)).attempts as JsonObject[];
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts.map(attempt => (attempt.validation as JsonObject).ok), [false, false]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("typed reference recovery rejects unknown usage, changed first or last validation and ambiguous parents", async () => {
  const root = await tempRoot();
  try {
    const f = await fixture(root);
    const load = () => loadPwrp71ReferenceRecoverySeed({ ...f.input, sourceRunDirectory: f.sourceDirectory, outputRoot: root });
    const attemptsPath = path.join(f.sourceDirectory, "provider/attempts.json"), attempts = await json(attemptsPath);
    for (const index of [0, 1]) {
      const unknown = structuredClone(attempts); (unknown.attempts as JsonObject[])[index].usageStatus = "unknown";
      await put(attemptsPath, unknown); await assert.rejects(load(), /unsettled/u); await put(attemptsPath, attempts);
    }
    const eventsPath = path.join(f.sourceDirectory, "IFS/events.json"), events = JSON.parse(await readFile(eventsPath, "utf8")) as JsonObject[];
    for (const index of [0, 2]) {
      const changed = structuredClone(events); (changed[index].issues as JsonObject[])[0].path = "$.claims.other.evidence_ids";
      await put(eventsPath, changed); await assert.rejects(load(), /event issues/u); await put(eventsPath, events);
    }
    const changedDecision = structuredClone(events); changedDecision[1].issueCount = 999;
    await put(eventsPath, changedDecision); await assert.rejects(load(), /structural correction event differs/u); await put(eventsPath, events);
    const summaryPath = path.join(f.sourceDirectory, "summary.json"), summary = await json(summaryPath);
    await put(summaryPath, { ...summary, settledCostMicros: 1 }); await assert.rejects(load(), /spend does not reconcile/u); await put(summaryPath, summary);
    const outcomePath = path.join(f.sourceDirectory, "IFS/outcome.json"), outcome = await json(outcomePath);
    const changedOutcome = structuredClone(outcome); (changedOutcome.failure as JsonObject).code = "review_not_accepted";
    await put(outcomePath, changedOutcome); await assert.rejects(load(), /failed outcome differs/u); await put(outcomePath, outcome);
    await cp(f.parentDirectory, path.join(root, "runs", "duplicate-parent"), { recursive: true });
    await assert.rejects(load(), /missing or ambiguous/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
