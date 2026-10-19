import type { JsonObject, ReportType, ValidationIssue } from "../../question-engine/types.ts";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import type { Pwrp71SourcePackage } from "./pwrp71-source.ts";
import { validatePwrp71ReportDraft, type Pwrp71ReportArtifact } from "./pwrp71-validation.ts";

export interface Pwrp71ReferenceRestorationDerivation {
  normalization_version: "pwrp71-typed-reference-restoration-v1";
  raw_draft_sha256: string;
  normalized_draft_sha256: string;
  candidate_inventory_sha256: string;
  packet_sha256: string;
  replacements: {
    path: string;
    field: "evidence_ids" | "counterevidence_ids" | "scope.occurrence_ids";
    old_id: string;
    restored_id: string;
    candidate_count: 1;
    edit_distance: 1;
  }[];
}

const allowedIssueCodes = new Set(["current_observation", "evidence_scope", "claim_scope", "unsupported_scope"]);
const fields = ["evidence_ids", "counterevidence_ids"] as const;
const failureMessage = "Typed reference restoration is unavailable for this draft.";
type RestoreField = "evidence_ids" | "counterevidence_ids" | "scope.occurrence_ids";
interface CandidateRepair { path: string; field: RestoreField; oldId: string; restoredId: string; }

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) && value.every((row) => object(row) !== undefined) ? value as Record<string, unknown>[] : [];
}
function isSingleEdit(left: string, right: string): boolean {
  if (left === right || Math.abs(left.length - right.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    edits++;
    if (edits > 1) return false;
    if (left.length === right.length) { i++; j++; }
    else if (left.length > right.length) i++;
    else j++;
  }
  if (i < left.length || j < right.length) edits++;
  return edits === 1;
}
function hasPattern(id: string, type: "observation" | "occurrence"): boolean {
  return type === "observation" ? /^O[0-9a-f]{20}$/u.test(id) : /^pwep_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(id);
}
function uniqueCandidates(oldId: string, ids: Iterable<string>, type: "observation" | "occurrence"): string[] {
  return [...new Set(ids)].filter((id) => hasPattern(id, type) && isSingleEdit(oldId, id)).sort();
}
function assertRefArrays(claims: readonly Record<string, unknown>[]): void {
  for (const claim of claims) {
    for (const field of fields) {
      const refs = claim[field];
      if (!Array.isArray(refs) || refs.some((id) => typeof id !== "string" || id.length === 0) || new Set(refs).size !== refs.length) throw new Error(failureMessage);
    }
    const scope = object(claim.scope);
    if (!scope || !Array.isArray(scope.occurrence_ids) || scope.occurrence_ids.some((id) => typeof id !== "string" || id.length === 0) || new Set(scope.occurrence_ids).size !== scope.occurrence_ids.length) throw new Error(failureMessage);
  }
}
function assertOnlyTypedReferencesChanged(raw: unknown, normalized: unknown): void {
  const rawObject = object(raw); const normalizedObject = object(normalized);
  if (!rawObject || !normalizedObject) throw new Error(failureMessage);
  const project = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key !== "claims" || !Array.isArray(child)) return [key, child];
    return [key, child.map((item) => {
      const claim = object(item);
      if (!claim) return item;
      const next = { ...claim };
      delete next.evidence_ids; delete next.counterevidence_ids;
      const scope = object(next.scope);
      if (scope) next.scope = Object.fromEntries(Object.entries(scope).filter(([scopeKey]) => scopeKey !== "occurrence_ids"));
      return next;
    })];
  }));
  if (JSON.stringify(project(rawObject)) !== JSON.stringify(project(normalizedObject))) throw new Error(failureMessage);
}

