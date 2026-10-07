import assert from "node:assert/strict";
import test from "node:test";
import { loadPwqe5OfflineQualificationFixtures } from "../../lib/server/openrouter/qualification.ts";

test("loads offline P01–P09 and negative semantics with stable release and fixture digests", async () => {
  const fixtures = await loadPwqe5OfflineQualificationFixtures(process.cwd());
  assert.equal(fixtures.qualificationMode, "offline-source-fixtures");
  assert.equal(fixtures.qualificationStatus, "source-verified-only");
  assert.equal(fixtures.approvalStatus, "not-reviewed");
  assert.equal(fixtures.providerCalls, 0);
  assert.deepEqual(fixtures.profiles.map((profile) => profile.id), ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09"]);
  assert.ok(fixtures.profiles.every((profile) => profile.fictional === true));
  assert.equal(fixtures.profileFixtureCount, 9);
  assert.equal(fixtures.negativeCaseCount, 14);
  assert.deepEqual(fixtures.negativeCases.map((entry) => entry.id), Array.from({ length: 14 }, (_, index) => `N${String(index + 1).padStart(2, "0")}`));
  assert.match(fixtures.workedPathsSha256, /^[a-f0-9]{64}$/u);
  assert.match(fixtures.negativeCasesSha256, /^[a-f0-9]{64}$/u);
  assert.match(fixtures.fixtureSetSha256, /^[a-f0-9]{64}$/u);
  assert.ok(fixtures.checks.every((check) => check.status === "passed"));
});

test("offline fixture digest is deterministic and contains no provider or approval result", async () => {
  const [first, second] = await Promise.all([
    loadPwqe5OfflineQualificationFixtures(process.cwd()),
    loadPwqe5OfflineQualificationFixtures(process.cwd()),
  ]);
  assert.equal(first.fixtureSetSha256, second.fixtureSetSha256);
  assert.equal(first.providerCalls, 0);
  assert.equal(first.approvalStatus, "not-reviewed");
  assert.equal(first.qualificationStatus, "source-verified-only");
});
