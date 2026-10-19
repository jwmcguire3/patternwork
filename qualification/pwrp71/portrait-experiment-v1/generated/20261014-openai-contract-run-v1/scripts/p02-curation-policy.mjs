import { createHash } from "node:crypto";

export const P02_CURATED_OUTPUT = "outputs/P02.interpretation.curated-v1.json";
export const P02_CURATION_RECEIPT = "outputs/P02.interpretation.curated-v1.derivation.json";
export const P02_CALL_ID = "189f5e43-b80e-4f50-9f84-ce8fd605468d";
export const P02_RESPONSE_ID = "resp_00c09462f20e87f3016ad0d6c7df0087d2afaae132b1f87871";
export const P02_PACKET_SHA256 = "a28c19101cb596fca4e395806793944cc5135fc1b619a450161e3e9dcac8d497";
export const P02_EXPERIMENT_SHA256 = "eecb94ff118569ff44288fc81333aa42d0dee6dd868b514e02d3f0e09b47db33";
export const P02_OCCURRENCE_ID = "pwep_14b3844b-40fc-4f28-a241-6c812b592dd3";
export const P02_EDGE_ID = "edge:pwr_cbcda3040bd22d070ab9ce0cc901ab53f9b973f2:D08.after_failed";
export const P02_EDGE_EVIDENCE_ID = "Oa6147904a3dbc2821d38";

export const P02_PARENT_HASHES = Object.freeze({
  "prepared/P02.interpretation.input.json": "5cb46749aa39edabd3e8f6cf9a1e753c4c4c6aad8a14065c51dadbed7e8012de",
  "outputs/P02.source-observation-index-v3.json": "6902ae1ace97a48ff8ea49e99c4ffc6a155bcfea6bcad570a5854587ff1f7417",
  "requests/P02.interpretation.attempt-5.request.json": "f8c36e20ba9043a8bfc4392c7b11c174f6766d60b796ab175c4ee29cdd5b9cb6",
  "responses/P02.interpretation.attempt-5.response.json": "4b574e0d880b47b39c7b842e3561553bd833b7f3f6d2b8a269a8edec8f8070ab",
  "outputs/P02.interpretation.attempt-5.raw-output.txt": "bb64e152ff133c3420310903349c18b5ac286e920e28b1ce5bed00a6951a82de",
  "outputs/P02.interpretation.attempt-5.json": "c967d35a2a5e139f0d31db3b568b523274eefdc019f899412e8c94d8b7824d2f",
  "outputs/P02.interpretation.attempt-5.validation.json": "f9a7fb44959532c5491420fee672af50073c111d8fa3e8d863afc0eaa84f2c90",
  "outputs/P02.interpretation.attempt-5.validation.source-recheck.json": "bd39d906fc1d53f5eb254c1aa6cdb64e69b6e4f960b415f02094d1b719c165ef",
});

export const P02_RETAINED_CLAIMS = Object.freeze([
  "c_conflict_preventive_explaining",
  "c_conflict_reported_sequence",
  "c_conflict_exit_relief",
]);
export const P02_RETAINED_NAMES = Object.freeze(["n_explainer", "n_exit"]);
export const P02_RETAINED_RELATIONSHIPS = Object.freeze(["r_conflict_reported_sequence"]);
export const P02_RETAINED_OPEN_QUESTIONS = Object.freeze([
  "oq_conflict_practical_context",
  "oq_vulnerable_experience",
  "oq_conflict_recurrence",
  "oq_function_identity",
]);

export const P02_EXIT_BEFORE = "In this occurrence, after the respondent reported that explaining was not helping, the next action was leaving or ending the exchange. The stated next aim was for the feeling to ease right then, and the reported next effect was that it became easier to bear. The action, aim, and effect support a local reactive, relief-oriented interruption function.";
export const P02_EXIT_AFTER = "In this occurrence, the next action was leaving or ending the exchange. The stated next aim was for the feeling to ease right then, and the reported next effect was that it became easier to bear. The action, aim, and effect support a local reactive, relief-oriented interruption function.";
export const P02_PREVENTIVE_BASIS_BEFORE = "Converging actual-recalled first-action and prevention-aim selections plus a remembered expectation/prediction; synthetic fictional evidence only.";
export const P02_PREVENTIVE_BASIS_AFTER = "Original authored fictional D61 first action, D02 prevention aim, and D03 remembered expectation/prediction, all bound to the same recalled conflict occurrence.";
export const P02_EXIT_BASIS_BEFORE = "Actual-recalled next action, explicit next aim, and reported next effect, together with the sourced temporal edge; synthetic fictional evidence only.";
export const P02_EXIT_BASIS_AFTER = "Original authored fictional D07 next action, D09 next aim, and D10 reported next effect, all bound to the same recalled conflict occurrence.";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function requireExact(actual, expected, label) {
  if (!same(actual, expected)) throw new Error(`${label} differs from the reviewed P02 parent.`);
}

