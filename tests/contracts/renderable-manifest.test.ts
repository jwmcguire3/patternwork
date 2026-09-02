import assert from "node:assert/strict";
import test from "node:test";
import {
  LAYER_SECTION_CODES,
  loadRenderableInteraction,
  loadStructuredInstrumentManifest,
} from "../../lib/question-engine/index.ts";

function optionLabels(item: Awaited<ReturnType<typeof loadRenderableInteraction>>): string[] {
  return item?.optionGroups.flatMap((group) => group.options.map((option) => option.label)) ?? [];
}

test("structured loader represents all authored items and response libraries", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  assert.equal(manifest.items.length, 112);
  assert.equal(manifest.itemById.size, 112);
  assert.equal(manifest.responseLibraries.length, 91);
  assert.equal(manifest.responseLibraryById.size, 91);
  assert.ok(manifest.responseLibraries.every((library) => library.options.length > 0));
  assert.equal(new Set(manifest.responseLibraries.flatMap((library) => library.options.map((option) => option.optionId))).size,
    manifest.responseLibraries.flatMap((library) => library.options).length);
});

test("all broad-mapping prompts and normalized report support are renderable", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const mapping = manifest.items.filter((item) => item.bank === "mapping");
  const allowed = new Set<string>(LAYER_SECTION_CODES);
  assert.equal(mapping.length, 34);
  assert.ok(mapping.every((item) => item.prompt.trim().length > 0));
  assert.ok(manifest.items.every((item) => item.supportedReportSections.length > 0));
  assert.ok(manifest.items.every((item) => item.supportedReportSections.every((section) => allowed.has(section))));
  assert.ok(manifest.items.every((item) => item.eligibility.length > 0 && item.mechanic.length > 0 && item.limits.length > 0 && item.branchRules.length > 0 && item.confidenceReplication.length > 0));
});

test("BTM-109 retains the canonical recovery gate as structured routing", async () => {
  const item = await loadRenderableInteraction("BTM-109");
  assert.ok(item);
  assert.equal(item.deterministicRouting.canonicalPostBodyRecoveryRequired, true);
  assert.match(item.branchRules, /next rendered screen is only `RSR-003` or an eligible `SEF-\*`/u);
  assert.match(item.recovery, /Mandatory canonical next screen/u);
  assert.ok(item.deterministicRouting.routeBankItemIds.includes("RSR-003"));
});

test("representative authored options survive normalization", async () => {
  const rl = await loadRenderableInteraction("RL-101");
  const bda = await loadRenderableInteraction("BDA-102");
  const btm = await loadRenderableInteraction("BTM-109");
  const fcf = await loadRenderableInteraction("FCF-201");
  assert.ok(optionLabels(rl).includes("A close friend"));
  assert.ok(optionLabels(bda).includes("I rehearsed what to say"));
  assert.ok(optionLabels(btm).includes("tight"));
  assert.ok(optionLabels(fcf).includes("matches"));
});

