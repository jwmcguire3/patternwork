import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

async function fixture() {
  const questionSource = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const question = questionSource.questionBank.items.find((item) => item.id === "D99")!;
  const option = question.options[0];
  const responseId = "response-typicality";
  const observationId = `O${digest([responseId, option.id]).slice(0, 20)}`;
  const episodeId = "occurrence-1";
  const observation = {
    id: observationId,
    response_id: responseId,
    administration_id: "admin-typicality",
    item_id: question.id,
    option_id: option.id,
    variant: "base",
    text: option.text,
    displayed_text: option.text,
    reported_value: option.reported_value,
    capture: question.captures,
    occurrence_id: episodeId,
    step_id: "typicality",
    basis: "reported_typicality",
    mode: "single",
    dependence_group: episodeId,
    selection_reason: "conditional follow-up selected from server routing",
    source_version: question.version,
    person_id: null,
    signals: option.candidate_signals ?? [],
  };
  const packet: Record<string, unknown> = {
    format: "patternwork-router-evidence-v1",
    release_id: questionSource.manifest.source_binding.question_release,
    snapshot_id: "snapshot-1",
    packet_id: "packet-1",
    source_binding: { ...questionSource.manifest.source_binding },
    superseded_response_ids: [],
    invalidated_response_ids: [],
    assessment_scope: {
      recall_window: "Per-question respondent recall.",
      report_language: "en",
      phase: "deepening",
      interpretation_authority: "Respondent self-report.",
      evidence_basis: "Retrospective self-report.",
      completion_reason: null,
      readiness: {
        mapping_coverage_complete: false,
        normal_mapping_ready: true,
        applicable_pending_items: [],
        offered_mapping_items: [],
        actual_occurrence_ids: [episodeId],
        sampled_contexts: ["work"],
        closed_coverage: {},
        usable_actual_occurrences: 1,
        unresolved_bindings: 0,
        administrations: 1,
        mapping_administrations: 0,
        decisions: 1,
        controls: 0,
        interpretive_quota: null,
        report_readiness: "scoped_evidence_available",
      },
    },
    observations: [observation],
    episodes: [{
      id: episodeId, family: "work", context: "work", root_item_id: "M01", basis: "actual_recalled", status: "actual_recalled",
      recall_window: "recent", person_id: null, role: null, topic: null, linked_from: null, distinct_from: [], outside_window: false,
    }],
    steps: [{ id: "step-record-1", occurrence_id: episodeId, step_id: "typicality", observation_ids: [observationId] }],
    sequence_edges: [],
    target_resolutions: [],
    structural_evidence_summaries: [],
    supported_alternatives: [],
    counterexamples: [],
    secure_capacity_examples: [],
    missingness: [],
    corrections: [],
    unresolved_bindings: [],
    referent_scopes: [],
    context_comparisons: [],
    reported_context_controls: [],
    interpretation_disputes: [],
    open_questions: [],
    administration_provenance: [{
      id: "admin-typicality", item_id: question.id, variant: "base", occurrence_id: episodeId, phase: "deepening",
      selection_reason: "conditional follow-up selected from server routing", option_order: [option.id], live_response_id: responseId,
    }],
  };
  packet.content_sha256 = digest(packet);
  return { packet: packet as JsonObject, observation, questionSource, reportSource };
}

test("PWRP 7.1 adapter preserves source observations and derives report bindings", async () => {
  const value = await fixture();
  const result = preparePwrp71Request({ packet: value.packet, reportType: "MAP", questionSource: value.questionSource, reportSource: value.reportSource });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues));
  if (!result.ok) return;
  const provider = result.value.user_data;
  assert.deepEqual((provider.observations as unknown[])[0], value.observation);
  assert.equal(provider.report_release, "PWRP-7.1.0-candidate.1");
  assert.equal(provider.evidence_sha256, value.packet.content_sha256);
  assert.equal(result.value.binding.report_release, "PWRP-7.1.0-candidate.1");
  assert.equal(result.value.binding.evidence_sha256, value.packet.content_sha256);
  assert.equal("administration_provenance" in provider, false);
  assert.equal("content_sha256" in provider, false);
  assert.equal(result.value.binding.prompt_sha256.length, 64);
});

