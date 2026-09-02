import type { JsonObject, ReportType, ValidationIssue, ValidationResult } from "../../question-engine/types.ts";
import { validateReportEvidencePacket } from "../../question-engine/packet-validator.ts";
import { verifyPatternworkSourceIntegrity } from "../../question-engine/source-integrity.ts";
import {
  validateLayerReportArtifact,
  validateMappingSummaryArtifact,
} from "../../report-contracts/delivery-validator.ts";
import { validateSynthesisArtifact } from "../../report-contracts/synthesis-validator.ts";
import type {
  ReportArtifact,
  ReportEvidencePacketV3_1,
  SynthesisAudit,
  SynthesisBundle,
} from "../../report-contracts/types.ts";
import type { DecryptedAssessmentSnapshot, PreparedReportInputs } from "./types.ts";

const FORBIDDEN_KEYS = new Set([
  "email", "email_address", "contact_email", "phone", "phone_number", "street_address",
  "mailing_address", "full_name", "legal_name", "raw_answers", "flat_answers", "answers",
  "response_list", "all_responses",
]);
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/u;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/u;

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function piiIssues(value: unknown, path = "$", issues: ValidationIssue[] = []): ValidationIssue[] {
  if (typeof value === "string") {
    if (EMAIL.test(value) || PHONE.test(value) || SSN.test(value)) {
      issues.push({ code: "direct_pii", path, message: "Provider input contains direct contact or government-identifier data." });
    }
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => piiIssues(item, `${path}[${index}]`, issues));
    return issues;
  }
  const record = object(value);
  if (!record) return issues;
  for (const [key, child] of Object.entries(record)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      issues.push({ code: key.includes("answer") || key.includes("response") ? "raw_answer_boundary" : "pii_key", path: childPath, message: "Provider input contains a prohibited PII or raw-answer field." });
    }
    piiIssues(child, childPath, issues);
  }
  return issues;
}