export function verifyP02ParentHashes(bytesByPath) {
  for (const [file, expected] of Object.entries(P02_PARENT_HASHES)) {
    const bytes = bytesByPath[file];
    if (!Buffer.isBuffer(bytes) || sha256(bytes) !== expected) {
      throw new Error(`P02 parent drift or missing bytes: ${file}`);
    }
  }
  return true;
}

export function deriveP02CuratedGraph(providerOutput, sourceIndex, prepared) {
  if (providerOutput?.profile_id !== "P02" || providerOutput.packet_sha256 !== P02_PACKET_SHA256
    || sourceIndex?.profileId !== "P02" || sourceIndex.packetSha256 !== P02_PACKET_SHA256
    || sourceIndex.status !== "source_cross_checked_fictional_evidence"
    || sourceIndex.fixtureSet !== "route-replays-v5"
    || prepared?.profileId !== "P02" || prepared.packetSha256 !== P02_PACKET_SHA256
    || prepared.experimentSha256 !== P02_EXPERIMENT_SHA256
    || prepared.evidencePacket?.content_sha256 !== P02_PACKET_SHA256) {
    throw new Error("P02 curation requires the reviewed profile, packet, experiment, and authored index.");
  }
  requireExact(sourceIndex.occurrenceIds, [P02_OCCURRENCE_ID], "Authored occurrence set");
  requireExact(sourceIndex.observations.map((row) => row.item_id).sort(),
    ["D02", "D03", "D07", "D08", "D09", "D10", "D61"].sort(), "Authored question set");
  const authoredIds = new Set(sourceIndex.observations.map((row) => row.observation_id));
  const sourceEdge = sourceIndex.sequenceEdges.find((edge) => edge.id === P02_EDGE_ID);
  const packetEdge = prepared.evidencePacket.sequence_edges.find((edge) => edge.id === P02_EDGE_ID);
  if (!sourceEdge || !packetEdge || !same(sourceEdge, packetEdge)
    || sourceEdge.occurrence_id !== P02_OCCURRENCE_ID
    || sourceEdge.from_step !== "first" || sourceEdge.to_step !== "next"
    || sourceEdge.relation !== "before"
    || !same(sourceEdge.evidence_ids, [P02_EDGE_EVIDENCE_ID])
    || !authoredIds.has(P02_EDGE_EVIDENCE_ID)) {
    throw new Error("P02 reported temporal edge is not bound to the authored D08 observation.");
  }

  const result = clone(providerOutput);
  requireExact(result.claims.length, 19, "Provider claim count");
  const selected = (rows, ids, idField, collection) => {
    const kept = ids.map((id) => {
      const matches = rows.filter((row) => row[idField] === id);
      if (matches.length !== 1) throw new Error(`${collection} must contain exactly one ${id}.`);
      return matches[0];
    });
    return kept;
  };
  result.claims = selected(result.claims, P02_RETAINED_CLAIMS, "id", "claims");
  result.name_registry = selected(result.name_registry, P02_RETAINED_NAMES, "name_id", "name_registry");
  result.relationships = selected(result.relationships, P02_RETAINED_RELATIONSHIPS, "id", "relationships");
  requireExact(result.priority_claim_ids.filter((id) => P02_RETAINED_CLAIMS.includes(id)), P02_RETAINED_CLAIMS,
    "Retained priority order");
  result.priority_claim_ids = [...P02_RETAINED_CLAIMS];
  result.observed_strengths = [];
  result.counterexamples = [];
  result.open_questions = selected(result.open_questions, P02_RETAINED_OPEN_QUESTIONS, "id", "open_questions");

  const preventive = result.claims[0];
  const sequence = result.claims[1];
  const exit = result.claims[2];
  requireExact(preventive.support_basis, P02_PREVENTIVE_BASIS_BEFORE, "Preventive basis");
  requireExact(exit.text, P02_EXIT_BEFORE, "Exit text");
  requireExact(exit.support_basis, P02_EXIT_BASIS_BEFORE, "Exit basis");
  requireExact(exit.sequence_edge_ids, [P02_EDGE_ID], "Exit edge reference");
  requireExact(exit.depends_on_claim_ids, [sequence.id], "Exit sequence dependency");
  preventive.support_basis = P02_PREVENTIVE_BASIS_AFTER;
  exit.text = P02_EXIT_AFTER;
  exit.support_basis = P02_EXIT_BASIS_AFTER;
  exit.sequence_edge_ids = [];

  const expectedByClaim = new Map([
    [preventive.id, ["D61", "D02", "D03"]],
    [sequence.id, ["D61", "D07", "D08"]],
    [exit.id, ["D07", "D09", "D10"]],
  ]);
  const sourceById = new Map(sourceIndex.observations.map((row) => [row.observation_id, row]));
  for (const claim of result.claims) {
    const sourceItems = claim.evidence_ids.map((id) => {
      const row = sourceById.get(id);
      if (!row || row.occurrence_id !== P02_OCCURRENCE_ID) {
        throw new Error(`Claim ${claim.id} cites a non-authored or wrong-occurrence observation.`);
      }
      return row.item_id;
    });
    requireExact(sourceItems, expectedByClaim.get(claim.id), `${claim.id} authored evidence sequence`);
    requireExact(claim.counterevidence_ids, [], `${claim.id} counterevidence set`);
    requireExact(claim.scope?.level, "occurrence", `${claim.id} scope level`);
    requireExact(claim.scope?.occurrence_ids, [P02_OCCURRENCE_ID], `${claim.id} occurrence scope`);
  }
  requireExact(sequence.sequence_edge_ids, [P02_EDGE_ID], "Sequence claim edge");
  if (!sequence.evidence_ids.includes(P02_EDGE_EVIDENCE_ID)) {
    throw new Error("Sequence claim omits its authored D08 edge evidence.");
  }
  for (const name of result.name_registry) {
    requireExact(name.entity_kind, "candidate_response_function", `${name.name_id} entity kind`);
    if (name.supporting_claim_ids.some((id) => !P02_RETAINED_CLAIMS.includes(id))) {
      throw new Error(`Name ${name.name_id} depends on an omitted claim.`);
    }
  }
  const relation = result.relationships[0];
  requireExact(relation.from_name_id, "n_explainer", "Relationship source");
  requireExact(relation.to_name_id, "n_exit", "Relationship target");
  requireExact(relation.relation, "reported_temporal_sequence", "Relationship type");
  requireExact(relation.claim_ids, [sequence.id], "Relationship support");
  for (const row of result.open_questions) {
    if (!row.evidence_ids?.length || row.evidence_ids.some((id) => !authoredIds.has(id))
      || !same(row.scope?.occurrence_ids, [P02_OCCURRENCE_ID])
      || row.sequence_edge_ids?.some((id) => id !== P02_EDGE_ID
        || !row.evidence_ids.includes(P02_EDGE_EVIDENCE_ID))
      || row.related_claim_ids?.some((id) => !P02_RETAINED_CLAIMS.includes(id))) {
      throw new Error(`Open question ${row.id} is not bound to authored conflict evidence.`);
    }
  }
  const removed = Object.fromEntries([
    ["claims", providerOutput.claims.filter((row) => !P02_RETAINED_CLAIMS.includes(row.id)).map((row) => row.id)],
    ["name_registry", providerOutput.name_registry.filter((row) => !P02_RETAINED_NAMES.includes(row.name_id)).map((row) => row.name_id)],
    ["relationships", providerOutput.relationships.filter((row) => !P02_RETAINED_RELATIONSHIPS.includes(row.id)).map((row) => row.id)],
    ["observed_strengths", providerOutput.observed_strengths.map((row) => row.id)],
    ["counterexamples", providerOutput.counterexamples.map((row) => row.id)],
    ["open_questions", providerOutput.open_questions.filter((row) => !P02_RETAINED_OPEN_QUESTIONS.includes(row.id)).map((row) => row.id)],
  ]);
  const edits = [
    { claimId: preventive.id, field: "support_basis", before: P02_PREVENTIVE_BASIS_BEFORE, after: P02_PREVENTIVE_BASIS_AFTER,
      reason: "Correct provenance label to exact original authored D61/D02/D03 observations; no new evidence or substantive claim." },
    { claimId: exit.id, field: "text", before: P02_EXIT_BEFORE, after: P02_EXIT_AFTER,
      reason: "Remove temporal clause whose D08 edge evidence was not directly cited by this claim." },
    { claimId: exit.id, field: "support_basis", before: P02_EXIT_BASIS_BEFORE, after: P02_EXIT_BASIS_AFTER,
      reason: "Correct provenance label to exact original authored D07/D09/D10 observations and remove direct edge assertion." },
    { claimId: exit.id, field: "sequence_edge_ids", before: [P02_EDGE_ID], after: [],
      reason: "Keep temporal edge only on the separately sourced sequence claim and relationship." },
  ];
  return {
    value: result,
    edits,
    removed,
    policy: "constrained_p02_authored_evidence_correction_v1",
    limitations: ["One recalled fictional conflict occurrence only", "Labels are candidate response-function handles, not enduring part identities", "Fresh source validation and independent review required before composition"],
  };
}
