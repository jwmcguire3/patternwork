import type { JsonObject } from "../../lib/question-engine/types.ts";
import { validateReportEvidencePacket } from "../../lib/question-engine/packet-validator.ts";
import type { ReportEvidencePacketV3_1, SynthesisBundle } from "../../lib/report-contracts/types.ts";
import { validateSynthesisArtifact } from "../../lib/report-contracts/synthesis-validator.ts";
import { buildPseudonymousPacketsFromCanonicalSnapshot } from "../../lib/server/reports/packet-builder.ts";
import type { DecryptedAssessmentSnapshot, PreparedReportInputs } from "../../lib/server/reports/types.ts";

export type CliInput =
  | { readonly mode: "packets"; readonly prepared: PreparedReportInputs }
  | { readonly mode: "synthesis_bundle"; readonly bundle: SynthesisBundle };

function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }

function snapshotFromRaw(value: JsonObject): DecryptedAssessmentSnapshot {
  const binding = object(value.snapshot_binding) ?? object(value.snapshot) ?? value;
  const completion = object(value.assessment_completion);
  const snapshotId = String(binding.snapshot_id ?? value.snapshotId ?? value.snapshot_id ?? "local-snapshot");
  const snapshotRevision = String(binding.snapshot_revision ?? value.snapshotRevision ?? value.snapshot_revision ?? "local-1");
  const completedPass = completion?.completion_mode === "pass1_complete" || value.completedPass === 1 ? 1 : 2;
  return { databaseId: "local", assessmentSessionId: "local", snapshotId, snapshotRevision, completedPass, evidenceSha256: String(binding.evidence_sha256 ?? value.evidenceSha256 ?? value.evidence_sha256 ?? "0".repeat(64)), scopeSha256: String(binding.scope_sha256 ?? value.scopeSha256 ?? value.scope_sha256 ?? "0".repeat(64)), canonicalSnapshot: value };
}

function preparedFromPackets(packets: readonly ReportEvidencePacketV3_1[]): PreparedReportInputs {
  const binding = object(packets[0].snapshot_binding)!;
  const completion = object(packets[0].assessment_completion);
  return { snapshot: { databaseId: "local", assessmentSessionId: "local", snapshotId: String(binding.snapshot_id), snapshotRevision: String(binding.snapshot_revision), completedPass: completion?.completion_mode === "pass1_complete" ? 1 : 2, evidenceSha256: String(binding.evidence_sha256), scopeSha256: String(binding.scope_sha256) }, packets };
}

export async function classifyCliInput(value: unknown, workspaceRoot = process.cwd()): Promise<CliInput> {
  const record = object(value);
  if (record?.artifact_type === "synthesis_bundle") {
    const validation = await validateSynthesisArtifact(value, workspaceRoot);
    if (!validation.ok || validation.value.artifact_type !== "synthesis_bundle") throw new Error(`Invalid synthesis bundle: ${JSON.stringify(validation.issues)}`);
    return { mode: "synthesis_bundle", bundle: validation.value };
  }
  const candidates = Array.isArray(value) ? value : Array.isArray(record?.packets) ? record.packets : Array.isArray(record?.evidence_packets) ? record.evidence_packets : undefined;
  if (candidates) {
    const packets: ReportEvidencePacketV3_1[] = [];
    for (const [index, candidate] of candidates.entries()) {
      const validation = await validateReportEvidencePacket(candidate, workspaceRoot);
      if (!validation.ok) throw new Error(`Invalid packet ${index}: ${JSON.stringify(validation.issues)}`);
      packets.push(validation.value);
    }
    if (packets.length === 0) throw new Error("No packets were supplied.");
    return { mode: "packets", prepared: preparedFromPackets(packets) };
  }
  if (!record) throw new Error("Input must be a JSON object, packet array, or synthesis bundle.");
  const snapshot = snapshotFromRaw(record as JsonObject);
  return { mode: "packets", prepared: { ...preparedFromPackets(buildPseudonymousPacketsFromCanonicalSnapshot(snapshot)), snapshot: { ...snapshot, canonicalSnapshot: undefined, persistedPackets: undefined } as PreparedReportInputs["snapshot"] } };
}
