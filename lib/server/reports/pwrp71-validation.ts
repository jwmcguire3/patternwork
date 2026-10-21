import { validatePwrp71ClaimGraph } from "./pwrp71-claim-graph.ts";
import { renderPwrp71Markdown } from "./pwrp71-render.ts";
import { assertNoRespondentClassification } from "./content-boundary.ts";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import type { JsonObject, ReportType, ValidationIssue, ValidationResult } from "../../question-engine/types.ts";
import { PWQE51_RELEASE_IDENTITY } from "../../question-engine/pwqe51-source.ts";
import { PWRP71_RELEASE_MANIFEST_SHA256, type Pwrp71SourcePackage } from "./pwrp71-source.ts";

export interface Pwrp71ReportDraft extends JsonObject {
  readonly report_release: string;
  readonly release_id: string;
  readonly snapshot_id: string;
  readonly evidence_sha256: string;
  readonly report_type: ReportType;
  readonly title: string;
}

export interface Pwrp71ReportArtifact extends JsonObject {
  readonly artifact_type: "pwrp71_report";
  readonly report_release: string;
  readonly source_manifest_sha256: string;
  readonly report_id: string;
  readonly report_type: ReportType;
  readonly release_id: string;
  readonly snapshot_id: string;
  readonly evidence_sha256: string;
  readonly report_markdown: string;
  readonly draft: Pwrp71ReportDraft;
  readonly digests: JsonObject & { readonly artifact_sha256: string; readonly report_markdown_sha256: string };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is Record<string, unknown> => item !== undefined) : [];
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value), "utf8").digest("hex");
}

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function index(rowsValue: readonly Record<string, unknown>[], key: string, label: string, issues: ValidationIssue[], path: string): Map<string, Record<string, unknown>> {
  const output = new Map<string, Record<string, unknown>>();
  rowsValue.forEach((row, i) => {
    const id = row[key];
    if (typeof id !== "string" || id.length === 0 || output.has(id)) issues.push(issue("duplicate_identity", `${path}[${i}].${key}`, `Missing or duplicate ${label} identity.`));
    else output.set(id, row);
  });
  return output;
}

function packetBindingIssues(packet: JsonObject, snapshotId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const p = packet as Record<string, unknown>;
  const { content_sha256: contentSha, ...contents } = p;
  const binding = record(p.source_binding);
  if (p.format !== "patternwork-router-evidence-v1"
    || p.release_id !== PWQE51_RELEASE_IDENTITY.questionRelease
    || p.snapshot_id !== snapshotId
    || binding?.question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || binding?.runtime_version !== PWQE51_RELEASE_IDENTITY.routerVersion
    || binding?.source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256) {
    issues.push(issue("packet_source_binding", "$.packet", "Packet format, source, release, or snapshot does not bind to the pinned PWQE 5.1 source."));
  }
  if (typeof contentSha !== "string" || !/^[a-f0-9]{64}$/u.test(contentSha) || sha256(contents) !== contentSha) {
    issues.push(issue("packet_digest", "$.packet.content_sha256", "Packet content digest does not match its canonical contents."));
  }
  return issues;
}


function validateReaderTextDoesNotExposeOccurrenceIds(draft: Record<string, unknown>, packet: Record<string, unknown>, issues: ValidationIssue[]): void {
  const occurrenceIds = rows(packet.episodes).map((episode) => episode.id).filter((id): id is string => typeof id === "string" && id.length > 0);
  const readerText: Array<{ path: string; value: unknown }> = [
    { path: "$.title", value: draft.title },
    ...rows(draft.sections).flatMap((section, index) => [
      { path: `$.sections[${index}].heading`, value: section.heading },
      { path: `$.sections[${index}].text`, value: section.text },
    ]),
    ...rows(draft.claims).flatMap((claim, index) => [
      { path: `$.claims[${index}].text`, value: claim.text },
      { path: `$.claims[${index}].rationale`, value: claim.rationale },
      { path: `$.claims[${index}].scope.description`, value: record(claim.scope)?.description },
      ...(Array.isArray(claim.remaining_uncertainty) ? claim.remaining_uncertainty.map((value, itemIndex) => ({ path: `$.claims[${index}].remaining_uncertainty[${itemIndex}]`, value })) : []),
    ]),
    ...rows(draft.name_registry).map((name, index) => ({ path: `$.name_registry[${index}].name`, value: name.name })),
    ...(Array.isArray(draft.reflection_questions) ? draft.reflection_questions.map((value, index) => ({ path: `$.reflection_questions[${index}]`, value })) : []),
  ];
  for (const { path: textPath, value } of readerText) {
    if (typeof value !== "string") continue;
    for (const occurrenceId of occurrenceIds) {
      const escaped = occurrenceId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const identifierToken = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "iu");
      if (identifierToken.test(value)) {
        issues.push(issue("reader_internal_occurrence_id", textPath, "Reader-facing text must use contextual labels instead of internal occurrence identifiers."));
        break;
      }
    }
  }
}

