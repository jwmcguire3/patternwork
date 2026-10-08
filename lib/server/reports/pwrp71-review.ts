import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import type { JsonObject, ValidationIssue, ValidationResult } from "../../question-engine/types.ts";
import { PWQE51_RELEASE_IDENTITY } from "../../question-engine/pwqe51-source.ts";
import { PWRP71_RELEASE_MANIFEST_SHA256, type Pwrp71SourcePackage } from "./pwrp71-source.ts";
import type { Pwrp71ReportArtifact } from "./pwrp71-validation.ts";

export interface Pwrp71Review {
  readonly review_contract: string;
  readonly report_release: string;
  readonly reviewed_draft_sha256: string;
  readonly reviewed_evidence_sha256: string;
  readonly verdict: "accept" | "revise" | "invalid_input";
  readonly issues: readonly JsonObject[];
  readonly summary: string;
}

export interface Pwrp71StructuralReviewReceipt extends JsonObject {
  readonly receipt_type: "pwrp71_structural_review_receipt";
  readonly report_release: string;
  readonly source_manifest_sha256: string;
  readonly report_id: string;
  readonly reviewed_draft_sha256: string;
  readonly reviewed_evidence_sha256: string;
  readonly verdict: Pwrp71Review["verdict"];
  readonly review_sha256: string;
  readonly review: JsonObject;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object).filter((item): item is Record<string, unknown> => item !== undefined) : [];
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value), "utf8").digest("hex");
}

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function uniqueIds(rows: readonly Record<string, unknown>[], key: string, issues: ValidationIssue[], path: string): Set<string> {
  const ids = new Set<string>();
  rows.forEach((row, i) => {
    const id = row[key];
    if (typeof id !== "string" || id.length === 0 || ids.has(id)) issues.push(issue("draft_identity", `${path}[${i}].${key}`, "Referenced draft identities must be present and unique."));
    else ids.add(id);
  });
  return ids;
}

