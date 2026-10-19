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
import { loadPwrp71CitationClosureSeed } from "../../scripts/report-dev/citation-recovery.ts";
import { loadPwrp71ContinuationFromCitationReview } from "../../scripts/report-dev/citation-continuation.ts";
import { derivePwrp71Citations } from "../../lib/server/reports/pwrp71-citation-derivation.ts";
import { loadPwrp71ContinuationSeed, prepareReport } from "../../scripts/report-dev/workflow.ts";

async function json(file: string): Promise<JsonObject> { return JSON.parse(await readFile(file, "utf8")) as JsonObject; }
async function put(file: string, value: unknown): Promise<void> { await writeFile(file, JSON.stringify(value)); }
async function tempRoot(): Promise<string> {
  const directory = path.join(process.cwd(), ".codex-temp", "citation-continuation-tests");
  await mkdir(directory, { recursive: true });
  return mkdtemp(path.join(directory, "fixture-"));
}

async function reviewFixture(root: string) {
  const f = await fixture(root);
  const citationClosure = await loadPwrp71CitationClosureSeed({ ...f.input, sourceRunDirectory: f.sourceDirectory, outputRoot: root });
  const { packet, request } = prepareReport(f.input.assessment, "IFS", f.input.questionSource, f.input.reportSource);
  assert.ok(request.ok);
  const derived = derivePwrp71Citations({ value: citationClosure.rawDraft, previousDraft: citationClosure.previousDraft, reportType: "IFS", snapshotId: String(packet.snapshot_id), packet, source: f.input.reportSource });
  const review = structuralReviewFixture({ source: f.input.reportSource, packet, draft: derived.artifact.draft, verdict: "revise", issues: [{
    id: "revise-1", category: "voice", claim_ids: ["c2"], section_ids: ["s1"], name_ids: [], relationship_ids: [], evidence_ids: [],
    reason: "The exact derived draft still needs clearer wording.", requested_change: "Clarify the sentence while retaining the current scope.",
  }] });
  (review.quality_assessment as JsonObject).narrative_quality = { status: "revise", rationale: "Clarify the wording." };
  const reviewDirectory = path.join(root, "runs", "derived-review");
  const outcome = await writeHistoricalRunFixture({ ...f.input, directory: reviewDirectory, mode: "review-closure", citationClosure, steps: [{phase:"review",output:review}] });
  assert.equal(((outcome.reports.IFS as JsonObject).failure as JsonObject).code, "review_not_accepted");
  const attemptsPath = path.join(reviewDirectory, "provider/attempts.json"), attempts = await json(attemptsPath);
  for (const attempt of attempts.attempts as JsonObject[]) attempt.usageStatus = "reported";
  await put(attemptsPath, attempts);
  const summaryPath = path.join(reviewDirectory, "summary.json"), summary = await json(summaryPath);
  summary.narrativeEvaluation = "model_review"; await put(summaryPath, summary);
  return { ...f, reviewDirectory, derived, review, citationClosure };
}