export function restorePwrp71TypedReferences(input: {
  value: JsonObject;
  reportType: ReportType;
  snapshotId: string;
  packet: JsonObject;
  source: Pwrp71SourcePackage;
}): { artifact: Pwrp71ReportArtifact; derivation: Pwrp71ReferenceRestorationDerivation; rawValidationIssues: readonly ValidationIssue[] } {
  const rawValidation = validatePwrp71ReportDraft({ value: input.value, reportType: input.reportType, snapshotId: input.snapshotId, packet: input.packet, source: input.source });
  if (rawValidation.ok || rawValidation.issues.length === 0 || rawValidation.issues.some((issue) => !allowedIssueCodes.has(issue.code))) throw new Error(failureMessage);

  const rawClaims = rows(input.value.claims);
  if (!Array.isArray(input.value.claims) || rawClaims.length !== input.value.claims.length) throw new Error(failureMessage);
  assertRefArrays(rawClaims);
  const packet = object(input.packet);
  if (!packet) throw new Error(failureMessage);
  const observations = rows(packet.observations);
  const episodes = rows(packet.episodes);
  if (!Array.isArray(packet.observations) || observations.length !== packet.observations.length || !Array.isArray(packet.episodes) || episodes.length !== packet.episodes.length) throw new Error(failureMessage);
  const observationIds = observations.map((row) => row.id);
  const currentObservationIds = new Set(observationIds.filter((id): id is string => typeof id === "string"));
  const occurrenceIds = episodes.map((row) => row.id);
  const currentOccurrenceIds = new Set(occurrenceIds.filter((id): id is string => typeof id === "string"));
  const observationById = new Map(observations.filter((row): row is Record<string, unknown> & { id: string } => typeof row.id === "string").map((row) => [row.id, row]));
  const repairs: CandidateRepair[] = [];

  for (const [claimIndex, claim] of rawClaims.entries()) {
    const effectiveRefs = new Map<(typeof fields)[number], string[]>();
    for (const field of fields) {
      const refs = claim[field] as string[];
      const effective: string[] = [];
      for (const [refIndex, oldId] of refs.entries()) {
        if (currentObservationIds.has(oldId)) { effective.push(oldId); continue; }
        if (field !== "evidence_ids") throw new Error(failureMessage);
        const candidates = uniqueCandidates(oldId, currentObservationIds, "observation");
        if (candidates.length !== 1) throw new Error(failureMessage);
        const scope = object(claim.scope)!;
        const scopeOccurrences = new Set(scope.occurrence_ids as string[]);
        const scopePeople = new Set(scope.person_ids as string[]);
        const candidateObservation = observationById.get(candidates[0]);
        if (!candidateObservation || typeof candidateObservation.occurrence_id !== "string" || !scopeOccurrences.has(candidateObservation.occurrence_id)
          || (typeof candidateObservation.person_id === "string" && !scopePeople.has(candidateObservation.person_id))) throw new Error(failureMessage);
        repairs.push({ path: `$.claims[${claimIndex}].${field}[${refIndex}]`, field, oldId, restoredId: candidates[0] });
        effective.push(candidates[0]);
      }
      if (new Set(effective).size !== effective.length) throw new Error(failureMessage);
      effectiveRefs.set(field, effective);
    }

    const citedOccurrenceIds = new Set<string>();
    for (const field of fields) for (const id of effectiveRefs.get(field)!) {
      const observation = observationById.get(id);
      if (observation && typeof observation.occurrence_id === "string" && currentOccurrenceIds.has(observation.occurrence_id)) citedOccurrenceIds.add(observation.occurrence_id);
    }
    const scope = object(claim.scope)!;
    for (const [scopeIndex, oldId] of (scope.occurrence_ids as string[]).entries()) {
      if (currentOccurrenceIds.has(oldId)) {
        if (!citedOccurrenceIds.has(oldId)) throw new Error(failureMessage);
        continue;
      }
      const candidates = uniqueCandidates(oldId, currentOccurrenceIds, "occurrence");
      if (candidates.length !== 1 || !citedOccurrenceIds.has(candidates[0])) throw new Error(failureMessage);
      repairs.push({ path: `$.claims[${claimIndex}].scope.occurrence_ids[${scopeIndex}]`, field: "scope.occurrence_ids", oldId, restoredId: candidates[0] });
    }
  }
  if (repairs.length !== 1) throw new Error(failureMessage);
  const repair = repairs[0];
  const repairClaimMatch = /^\$\.claims\[(\d+)\]/u.exec(repair.path);
  if (!repairClaimMatch || rawValidation.issues.some((issue) => !issue.path.startsWith(`$.claims[${repairClaimMatch[1]}].`))) throw new Error(failureMessage);
  const scopePath = repair.field === "scope.occurrence_ids" ? repair.path.slice(0, repair.path.lastIndexOf("[")) : undefined;
  const issuePathMatches = rawValidation.issues.some((issue) => issue.path === repair.path || (scopePath !== undefined && issue.path === scopePath));
  if (!issuePathMatches) throw new Error(failureMessage);

  const normalized = structuredClone(input.value) as Record<string, unknown>;
  const claims = rows(normalized.claims);
  const match = /^\$\.claims\[(\d+)\]\.(evidence_ids|counterevidence_ids|scope\.occurrence_ids)\[(\d+)\]$/u.exec(repair.path);
  if (!match) throw new Error(failureMessage);
  const claim = claims[Number(match[1])];
  const index = Number(match[3]);
  if (repair.field === "scope.occurrence_ids") {
    const scope = object(claim.scope)!;
    (scope.occurrence_ids as string[])[index] = repair.restoredId;
  } else {
    (claim[repair.field] as string[])[index] = repair.restoredId;
  }
  assertRefArrays(claims);
  assertOnlyTypedReferencesChanged(input.value, normalized);
  const finalValidation = validatePwrp71ReportDraft({ value: normalized as JsonObject, reportType: input.reportType, snapshotId: input.snapshotId, packet: input.packet, source: input.source });
  if (!finalValidation.ok) throw new Error(failureMessage);
  return {
    artifact: finalValidation.value,
    derivation: {
      normalization_version: "pwrp71-typed-reference-restoration-v1",
      raw_draft_sha256: sha256Canonical(input.value),
      normalized_draft_sha256: sha256Canonical(normalized),
      candidate_inventory_sha256: sha256Canonical({
        observation_ids: [...currentObservationIds].filter((id) => hasPattern(id, "observation")).sort(),
        occurrence_ids: [...currentOccurrenceIds].filter((id) => hasPattern(id, "occurrence")).sort(),
      }),
      packet_sha256: sha256Canonical(input.packet),
      replacements: [{ path: repair.path, field: repair.field, old_id: repair.oldId, restored_id: repair.restoredId, candidate_count: 1, edit_distance: 1 }],
    },
    rawValidationIssues: rawValidation.issues,
  };
}