test("caller-provided report release or evidence hash cannot override packet and policy bindings", async () => {
  const value = await fixture();
  const forged = { ...value.packet, report_release: "caller-release", evidence_sha256: "f".repeat(64) } as JsonObject;
  const result = preparePwrp71Request({ packet: forged, reportType: "MAP", questionSource: value.questionSource, reportSource: value.reportSource });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((entry) => entry.code === "router_packet_schema"));

  const clean = preparePwrp71Request({ packet: value.packet, reportType: "MAP", questionSource: value.questionSource, reportSource: value.reportSource });
  assert.equal(clean.ok, true);
  if (clean.ok) {
    assert.equal(clean.value.user_data.report_release, value.reportSource.policy.release);
    assert.equal(clean.value.user_data.evidence_sha256, value.packet.content_sha256);
  }
});

test("step names may repeat across occurrences while sequence edges stay occurrence-bound", async () => {
  const value = await fixture();
  const item = value.questionSource.questionBank.items.find((candidate) => candidate.id === "D07")!;
  const option = item.options.find((candidate) => candidate.id === "D07.more")!;
  const responseId = "response-next";
  const observationId = `O${digest([responseId, option.id]).slice(0, 20)}`;
  const observation = {
    id: observationId,
    response_id: responseId,
    administration_id: "admin-next",
    item_id: item.id,
    option_id: option.id,
    variant: "base",
    text: option.text,
    displayed_text: option.text,
    reported_value: option.reported_value,
    capture: item.captures,
    occurrence_id: "occurrence-1",
    step_id: "next",
    basis: "actual_recalled",
    mode: "single",
    dependence_group: "occurrence-1",
    selection_reason: "sequenced follow-up",
    source_version: item.version,
    person_id: null,
    signals: option.candidate_signals ?? [],
  };
  const packet = structuredClone(value.packet) as Record<string, unknown>;
  packet.observations = [...packet.observations as unknown[], observation];
  packet.episodes = [...packet.episodes as unknown[], {
    id: "occurrence-2", family: "work", context: "work", root_item_id: "M01", basis: "actual_recalled", status: "actual_recalled",
    recall_window: "recent", person_id: null, role: null, topic: null, linked_from: null, distinct_from: [], outside_window: false,
  }];
  packet.steps = [
    ...packet.steps as unknown[],
    { id: "step-record-next", occurrence_id: "occurrence-1", step_id: "next", observation_ids: [observationId] },
    { id: "step-record-other", occurrence_id: "occurrence-2", step_id: "typicality", observation_ids: [] },
  ];
  packet.sequence_edges = [{
    id: "edge-1", occurrence_id: "occurrence-1", from_step: "typicality", to_step: "next", meaning: "reported sequence",
    relation: "before", evidence_ids: [(value.observation as Record<string, unknown>).id, observationId], first_not_helping: false,
  }];
  packet.administration_provenance = [...packet.administration_provenance as unknown[], {
    id: "admin-next", item_id: "D07", variant: "base", occurrence_id: "occurrence-1", phase: "deepening",
    selection_reason: "sequenced follow-up", option_order: [option.id], live_response_id: responseId,
  }];
  const unsigned = structuredClone(packet);
  delete unsigned.content_sha256;
  packet.content_sha256 = digest(unsigned);
  const result = preparePwrp71Request({ packet: packet as JsonObject, reportType: "MAP", questionSource: value.questionSource, reportSource: value.reportSource });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues));
});

function resignPacket(packet: Record<string, unknown>): JsonObject {
  const unsigned = structuredClone(packet);
  delete unsigned.content_sha256;
  packet.content_sha256 = digest(unsigned);
  return packet as JsonObject;
}

test("adapter rejects cross-step observation references before provider request preparation", async () => {
  const value = await fixture();
  const packet = structuredClone(value.packet) as Record<string, unknown>;
  packet.steps = [{ id: "step-record-1", occurrence_id: "occurrence-1", step_id: "other-step", observation_ids: [(value.observation as Record<string, unknown>).id] }];
  const result = preparePwrp71Request({ packet: resignPacket(packet), reportType: "MAP", questionSource: value.questionSource, reportSource: value.reportSource });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((entry) => entry.code === "step_lineage" || entry.code === "observation_step_lineage"));
});