test("citation review continuation reconstructs normalized draft and fresh revision receipt without changing raw validation", async () => {
  const root = await tempRoot();
  try {
    const f = await reviewFixture(root);
    const rawPath = path.join(f.sourceDirectory, "provider/attempts.json"), original = await readFile(rawPath, "utf8");
    const seed = await loadPwrp71ContinuationFromCitationReview({ ...f.input, sourceRunDirectory: f.reviewDirectory, outputRoot: root });
    assert.deepEqual(await loadPwrp71ContinuationSeed({ ...f.input, sourceRunDirectory: f.reviewDirectory, outputRoot: root }), seed);
    assert.deepEqual(seed.previousDraft, f.derived.artifact.draft);
    assert.deepEqual(seed.previousReview, f.review);
    assert.equal(seed.sourceDraftSha256, f.citationClosure.derivation.normalized_draft_sha256);
    assert.equal(seed.sourceDraftAttemptId, f.citationClosure.sourceDraftAttemptId);
    assert.match(seed.sourceReviewAttemptId, /:review:report-dev-luna-medium-v1:attempt-1$/u);
    assert.match(seed.sourceRunBindingSha256, /^[a-f0-9]{64}$/u);
    assert.equal(await readFile(rawPath, "utf8"), original);
    assert.equal((((await json(rawPath)).attempts as JsonObject[])[0].validation as JsonObject).ok, false);
    const { packet } = prepareReport(f.input.assessment, "IFS", f.input.questionSource, f.input.reportSource);
    const accepted = structuralReviewFixture({ source: f.input.reportSource, packet, draft: seed.previousDraft, verdict: "accept" });
    const result = await writeHistoricalRunFixture({ ...f.input, directory:path.join(root,"runs","resumed"), mode:"continue", continuation:seed, steps:[{phase:"repair",output:seed.previousDraft},{phase:"review_after_repair",output:accepted}] });
    assert.equal(result.failed,false,JSON.stringify(result.reports));
    assert.equal(result.providerAttempts,2);
    assert.match(result.repairStrategyVersion ?? "",/^pwrp71-functional-recomposition-/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("citation review continuation rejects unknown usage, changed artifacts, mismatched receipts and ambiguous raw sources", async () => {
  const root = await tempRoot();
  try {
    const f = await reviewFixture(root);
    const load = () => loadPwrp71ContinuationFromCitationReview({ ...f.input, sourceRunDirectory: f.reviewDirectory, outputRoot: root });
    const attemptsPath = path.join(f.reviewDirectory, "provider/attempts.json"), attempts = await json(attemptsPath);
    const unknown = structuredClone(attempts); (unknown.attempts as JsonObject[])[0].usageStatus = "unknown";
    await put(attemptsPath, unknown); await assert.rejects(load(), /unsettled/u); await put(attemptsPath, attempts);
    const draftPath = path.join(f.reviewDirectory, "IFS/normalized-draft.json"), draft = await json(draftPath);
    await put(draftPath, { ...draft, title: "Changed projection" }); await assert.rejects(load(), /normalized draft differs/u); await put(draftPath, draft);
    const derivationPath = path.join(f.reviewDirectory, "IFS/citation-derivation.json"), derivation = await json(derivationPath);
    await put(derivationPath, { ...derivation, rawDraftSha256: "0".repeat(64) }); await assert.rejects(load(), /derivation artifact differs/u); await put(derivationPath, derivation);
    const eventsPath = path.join(f.reviewDirectory, "IFS/events.json"), events = JSON.parse(await readFile(eventsPath, "utf8")) as JsonObject[];
    const changed = structuredClone(events); (changed[0].receipt as JsonObject).review_sha256 = "0".repeat(64);
    await put(eventsPath, changed); await assert.rejects(load(), /event differs/u); await put(eventsPath, events);
    await cp(f.sourceDirectory, path.join(root, "runs", "duplicate-raw-source"), { recursive: true });
    await assert.rejects(load(), /missing or ambiguous/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function fixture(root: string, recipe: "inheritance" | "restoration" = "inheritance") {
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
  if (recipe === "inheritance") (raw.claims as JsonObject[])[1].depends_on_claim_ids = ["c1"];
  else (raw.claims as JsonObject[])[0].evidence_ids = [String(first.id).slice(0, -1)];
  const rawValidation = validatePwrp71ReportDraft({ value: raw, reportType: "IFS", snapshotId: String(packet.snapshot_id), packet, source: reportSource });
  assert.equal(rawValidation.ok, false);
  if (!rawValidation.ok) assert.deepEqual(rawValidation.issues.map(issue => issue.code), [recipe === "inheritance" ? "claim_leaf_evidence" : "current_observation"], JSON.stringify(rawValidation.issues));
  const sourceDirectory = path.join(runs, "failed-writer");
  await writeHistoricalRunFixture({ ...input, directory: sourceDirectory, mode: "continue", continuation, steps: [{phase:"repair",output:raw}] });
  await markReported(sourceDirectory);
  const summaryPath = path.join(sourceDirectory, "summary.json"), summary = await json(summaryPath);
  summary.narrativeEvaluation = "not_reached";
  await put(summaryPath, summary);
  return { input, parentDirectory, sourceDirectory, raw };
}
