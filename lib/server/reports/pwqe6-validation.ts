import Ajv2020 from "ajv/dist/2020.js";
import type { JsonObject, ReportType, ValidationIssue, ValidationResult } from "../../question-engine/types.ts";
import { PWQE5_RELEASE_IDENTITY } from "./pwqe6-source.ts";
import type { Pwqe5SourcePackage } from "./pwqe6-source.ts";
import type { Pwqe6ReportArtifact, Pwqe6ReportDraft } from "./types.ts";
import type { DecryptedAssessmentSnapshot, PreparedReportInputs } from "./types.ts";
import type { Pwqe6ReportActivation } from "./pwqe6-readiness.ts";
import { containsAccountIdentifier } from "./privacy-patterns.ts";

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function pwqe6Canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pwqe6Canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${pwqe6Canonicalize(record[key])}`).join(",")}}`;
}

export function pwqe6Sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : pwqe6Canonicalize(value)).digest("hex");
}

import { createHash } from "node:crypto";

const DIRECT_PII = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:^|\s)\+\d(?:[\s().-]*\d){7,14}(?:\s|$)|\b\d{3}-\d{2}-\d{4}\b)/iu;
const DISALLOWED_KEYS = new Set(["email", "email_address", "phone", "phone_number", "raw_answers", "answers", "responses", "narrative", "private_note", "free_text", "user_label"]);

function privacyIssues(value: unknown, path = "$", issues: ValidationIssue[] = []): ValidationIssue[] {
  if (typeof value === "string") {
    if (DIRECT_PII.test(value) || containsAccountIdentifier(value)) issues.push({ code: "direct_pii", path, message: "Generated report contains direct identifying data." });
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => privacyIssues(item, `${path}[${index}]`, issues));
    return issues;
  }
  const record = object(value);
  if (record) for (const [key, child] of Object.entries(record)) {
    if (DISALLOWED_KEYS.has(key.toLowerCase())) issues.push({ code: "private_input_key", path: `${path}.${key}`, message: "Generated report contains a prohibited private-input field." });
    privacyIssues(child, `${path}.${key}`, issues);
  }
  return issues;
}

function packetRecordIds(packet: JsonObject): Set<string> {
  const ids = new Set<string>();
  for (const key of ["observations", "episodes", "steps", "sequence_edges", "target_resolutions", "structural_evidence_summaries", "missingness", "corrections", "open_questions"] as const) {
    const entries = Array.isArray(packet[key]) ? packet[key] as unknown[] : [];
    for (const entry of entries) {
      const id = object(entry)?.id;
      if (typeof id === "string") ids.add(id);
    }
  }
  return ids;
}

function packetOccurrenceIds(packet: JsonObject): Set<string> {
  const episodes = Array.isArray(packet.episodes) ? packet.episodes : [];
  return new Set(episodes.map((episode) => object(episode)?.id).filter((id): id is string => typeof id === "string"));
}

function packetRecordOccurrences(packet: JsonObject): Map<string, Set<string>> {
  const occurrencesById = new Map<string, Set<string>>();
  const add = (id: unknown, occurrences: unknown[]) => {
    if (typeof id !== "string") return;
    const scoped = occurrences.filter((occurrence): occurrence is string => typeof occurrence === "string");
    occurrencesById.set(id, new Set([...(occurrencesById.get(id) ?? []), ...scoped]));
  };
  for (const key of ["observations", "episodes", "steps", "sequence_edges", "target_resolutions", "structural_evidence_summaries"] as const) {
    const entries = Array.isArray(packet[key]) ? packet[key] as unknown[] : [];
    for (const entry of entries) {
      const record = object(entry);
      if (!record) continue;
      const occurrences = key === "episodes"
        ? [record.id]
        : key === "structural_evidence_summaries"
          ? Array.isArray(record.occurrence_ids) ? record.occurrence_ids : []
          : [record.occurrence_id];
      add(record.id, occurrences);
    }
  }
  return occurrencesById;
}

