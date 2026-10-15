import { createHash } from "node:crypto";

export const C10_CURATED_OUTPUT = "outputs/C10.interpretation.curated-v2.json";
export const C10_CURATION_RECEIPT = "outputs/C10.interpretation.curated-v2.derivation.json";
export const C10_CURATED_VALIDATION = "outputs/C10.interpretation.validation.curated-v2.json";
export const C10_CURATED_REVIEW = "outputs/C10.interpretation.sol-review.curated-v2.json";
export const C10_CURATED_REVIEW_TEXT = "outputs/C10.interpretation.sol-review.curated-v2.md";
export const C10_CURATED_FROZEN = "outputs/C10.interpretation.curated-v2.frozen.json";
export const C10_PROVIDER_OUTPUT = "outputs/C10.interpretation.json";
export const C10_PROVIDER_RESPONSE = "responses/C10.interpretation.response.json";
export const C10_PROVIDER_CALL_ID = "379e8908-4d6e-4288-a1ea-9e3a20b274dc";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }

export function deriveC10CuratedGraph(providerOutput, sourceIndex) {
  if (providerOutput?.profile_id !== "C10" || sourceIndex?.profileId !== "C10"
    || sourceIndex?.status !== "source_cross_checked_fictional_evidence"
    || sourceIndex?.fixtureSet !== "route-replays-v5") {
    throw new Error("C10 curation requires the pinned provider output and source-cross-checked v5 index.");
  }
  const authoredIds = new Set((sourceIndex.observations ?? []).map((row) => row.observation_id));
  const removedClaimIds = new Set(["C10-C02", "C10-C03", "C10-C07"]);
  const removedNames = new Set(["C10-N01"]);
  const result = cloneJson(providerOutput);
  const removed = [];
  const retain = (collectionName, rows, shouldRetain) => rows.filter((row, index) => {
    if (shouldRetain(row)) return true;
    removed.push({
      collection: collectionName,
      originalIndex: index + 1,
      recordId: row.id ?? row.name_id ?? null,
      evidenceIds: [...new Set([...(row.evidence_ids ?? []), ...(row.counterevidence_ids ?? [])])],
      claimIds: [...new Set([...(row.claim_ids ?? []), ...(row.related_claim_ids ?? []), ...(row.supporting_claim_ids ?? [])])],
      reason: "Whole record omitted because it relies on synthetic/non-authored observations or a claim/name omitted from this derivative; record text and references were not edited.",
    });
    return false;
  });
  const validEvidence = (row) => [...(row.evidence_ids ?? []), ...(row.counterevidence_ids ?? [])]
    .every((id) => authoredIds.has(id));
  const validClaimRefs = (row) => [...(row.claim_ids ?? []), ...(row.related_claim_ids ?? [])]
    .every((id) => !removedClaimIds.has(id));

  result.claims = result.claims.filter((claim, index) => {
    if (!removedClaimIds.has(claim.id)) return true;
    removed.push({ collection: "claims", originalIndex: index + 1, recordId: claim.id,
      evidenceIds: [...new Set([...(claim.evidence_ids ?? []), ...(claim.counterevidence_ids ?? [])])],
      claimIds: [claim.id],
      reason: claim.id === "C10-C02"
        ? "Whole claim omitted after independent review found its rationale and uncertainty text refer to a separately reported synthetic stopping response, despite the claim's authored evidence IDs. The contaminated prose was not edited."
        : "Whole claim omitted; its graph contains synthetic source evidence and its narrative/support basis cannot be safely repaired by deleting citations." });
    return false;
  });
  for (const claim of result.claims) {
    const dependencies = claim.depends_on_claim_ids ?? [];
    const dangling = dependencies.filter((id) => removedClaimIds.has(id));
    if (dangling.length) {
      removed.push({ collection: "claim_dependencies", originalIndex: null, recordId: claim.id,
        evidenceIds: [], claimIds: dangling,
        reason: "Dangling dependency edge removed because its target claim was omitted from this derivative; claim text, evidence IDs, and sequence edges remain unchanged." });
      claim.depends_on_claim_ids = dependencies.filter((id) => !removedClaimIds.has(id));
    }
  }
  result.name_registry = retain("name_registry", result.name_registry, (name) =>
    !removedNames.has(name.name_id) && (name.supporting_claim_ids ?? []).every((id) => !removedClaimIds.has(id)));
  result.relationships = retain("relationships", result.relationships, (row) =>
    !removedNames.has(row.from_name_id) && !removedNames.has(row.to_name_id) && validClaimRefs(row));
  result.priority_claim_ids = result.priority_claim_ids.filter((id) => !removedClaimIds.has(id));
  for (const collection of ["observed_strengths", "counterexamples", "open_questions"]) {
    result[collection] = retain(collection, result[collection], (row) => {
      const nameText = typeof row.question === "string" ? row.question : row.text;
      const refersToRemovedName = typeof nameText === "string" && nameText.includes("Input Reducer");
      const emptyProcessPlaceholder = collection === "open_questions" && row.status === "not_assessed"
        && !(row.evidence_ids ?? []).length && /^Independent validation of this proposed intermediate ledger/.test(row.question ?? "");
      return validEvidence(row) && validClaimRefs(row) && !refersToRemovedName && !emptyProcessPlaceholder;
    });
  }

  const remainingClaims = new Set(result.claims.map((claim) => claim.id));
  for (const claim of result.claims) {
    if ([...(claim.depends_on_claim_ids ?? [])].some((id) => !remainingClaims.has(id))) {
      throw new Error(`Curation left a dangling dependency on ${claim.id}.`);
    }
  }
  return {
    value: result,
    removals: removed,
    policy: "omission_only_c10_source_recovery_v1",
    guarantees: {
      providerOutputNotMutated: true,
      retainedClaimTextAndEvidenceSequenceReferencesCopiedVerbatim: true,
      danglingDependenciesToOmittedClaimsPrunedAndRecorded: true,
      syntheticObservationsCannotSupportRetainedGraphRecords: true,
      noClaimsAddedOrReworded: true,
      noEvidenceOrSequenceEdgesAdded: true,
      noQuestionPromptOrSchemaChanged: true,
    },
  };
}
