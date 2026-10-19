import test from "node:test";
import assert from "node:assert/strict";
import { sequenceBindingMatches, validateRecordEvidence } from "./validate-interpretation.mjs";

const sourceEdge = {
  occurrence_id: "event-1",
  from_step: "D36.input",
  to_step: "D36.words",
  relation: "before",
  meaning: "reported_temporal_relation_not_causality",
  evidence_ids: ["obs-input", "obs-words"],
};
const packetEdge = { ...sourceEdge };

test("D36 sequence validation requires every source observation on the edge", () => {
  assert.equal(sequenceBindingMatches(sourceEdge, packetEdge, ["obs-input", "obs-words"], ["event-1", "event-1"]), true);
  assert.equal(sequenceBindingMatches(sourceEdge, packetEdge, ["obs-input"], ["event-1"]), false);
});

test("sequence validation rejects source-to-packet lineage drift", () => {
  assert.equal(sequenceBindingMatches(sourceEdge, { ...packetEdge, to_step: "D36.think" }, ["obs-input", "obs-words"], ["event-1"]), false);
  assert.equal(sequenceBindingMatches(sourceEdge, packetEdge, ["obs-input", "obs-words"], ["event-1", "event-2"]), false);
});

test("reported recovery order is a valid explicit temporal edge", () => {
  const recoveryEdge = {
    ...sourceEdge,
    meaning: "reported_recovery_order",
    from_step: "recovery/D36.input",
    to_step: "recovery/D36.words",
  };
  assert.equal(sequenceBindingMatches(recoveryEdge, recoveryEdge, ["obs-input", "obs-words"], ["event-1"]), true);
});

test("graph-wide evidence checks reject synthetic citations outside claims", () => {
  const issues = [];
  const packetObservation = {
    id: "synthetic-observation",
    response_id: "response-synthetic",
    selection_reason: "new_synthetic_mapping_response",
    option_id: "M01.example",
    item_id: "M01",
    occurrence_id: "event-1",
    step_id: "first",
  };
  validateRecordEvidence({ id: "strength-1", evidence_ids: [packetObservation.id] }, "observed_strengths", {
    issues,
    sourceRows: new Map(),
    packetObservations: new Map([[packetObservation.id, packetObservation]]),
    packet: { superseded_response_ids: [], invalidated_response_ids: [] },
    claimIds: new Set(),
    sourceEdges: new Map(),
    packetEdges: new Map(),
  });
  assert.ok(issues.some((issue) => issue.code === "graph_non_authored_or_stale_evidence"));
});
