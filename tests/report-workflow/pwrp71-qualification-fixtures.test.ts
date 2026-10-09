import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PWRP71_SEMANTIC_CASE_SET_SHA256 } from "../../lib/server/reports/pwrp71-readiness.ts";
import { loadPwrp71QualificationFixtures, Pwrp71FixtureError } from "../../lib/server/reports/qualification/fixtures.ts";
import { buildPwrp71AuthoredProfilePacket, loadPwrp71FixturePacket } from "../../lib/server/reports/qualification/replay.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";

const sourceFixtures = path.join(process.cwd(), "qualification/pwrp71");

async function copiedFixtureRoot(): Promise<{ readonly root: string; readonly cleanup: () => Promise<void> }> {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pwrp71-fixtures-"));
  const root = path.join(parent, "qualification", "pwrp71");
  await cp(sourceFixtures, root, { recursive: true });
  return { root, cleanup: () => rm(parent, { recursive: true, force: true }) };
}

test("PWRP 7.1 fixture identities retain authored lineage and pending router status", async () => {
  const fixtures = await loadPwrp71QualificationFixtures();
  assert.deepEqual(fixtures.profiles.map(({ id }) => id), Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`));
  for (const fixture of fixtures.profiles) {
    assert.equal(fixture.authoredPlan.id, fixture.id);
    assert.equal(fixture.authoredPlan.title, fixture.title);
    assert.equal(fixture.sourceKind, "adapted_authored_branch_segment_not_complete_observed_respondent");
    assert.equal(fixture.authoredHistory.id, fixture.id);
    assert.equal(fixture.lineage.plan.archivePath.includes(`/current_replays/${fixture.id}_plan.json`), true);
    assert.equal(fixture.lineage.authoredHistory.archivePath.includes(`/assessment_runtime/examples/worked_paths.json`), true);
    assert.equal(fixture.lineage.referenceStateArchive.archivePath.includes(`/current_replays/${fixture.id}_LOCAL_UNSIGNED_state.json`), true);
    assert.equal("routing_target" in (fixture.authoredHistory.answers as Record<string, unknown>[])[0], true, "authored target note remains source material, not an oracle");
    const archivedBody = fixture.referenceStateArchive.body as Record<string, unknown>;
    assert.equal((archivedBody.source_binding as Record<string, unknown>).question_release, "PWQE-5.0.0-design.1", "legacy state archive is retained as provenance only");
    assert.match(fixture.lineage.plan.sha256, /^[a-f0-9]{64}$/u);
    assert.match(fixture.lineage.authoredHistory.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(fixture.routerParity, "pending");
    assert.equal(fixture.qualificationStatus, "pending_router_parity");
    assert.equal("expectedRoute" in fixture, false);
  }
  assert.equal(fixtures.coverageCandidates.length, 16);
  assert.deepEqual(fixtures.coverageCandidates.map(({ id }) => id), Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`));
  assert.ok(fixtures.coverageCandidates.every((candidate) => candidate.status === "candidate_archive_not_canonical_answer_history" && candidate.routerParity === "pending"));
  assert.ok(fixtures.coverageCandidates.every((candidate) => candidate.packet.release_id === "PWQE-5.1.0-candidate.1"));
});

test("PWRP 7.1 fixture pins tolerate Git's Windows CRLF checkout without weakening content checks", async () => {
  const copied = await copiedFixtureRoot();
  try {
    const file = path.join(copied.root, "authored_worked_paths.json");
    const original = await readFile(file, "utf8");
    const crlf = original.replace(/\r\n/gu, "\n").replace(/\n/gu, "\r\n");
    await writeFile(file, crlf);
    const fixtures = await loadPwrp71QualificationFixtures({ fixtureRoot: copied.root });
    assert.equal(fixtures.profiles.length, 9);
    assert.equal(fixtures.coverageCandidates.length, 16);

    await writeFile(file, crlf.replace("A preventive role", "A changed role"));
    await assert.rejects(loadPwrp71QualificationFixtures({ fixtureRoot: copied.root }), /authored P01–P09 answer-history asset digest drifted/u);
  } finally {
    await copied.cleanup();
  }
});

