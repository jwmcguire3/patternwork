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
import { loadPwrp71ContinuationSeed, prepareReport } from "../../scripts/report-dev/workflow.ts";

async function json(file: string): Promise<JsonObject> { return JSON.parse(await readFile(file, "utf8")) as JsonObject; }
async function put(file: string, value: unknown): Promise<void> { await writeFile(file, JSON.stringify(value)); }
async function tempRoot(): Promise<string> {
  const directory = path.join(process.cwd(), ".codex-temp", "citation-recovery-tests");
  await mkdir(directory, { recursive: true });
  return mkdtemp(path.join(directory, "fixture-"));
}

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

test("citation recovery proves immutable parentage and returns an unchanged raw writer draft", async () => {
  const root = await tempRoot();
  try {
    const f = await fixture(root);
    const before = await readFile(path.join(f.sourceDirectory, "provider/attempts.json"), "utf8");
    const seed = await loadPwrp71CitationClosureSeed({ ...f.input, sourceRunDirectory: f.sourceDirectory, outputRoot: root });
    assert.deepEqual(seed.rawDraft, f.raw);
    assert.match(seed.sourceRunBindingSha256, /^[a-f0-9]{64}$/u);
    assert.ok("additions" in seed.derivation);
    assert.equal(seed.derivation.additions.length, 1);
    assert.deepEqual(seed.derivation.additions[0].dependency_path, ["c2", "c1"]);
    assert.equal(await readFile(path.join(f.sourceDirectory, "provider/attempts.json"), "utf8"), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("citation recovery binds a one-character restoration to its validated parent assertion", async () => {
  const root = await tempRoot();
  try {
    const f = await fixture(root, "restoration");
    const load = () => loadPwrp71CitationClosureSeed({ ...f.input, sourceRunDirectory: f.sourceDirectory, outputRoot: root });
    const seed = await load();
    assert.deepEqual(seed.rawDraft, f.raw);
    assert.ok(seed.previousDraft);
    assert.equal(seed.derivation.normalization_version, "pwrp71-prior-citation-restoration-v1");
    assert.ok("replacements" in seed.derivation);
    assert.equal(seed.derivation.replacements.length, 1);
    assert.equal(seed.derivation.replacements[0].claim_id, "c1");
    const attemptsPath = path.join(f.sourceDirectory, "provider/attempts.json"), attempts = await json(attemptsPath);
    const output = ((attempts.attempts as JsonObject[])[0].providerResult as JsonObject).output as JsonObject;
    (output.claims as JsonObject[])[0].text = "A different assertion must not inherit the earlier citation.";
    await put(attemptsPath, attempts);
    await assert.rejects(load(), /Prior citation restoration is unavailable/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("citation recovery rejects unsettled attempts, changed validation, changed guidance and duplicate parents", async () => {
  const root = await tempRoot();
  try {
    const f = await fixture(root);
    const load = () => loadPwrp71CitationClosureSeed({ ...f.input, sourceRunDirectory: f.sourceDirectory, outputRoot: root });
    const attemptsPath = path.join(f.sourceDirectory, "provider/attempts.json"), attempts = await json(attemptsPath);
    const unknown = structuredClone(attempts); (unknown.attempts as JsonObject[])[0].usageStatus = "unknown";
    await put(attemptsPath, unknown); await assert.rejects(load(), /unsettled/u); await put(attemptsPath, attempts);
    const eventsPath = path.join(f.sourceDirectory, "IFS/events.json");
    const events = JSON.parse(await readFile(eventsPath, "utf8")) as JsonObject[];
    const changed = structuredClone(events); (changed[0].issues as JsonObject[])[0].path = "$.claims.other.evidence_ids";
    await put(eventsPath, changed); await assert.rejects(load(), /event issues/u); await put(eventsPath, events);
    const bindingPath = path.join(f.sourceDirectory, "binding.json"), binding = await json(bindingPath);
    await put(bindingPath, { ...binding, inputGuidanceVersion: "old-guidance" });
    await assert.rejects(load(), /bounded, same-assessment/u); await put(bindingPath, binding);
    await cp(f.parentDirectory, path.join(root, "runs", "duplicate-parent"), { recursive: true });
    await assert.rejects(load(), /missing or ambiguous/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
