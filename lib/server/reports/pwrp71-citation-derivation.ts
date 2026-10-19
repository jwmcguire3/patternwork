import type { JsonObject, ReportType, ValidationIssue } from "../../question-engine/types.ts";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import { closePwrp71CitationInheritance, type Pwrp71CitationClosureDerivation } from "./pwrp71-citation-closure.ts";
import type { Pwrp71SourcePackage } from "./pwrp71-source.ts";
import { validatePwrp71ReportDraft, type Pwrp71ReportArtifact } from "./pwrp71-validation.ts";
import { restorePwrp71TypedReferences, type Pwrp71ReferenceRestorationDerivation } from "./pwrp71-reference-restoration.ts";

export interface Pwrp71CitationRestorationDerivation {
  normalization_version: "pwrp71-prior-citation-restoration-v1";
  raw_draft_sha256: string;
  normalized_draft_sha256: string;
  prior_draft_sha256: string;
  replacements: { claim_id: string; path: string; field: "evidence_ids" | "counterevidence_ids"; position: number; old_id: string; restored_id: string }[];
}
export type Pwrp71CitationDerivation = Pwrp71CitationClosureDerivation | Pwrp71CitationRestorationDerivation | Pwrp71ReferenceRestorationDerivation;

/** Two narrowly defined citation bookkeeping recipes; neither changes report wording. */
export function derivePwrp71Citations(input: {
  value: JsonObject; previousDraft?: JsonObject; referenceRestoration?: boolean; reportType: ReportType; snapshotId: string; packet: JsonObject; source: Pwrp71SourcePackage;
}): { artifact: Pwrp71ReportArtifact; derivation: Pwrp71CitationDerivation; rawValidationIssues: readonly ValidationIssue[] } {
  if (input.referenceRestoration) {
    if (input.previousDraft) throw new Error("Reference derivation recipes cannot be combined.");
    return restorePwrp71TypedReferences(input);
  }
  if (!input.previousDraft) return closePwrp71CitationInheritance(input);
  const error = "Prior citation restoration is unavailable for this draft.";
  const raw = validatePwrp71ReportDraft(input);
  const prior = validatePwrp71ReportDraft({ ...input, value: input.previousDraft });
  if (raw.ok || raw.issues.length !== 1 || raw.issues[0].code !== "current_observation" || !prior.ok) throw new Error(error);
  const match = /^\$\.claims\[(\d+)\]\.(evidence_ids|counterevidence_ids)\[(\d+)\]$/u.exec(raw.issues[0].path);
  if (!match) throw new Error(error);
  const claimIndex = Number(match[1]), field = match[2] as "evidence_ids" | "counterevidence_ids", position = Number(match[3]);
  const claims = input.value.claims as JsonObject[], claim = claims[claimIndex];
  const priorClaims = (input.previousDraft.claims as JsonObject[]).filter(row => row.id === claim.id);
  if (priorClaims.length !== 1) throw new Error(error);
  const oldId = (claim[field] as string[])[position], restoredId = (priorClaims[0][field] as string[])[position];
  if (typeof oldId !== "string" || typeof restoredId !== "string" || oldId.length + 1 !== restoredId.length
    || !(Array.from(restoredId).some((_, index) => restoredId.slice(0, index) + restoredId.slice(index + 1) === oldId))) throw new Error(error);
  const observations = input.packet.observations as JsonObject[];
  const candidates = observations.filter(row => typeof row.id === "string" && row.id.length === oldId.length + 1
    && Array.from(row.id).some((_, index) => (row.id as string).slice(0, index) + (row.id as string).slice(index + 1) === oldId));
  if (candidates.length !== 1 || candidates[0].id !== restoredId || (claim[field] as string[]).includes(restoredId)) throw new Error(error);
  // Preserve the prior assertion, scope, structure and all other citations. A changed rationale
  // is evaluated by the fresh reviewer and is never inherited as an earlier quality judgment.
  const restoredClaim = structuredClone(claim);
  (restoredClaim[field] as string[])[position] = restoredId;
  const assertion = (value: JsonObject) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "rationale"));
  if (sha256Canonical(assertion(restoredClaim)) !== sha256Canonical(assertion(priorClaims[0]))) throw new Error(error);
  const corrected = structuredClone(input.value);
  ((corrected.claims as JsonObject[])[claimIndex][field] as string[])[position] = restoredId;
  const validated = validatePwrp71ReportDraft({ ...input, value: corrected });
  if (!validated.ok) throw new Error(error);
  return { artifact: validated.value, rawValidationIssues: raw.issues, derivation: {
    normalization_version: "pwrp71-prior-citation-restoration-v1", raw_draft_sha256: sha256Canonical(input.value),
    normalized_draft_sha256: sha256Canonical(corrected), prior_draft_sha256: sha256Canonical(input.previousDraft),
    replacements: [{ claim_id: String(claim.id), path: raw.issues[0].path, field, position, old_id: oldId, restored_id: restoredId }],
  } };
}
