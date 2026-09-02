import { createHash } from "node:crypto";
import type { JsonObject, ValidationIssue, ValidationResult } from "../question-engine/types.ts";
import { validatePacketCrossObject } from "../question-engine/packet-validator.ts";
import { loadPatternworkSchemas } from "./schema-loader.ts";
import { validateAgainstSchema } from "./schema-validator.ts";
import type { LayerReportArtifact, MappingSummaryArtifact, ReportArtifact, ReportEvidencePacketV3_1 } from "./types.ts";

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object).filter((item): item is Record<string, unknown> => item !== undefined) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function issue(issues: ValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

export function normalizeLf(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON cannot contain a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = object(value);
  if (record) return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  throw new TypeError(`Canonical JSON cannot contain ${typeof value}.`);
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sha256Canonical(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

function withoutArtifactDigest(artifact: ReportArtifact): JsonObject {
  const clone = structuredClone(artifact) as JsonObject;
  const digests = object(clone.digests);
  if (digests) delete digests.artifact_sha256;
  return clone;
}

export function validateReportArtifactCrossObject(artifact: ReportArtifact, packets: readonly ReportEvidencePacketV3_1[] = []): ValidationResult<ReportArtifact> {
  const issues: ValidationIssue[] = [];
  const blocks = objects(artifact.markdown_blocks);
  const claims = objects(artifact.claims);
  const traces = objects(artifact.paragraph_traces);
  const claimIds = new Set(claims.map((claim) => claim.claim_id).filter((id): id is string => typeof id === "string"));
  const traceIds = new Set(traces.map((trace) => trace.trace_id).filter((id): id is string => typeof id === "string"));
  const paragraphIds = new Set(blocks.map((block) => block.paragraph_id).filter((id): id is string => typeof id === "string"));
  const tracedClaims = new Set<string>();
  const bindings = artifact.artifact_type === "mapping_summary" ? objects(artifact.packet_bindings) : [object(artifact.packet_binding)].filter((item): item is Record<string, unknown> => item !== undefined);

  if (new Set(claimIds).size !== claims.length) issue(issues, "duplicate_claim_id", "$.claims", "Claim IDs must be unique.");
  if (new Set(traceIds).size !== traces.length) issue(issues, "duplicate_trace_id", "$.paragraph_traces", "Trace IDs must be unique.");
  if (new Set(paragraphIds).size !== blocks.length) issue(issues, "duplicate_paragraph_id", "$.markdown_blocks", "Paragraph IDs must be unique.");

  blocks.forEach((block, index) => {
    const ordinal = index + 1;
    if (block.ordinal !== ordinal) issue(issues, "block_order", `$.markdown_blocks[${index}].ordinal`, "Markdown block ordinals must be contiguous and one-based.");
    if (typeof block.markdown === "string" && block.markdown_sha256 !== sha256Text(normalizeLf(block.markdown))) issue(issues, "paragraph_digest", `$.markdown_blocks[${index}].markdown_sha256`, "Markdown block digest does not match its LF-normalized content.");
    if (block.kind === "substantive" && (typeof block.trace_id !== "string" || !traceIds.has(block.trace_id))) issue(issues, "substantive_trace", `$.markdown_blocks[${index}].trace_id`, "Every substantive block requires one resolving trace.");
    if (block.kind !== "substantive" && typeof block.trace_id === "string") issue(issues, "navigation_trace", `$.markdown_blocks[${index}].trace_id`, "Non-substantive navigation blocks must not carry a trace.");
  });

  const reconstructed = blocks.map((block) => String(block.markdown)).join("\n\n");
  if (normalizeLf(artifact.report_markdown) !== reconstructed) issue(issues, "markdown_reconstruction", "$.report_markdown", "Ordered Markdown blocks joined by one blank line must reproduce report_markdown.");

  traces.forEach((trace, index) => {
    const block = blocks.find((candidate) => candidate.paragraph_id === trace.paragraph_id);
    if (!block) issue(issues, "orphan_trace", `$.paragraph_traces[${index}].paragraph_id`, "Trace paragraph does not resolve.");
    else {
      if (trace.trace_id !== block.trace_id) issue(issues, "trace_block_link", `$.paragraph_traces[${index}].trace_id`, "Trace and block trace IDs disagree.");
      if (trace.paragraph_ordinal !== block.ordinal) issue(issues, "trace_ordinal", `$.paragraph_traces[${index}].paragraph_ordinal`, "Trace ordinal does not match block ordinal.");
      if (trace.paragraph_sha256 !== block.markdown_sha256) issue(issues, "trace_digest", `$.paragraph_traces[${index}].paragraph_sha256`, "Trace digest does not match block digest.");
    }
    for (const claimId of strings(trace.claim_ids)) {
      if (!claimIds.has(claimId)) issue(issues, "unresolved_claim", `$.paragraph_traces[${index}].claim_ids`, `Unknown claim ${claimId}.`);
      tracedClaims.add(claimId);
    }
    if (artifact.artifact_type === "mapping_summary" && (trace.contains_exact_quote !== false || strings(trace.supporting_response_ids).length > 0)) issue(issues, "mapping_quote", `$.paragraph_traces[${index}]`, "Mapping Summary traces cannot contain exact quotes or supporting response IDs.");
  });
  for (const claimId of claimIds.difference(tracedClaims)) issue(issues, "untraced_claim", "$.claims", `Claim ${claimId} is not used by any trace.`);

  const digests = object(artifact.digests);
  if (digests) {
    if (digests.markdown_sha256 !== sha256Text(normalizeLf(artifact.report_markdown))) issue(issues, "markdown_digest", "$.digests.markdown_sha256", "Report Markdown digest mismatch.");
    if (digests.claims_sha256 !== sha256Canonical(artifact.claims)) issue(issues, "claims_digest", "$.digests.claims_sha256", "Claims canonical digest mismatch.");
    if (digests.paragraph_traces_sha256 !== sha256Canonical(artifact.paragraph_traces)) issue(issues, "traces_digest", "$.digests.paragraph_traces_sha256", "Paragraph traces canonical digest mismatch.");
    if (digests.artifact_sha256 !== sha256Canonical(withoutArtifactDigest(artifact))) issue(issues, "artifact_digest", "$.digests.artifact_sha256", "Artifact canonical digest mismatch.");
  }

  const packetById = new Map(packets.map((packet) => [packet.packet_id, packet]));
  const boundTypes = new Set<string>();
  bindings.forEach((binding, index) => {
    const reportType = String(binding.report_type);
    if (boundTypes.has(reportType)) issue(issues, "duplicate_packet_type", `$.packet_bindings[${index}]`, `Duplicate packet report type ${reportType}.`);
    boundTypes.add(reportType);
    const packet = packetById.get(String(binding.packet_id));
    if (packets.length > 0 && !packet) issue(issues, "unresolved_packet", `$.packet_bindings[${index}].packet_id`, "Packet binding does not resolve to a supplied validated packet.");
    if (packet) {
      const packetResult = validatePacketCrossObject(packet);
      if (!packetResult.ok) issue(issues, "invalid_bound_packet", `$.packet_bindings[${index}]`, "Bound packet fails cross-object validation.");
      const snapshot = object(packet.snapshot_binding);
      if (packet.report_type !== reportType || binding.snapshot_id !== snapshot?.snapshot_id || binding.snapshot_revision !== snapshot?.snapshot_revision || binding.evidence_sha256 !== snapshot?.evidence_sha256 || binding.scope_sha256 !== snapshot?.scope_sha256) issue(issues, "packet_binding_mismatch", `$.packet_bindings[${index}]`, "Packet type or immutable snapshot binding does not match.");
      if (artifact.artifact_type === "mapping_summary") {
        const completion = object(packet.assessment_completion);
        if (completion?.completion_mode !== "pass1_complete" || completion.last_completed_stage !== "S2" || completion.safe_resume_stage !== "S3") issue(issues, "mapping_pass1_boundary", `$.packet_bindings[${index}]`, "Mapping Summary input must be a normal S2-complete Pass-1 packet resumable at S3.");
      }
    }
  });

  if (artifact.artifact_type === "mapping_summary") {
    const mapCodes = new Set(claims.map((claim) => claim.section_code));
    for (let index = 1; index <= 8; index += 1) {
      const code = `MAP-${String(index).padStart(2, "0")}`;
      if (!mapCodes.has(code)) issue(issues, "mapping_section_missing", "$.claims", `Missing Mapping Summary claim for ${code}.`);
    }
  } else {
    if (artifact.packet_binding.report_type !== artifact.report_type) issue(issues, "layer_packet_type", "$.packet_binding.report_type", "Layer report and packet binding report types must match.");
    claims.forEach((claim, index) => {
      if (claim.report_type !== artifact.report_type || !String(claim.section_code).startsWith(`${artifact.report_type}-`)) issue(issues, "layer_claim_type", `$.claims[${index}]`, "Layer claim report type and section must match the artifact.");
    });
  }

  return issues.length === 0 ? { ok: true, value: artifact, issues: [] } : { ok: false, issues };
}

export async function validateReportArtifact(value: unknown, packets: readonly ReportEvidencePacketV3_1[] = [], workspaceRoot = process.cwd()): Promise<ValidationResult<ReportArtifact>> {
  const schemas = await loadPatternworkSchemas(workspaceRoot);
  const structural = validateAgainstSchema<ReportArtifact>(value, schemas.registryFor(schemas.reportArtifact));
  if (!structural.ok) return structural;
  return validateReportArtifactCrossObject(structural.value, packets);
}

export async function validateMappingSummaryArtifact(value: unknown, packets: readonly ReportEvidencePacketV3_1[] = [], workspaceRoot = process.cwd()): Promise<ValidationResult<MappingSummaryArtifact>> {
  const result = await validateReportArtifact(value, packets, workspaceRoot);
  if (!result.ok) return result;
  if (result.value.artifact_type !== "mapping_summary") return { ok: false, issues: [{ code: "artifact_type", path: "$.artifact_type", message: "Expected a Mapping Summary artifact." }] };
  return { ok: true, value: result.value, issues: [] };
}

export async function validateLayerReportArtifact(value: unknown, packets: readonly ReportEvidencePacketV3_1[] = [], workspaceRoot = process.cwd()): Promise<ValidationResult<LayerReportArtifact>> {
  const result = await validateReportArtifact(value, packets, workspaceRoot);
  if (!result.ok) return result;
  if (result.value.artifact_type !== "layer_report") return { ok: false, issues: [{ code: "artifact_type", path: "$.artifact_type", message: "Expected a layer report artifact." }] };
  return { ok: true, value: result.value, issues: [] };
}