function packetLineageIssues(draft: Pwqe6ReportDraft, packet: JsonObject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const validEvidence = packetRecordIds(packet);
  const evidenceOccurrences = packetRecordOccurrences(packet);
  const occurrences = packetOccurrenceIds(packet);
  const invalidated = new Set([...(Array.isArray(packet.superseded_response_ids) ? packet.superseded_response_ids : []), ...(Array.isArray(packet.invalidated_response_ids) ? packet.invalidated_response_ids : [])].filter((id): id is string => typeof id === "string"));
  const claims = Array.isArray(draft.claims) ? draft.claims : [];
  const claimIds = new Set<string>();
  claims.forEach((candidate, index) => {
    const claim = object(candidate);
    if (!claim) return;
    const id = claim.id;
    if (typeof id === "string") {
      if (claimIds.has(id)) issues.push({ code: "duplicate_claim_id", path: `$.claims[${index}].id`, message: "Claim identifiers must be unique." });
      claimIds.add(id);
    }
    const scope = object(claim.scope);
    const occurrenceRefs = Array.isArray(scope?.occurrence_ids) ? scope.occurrence_ids as unknown[] : [];
    for (const key of ["evidence_ids", "counterevidence_ids"] as const) {
      const refs = Array.isArray(claim[key]) ? claim[key] as unknown[] : [];
      refs.forEach((ref, refIndex) => {
        if (typeof ref !== "string" || !validEvidence.has(ref) || invalidated.has(ref)) {
          issues.push({ code: "invalid_evidence_reference", path: `$.claims[${index}].${key}[${refIndex}]`, message: "Claim reference does not resolve to current packet evidence." });
          return;
        }
        const citedOccurrences = evidenceOccurrences.get(ref);
        if (citedOccurrences && [...citedOccurrences].some((occurrenceId) => !occurrenceRefs.includes(occurrenceId))) {
          issues.push({ code: "evidence_occurrence_scope", path: `$.claims[${index}].${key}[${refIndex}]`, message: "Claim evidence belongs to an occurrence outside the claim's declared scope." });
        }
      });
    }
    occurrenceRefs.forEach((ref, refIndex) => {
      if (typeof ref !== "string" || !occurrences.has(ref)) issues.push({ code: "invalid_occurrence_reference", path: `$.claims[${index}].scope.occurrence_ids[${refIndex}]`, message: "Claim occurrence does not exist in the packet." });
    });
    const personRefs = Array.isArray(scope?.person_ids) ? scope.person_ids as unknown[] : [];
    if (personRefs.length > 0) issues.push({ code: "unsupported_person_scope", path: `$.claims[${index}].scope.person_ids`, message: "The source packet does not establish person identities." });
  });
  const sections = Array.isArray(draft.sections) ? draft.sections : [];
  sections.forEach((candidate, index) => {
    const section = object(candidate);
    const refs = Array.isArray(section?.claim_ids) ? section.claim_ids as unknown[] : [];
    refs.forEach((ref, refIndex) => {
      if (typeof ref !== "string" || !claimIds.has(ref)) issues.push({ code: "invalid_section_claim_reference", path: `$.sections[${index}].claim_ids[${refIndex}]`, message: "Section reference does not resolve to a report claim." });
    });
  });
  const names = Array.isArray(draft.name_registry) ? draft.name_registry : [];
  names.forEach((candidate, index) => {
    const name = object(candidate);
    const refs = Array.isArray(name?.supporting_claim_ids) ? name.supporting_claim_ids as unknown[] : [];
    refs.forEach((ref, refIndex) => {
      if (typeof ref !== "string" || !claimIds.has(ref)) issues.push({ code: "invalid_name_claim_reference", path: `$.name_registry[${index}].supporting_claim_ids[${refIndex}]`, message: "Name registry support does not resolve to a report claim." });
    });
  });
  return issues;
}

