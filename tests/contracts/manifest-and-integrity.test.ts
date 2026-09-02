import assert from "node:assert/strict";
import test from "node:test";
import {
  PATTERNWORK_INSTRUMENT_MANIFEST,
  loadAuthoredInstrumentManifest,
  verifyPatternworkSourceIntegrity,
} from "../../lib/question-engine/index.ts";

test("instrument manifest closes the accepted package cardinalities", () => {
  const manifest = PATTERNWORK_INSTRUMENT_MANIFEST;
  assert.equal(manifest.contractId, "PWQE3-CONTRACT-2");
  assert.equal(manifest.integrityContractId, "PWQE3-INTEGRITY-1");
  assert.equal(manifest.interactionFamilies.length, 17);
  assert.equal(manifest.inventoryItems.length, 51);
  assert.equal(manifest.mappingItems.length, 34);
  assert.equal(manifest.deepeningItems.length, 27);
  assert.equal(manifest.bankItems.length, 112);
  assert.equal(manifest.sectionCodes.length, 35);
  assert.equal(new Set(manifest.bankItems.map((item) => item.bankItemId)).size, 112);
  assert.equal(new Set(manifest.interactionFamilies.map((family) => family.code)).size, 17);
  assert.ok(manifest.mappingItems.every((item) => item.numericId >= 100 && item.numericId < 200));
  assert.ok(manifest.deepeningItems.every((item) => item.numericId >= 200 && item.numericId < 300 && item.moduleGroup));
  assert.equal(manifest.invariants.aiDuringQuestionsRoutingOrScoring, false);
  assert.equal(manifest.invariants.canonicalJsonAuthoritative, true);
});

test("source-derived authored manifest exposes the complete render/scoring definitions", async () => {
  const authored = await loadAuthoredInstrumentManifest();
  assert.equal(authored.bankItems.length, 112);
  assert.equal(authored.mappingItems.length, 34);
  assert.ok(authored.mappingItems.every((item) => item.authoredMarkdown.includes(item.bankItemId) && item.authoredMarkdown.includes("**Prompt.**")));
  assert.ok(authored.deepeningItems.every((item) => item.authoredMarkdown.includes("**Mechanics / complete options:**")));
  assert.equal(new Set(authored.bankItems.map((item) => item.authoredContentSha256)).size, 112);
});

test("all 26 canonical source files match the frozen SHA-256 manifest", async () => {
  const result = await verifyPatternworkSourceIntegrity();
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues, null, 2));
  if (result.ok) assert.equal(result.value.files.length, 26);
});
