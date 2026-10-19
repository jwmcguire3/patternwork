import { createHash } from "node:crypto";
import type { JsonObject } from "../../../question-engine/types.ts";
import type { Pwrp71SourcePackage } from "../pwrp71-source.ts";
import { PWRP71_REVIEW_CONTRACT, REVIEW_DIMENSIONS } from "../pwrp71-review-quality.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).filter(k => row[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(row[k])}`).join(",")}}`;
}
const rows = (value: unknown): JsonObject[] => Array.isArray(value) ? value as JsonObject[] : [];
const strings = (value: unknown): string[] => Array.isArray(value) ? value as string[] : [];

/** Deterministic transport fixture only. Its judgments are NOT semantic acceptance evidence. */
export function structuralReviewFixture(input: {
  source: Pwrp71SourcePackage; packet: JsonObject; draft: JsonObject;
  verdict?: "accept" | "revise"; issues?: JsonObject[];
}): JsonObject {
  const { source, packet, draft, verdict = "accept", issues = [] } = input;
  const surfaced = new Set([...strings(draft.title_claim_ids), ...rows(draft.sections).flatMap(s => strings(s.claim_ids))]);
  const claims = rows(draft.claims).filter(c => surfaced.has(String(c.id)));
  const rationale = "Deterministic transport fixture; this is not an independent semantic judgment.";
  return {
    review_contract: PWRP71_REVIEW_CONTRACT,
    report_release: source.policy.release,
    reviewed_draft_sha256: createHash("sha256").update(canonical(draft)).digest("hex"),
    reviewed_evidence_sha256: String(packet.content_sha256),
    verdict, issues, summary: rationale,
    quality_assessment: Object.fromEntries(REVIEW_DIMENSIONS.map(dimension => [dimension, {
      status: verdict === "revise" && dimension === "narrative_quality" ? "revise" : "adequate", rationale,
    }])),
    explanatory_assessment: {
      ...Object.fromEntries(["functions", "triggers", "costs", "vulnerabilities", "relationships", "choice"].map(aspect => [aspect, {
        status: "not_supported", evidence_ids: [], claim_ids: [], rationale,
      }])),
    },
    synthesis_opportunity: { status: "no_material_opportunity", evidence_ids: [], claim_ids: [], rationale },
    evidence_coverage: rows(packet.observations).map(observation => {
      const refs = claims.filter(c => [...strings(c.evidence_ids), ...strings(c.counterevidence_ids)].includes(String(observation.id)));
      return { evidence_ids: [observation.id], disposition: refs.length ? "represented" : "context", claim_ids: refs.map(c => c.id), rationale };
    }),
  } as JsonObject;
}