test("adapter rejects sequence evidence from another occurrence before provider request preparation", async () => {
  const value = await fixture();
  const packet = structuredClone(value.packet) as Record<string, unknown>;
  const otherOccurrence = "occurrence-2";
  const question = value.questionSource.questionBank.items.find((item) => item.id === "D07")!;
  const option = question.options[0];
  const responseId = "response-other-occurrence";
  const observationId = `O${digest([responseId, option.id]).slice(0, 20)}`;
  const observation = {
    id: observationId, response_id: responseId, administration_id: "admin-other", item_id: question.id,
    option_id: option.id, variant: "base", text: option.text, displayed_text: option.text,
    reported_value: option.reported_value, capture: question.captures, occurrence_id: otherOccurrence,
    step_id: "next", basis: "actual_recalled", mode: "single", dependence_group: otherOccurrence,
    selection_reason: "server-selected authored question", source_version: question.version,
    person_id: null, signals: option.candidate_signals ?? [],
  };
  packet.observations = [...packet.observations as unknown[], observation];
  packet.episodes = [...packet.episodes as unknown[], {
    id: otherOccurrence, family: "work", context: "work", root_item_id: "M01", basis: "actual_recalled", status: "actual_recalled",
    recall_window: "recent", person_id: null, role: null, topic: null, linked_from: null, distinct_from: [], outside_window: false,
  }];
  packet.steps = [...packet.steps as unknown[], { id: "step-record-next", occurrence_id: otherOccurrence, step_id: "next", observation_ids: [observationId] }];
  packet.sequence_edges = [{
    id: "edge-cross-occurrence", occurrence_id: "occurrence-1", from_step: "typicality", to_step: "next", meaning: "reported sequence",
    relation: "before", evidence_ids: [observationId], first_not_helping: false,
  }];
  packet.administration_provenance = [...packet.administration_provenance as unknown[], {
    id: "admin-other", item_id: question.id, variant: "base", occurrence_id: otherOccurrence, phase: "deepening",
    selection_reason: "server-selected authored question", option_order: [option.id], live_response_id: responseId,
  }];
  const result = preparePwrp71Request({ packet: resignPacket(packet), reportType: "MAP", questionSource: value.questionSource, reportSource: value.reportSource });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((entry) => entry.code === "sequence_lineage"));
});

test("adapter rejects a reported temporal cycle before provider request preparation", async () => {
  const value = await fixture();
  const observationId = (value.observation as Record<string, unknown>).id as string;
  const packet = structuredClone(value.packet) as Record<string, unknown>;
  packet.steps = [...packet.steps as unknown[], { id: "step-record-next", occurrence_id: "occurrence-1", step_id: "next", observation_ids: [] }];
  packet.sequence_edges = [
    { id: "edge-forward", occurrence_id: "occurrence-1", from_step: "typicality", to_step: "next", meaning: "reported sequence", relation: "before", evidence_ids: [observationId], first_not_helping: false },
    { id: "edge-reverse", occurrence_id: "occurrence-1", from_step: "next", to_step: "typicality", meaning: "reported sequence", relation: "before", evidence_ids: [observationId], first_not_helping: false },
  ];
  const result = preparePwrp71Request({ packet: resignPacket(packet), reportType: "MAP", questionSource: value.questionSource, reportSource: value.reportSource });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((entry) => entry.code === "sequence_cycle"));
});

test("synthesis requires the exact bound layer set and validates every layer claim", async () => {
  const value = await fixture();
  const observationId = (value.observation as Record<string, unknown>).id as string;
  const layerDraft = (reportType: "IFS" | "PV" | "ATT", evidenceId = observationId): JsonObject => ({
    report_release: value.reportSource.policy.release,
    release_id: value.packet.release_id,
    snapshot_id: value.packet.snapshot_id,
    evidence_sha256: value.packet.content_sha256,
    report_type: reportType,
    title: `${reportType} report`,
    title_claim_ids: [],
    content_status: "complete",
    sections: [{ id: `${reportType}-section`, heading: "Observed", text: "A reported response.", claim_ids: [`${reportType}-claim`] }],
    claims: [{
      id: `${reportType}-claim`, text: "A reported response.", kind: "reported", constructs: [],
      scope: { level: "occurrence", occurrence_ids: ["occurrence-1"], person_ids: [], description: "One recalled moment." },
      evidence_ids: [evidenceId], counterevidence_ids: [], sequence_edge_ids: [], depends_on_claim_ids: [],
      support_basis: ["direct_report"], rationale: "Direct observation.", remaining_uncertainty: [],
    }],
    name_registry: [], relationships: [], reflection_questions: [],
  });
  const acceptedLayers = { IFS: layerDraft("IFS"), PV: layerDraft("PV"), ATT: layerDraft("ATT") };
  const valid = preparePwrp71Request({ packet: value.packet, reportType: "SYNTHESIS", questionSource: value.questionSource, reportSource: value.reportSource, acceptedLayers });
  assert.equal(valid.ok, true, valid.ok ? undefined : JSON.stringify(valid.issues));

  const invalidLineage = { ...acceptedLayers, IFS: layerDraft("IFS", "O-not-in-packet") };
  const invalid = preparePwrp71Request({ packet: value.packet, reportType: "SYNTHESIS", questionSource: value.questionSource, reportSource: value.reportSource, acceptedLayers: invalidLineage });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.ok(invalid.issues.some((entry) => entry.code === "accepted_layer_validation"));

  const incomplete = preparePwrp71Request({ packet: value.packet, reportType: "SYNTHESIS", questionSource: value.questionSource, reportSource: value.reportSource, acceptedLayers: { IFS: acceptedLayers.IFS } });
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) assert.ok(incomplete.issues.some((entry) => entry.code === "accepted_layer_set"));
});

