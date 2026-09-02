import assert from "node:assert/strict";
import test from "node:test";
import { loadStructuredInstrumentManifest } from "../../lib/question-engine/renderable-manifest.ts";

test("every authored option has a stable semantic ID and repeated manifest loads reproduce it", async () => {
  const first = await loadStructuredInstrumentManifest();
  const second = await loadStructuredInstrumentManifest();
  const flatten = (manifest: typeof first) => manifest.items.flatMap((item) => item.optionGroups.flatMap((group) => group.options.map((option) => [item.bankItemId, option.label, option.optionId] as const)));
  const firstOptions = flatten(first);
  assert.ok(firstOptions.length > 0);
  assert.ok(firstOptions.every(([, , optionId]) => /^(?:OPT-|OL-)[A-Za-z0-9._-]+$/u.test(optionId)));
  assert.deepEqual(firstOptions, flatten(second));
});
