import type { JsonObject, ValidationIssue, ValidationResult } from "../../question-engine/types.ts";
import { PWQE51_RELEASE_IDENTITY } from "../../question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import { sha256 } from "../security/crypto.ts";
import { preparePwrp71Request } from "./pwrp71-adapter.ts";
import { pwrp71CanonicalResponseEvidenceFromSnapshot } from "./pwrp71-response-evidence.ts";
import type { DecryptedAssessmentSnapshot, PreparedReportInputs } from "./types.ts";
import type { Pwrp71ReportActivation } from "./pwrp71-readiness.ts";

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

/** Validates a frozen PWQE 5.1 packet before handing it to the PWRP 7.1 report workflow. */
export function preparePwrp71ReportInputs(
  snapshot: DecryptedAssessmentSnapshot,
  activation: Pwrp71ReportActivation,
): ValidationResult<PreparedReportInputs> {
  const canonicalSnapshot = snapshot.canonicalSnapshot as Record<string, unknown>;
  const packet = object(canonicalSnapshot.router_packet);
  const issues: ValidationIssue[] = [];
  if (!packet) return { ok: false, issues: [issue("router_packet_missing", "$.router_packet", "PWQE 5.1 snapshot has no evidence packet.")] };
  const contentSha = packet.content_sha256;
  const sourceBinding = object(packet.source_binding);
  const scope = object(packet.assessment_scope);
  const packetContent = Object.fromEntries(Object.entries(packet).filter(([key]) => key !== "content_sha256"));
  if (canonicalSnapshot.snapshot_id !== snapshot.snapshotId || packet.snapshot_id !== snapshot.snapshotId
    || canonicalSnapshot.contract_id !== PWQE51_RELEASE_IDENTITY.questionRelease
    || canonicalSnapshot.integrity_contract_id !== "patternwork-router-evidence-v1"
    || canonicalSnapshot.packet_version !== "urn:patternwork:router-evidence:1"
    || canonicalSnapshot.source_manifest_sha256 !== activation.questionSource.sourceManifestSha256
    || packet.format !== "patternwork-router-evidence-v1"
    || packet.release_id !== PWQE51_RELEASE_IDENTITY.questionRelease
    || sourceBinding?.question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || sourceBinding?.runtime_version !== PWQE51_RELEASE_IDENTITY.routerVersion
    || sourceBinding?.source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256) {
    issues.push(issue("snapshot_source_binding", "$.router_packet", "Snapshot and evidence packet do not bind to the active PWQE 5.1 source and router."));
  }
  if (typeof contentSha !== "string" || !/^[a-f0-9]{64}$/u.test(contentSha) || sha256Canonical(packetContent) !== contentSha) {
    issues.push(issue("router_packet_digest", "$.router_packet.content_sha256", "Packet contents do not match their canonical digest."));
  }
  if (!scope || snapshot.evidenceSha256 !== sha256(String(contentSha)) || snapshot.scopeSha256 !== sha256Canonical(scope)) {
    issues.push(issue("snapshot_digest_binding", "$.router_packet", "Frozen snapshot evidence or scope digest does not match the packet."));
  }
  if (issues.length) return { ok: false, issues };

  const packetJson = packet as JsonObject;
  const validationReportType = snapshot.completedPass === 1 ? "MAP" : "IFS";
  const adapter = preparePwrp71Request({
    packet: packetJson,
    reportType: validationReportType,
    questionSource: activation.questionSource,
    reportSource: activation.reportSource,
    canonicalResponseEvidence: pwrp71CanonicalResponseEvidenceFromSnapshot(canonicalSnapshot),
  });
  if (!adapter.ok) return { ok: false, issues: adapter.issues };
  return {
    ok: true,
    issues: [],
    value: {
      contractVersion: "v7.1",
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
      routerPacket: packetJson,
      sourceManifestSha256: activation.questionSource.sourceManifestSha256,
      reportSourceManifestSha256: activation.reportSource.manifestSha256,
      qualificationManifestSha256: activation.qualificationManifestSha256,
      modelPolicy: activation.modelPolicy,
    },
  };
}