test("prospective targets need no fabricated observation step", async () => {
  const value = await fixture();
  const packet = structuredClone(value.packet) as Record<string, unknown>;
  packet.target_resolutions = [{
    id: "target-future", target_id: "recurrence", occurrence_id: "occurrence-1",
    step_id: "recovery", state: "open", reason: "future_discriminator",
    comparison_ids: [], source_ids: [(value.observation as Record<string, unknown>).id],
    resolution_ids: [], attempts: 0,
  }];
  const result = preparePwrp71Request({ packet: resignPacket(packet), reportType: "MAP", questionSource: value.questionSource, reportSource: value.reportSource });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues));
});

test("confirmed actual comparison allows pair-wide observations but not an unrelated occurrence", async () => {
  const value = await fixture();
  const packet = structuredClone(value.packet) as Record<string, unknown>;
  const oldObs = packet.observations as Record<string, unknown>[];
  const newObservation: Record<string, unknown> = {
    ...oldObs[0], id: `O${digest(["other-response", oldObs[0]!.option_id]).slice(0, 20)}`,
    response_id: "other-response", administration_id: "other-response",
    occurrence_id: "occurrence-2", dependence_group: "occurrence-2",
  };
  packet.episodes = [...packet.episodes as unknown[], {
    id: "occurrence-2", family: "work", context: "work", root_item_id: "M01",
    basis: "actual_recalled", status: "actual_recalled", recall_window: "recent",
    person_id: null, role: null, topic: null, linked_from: "occurrence-1",
    distinct_from: ["occurrence-1"], outside_window: false,
  }];
  packet.observations = [...oldObs, newObservation];
  packet.steps = [...packet.steps as unknown[], {
    id: "other-step", occurrence_id: "occurrence-2",
    step_id: "typicality", observation_ids: [newObservation.id],
  }];
  packet.administration_provenance = [...packet.administration_provenance as unknown[], {
    id: "other-response", item_id: newObservation.item_id, variant: "base",
    occurrence_id: "occurrence-2", phase: "deepening",
    selection_reason: "server-issued authored question", option_order: [newObservation.option_id],
    live_response_id: "other-response",
  }];
  packet.context_comparisons = [{
    occurrence_id: "occurrence-2", distinct_from: ["occurrence-1"],
    linked_from: "occurrence-1", basis: "respondent_confirmed_distinctness",
  }];
  packet.target_resolutions = [{
    id: "target-compare", target_id: "contrast_goal", occurrence_id: "occurrence-1",
    step_id: "comparison", state: "open", reason: "pair_context",
    comparison_ids: ["occurrence-1", "occurrence-2"],
    source_ids: [oldObs[0]!.id, newObservation.id], resolution_ids: [], attempts: 0,
  }];
  const good = preparePwrp71Request({ packet: resignPacket(packet), reportType: "MAP", questionSource: value.questionSource, reportSource: value.reportSource });
  assert.equal(good.ok, true, good.ok ? undefined : JSON.stringify(good.issues));
  const changed = structuredClone(packet);
  (changed.context_comparisons as Record<string, unknown>[])[0]!.basis = "respondent_cannot_tell_distinctness";
  (changed.context_comparisons as Record<string, unknown>[])[0]!.distinct_from = [];
  (changed.episodes as Record<string, unknown>[])[1]!.distinct_from = [];
  const bad = preparePwrp71Request({ packet: resignPacket(changed), reportType: "MAP", questionSource: value.questionSource, reportSource: value.reportSource });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.issues.some((issue) => issue.code === "target_lineage"));
});
