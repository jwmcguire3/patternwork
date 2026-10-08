import assert from "node:assert/strict";
import test from "node:test";
import { isReplayOperatorItem } from "../../scripts/pwqe51-parity/classification.ts";

test("parity classification recognizes the authored REPLAY item ID without matching ordinary items", () => {
  assert.equal(isReplayOperatorItem("REPLAY"), true);
  assert.equal(isReplayOperatorItem("REPLAY:contrast_context"), true);
  assert.equal(isReplayOperatorItem("D41"), false);
  assert.equal(isReplayOperatorItem(undefined), false);
});
