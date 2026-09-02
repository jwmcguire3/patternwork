import type { JsonObject, ValidationIssue, ValidationResult } from "../question-engine/types.ts";
import { validatePacketCrossObject } from "../question-engine/packet-validator.ts";
import { canonicalJson, normalizeLf, sha256Canonical, sha256Text, validateReportArtifactCrossObject } from "./delivery-validator.ts";
import { loadPatternworkSchemas } from "./schema-loader.ts";
import { validateAgainstSchema } from "./schema-validator.ts";
import type { ReportArtifact, ReportEvidencePacketV3_1, SynthesisArtifact, SynthesisAudit, SynthesisBundle } from "./types.ts";

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object).filter((item): item is Record<string, unknown> => item !== undefined) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function add(issues: ValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

function omitField<T extends JsonObject>(value: T, containerKey: string | undefined, field: string): JsonObject {
  const clone = structuredClone(value) as JsonObject;
  const container = containerKey ? object(clone[containerKey]) : clone;
  if (container) delete container[field];
  return clone;
}

export function validateSynthesisBundleCrossObject(bundle: SynthesisBundle): ValidationResult<SynthesisBundle> {
  const issues: ValidationIssue[] = [];
  const sources = object(bundle.sources)!;
  const manifest = object(bundle.snapshot_manifest)!;
  const expected = [["ifs","IFS"], ["pv","PV"], ["attachment","ATT"]] as const;
  const claimIds = new Set<string>();

  for (const [key, reportType] of expected) {
    const source = object(sources[key]);
    const packet = object(source?.packet) as ReportEvidencePacketV3_1 | undefined;
    const report = object(source?.report) as ReportArtifact | undefined;
    if (!source || !packet || !report) continue;
    if (source.report_type !== reportType || packet.report_type !== reportType || report.report_type !== reportType) add(issues, "synthesis_source_type", `$.sources.${key}`, "Source slot, packet, and report types must agree.");
    const packetResult = validatePacketCrossObject(packet);
    if (!packetResult.ok) add(issues, "synthesis_packet", `$.sources.${key}.packet`, "Source packet fails cross-object validation.");
    const reportResult = validateReportArtifactCrossObject(report, [packet]);
    if (!reportResult.ok) add(issues, "synthesis_report", `$.sources.${key}.report`, "Source report fails delivery validation.");
    if (source.packet_sha256 !== sha256Canonical(packet)) add(issues, "synthesis_packet_digest", `$.sources.${key}.packet_sha256`, "Packet canonical digest mismatch.");
    if (source.report_artifact_sha256 !== object(report.digests)?.artifact_sha256) add(issues, "synthesis_report_digest", `$.sources.${key}.report_artifact_sha256`, "Report artifact digest mismatch.");
    const snapshot = object(packet.snapshot_binding);
    if (snapshot?.snapshot_id !== manifest.snapshot_id || snapshot?.snapshot_revision !== manifest.snapshot_revision || snapshot?.evidence_sha256 !== manifest.evidence_sha256 || snapshot?.scope_sha256 !== manifest.scope_sha256) add(issues, "synthesis_snapshot", `$.sources.${key}`, "Source packet does not exactly match the synthesis snapshot manifest.");
    for (const claim of objects(report.claims)) if (typeof claim.claim_id === "string") claimIds.add(claim.claim_id);
  }

  for (const [index, proof] of objects(bundle.cross_layer_link_proofs).entries()) {
    const triple = object(proof.claim_ids);
    for (const key of ["ifs","pv","attachment"] as const) {
      const id = triple?.[key];
      if (typeof id !== "string" || !claimIds.has(id)) add(issues, "synthesis_link_claim", `$.cross_layer_link_proofs[${index}].claim_ids.${key}`, "Cross-layer proof claim does not resolve.");
    }
    if (proof.proof_sha256 !== sha256Canonical(omitField(proof as JsonObject, undefined, "proof_sha256"))) add(issues, "synthesis_link_digest", `$.cross_layer_link_proofs[${index}].proof_sha256`, "Cross-layer proof digest mismatch.");
  }
  if (manifest.manifest_sha256 !== sha256Canonical(omitField(manifest as JsonObject, undefined, "manifest_sha256"))) add(issues, "snapshot_manifest_digest", "$.snapshot_manifest.manifest_sha256", "Snapshot manifest digest mismatch.");
  if (bundle.bundle_sha256 !== sha256Canonical(omitField(bundle, undefined, "bundle_sha256"))) add(issues, "synthesis_bundle_digest", "$.bundle_sha256", "Synthesis bundle digest mismatch.");
  return issues.length === 0 ? { ok: true, value: bundle, issues: [] } : { ok: false, issues };
}

export function validateSynthesisAuditCrossObject(audit: SynthesisAudit, bundle?: SynthesisBundle): ValidationResult<SynthesisAudit> {
  const issues: ValidationIssue[] = [];
  const blocks = objects(audit.markdown_blocks);
  const traces = objects(audit.paragraph_traces);
  const candidates = objects(audit.candidates);
  const traceIds = new Set(traces.map((trace) => trace.trace_id).filter((id): id is string => typeof id === "string"));
  const renderedCandidates = new Set<string>();
  blocks.forEach((block, index) => {
    if (block.ordinal !== index + 1) add(issues, "synthesis_block_order", `$.markdown_blocks[${index}].ordinal`, "Synthesis blocks must have contiguous one-based ordinals.");
    if (typeof block.markdown === "string" && block.markdown_sha256 !== sha256Text(normalizeLf(block.markdown))) add(issues, "synthesis_paragraph_digest", `$.markdown_blocks[${index}]`, "Synthesis block digest mismatch.");
    if (block.kind === "substantive" && !traceIds.has(String(block.trace_id))) add(issues, "synthesis_trace", `$.markdown_blocks[${index}]`, "Substantive synthesis block lacks a resolving trace.");
  });
  traces.forEach((trace) => strings(trace.candidate_ids).forEach((id) => renderedCandidates.add(id)));
  candidates.forEach((candidate, index) => {
    const visible = ["include_convergence","include_divergence"].includes(String(candidate.reader_disposition));
    if (visible && !renderedCandidates.has(String(candidate.candidate_id))) add(issues, "synthesis_candidate_trace", `$.candidates[${index}]`, "Reader-visible candidate is not traced.");
    if (!visible && renderedCandidates.has(String(candidate.candidate_id))) add(issues, "synthesis_audit_only_rendered", `$.candidates[${index}]`, "Audit-only candidate cannot appear in reader prose.");
    if (candidate.ordinal !== index + 1) add(issues, "synthesis_candidate_order", `$.candidates[${index}].ordinal`, "Candidate order must be deterministic and contiguous.");
  });
  if (bundle && (audit.bundle_id !== bundle.bundle_id || audit.bundle_sha256 !== bundle.bundle_sha256 || canonicalJson(audit.candidates) !== canonicalJson((bundle as JsonObject).candidates ?? audit.candidates))) {
    if (audit.bundle_id !== bundle.bundle_id || audit.bundle_sha256 !== bundle.bundle_sha256) add(issues, "synthesis_bundle_binding", "$", "Synthesis audit does not bind to the supplied bundle.");
  }
  const digests = object(audit.digests);
  if (digests) {
    if (digests.markdown_sha256 !== sha256Text(normalizeLf(audit.reader_markdown))) add(issues, "synthesis_markdown_digest", "$.digests.markdown_sha256", "Synthesis Markdown digest mismatch.");
    if (digests.candidate_audit_sha256 !== sha256Canonical(audit.candidates)) add(issues, "synthesis_candidate_digest", "$.digests.candidate_audit_sha256", "Candidate audit digest mismatch.");
    if (digests.paragraph_traces_sha256 !== sha256Canonical(audit.paragraph_traces)) add(issues, "synthesis_trace_digest", "$.digests.paragraph_traces_sha256", "Synthesis trace digest mismatch.");
    if (digests.audit_sha256 !== sha256Canonical(omitField(audit, "digests", "audit_sha256"))) add(issues, "synthesis_audit_digest", "$.digests.audit_sha256", "Synthesis audit digest mismatch.");
  }
  return issues.length === 0 ? { ok: true, value: audit, issues: [] } : { ok: false, issues };
}

export async function validateSynthesisArtifact(value: unknown, workspaceRoot = process.cwd(), bundle?: SynthesisBundle): Promise<ValidationResult<SynthesisArtifact>> {
  const schemas = await loadPatternworkSchemas(workspaceRoot);
  const structural = validateAgainstSchema<SynthesisArtifact>(value, schemas.registryFor(schemas.synthesis));
  if (!structural.ok) return structural;
  if (structural.value.artifact_type === "synthesis_bundle") return validateSynthesisBundleCrossObject(structural.value);
  if (structural.value.artifact_type === "synthesis_audit") return validateSynthesisAuditCrossObject(structural.value, bundle);
  return structural;
}