function markdownFromDraft(draft: Pwqe6ReportDraft): string {
  const claimMap = new Map((draft.claims as Array<Record<string, unknown>>).map((claim) => [String(claim.id), claim]));
  const renderedClaimIds = new Set<string>();
  const renderClaim = (claim: Record<string, unknown>) => {
    const evidence = [...(Array.isArray(claim.evidence_ids) ? claim.evidence_ids : []), ...(Array.isArray(claim.counterevidence_ids) ? claim.counterevidence_ids : [])].map(String);
    return `- ${String(claim.text)}${evidence.length ? ` (Evidence: ${evidence.join(", ")})` : ""}`;
  };
  const sections = (draft.sections as Array<Record<string, unknown>>).map((section) => {
    const linked = (Array.isArray(section.claim_ids) ? section.claim_ids : []).map(String).flatMap((id) => {
      const claim = claimMap.get(id);
      if (!claim) return [];
      renderedClaimIds.add(id);
      return [renderClaim(claim)];
    });
    // Reader prose comes only from claims with validated evidence lineage. The
    // schema's freeform section text is retained in the canonical draft for audit.
    return `## ${String(section.heading)}${linked.length ? `\n\n${linked.join("\n")}` : ""}`;
  }).join("\n\n");
  const claims = (draft.claims as Array<Record<string, unknown>>).filter((claim) => !renderedClaimIds.has(String(claim.id))).map(renderClaim).join("\n");
  const questions = (draft.reflection_questions as string[]).map((question) => `- ${question}`).join("\n");
  return [`# ${draft.title}`, sections, claims ? `## Evidence linked claims\n\n${claims}` : "", questions ? `## Reflection questions\n\n${questions}` : ""].filter(Boolean).join("\n\n");
}

/** Renders the reader-facing Markdown from a draft that already passed v6 validation. */
export function renderPwqe6ReportDraftMarkdown(draft: Pwqe6ReportDraft): string {
  return markdownFromDraft(draft);
}

export function validatePwqe6ReportDraftValue(input: {
  readonly value: unknown;
  readonly reportType: ReportType;
  readonly snapshotId: string;
  readonly packet: JsonObject;
  readonly source: Pwqe5SourcePackage;
}): ValidationResult<Pwqe6ReportDraft> {
  const issues: ValidationIssue[] = [];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(input.source.schemas.reportDraft);
  if (!validate(input.value)) {
    for (const error of validate.errors ?? []) issues.push({ code: "report_schema", path: error.instancePath || "$", message: error.message ?? "Draft schema validation failed." });
    return { ok: false, issues };
  }
  const draft = input.value as Pwqe6ReportDraft;
  if (draft.release_id !== PWQE5_RELEASE_IDENTITY.release || draft.snapshot_id !== input.snapshotId || draft.report_type !== input.reportType) {
    return { ok: false, issues: [{ code: "report_binding", path: "$", message: "Draft release, snapshot, or report type does not match the prepared inputs." }] };
  }
  issues.push(...privacyIssues(draft), ...packetLineageIssues(draft, input.packet));
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: draft, issues: [] };
}

