import assert from "node:assert/strict";
import test from "node:test";
import { buildPwqe5QualificationFixtureSet } from "@/lib/server/openrouter/pwqe5-qualification-fixtures";

test("adapts all authored P01–P09 into schema-valid Mapping and Pass-2 packets", async () => {
  const fixtures = await buildPwqe5QualificationFixtureSet();

  assert.equal(fixtures.profiles.length, 9);
  assert.equal(fixtures.negativeCases.length > 0, true);
  assert.equal(fixtures.negativeCasesSha256.length, 64);
  assert.equal(fixtures.workedPathsSha256.length, 64);
  for (const fixture of fixtures.profiles) {
    assert.equal(fixture.mappingPacket.snapshot_id, fixture.mappingSnapshotId);
    assert.equal(fixture.reportPacket.snapshot_id, fixture.deepeningSnapshotId);
    assert.equal(fixture.mappingPacket.release_id, fixtures.questionRelease);
    assert.equal(fixture.reportPacket.release_id, fixtures.questionRelease);
    assert.equal(fixture.sourcePacketSha256.length, 64);
    assert.equal((fixture.mappingPacket.observations as unknown[]).length >= 0, true);
    assert.equal((fixture.reportPacket.administration_provenance as unknown[]).length > 0, true);
    assert.equal("claims" in fixture.reportPacket, false);
    assert.equal("sample_report_passage" in fixture.reportPacket, false);
    assert.ok(fixture.reviewReference.claims.length > 0);
  }
});

test("keeps mapping administrations separate from Pass-2 report evidence", async () => {
  const fixtures = await buildPwqe5QualificationFixtureSet();
  const p01 = fixtures.profiles.find((fixture) => fixture.id === "P01");
  assert.ok(p01);
  const mappingIds = (p01.mappingPacket.administration_provenance as Array<{ item_id: string }>).map((entry) => entry.item_id);
  const reportIds = (p01.reportPacket.administration_provenance as Array<{ item_id: string }>).map((entry) => entry.item_id);
  assert.ok(mappingIds.length > 0);
  assert.ok(mappingIds.every((itemId) => fixtures.source.questionBank.items.find((item) => item.id === itemId)?.stage === "mapping"));
  assert.ok(reportIds.some((itemId) => fixtures.source.questionBank.items.find((item) => item.id === itemId)?.stage === "deepening"));
  assert.deepEqual((p01.mappingPacket.observations as Array<{ response_id: string }>).map((item) => item.response_id), ["P01-A01", "P01-A02", "P01-A04", "P01-A05"]);
});

test("returns authored review references outside the provider packet", async () => {
  const fixtures = await buildPwqe5QualificationFixtureSet();
  const p01 = fixtures.profiles[0];
  assert.match(p01.reviewReference.title, /preventive role/u);
  assert.ok(p01.reviewReference.remaining_uncertainty.length > 0);
  assert.ok(p01.reviewReference.must_not_claim.length > 0);
  assert.equal(typeof p01.reviewReference.stopping_reason, "string");
  assert.equal(JSON.stringify(p01.mappingPacket).includes(p01.reviewReference.title), false);
  assert.equal(JSON.stringify(p01.reportPacket).includes(p01.reviewReference.title), false);
});