function sharedSnapshotIssues(packets: readonly ReportEvidencePacketV3_1[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const first = object(packets[0]?.snapshot_binding);
  const firstWindows = JSON.stringify(packets[0]?.window_registry ?? []);
  const types = new Set<string>();
  packets.forEach((packet, index) => {
    const binding = object(packet.snapshot_binding);
    if (types.has(packet.report_type)) issues.push({ code: "duplicate_packet_type", path: `$.packets[${index}].report_type`, message: "Packet report types must be unique." });
    types.add(packet.report_type);
    if (
      binding?.snapshot_id !== first?.snapshot_id ||
      binding?.snapshot_revision !== first?.snapshot_revision ||
      binding?.evidence_sha256 !== first?.evidence_sha256 ||
      binding?.scope_sha256 !== first?.scope_sha256 ||
      JSON.stringify(packet.window_registry) !== firstWindows
    ) {
      issues.push({ code: "snapshot_packet_drift", path: `$.packets[${index}]`, message: "Packet views must share the exact immutable snapshot and window registry." });
    }
  });
  return issues;
}

export async function prepareAndValidateInputs(
  snapshot: DecryptedAssessmentSnapshot,
  packetValues: readonly JsonObject[],
  workspaceRoot = process.cwd(),
): Promise<ValidationResult<PreparedReportInputs>> {
  const integrity = await verifyPatternworkSourceIntegrity(workspaceRoot);
  if (!integrity.ok) return integrity;
  const packets: ReportEvidencePacketV3_1[] = [];
  const issues: ValidationIssue[] = [...piiIssues(packetValues)];
  for (const [index, value] of packetValues.entries()) {
    const result = await validateReportEvidencePacket(value, workspaceRoot);
    if (result.ok) packets.push(result.value);
    else issues.push(...result.issues.map((issue) => ({ ...issue, path: `$.packets[${index}]${issue.path.slice(1)}` })));
  }
  issues.push(...sharedSnapshotIssues(packets));
  const expectedTypes = snapshot.completedPass === 1 ? undefined : new Set(["IFS", "PV", "ATT"]);
  if (snapshot.completedPass === 1 && (packets.length < 1 || packets.length > 3)) {
    issues.push({ code: "pass1_packet_count", path: "$.packets", message: "Pass 1 requires one to three compatible packet views." });
  }
  if (expectedTypes && (packets.length !== 3 || packets.some((packet) => !expectedTypes.has(packet.report_type)))) {
    issues.push({ code: "pass2_packet_set", path: "$.packets", message: "Pass 2 requires exactly IFS, PV, and ATT packet views." });
  }
  for (const [index, packet] of packets.entries()) {
    const binding = object(packet.snapshot_binding);
    if (
      binding?.snapshot_id !== snapshot.snapshotId ||
      binding?.snapshot_revision !== snapshot.snapshotRevision ||
      binding?.evidence_sha256 !== snapshot.evidenceSha256 ||
      binding?.scope_sha256 !== snapshot.scopeSha256
    ) issues.push({ code: "snapshot_binding", path: `$.packets[${index}].snapshot_binding`, message: "Packet binding does not match the decrypted snapshot." });
  }
  return issues.length > 0 ? { ok: false, issues } : {
    ok: true,
    value: {
      snapshot: {
        databaseId: snapshot.databaseId,
        assessmentSessionId: snapshot.assessmentSessionId,
        snapshotId: snapshot.snapshotId,
        snapshotRevision: snapshot.snapshotRevision,
        completedPass: snapshot.completedPass,
        evidenceSha256: snapshot.evidenceSha256,
        scopeSha256: snapshot.scopeSha256,
      },
      packets,
    },
    issues: [],
  };
}

const PROHIBITED_PROSE: readonly [RegExp, string][] = [
  [/\b(?:diagnos(?:is|ed)|personality disorder|mental disorder)\b/iu, "diagnostic_claim"],
  [/\b(?:your trauma|your childhood|caused by (?:your )?caregiver)\b/iu, "origin_claim"],
  [/\b(?:vagal tone|heart[- ]rate variability|measured (?:your )?(?:physiology|nervous system))\b/iu, "physiology_claim"],
  [/\b(?:your (?:global )?attachment style is|you are (?:securely|anxiously|avoidantly) attached)\b/iu, "global_attachment_claim"],
  [/\b(?:your exile|an exile from|exile's age)\b/iu, "exile_claim"],
  [/\b(?:you should|you need to|try to|practice )\b/iu, "advice_claim"],
];

function prohibitedClaimIssues(value: ReportArtifact | SynthesisAudit): ValidationIssue[] {
  const prose = value.artifact_type === "synthesis_audit" ? value.reader_markdown : value.report_markdown;
  return PROHIBITED_PROSE.flatMap(([pattern, code]) => pattern.test(prose)
    ? [{ code, path: value.artifact_type === "synthesis_audit" ? "$.reader_markdown" : "$.report_markdown", message: "Reader prose crossed an absolute report-writer prohibition." }]
    : []);
}

export async function validateCanonicalArtifact(
  reportType: ReportType,
  value: unknown,
  packets: readonly ReportEvidencePacketV3_1[],
  workspaceRoot = process.cwd(),
  bundle?: SynthesisBundle,
): Promise<ValidationResult<ReportArtifact | SynthesisAudit>> {
  const result = reportType === "MAP"
    ? await validateMappingSummaryArtifact(value, packets, workspaceRoot)
    : reportType === "SYNTHESIS"
      ? await validateSynthesisArtifact(value, workspaceRoot, bundle)
      : await validateLayerReportArtifact(value, packets.filter((packet) => packet.report_type === reportType), workspaceRoot);
  if (!result.ok) return result;
  if (reportType === "SYNTHESIS" && result.value.artifact_type !== "synthesis_audit") {
    return { ok: false, issues: [{ code: "synthesis_release_type", path: "$.artifact_type", message: "Only a final SynthesisAudit can be released." }] };
  }
  const artifact = result.value as ReportArtifact | SynthesisAudit;
  const issues = prohibitedClaimIssues(artifact);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: artifact, issues: [] };
}
