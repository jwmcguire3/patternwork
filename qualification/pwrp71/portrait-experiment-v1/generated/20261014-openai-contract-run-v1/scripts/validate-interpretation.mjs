import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(runDir, "..", "..", "..", "..", "..");
const pins = {
  experimentSha256: "eecb94ff118569ff44288fc81333aa42d0dee6dd868b514e02d3f0e09b47db33",
  packets: {
    P02: "a28c19101cb596fca4e395806793944cc5135fc1b619a450161e3e9dcac8d497",
    C10: "109ad81a85793f0f114351e42e7f2f4f62e927a80a76e23b0afee4e112b87cb3",
  },
  reportManifestSha256: "026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5",
  draftSchemaSha256: "14e880841aab064593b777b9d113376a30338968e4b0375a38955b174e55b4ba",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function fail(issues, code, message, claimId = null) {
  issues.push({ code, message, claimId });
}

export function sequenceBindingMatches(sourceEdge, edge, claimEvidenceIds, occurrenceIds) {
  return sourceEdge.occurrence_id === edge.occurrence_id
    && sourceEdge.from_step === edge.from_step
    && sourceEdge.to_step === edge.to_step
    && sourceEdge.relation === edge.relation
    && sourceEdge.meaning === edge.meaning
    && canonical([...sourceEdge.evidence_ids].sort()) === canonical([...edge.evidence_ids].sort())
    && edge.evidence_ids.every((id) => claimEvidenceIds.includes(id))
    && occurrenceIds.every((occurrenceId) => occurrenceId === edge.occurrence_id);
}

export function validateRecordEvidence(record, label, context) {
  const { issues, sourceRows, packetObservations, packet, claimIds, sourceEdges, packetEdges } = context;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    fail(issues, "graph_record_invalid", `${label} must be an object.`);
    return;
  }
  const primaryEvidence = record.evidence_ids ?? [];
  const counterEvidence = record.counterevidence_ids ?? [];
  if (!Array.isArray(primaryEvidence) || !Array.isArray(counterEvidence)) {
    fail(issues, "graph_evidence_ids_invalid", `${label} evidence reference fields must be arrays.`, record.id ?? null);
    return;
  }
  const evidenceIds = [...primaryEvidence, ...counterEvidence];
  const occurrences = new Set();
  for (const id of evidenceIds) {
    const observation = packetObservations.get(id);
    const sourceRow = sourceRows.get(id);
    if (!observation || !sourceRow
      || !observation.selection_reason?.includes("original_authored_fictional_response")
      || packet.superseded_response_ids.includes(observation.response_id)
      || packet.invalidated_response_ids.includes(observation.response_id)
      || observation.response_id !== sourceRow.current_response_id
      || observation.option_id !== sourceRow.option_id
      || observation.item_id !== sourceRow.item_id
      || observation.occurrence_id !== sourceRow.occurrence_id
      || observation.step_id !== sourceRow.step_id) {
      fail(issues, "graph_non_authored_or_stale_evidence", `${label} cites missing, synthetic, superseded, invalidated, or mismatched evidence.`, record.id ?? null);
      continue;
    }
    occurrences.add(sourceRow.occurrence_id);
  }
  if (Array.isArray(record.occurrence_ids)
    && canonical([...new Set(record.occurrence_ids)].sort()) !== canonical([...occurrences].sort())) {
    fail(issues, "graph_occurrence_scope_mismatch", `${label} occurrence_ids do not match its current authored evidence.`, record.id ?? null);
  }
  const referencedClaims = [...(record.claim_ids ?? []), ...(record.related_claim_ids ?? [])];
  for (const id of referencedClaims) {
    if (!claimIds.has(id)) fail(issues, "graph_claim_reference_missing", `${label} references an unknown claim.`, record.id ?? null);
  }
  for (const edgeId of record.sequence_edge_ids ?? []) {
    const edge = packetEdges.get(edgeId);
    const sourceEdge = sourceEdges.get(edgeId);
    if (!edge || !sourceEdge || edge.relation !== "before"
      || !new Set(["reported_temporal_relation_not_causality", "reported_recovery_order"]).has(edge.meaning)
      || !sequenceBindingMatches(sourceEdge, edge, evidenceIds, [...occurrences])) {
      fail(issues, "graph_sequence_lineage_mismatch", `${label} sequence edge lacks exact current same-occurrence authored evidence.`, record.id ?? null);
    }
  }
}

