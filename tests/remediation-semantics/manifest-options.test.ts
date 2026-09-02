import assert from "node:assert/strict";
import test from "node:test";
import { loadStructuredInstrumentManifest } from "../../lib/question-engine/renderable-manifest.ts";
import { ACTIVE_EXECUTABLE_ROUTING_CONTRACTS, EXECUTABLE_ROUTING_CONTRACT_VERSION } from "../../lib/question-engine/routing-contracts.ts";

test("every authored option has a stable semantic ID and repeated manifest loads reproduce it", async () => {
  const first = await loadStructuredInstrumentManifest();
  const second = await loadStructuredInstrumentManifest();
  const flatten = (manifest: typeof first) => manifest.items.flatMap((item) => item.optionGroups.flatMap((group) => group.options.map((option) => [item.bankItemId, option.label, option.optionId] as const)));
  const firstOptions = flatten(first);
  assert.ok(firstOptions.length > 0);
  assert.ok(firstOptions.every(([, , optionId]) => /^(?:OPT-|OL-)[A-Za-z0-9._-]+$/u.test(optionId)));
  assert.deepEqual(firstOptions, flatten(second));
});

test("every active item uses a fully reviewed executable contract bound to authored provenance", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  assert.equal(ACTIVE_EXECUTABLE_ROUTING_CONTRACTS.length, 61);
  for (const contract of ACTIVE_EXECUTABLE_ROUTING_CONTRACTS) {
    const item = manifest.itemById.get(contract.bankItemId)!;
    assert.equal(item.deterministicRouting.executable, contract);
    assert.equal(contract.contractVersion, EXECUTABLE_ROUTING_CONTRACT_VERSION);
    assert.equal(contract.compilation, "compiled");
    assert.equal(contract.eligibilityCompilation, "compiled");
    assert.equal(contract.branchCompilation, "compiled");
    assert.equal(contract.recoveryCompilation, "compiled");
    assert.deepEqual(contract.uncompiledFragments, []);
    assert.equal(contract.provenance.authoredBlockSha256, item.authoredContentSha256);
  }
});
