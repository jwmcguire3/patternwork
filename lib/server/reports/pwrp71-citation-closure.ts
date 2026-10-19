import type { JsonObject, ReportType, ValidationIssue } from "../../question-engine/types.ts";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import type { Pwrp71SourcePackage } from "./pwrp71-source.ts";
import { validatePwrp71ReportDraft, type Pwrp71ReportArtifact } from "./pwrp71-validation.ts";

export const PWRP71_CITATION_CLOSURE_VERSION = "pwrp71-citation-closure-v1" as const;

export interface Pwrp71CitationAddition {
  claim_id: string;
  field: "evidence_ids" | "counterevidence_ids";
  evidence_id: string;
  dependency_path: string[];
}

export interface Pwrp71CitationClosureDerivation {
  normalization_version: typeof PWRP71_CITATION_CLOSURE_VERSION;
  raw_draft_sha256: string;
  normalized_draft_sha256: string;
  additions: Pwrp71CitationAddition[];
}

const citationFields = ["evidence_ids", "counterevidence_ids"] as const;
const settledKinds = new Set(["reported", "supported_interpretation"]);
const closureError = "Citation closure is unavailable for this draft.";

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) && value.every((row) => typeof row === "object" && row !== null && !Array.isArray(row))
    ? value as Record<string, unknown>[] : [];
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function onlyLeafFailures(issues: readonly ValidationIssue[]): boolean {
  return issues.length > 0 && issues.every((issue) => issue.code === "claim_leaf_evidence");
}

function assertGraph(draft: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const claims = rows(draft.claims);
  if (!Array.isArray(draft.claims) || claims.length !== draft.claims.length) throw new Error(closureError);
  const byId = new Map<string, Record<string, unknown>>();
  for (const claim of claims) {
    if (typeof claim.id !== "string" || claim.id.length === 0 || byId.has(claim.id)) throw new Error(closureError);
    for (const field of citationFields) {
      const refs = claim[field];
      if (!Array.isArray(refs) || refs.some((ref) => typeof ref !== "string" || ref.length === 0) || new Set(refs).size !== refs.length) throw new Error(closureError);
    }
    const deps = claim.depends_on_claim_ids;
    if (!Array.isArray(deps) || deps.some((dep) => typeof dep !== "string" || dep.length === 0) || new Set(deps).size !== deps.length) throw new Error(closureError);
    if (deps.length > 0 && !settledKinds.has(String(claim.kind))) throw new Error(closureError);
    byId.set(claim.id, claim);
  }
  for (const claim of claims) {
    for (const dependency of claim.depends_on_claim_ids as string[]) {
      const premise = byId.get(dependency);
      if (!premise || !settledKinds.has(String(premise.kind))) throw new Error(closureError);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(closureError);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of byId.get(id)!.depends_on_claim_ids as string[]) visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  return byId;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function assertOnlyCitationChanges(raw: unknown, normalized: unknown): void {
  const rawObject = object(raw);
  const normalizedObject = object(normalized);
  if (!rawObject || !normalizedObject) throw new Error(closureError);
  const project = (value: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key === "claims" && Array.isArray(child)) {
      return [key, child.map((claim) => {
        const row = object(claim);
        if (!row) return claim;
        return Object.fromEntries(Object.entries(row).filter(([field]) => !citationFields.includes(field as typeof citationFields[number])));
      })];
    }
    return [key, child];
  }));
  if (JSON.stringify(project(rawObject)) !== JSON.stringify(project(normalizedObject))) throw new Error(closureError);
}

export function closePwrp71CitationInheritance(input: {
  value: JsonObject;
  reportType: ReportType;
  snapshotId: string;
  packet: JsonObject;
  source: Pwrp71SourcePackage;
}): { artifact: Pwrp71ReportArtifact; derivation: Pwrp71CitationClosureDerivation; rawValidationIssues: readonly ValidationIssue[] } {
  const rawValidation = validatePwrp71ReportDraft({ value: input.value, reportType: input.reportType, snapshotId: input.snapshotId, packet: input.packet, source: input.source });
  if (rawValidation.ok || !onlyLeafFailures(rawValidation.issues)) throw new Error(closureError);

  const rawById = assertGraph(input.value);
  const normalized = cloneJson(input.value) as Record<string, unknown>;
  assertGraph(normalized);
  const additions: Pwrp71CitationAddition[] = [];
  for (const claim of rows(normalized.claims)) {
    const claimId = claim.id as string;
    for (const field of citationFields) {
      const existing = claim[field] as string[];
      const seen = new Set(existing);
      const inherited = new Map<string, string[]>();
      const collect = (premiseId: string, path: string[]): void => {
        const premise = rawById.get(premiseId)!;
        for (const evidenceId of premise[field] as string[]) if (!inherited.has(evidenceId)) inherited.set(evidenceId, [...path, premiseId]);
        for (const dep of premise.depends_on_claim_ids as string[]) collect(dep, [...path, premiseId]);
      };
      for (const dep of claim.depends_on_claim_ids as string[]) collect(dep, [claimId]);
      for (const [evidenceId, dependencyPath] of inherited) {
        if (seen.has(evidenceId)) continue;
        existing.push(evidenceId);
        seen.add(evidenceId);
        additions.push({ claim_id: claimId, field, evidence_id: evidenceId, dependency_path: dependencyPath });
      }
    }
  }
  assertOnlyCitationChanges(input.value, normalized);
  const finalValidation = validatePwrp71ReportDraft({ value: normalized as JsonObject, reportType: input.reportType, snapshotId: input.snapshotId, packet: input.packet, source: input.source });
  if (!finalValidation.ok) throw new Error(closureError);
  return {
    artifact: finalValidation.value,
    derivation: {
      normalization_version: PWRP71_CITATION_CLOSURE_VERSION,
      raw_draft_sha256: sha256Canonical(input.value),
      normalized_draft_sha256: sha256Canonical(normalized),
      additions,
    },
    rawValidationIssues: rawValidation.issues,
  };
}