function expectedMarkdown(draft: Record<string, unknown>): string {
  const lines = [`# ${String(draft.title)}`, "", "*Patternwork is nonclinical self-reflection. Parts and state names are working interpretations, not diagnoses or physiological measurements.*", ""];
  for (const section of list(draft.sections)) {
    if (typeof section.heading === "string" && section.heading) lines.push(`## ${section.heading}`, "");
    lines.push(String(section.text), "");
  }
  const questions = Array.isArray(draft.reflection_questions) ? draft.reflection_questions : [];
  if (questions.length) {
    lines.push("## To notice", "");
    for (const question of questions) lines.push(String(question), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function artifactIssues(artifact: Pwrp71ReportArtifact, packet: JsonObject, source: Pwrp71SourcePackage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const row = artifact as Record<string, unknown>;
  const draft = object(artifact.draft);
  const p = packet as Record<string, unknown>;
  const sourceBinding = object(p.source_binding);
  const digestSet = object(artifact.digests);
  const withoutDigests = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "digests"));
  if (!draft) return [issue("artifact_draft", "$.artifact.draft", "Report artifact must contain the exact validated draft.")];
  if (artifact.artifact_type !== "pwrp71_report" || artifact.report_release !== source.policy.release
    || artifact.source_manifest_sha256 !== source.manifestSha256
    || artifact.source_manifest_sha256 !== PWRP71_RELEASE_MANIFEST_SHA256
    || source.manifest.report_release !== PWQE51_RELEASE_IDENTITY.reportRelease
    || sourceBinding?.question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || sourceBinding.runtime_version !== PWQE51_RELEASE_IDENTITY.routerVersion
    || sourceBinding.source_sha256 !== source.policy.compatible_router_source_sha256
    || source.policy.compatible_router_source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || artifact.release_id !== p.release_id || artifact.snapshot_id !== p.snapshot_id
    || artifact.evidence_sha256 !== p.content_sha256 || draft.report_release !== artifact.report_release
    || draft.release_id !== artifact.release_id || draft.snapshot_id !== artifact.snapshot_id
    || draft.evidence_sha256 !== artifact.evidence_sha256 || draft.report_type !== artifact.report_type) {
    issues.push(issue("artifact_source_binding", "$.artifact", "Report artifact does not bind to the pinned PWRP/PWQE source and current packet."));
  }
  const { content_sha256: packetDigest, ...packetContent } = p;
  if (typeof packetDigest !== "string" || sha256(packetContent) !== packetDigest) issues.push(issue("packet_digest", "$.packet.content_sha256", "Current packet digest does not match its canonical contents."));
  if (typeof artifact.report_markdown !== "string" || artifact.report_markdown !== expectedMarkdown(draft)) issues.push(issue("artifact_markdown", "$.artifact.report_markdown", "Report Markdown does not match the exact draft rendering."));
  const identity = { report_release: draft.report_release, release_id: draft.release_id, snapshot_id: draft.snapshot_id, report_type: draft.report_type, evidence_sha256: draft.evidence_sha256, draft };
  if (artifact.report_id !== `pwrp71_${sha256(identity).slice(0, 28)}`) issues.push(issue("artifact_identity", "$.artifact.report_id", "Report artifact identity does not match its draft."));
  if (!digestSet || digestSet.artifact_sha256 !== sha256(withoutDigests) || digestSet.report_markdown_sha256 !== sha256(String(artifact.report_markdown))) {
    issues.push(issue("artifact_digest", "$.artifact.digests", "Report artifact or Markdown digest does not match its contents."));
  }
  if (source.manifestSha256 !== PWRP71_RELEASE_MANIFEST_SHA256
    || source.manifest.content_binding !== sha256(source.manifest.files)
    || source.policy.release !== PWQE51_RELEASE_IDENTITY.reportRelease
    || source.policy.compatible_question_release !== PWQE51_RELEASE_IDENTITY.questionRelease) {
    issues.push(issue("source_manifest", "$.source", "PWRP 7.1 source manifest or question compatibility is not pinned."));
  }
  return issues;
}

function reviewReferenceIssues(review: Record<string, unknown>, artifact: Pwrp71ReportArtifact, packet: JsonObject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const draft = artifact.draft as Record<string, unknown>;
  const claims = uniqueIds(list(draft.claims), "id", issues, "$.artifact.draft.claims");
  const sections = uniqueIds(list(draft.sections), "id", issues, "$.artifact.draft.sections");
  const names = uniqueIds(list(draft.name_registry), "name_id", issues, "$.artifact.draft.name_registry");
  const relationships = uniqueIds(list(draft.relationships), "id", issues, "$.artifact.draft.relationships");
  const observations = uniqueIds(list((packet as Record<string, unknown>).observations), "id", issues, "$.packet.observations");
  const invalidated = new Set([...(Array.isArray((packet as Record<string, unknown>).superseded_response_ids) ? (packet as Record<string, unknown>).superseded_response_ids as unknown[] : []), ...(Array.isArray((packet as Record<string, unknown>).invalidated_response_ids) ? (packet as Record<string, unknown>).invalidated_response_ids as unknown[] : [])]);
  const liveResponses = new Set(list((packet as Record<string, unknown>).administration_provenance).map((row) => row.live_response_id).filter((id): id is string => typeof id === "string"));
  const observationRows = new Map(list((packet as Record<string, unknown>).observations).map((row) => [String(row.id), row]));
  for (const [index, candidate] of list(review.issues).entries()) {
    for (const [field, allowed] of [["claim_ids", claims], ["section_ids", sections], ["name_ids", names], ["relationship_ids", relationships], ["evidence_ids", observations]] as const) {
      const refs = Array.isArray(candidate[field]) ? candidate[field] as unknown[] : [];
      for (const [refIndex, ref] of refs.entries()) {
        if (typeof ref !== "string" || !allowed.has(ref)) {
          issues.push(issue("review_reference", `$.issues[${index}].${field}[${refIndex}]`, `Review reference does not resolve to current ${field.replace(/_ids$/u, "")} evidence.`));
        } else if (field === "evidence_ids") {
          const observation = observationRows.get(ref)!;
          if (typeof observation.response_id !== "string" || invalidated.has(observation.response_id) || !liveResponses.has(observation.response_id)) {
            issues.push(issue("review_stale_evidence", `$.issues[${index}].evidence_ids[${refIndex}]`, "Review cites stale or noncurrent packet evidence."));
          }
        }
      }
    }
    if (candidate.category === "material_omission" && (!Array.isArray(candidate.evidence_ids) || candidate.evidence_ids.length === 0)) {
      issues.push(issue("review_omission_evidence", `$.issues[${index}].evidence_ids`, "A material-omission issue must cite actual neglected evidence."));
    }
  }
  return issues;
}

/** Validates a reviewer result as a structural receipt only; it is never release authorization or semantic approval. */
export function validatePwrp71Review(input: {
  readonly value: unknown;
  readonly artifact: Pwrp71ReportArtifact;
  readonly packet: JsonObject;
  readonly source: Pwrp71SourcePackage;
}): ValidationResult<Pwrp71StructuralReviewReceipt> {
  const issues: ValidationIssue[] = [];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(input.source.schemas.reportReview as object);
  if (!validate(input.value)) {
    for (const error of validate.errors ?? []) issues.push(issue("review_schema", error.instancePath || "$", error.message ?? "PWRP 7.1 review schema validation failed."));
    return { ok: false, issues };
  }
  const review = input.value as Pwrp71Review;
  issues.push(...artifactIssues(input.artifact, input.packet, input.source));
  if (review.report_release !== input.source.policy.release
    || review.reviewed_draft_sha256 !== sha256(input.artifact.draft)
    || review.reviewed_evidence_sha256 !== (input.packet as Record<string, unknown>).content_sha256
    || review.reviewed_evidence_sha256 !== input.artifact.evidence_sha256) {
    issues.push(issue("review_binding", "$", "Review does not bind to the exact current report draft artifact and packet evidence."));
  }
  if (review.verdict === "accept" && review.issues.length > 0) issues.push(issue("review_accept_with_issues", "$.issues", "A structurally accepted review cannot retain unresolved issue records."));
  if (review.verdict === "revise" && review.issues.length === 0) issues.push(issue("review_revise_without_issue", "$.issues", "A revision verdict must identify at least one actionable issue."));
  issues.push(...reviewReferenceIssues(review as unknown as Record<string, unknown>, input.artifact, input.packet));
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, issues: [], value: {
    receipt_type: "pwrp71_structural_review_receipt",
    report_release: review.report_release,
    source_manifest_sha256: input.source.manifestSha256,
    report_id: input.artifact.report_id,
    reviewed_draft_sha256: review.reviewed_draft_sha256,
    reviewed_evidence_sha256: review.reviewed_evidence_sha256,
    verdict: review.verdict,
    review_sha256: sha256(review),
    review: review as unknown as JsonObject,
  } };
}
