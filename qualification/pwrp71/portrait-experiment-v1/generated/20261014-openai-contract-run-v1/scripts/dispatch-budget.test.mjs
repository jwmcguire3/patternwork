import assert from "node:assert/strict";
import test from "node:test";
import { countPotentialProviderDispatches } from "./dispatch-budget.mjs";

test("only an explicitly reconciled pre-provider failure is excluded from the dispatch cap", () => {
  const calls = [
    { status: "failed_before_provider_dispatch" },
    { status: "unknown_cost" },
    { status: "reserved" },
    { status: "completed" },
    { status: "completed_needs_review" },
    { status: "rejected_no_generation" },
    { status: "some_future_status" },
    {},
  ];
  assert.equal(countPotentialProviderDispatches(calls), 7);
});

test("refuses malformed journal call collections", () => {
  assert.throws(() => countPotentialProviderDispatches(null), /must be an array/);
});
