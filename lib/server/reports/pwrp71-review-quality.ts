import type { JsonObject, ValidationIssue } from "../../question-engine/types.ts";
export const PWRP71_REVIEW_CONTRACT = "PWRP-REVIEW-7.1.0-candidate.2";
export const REVIEW_DIMENSIONS = ["source_fidelity", "semantic_completeness", "narrative_quality"] as const;
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(object) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
/** Checks review consistency and coverage, not the truth of the reviewer's judgments. */
export function validatePwrp71ReviewQuality(review: Record<string, unknown>, draft: JsonObject, packet: JsonObject): ValidationIssue[] {
 const issues: ValidationIssue[] = [];
 const add = (code: string, path: string, message: string) => issues.push({code,path,message});
 const quality = object(review.quality_assessment);
 const statuses = REVIEW_DIMENSIONS.map(d => object(quality[d]).status);
 if (review.verdict === "accept" && statuses.some(s => s !== "adequate")) add("review_quality_verdict", "$.quality_assessment", "Acceptance requires all three dimensions adequate.");
 if (review.verdict === "revise" && !statuses.includes("revise")) add("review_quality_verdict", "$.quality_assessment", "Revision must identify a deficient dimension.");
 const observations = new Set(rows(packet.observations).map(r => String(r.id)));
 const claims = new Map(rows(draft.claims).map(r => [String(r.id), r]));
 const surfaced = new Set([...strings(draft.title_claim_ids), ...rows(draft.sections).flatMap(r => strings(r.claim_ids))]);
 const covered = new Set<string>();
 for (const [index, group] of rows(review.evidence_coverage).entries()) {
  const path = `$.evidence_coverage[${index}]`, refs = strings(group.evidence_ids), claimRefs = strings(group.claim_ids);
  for (const id of refs) {
   if (!observations.has(id) || covered.has(id)) add("review_coverage_reference", path, "Each current observation must be accounted for exactly once, without foreign IDs.");
   covered.add(id);
  }
  if (claimRefs.some(id => !claims.has(id))) add("review_coverage_claim", path, "Coverage claims must resolve in the reviewed draft.");
  if (group.disposition === "represented") {
   if (!claimRefs.length || claimRefs.some(id => !surfaced.has(id))) add("review_coverage_representation", path, "Represented evidence requires claims surfaced in the title or sections.");
   for (const id of refs) {
    if (!claimRefs.some(cid => { const claim = claims.get(cid); return claim && [...strings(claim.evidence_ids), ...strings(claim.counterevidence_ids)].includes(id); })) add("review_coverage_representation", path, "The cited claims must actually carry the represented evidence.");
   }
  }
  if (group.disposition === "missing") {
   const omission = rows(review.issues).some(r => r.category === "material_omission" && refs.every(id => strings(r.evidence_ids).includes(id)));
   if (!omission || object(quality.semantic_completeness).status !== "revise" || review.verdict !== "revise") add("review_coverage_omission", path, "Missing material requires an evidence-linked omission issue and a completeness revision.");
  }
 }
 if ([...observations].some(id => !covered.has(id))) add("review_coverage_incomplete", "$.evidence_coverage", "Review must account for the full current evidence, including context, counterexamples, and recovery detail.");
 return issues;
}