async function main() {
  const profile = process.argv[2];
  if (!new Set(["P02", "C10"]).has(profile)) throw new Error("Only P02 or C10 can be checked.");
  let attemptNumber = 1;
  let receiptSuffix = "";
  let inputRelative = null;
  for (let index = 3; index < process.argv.length; index += 1) {
    const option = process.argv[index];
    const value = process.argv[index + 1];
    if (option === "--attempt" && value && Number.isSafeInteger(Number(value)) && Number(value) > 0) {
      attemptNumber = Number(value);
      index += 1;
    } else if (option === "--receipt-suffix" && value && /^[a-z0-9-]{1,40}$/.test(value)) {
      receiptSuffix = `.${value}`;
      index += 1;
    } else if (option === "--input-file" && value && !path.isAbsolute(value)
      && value.startsWith("outputs/") && !value.split(/[\\/]/).includes("..")) {
      inputRelative = value.replaceAll("\\", "/");
      index += 1;
    } else {
      throw new Error("Optional syntax is --attempt <positive integer>, --receipt-suffix <lowercase-label>, and --input-file outputs/<file>.");
    }
  }
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) throw new Error("Attempt number must be a positive integer.");
  const attemptSuffix = attemptNumber > 1 ? `.attempt-${attemptNumber}` : "";
  const preparedDir = path.join(runDir, "prepared");
  const allowedC10Derivative = profile === "C10" && inputRelative === "outputs/C10.interpretation.curated-v2.json"
    && receiptSuffix === ".curated-v2";
  const allowedP02Derivative = profile === "P02" && attemptNumber === 5
    && inputRelative === "outputs/P02.interpretation.curated-v1.json" && receiptSuffix === ".p02-curated-v1";
  if (inputRelative && !allowedC10Derivative && !allowedP02Derivative) {
    throw new Error("Alternate interpretation inputs are limited to the exact reviewed C10 curated-v2 and P02 attempt-5 curated-v1 derivatives, each with a distinct receipt suffix.");
  }
  const outputRelative = inputRelative ?? `outputs/${profile}.interpretation${attemptSuffix}.json`;
  const outputPath = path.join(runDir, ...outputRelative.split("/"));
  const outputBytes = await readFile(outputPath);
  const output = JSON.parse(outputBytes.toString("utf8"));
  const prepared = await json(path.join(preparedDir, profile + ".interpretation.input.json"));
  const sourceIndexPath = path.join(runDir, "outputs", profile + ".source-observation-index-v3.json");
  const sourceIndexBytes = await readFile(sourceIndexPath);
  const sourceIndex = JSON.parse(sourceIndexBytes.toString("utf8"));
  const packet = prepared.evidencePacket;
  const issues = [];

  if (prepared.profileId !== profile || prepared.packetSha256 !== pins.packets[profile]
    || prepared.experimentSha256 !== pins.experimentSha256
    || packet.content_sha256 !== pins.packets[profile]) fail(issues, "input_pin_mismatch", "Prepared input, packet, profile, or experiment pin differs.");
  const packetContent = Object.fromEntries(Object.entries(packet).filter(([key]) => key !== "content_sha256"));
  if (sha256(Buffer.from(canonical(packetContent), "utf8")) !== pins.packets[profile]) fail(issues, "packet_digest_mismatch", "Canonical packet digest does not match the required pin.");
  if (sourceIndex.status !== "source_cross_checked_fictional_evidence"
    || sourceIndex.profileId !== profile
    || sourceIndex.packetSha256 !== pins.packets[profile]
    || sourceIndex.fixtureSet !== "route-replays-v5") fail(issues, "source_index_pin_mismatch", "The source-observation index is not bound to the current profile and packet.");
  if (output.profile_id !== profile || output.packet_sha256 !== pins.packets[profile]) fail(issues, "model_output_pin_mismatch", "Provider output does not identify this profile and packet.");

  const sourceIds = new Set(sourceIndex.observations.map((observation) => observation.observation_id));
  const packetObservations = new Map(packet.observations.map((observation) => [observation.id, observation]));
  const sourceRows = new Map(sourceIndex.observations.map((observation) => [observation.observation_id, observation]));
  const sourceEdges = new Map(sourceIndex.sequenceEdges.map((edge) => [edge.id, edge]));
  const packetEdges = new Map(packet.sequence_edges.map((edge) => [edge.id, edge]));
  const claimIds = new Set();
  const claimEvidence = [];
  for (const claim of output.claims ?? []) {
    if (!claim.id || claimIds.has(claim.id)) fail(issues, "claim_id_invalid", "Claim ID is empty or duplicated.", claim.id ?? null);
    claimIds.add(claim.id);
    const refs = [...(claim.evidence_ids ?? []), ...(claim.counterevidence_ids ?? [])];
    const rows = [];
    for (const id of refs) {
      const packetObservation = packetObservations.get(id);
      const sourceRow = sourceRows.get(id);
      if (!packetObservation || !sourceRow || !sourceIds.has(id)) {
        fail(issues, "non_authored_or_missing_evidence", "Claim cites an observation outside the source-cross-checked authored evidence set.", claim.id);
        continue;
      }
      if (!packetObservation.selection_reason?.includes("original_authored_fictional_response")
        || packet.superseded_response_ids.includes(packetObservation.response_id)
        || packet.invalidated_response_ids.includes(packetObservation.response_id)
        || packetObservation.response_id !== sourceRow.current_response_id
        || packetObservation.option_id !== sourceRow.option_id
        || packetObservation.item_id !== sourceRow.item_id
        || packetObservation.occurrence_id !== sourceRow.occurrence_id
        || packetObservation.step_id !== sourceRow.step_id) {
        fail(issues, "evidence_lineage_mismatch", "Claim evidence does not match its current source response, option, occurrence, and step lineage.", claim.id);
        continue;
      }
      rows.push({ observationId: id, sourceResponseId: sourceRow.source_response_id, responseId: sourceRow.current_response_id, itemId: sourceRow.item_id, optionId: sourceRow.option_id, occurrenceId: sourceRow.occurrence_id, stepId: sourceRow.step_id, basis: sourceRow.basis, capture: sourceRow.capture, targetIds: sourceRow.target_ids });
    }
    if (["reported", "supported_interpretation"].includes(claim.kind) && refs.length === 0) fail(issues, "claim_without_evidence", "Claim marked reported or supported has no source evidence.", claim.id);
    const expectedOccurrences = [...new Set(rows.map((row) => row.occurrenceId))].sort();
    const claimOccurrences = [...(claim.scope?.occurrence_ids ?? [])].sort();
    if (["reported", "supported_interpretation"].includes(claim.kind)
      && canonical(expectedOccurrences) !== canonical(claimOccurrences)) fail(issues, "claim_scope_mismatch", "Claim scope occurrence IDs do not exactly match cited source observations.", claim.id);
    if (["reported_tendency", "recurring_within_context", "across_sampled_contexts"].includes(claim.scope?.level)) {
      fail(issues, "unsupported_recurrence_scope", "A single fictional occurrence cannot support recurring or across-sampled-context scope.", claim.id);
    }
    for (const edgeId of claim.sequence_edge_ids ?? []) {
      const sourceEdge = sourceEdges.get(edgeId);
      const edge = packetEdges.get(edgeId);
      if (!edge || !sourceEdge || edge.relation !== "before"
        || !new Set(["reported_temporal_relation_not_causality", "reported_recovery_order"]).has(edge.meaning)) {
        fail(issues, "unsupported_sequence_edge", "Sequence reference is missing or is not an explicitly reported temporal order.", claim.id);
        continue;
      }
      if (!sequenceBindingMatches(sourceEdge, edge, claim.evidence_ids ?? [], rows.map((row) => row.occurrenceId))) {
        fail(issues, "sequence_lineage_mismatch", "Sequence edge and all of its source observations must match the packet edge in the same occurrence.", claim.id);
      }
    }
    for (const dependency of claim.depends_on_claim_ids ?? []) {
      if (!(output.claims ?? []).some((candidate) => candidate.id === dependency)) fail(issues, "unknown_claim_dependency", "Claim dependency references an unknown claim.", claim.id);
    }
    claimEvidence.push({ claimId: claim.id, kind: claim.kind, scopeLevel: claim.scope?.level ?? null, occurrenceIds: claimOccurrences, citedSourceObservations: rows });
  }
  for (const name of output.name_registry ?? []) {
    if (!name.supporting_claim_ids?.length || name.supporting_claim_ids.some((id) => !claimIds.has(id))) {
      fail(issues, "name_without_claim_support", "Name has no valid supporting claim binding.");
    }
  }
  const nameIds = new Set((output.name_registry ?? []).map((name) => name.name_id));
  for (const relation of output.relationships ?? []) {
    if (!nameIds.has(relation.from_name_id) || !nameIds.has(relation.to_name_id)
      || !relation.claim_ids?.length || relation.claim_ids.some((id) => !claimIds.has(id))) {
      fail(issues, "relationship_without_claim_support", "Relationship has an invalid name or claim binding.");
    }
  }
  for (const id of output.priority_claim_ids ?? []) if (!claimIds.has(id)) fail(issues, "priority_claim_missing", "Priority claim ID is not in the interpretation graph.");

  const recordContext = { issues, sourceRows, packetObservations, packet, claimIds, sourceEdges, packetEdges };
  for (const [collectionName, records] of [
    ["observed_strengths", output.observed_strengths],
    ["counterexamples", output.counterexamples],
    ["open_questions", output.open_questions],
  ]) {
    if (!Array.isArray(records)) {
      fail(issues, "graph_collection_invalid", `${collectionName} must be an array.`);
      continue;
    }
    for (const record of records) validateRecordEvidence(record, collectionName, recordContext);
  }

  const reportManifestPath = path.join(repoRoot, "reporting", "contracts", "report_release_manifest.json");
  const reportManifestBytes = await readFile(reportManifestPath);
  if (sha256(reportManifestBytes) !== pins.reportManifestSha256) fail(issues, "report_manifest_pin_mismatch", "PWRP 7.1 manifest differs from the reviewed pin.");
  const schemaPath = path.join(repoRoot, "reporting", "schemas", "report_draft.schema.json");
  const schemaBytes = await readFile(schemaPath);
  if (sha256(schemaBytes) !== pins.draftSchemaSha256) fail(issues, "report_schema_pin_mismatch", "PWRP 7.1 report-draft schema differs from the reviewed pin.");
  const receipt = {
    schemaVersion: "PATTERNWORK-PWRP71-INTERPRETATION-SOURCE-VALIDATION-V1",
    validationMode: "intermediate_interpretation_graph_source_lineage",
    status: issues.length === 0 ? "source_reference_checks_passed" : "source_reference_checks_failed",
    checkedAt: new Date().toISOString(),
    profileId: profile,
    attemptNumber,
    packetSha256: pins.packets[profile],
    experimentSha256: pins.experimentSha256,
    sourceIdentity: prepared.sourceIdentity,
    modelOutputFile: outputRelative,
    modelOutputFileSha256: sha256(outputBytes),
    modelOutputCompactSha256: sha256(JSON.stringify(output)),
    sourceObservationIndexFile: path.relative(runDir, sourceIndexPath).replaceAll("\\", "/"),
    sourceObservationIndexFileSha256: sha256(sourceIndexBytes),
    reportManifestSha256: sha256(reportManifestBytes),
    reportDraftSchemaSha256: sha256(schemaBytes),
    claimEvidence,
    checks: {
      onlyCurrentSourceAuthoredObservations: true,
      syntheticAnswersCannotSupportClaims: true,
      oneOccurrenceCannotSupportRecurrence: true,
      sequenceEdgesRequirePacketAndSourceIndexLineage: true,
      productionClaimSchema: "pinned_for_composed_draft_validation; not applied to intermediate graph",
      noHumanApprovalOrRoutingQualification: true,
    },
    issues,
  };
  const receiptPath = path.join(runDir, "outputs", `${profile}.interpretation${attemptSuffix}.validation${receiptSuffix}.json`);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ profile, status: receipt.status, issueCount: issues.length, receiptPath: path.relative(runDir, receiptPath).replaceAll("\\", "/"), modelOutputCompactSha256: receipt.modelOutputCompactSha256 }, null, 2));
  if (issues.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