export function validatePwqe6ReportDraft(input: {
  readonly value: unknown;
  readonly reportType: ReportType;
  readonly snapshotId: string;
  readonly packet: JsonObject;
  readonly source: Pwqe5SourcePackage;
  readonly qualificationManifestSha256: string;
}): ValidationResult<Pwqe6ReportArtifact> {
  const validated = validatePwqe6ReportDraftValue(input);
  if (!validated.ok) return { ok: false, issues: validated.issues };
  const draft = validated.value;
  const reportMarkdown = markdownFromDraft(draft);
  const reportId = `pwr6_${pwqe6Sha256({ release: draft.release_id, snapshot: draft.snapshot_id, type: draft.report_type, draft }).slice(0, 28)}`;
  const withoutDigests = {
    artifact_type: "pwqe6_report" as const,
    contract_id: PWQE5_RELEASE_IDENTITY.reportContract,
    integrity_contract_id: PWQE5_RELEASE_IDENTITY.evidenceContract,
    package_version: PWQE5_RELEASE_IDENTITY.release,
    prompt_release: PWQE5_RELEASE_IDENTITY.promptRelease,
    report_id: reportId,
    report_type: input.reportType,
    snapshot_id: input.snapshotId,
    source_manifest_sha256: input.source.sourceManifestSha256,
    qualification_manifest_sha256: input.qualificationManifestSha256,
    packet_id: String(input.packet.packet_id),
    report_markdown: reportMarkdown,
    draft,
  };
  const artifact = {
    ...withoutDigests,
    digests: { artifact_sha256: pwqe6Sha256(withoutDigests), report_markdown_sha256: pwqe6Sha256(reportMarkdown) },
  } as Pwqe6ReportArtifact;
  return { ok: true, value: artifact, issues: [] };
}

export function isPwqe6Artifact(value: unknown): value is Pwqe6ReportArtifact {
  return object(value)?.artifact_type === "pwqe6_report";
}

export function validatePwqe6ArtifactLineage(value: unknown, packet: JsonObject, snapshotId: string): ValidationIssue[] {
  const artifact = object(value);
  if (!artifact || !isPwqe6Artifact(value)) return [{ code: "artifact_type", path: "$.artifact_type", message: "Expected a PWQE6 report artifact." }];
  if (artifact.snapshot_id !== snapshotId || artifact.packet_id !== packet.packet_id || artifact.contract_id !== PWQE5_RELEASE_IDENTITY.reportContract || artifact.prompt_release !== PWQE5_RELEASE_IDENTITY.promptRelease) {
    return [{ code: "artifact_binding", path: "$", message: "Released artifact does not match its snapshot, packet, or report contract." }];
  }
  const digests = object(artifact.digests);
  const withoutDigests = Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== "digests"));
  if (!digests || digests.artifact_sha256 !== pwqe6Sha256(withoutDigests) || digests.report_markdown_sha256 !== pwqe6Sha256(String(artifact.report_markdown))) {
    return [{ code: "artifact_digest", path: "$.digests", message: "Released artifact or Markdown digest does not match its contents." }];
  }
  const draft = object(artifact.draft) as Pwqe6ReportDraft | undefined;
  if (!draft) return [{ code: "artifact_draft", path: "$.draft", message: "Released artifact is missing its validated draft." }];
  return packetLineageIssues(draft, packet);
}