test("authored histories replay explicit answer lineage and preserve pending report-adapter findings", async () => {
  const fixtures = await loadPwrp71QualificationFixtures();
  const questionSource = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  for (const profile of fixtures.profiles) {
    const packet = buildPwrp71AuthoredProfilePacket({ profile, questionSource });
    assert.equal(packet.fixtureStatus, "pending_router_parity");
    assert.equal(packet.routerParity, "pending");
    assert.equal(packet.issues.length, 0, JSON.stringify(packet.issues));
    const observations = packet.packet.observations as Record<string, unknown>[];
    const authoredAnswers = profile.authoredHistory.answers as Record<string, unknown>[];
    assert.equal(observations.length, authoredAnswers.filter((answer) => answer.status === "answered").reduce((sum, answer) => sum + (answer.selected as unknown[]).length, 0));
    const responseIds = new Set(authoredAnswers.map((answer) => answer.id));
    assert.ok(observations.every((observation) => responseIds.has(String(observation.response_id))));
    const prepared = preparePwrp71Request({ packet: packet.packet, reportType: "MAP", questionSource, reportSource });
    if (!prepared.ok) {
      assert.equal(packet.routerParity, "pending");
      assert.ok(prepared.issues.length > 0);
      assert.ok(prepared.issues.every((issue) => issue.code === "target_lineage" || issue.code === "sequence_lineage"), JSON.stringify(prepared.issues));
    }
  }
});

test("C01–C16 remain exact candidate packet archives pending router qualification", async () => {
  const fixtures = await loadPwrp71QualificationFixtures();
  const candidate = await loadPwrp71FixturePacket({ profileId: "C01", fixtures });
  assert.equal(candidate.fixtureStatus, "candidate_archive_pending_router_parity");
  assert.equal(candidate.routerParity, "pending");
  assert.equal(candidate.packet.snapshot_id, fixtures.coverageCandidates[0].packet.snapshot_id);
  assert.deepEqual(candidate.issues, []);
});

test("C candidate archives remain unqualified and legacy C10 D36 packet order is rejected", async () => {
  const fixtures = await loadPwrp71QualificationFixtures();
  const questionSource = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  let structurallyReady = 0;
  for (const profile of fixtures.coverageCandidates) {
    const prepared = preparePwrp71Request({ packet: profile.packet, reportType: "MAP", questionSource, reportSource });
    if (prepared.ok) structurallyReady += 1;
    else {
      assert.ok(prepared.issues.every((issue) => issue.code === "target_lineage" || issue.code === "sequence_lineage" || issue.code === "recovery_sequence_semantics"), JSON.stringify(prepared.issues));
      if (prepared.issues.some((issue) => issue.code === "recovery_sequence_semantics")) {
        assert.equal(profile.id, "C10", "only the legacy candidate archive with D36 carries the old response/edge ordering mismatch");
      }
    }
    assert.equal(profile.routerParity, "pending");
  }
  assert.ok(structurallyReady > 0);
});

test("PWRP 7.1 semantic criteria match the readiness-pinned source digest", async () => {
  const fixtures = await loadPwrp71QualificationFixtures();
  assert.equal(fixtures.semanticCaseSetSha256, PWRP71_SEMANTIC_CASE_SET_SHA256);
  assert.equal(fixtures.semanticCaseSetSha256, "fec1752b4a4892da77fcadbf78688b23fd77e010b845ae6ddcd4523c0547569d");
  assert.equal(fixtures.semanticCasesCanonicalJsonSha256, "ad48886eb708871933674f95f008edc08871be0a68d8b887571e430e174201e2");
  assert.notEqual(fixtures.semanticCasesCanonicalJsonSha256, fixtures.semanticCaseSetSha256);
  assert.equal((fixtures.semanticCases.cases as unknown[]).length, 14);
  assert.equal(fixtures.semanticCases.report_release, "PWRP-7.1.0-candidate.1");
});

test("PWRP 7.1 fixture loader rejects authored history drift", async () => {
  const copied = await copiedFixtureRoot();
  try {
    const file = path.join(copied.root, "profiles/P01_plan.json");
    const original = await readFile(file, "utf8");
    await writeFile(file, original.replace("A preventive role", "A changed role"));
    await assert.rejects(loadPwrp71QualificationFixtures({ fixtureRoot: copied.root }), (error: unknown) => {
      assert.ok(error instanceof Pwrp71FixtureError);
      assert.match(error.message, /P01 authored plan digest drifted/u);
      return true;
    });
  } finally {
    await copied.cleanup();
  }
});

test("PWRP 7.1 fixture loader reports a missing authored history fixture", async () => {
  const copied = await copiedFixtureRoot();
  try {
    await rm(path.join(copied.root, "profiles/P09_LOCAL_UNSIGNED_state.json"));
    await assert.rejects(loadPwrp71QualificationFixtures({ fixtureRoot: copied.root }), /P09 authored history/u);
  } finally {
    await copied.cleanup();
  }
});

test("PWRP 7.1 fixture loader rejects a replaced semantic case set", async () => {
  const copied = await copiedFixtureRoot();
  try {
    const file = path.join(copied.root, "SEMANTIC_CASES.json");
    const semantic = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    semantic.report_release = "changed";
    await writeFile(file, JSON.stringify(semantic));
    await assert.rejects(loadPwrp71QualificationFixtures({ fixtureRoot: copied.root }), /semantic case source bytes drifted/u);
  } finally {
    await copied.cleanup();
  }
});