export function validatePwrp71ReportDraft(input: {
  readonly value: unknown;
  readonly reportType: ReportType;
  readonly snapshotId: string;
  readonly packet: JsonObject;
  readonly source: Pwrp71SourcePackage;
}): ValidationResult<Pwrp71ReportArtifact> {
  const issues: ValidationIssue[] = [];
  try { assertNoRespondentClassification(input.value); }
  catch { return { ok: false, issues: [issue("respondent_classification", "$.draft", "Draft contains retired respondent classification.")] }; }
  const reportSource = input.source;
  if (reportSource.manifestSha256 !== PWRP71_RELEASE_MANIFEST_SHA256
    || reportSource.manifest.report_release !== PWQE51_RELEASE_IDENTITY.reportRelease
    || reportSource.policy.release !== PWQE51_RELEASE_IDENTITY.reportRelease
    || reportSource.policy.compatible_question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || reportSource.policy.compatible_router_source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || reportSource.manifest.content_binding !== sha256(reportSource.manifest.files)) {
    issues.push(issue("report_source_binding", "$.source", "PWRP 7.1 source manifest or compatibility binding is not pinned."));
  }
  const packet = input.packet as Record<string, unknown>;
  issues.push(...packetBindingIssues(input.packet, input.snapshotId));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(reportSource.schemas.reportDraft as object);
  if (!validate(input.value)) {
    for (const error of validate.errors ?? []) issues.push(issue("report_schema", error.instancePath || "$", error.message ?? "PWRP 7.1 draft schema validation failed."));
    return { ok: false, issues };
  }
  const draft = input.value as Pwrp71ReportDraft;
  if (draft.report_release !== reportSource.policy.release || draft.release_id !== packet.release_id
    || draft.snapshot_id !== input.snapshotId || draft.evidence_sha256 !== packet.content_sha256 || draft.report_type !== input.reportType) {
    issues.push(issue("draft_binding", "$", "Draft release, report type, packet, evidence, or snapshot does not match its prepared source."));
  }
  validatePwrp71ClaimGraph(draft, packet, issues);
  validateReaderTextDoesNotExposeOccurrenceIds(draft, packet, issues);
  if (issues.length) return { ok: false, issues };

  const reportMarkdown = renderPwrp71Markdown(draft);
  const identity = { report_release: draft.report_release, release_id: draft.release_id, snapshot_id: draft.snapshot_id, report_type: draft.report_type, evidence_sha256: draft.evidence_sha256, draft };
  const reportId = `pwrp71_${sha256(identity).slice(0, 28)}`;
  const withoutDigests = {
    artifact_type: "pwrp71_report" as const,
    report_release: draft.report_release,
    source_manifest_sha256: reportSource.manifestSha256,
    report_id: reportId,
    report_type: draft.report_type,
    release_id: draft.release_id,
    snapshot_id: draft.snapshot_id,
    evidence_sha256: draft.evidence_sha256,
    report_markdown: reportMarkdown,
    draft,
  };
  return { ok: true, issues: [], value: {
    ...withoutDigests,
    digests: { artifact_sha256: sha256(withoutDigests), report_markdown_sha256: sha256(reportMarkdown) },
  } as Pwrp71ReportArtifact };
}