export async function preparePwqe6ReportInputs(
  snapshot: DecryptedAssessmentSnapshot,
  activation: Pwqe6ReportActivation,
  workspaceRoot = process.cwd(),
): Promise<ValidationResult<PreparedReportInputs>> {
  const { loadPwqe5SourcePackage } = await import("./pwqe6-source.ts");
  const source = await loadPwqe5SourcePackage(workspaceRoot);
  const packet = object(snapshot.canonicalSnapshot.router_packet);
  const issues: ValidationIssue[] = [];
  if (!packet) return { ok: false, issues: [{ code: "router_packet_missing", path: "$.router_packet", message: "PWQE6 snapshot has no router evidence packet." }] };
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validatePacket = ajv.compile(source.schemas.routerPacket);
  if (!validatePacket(packet)) {
    for (const error of validatePacket.errors ?? []) issues.push({ code: "router_packet_schema", path: error.instancePath || "$.router_packet", message: error.message ?? "Router packet schema validation failed." });
  }
  const { content_sha256: contentSha, ...packetContent } = packet;
  if (typeof contentSha !== "string" || contentSha !== pwqe6Sha256(packetContent)) issues.push({ code: "router_packet_digest", path: "$.router_packet.content_sha256", message: "Router packet content digest does not match its canonical contents." });
  if (packet.snapshot_id !== snapshot.snapshotId
    || packet.release_id !== source.identities.release
    || packet.format !== source.identities.evidenceContract
    || snapshot.canonicalSnapshot.contract_id !== source.identities.release
    || snapshot.canonicalSnapshot.integrity_contract_id !== source.identities.evidenceContract
    || snapshot.canonicalSnapshot.source_manifest_sha256 !== source.sourceManifestSha256) {
    issues.push({ code: "snapshot_source_binding", path: "$.router_packet", message: "Snapshot and router packet do not bind to the loaded PWQE5 source release." });
  }
  if (snapshot.evidenceSha256 !== pwqe6Sha256(String(contentSha)) || snapshot.scopeSha256 !== pwqe6Sha256(packet.assessment_scope)) {
    issues.push({ code: "snapshot_digest_binding", path: "$.router_packet", message: "Snapshot evidence or scope digest does not match its router packet." });
  }
  const observations = Array.isArray(packet.observations) ? packet.observations : [];
  const observationIds = new Set<string>();
  observations.forEach((candidate, index) => {
    const observation = object(candidate);
    const id = observation?.id;
    if (typeof id !== "string" || observationIds.has(id)) issues.push({ code: "observation_id", path: `$.router_packet.observations[${index}].id`, message: "Observation identifiers must be present and unique." });
    else observationIds.add(id);
  });
  const superseded = new Set([...(Array.isArray(packet.superseded_response_ids) ? packet.superseded_response_ids : []), ...(Array.isArray(packet.invalidated_response_ids) ? packet.invalidated_response_ids : [])]);
  observations.forEach((candidate, index) => {
    const responseId = object(candidate)?.response_id;
    if (typeof responseId === "string" && superseded.has(responseId)) issues.push({ code: "stale_observation", path: `$.router_packet.observations[${index}].response_id`, message: "Superseded or invalidated response appears as current evidence." });
  });
  const steps = Array.isArray(packet.steps) ? packet.steps : [];
  const stepIds = new Set(steps.map((step) => object(step)?.step_id).filter((id): id is string => typeof id === "string"));
  const observationEvidenceIds = new Set<string>(observationIds);
  observations.forEach((candidate) => {
    const responseId = object(candidate)?.response_id;
    if (typeof responseId === "string") observationEvidenceIds.add(responseId);
  });
  const edges = Array.isArray(packet.sequence_edges) ? packet.sequence_edges : [];
  edges.forEach((candidate, index) => {
    const edge = object(candidate);
    if (!edge || !stepIds.has(String(edge.from_step)) || !stepIds.has(String(edge.to_step))) issues.push({ code: "invalid_sequence_edge", path: `$.router_packet.sequence_edges[${index}]`, message: "Sequence edge references a step that does not exist in the packet." });
    const refs = Array.isArray(edge?.evidence_ids) ? edge.evidence_ids : [];
    if (refs.some((id) => typeof id !== "string" || !observationEvidenceIds.has(id))) issues.push({ code: "invalid_sequence_evidence", path: `$.router_packet.sequence_edges[${index}].evidence_ids`, message: "Sequence edge evidence must resolve to a current observation." });
  });
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    issues: [],
    value: {
      contractVersion: "v6",
      snapshot: {
        databaseId: snapshot.databaseId,
        assessmentSessionId: snapshot.assessmentSessionId,
        snapshotId: snapshot.snapshotId,
        snapshotRevision: snapshot.snapshotRevision,
        completedPass: snapshot.completedPass,
        evidenceSha256: snapshot.evidenceSha256,
        scopeSha256: snapshot.scopeSha256,
      },
      packets: [],
      routerPacket: packet as JsonObject,
      sourceManifestSha256: activation.sourceManifestSha256,
      qualificationManifestSha256: activation.qualificationManifestSha256,
      modelPolicy: activation.modelPolicy,
    },
  };
}
