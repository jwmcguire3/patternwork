import type { JsonObject } from "../../question-engine/types.ts";
import { canonicalJson, sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import { validateSynthesisBundleCrossObject } from "../../report-contracts/synthesis-validator.ts";
import type { LayerReportArtifact, ReportEvidencePacketV3_1, SynthesisBundle } from "../../report-contracts/types.ts";
import type { GeneratedCanonicalArtifact, PreparedReportInputs } from "./types.ts";

function safeId(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9._-]/gu, "-");
}

function omit<T extends JsonObject>(value: T, key: string): JsonObject {
  const copy = structuredClone(value) as JsonObject;
  delete copy[key];
  return copy;
}

export function buildValidatedSynthesisBundle(
  prepared: PreparedReportInputs,
  layerArtifacts: readonly GeneratedCanonicalArtifact[],
): SynthesisBundle {
  const packets = new Map(prepared.packets.map((packet) => [packet.report_type, packet]));
  const artifacts = new Map(layerArtifacts.map((generated) => [generated.reportType, generated.artifact as LayerReportArtifact]));
  const snapshot = prepared.snapshot;
  const manifestWithoutDigest = {
    manifest_id: `SNAP-${safeId(snapshot.snapshotId)}`,
    contract_id: "PWQE3-CONTRACT-2",
    integrity_contract_id: "PWQE3-INTEGRITY-1",
    package_version: "3.1.0",
    snapshot_id: snapshot.snapshotId,
    snapshot_revision: snapshot.snapshotRevision,
    evidence_sha256: snapshot.evidenceSha256,
    scope_sha256: snapshot.scopeSha256,
    packet_version: "3.1.0",
    report_version: "4.1.0",
    writer_template_version: "PWRP-V4.1",
  } as const;
  const snapshotManifest = {
    ...manifestWithoutDigest,
    manifest_sha256: sha256Canonical(manifestWithoutDigest),
  };
  const source = (reportType: "IFS" | "PV" | "ATT") => {
    const packet = packets.get(reportType) as ReportEvidencePacketV3_1 | undefined;
    const report = artifacts.get(reportType);
    if (!packet || !report) throw new Error(`Missing validated ${reportType} synthesis source.`);
    return {
      report_type: reportType,
      packet,
      packet_sha256: sha256Canonical(packet),
      report,
      report_artifact_sha256: String((report.digests as JsonObject).artifact_sha256),
    };
  };
  const seed = canonicalJson({ snapshot_id: snapshot.snapshotId, snapshot_revision: snapshot.snapshotRevision });
  const withoutDigest = {
    artifact_type: "synthesis_bundle",
    bundle_id: `SYN-BUNDLE-${sha256Canonical(seed).slice(0, 32)}`,
    contract_id: "PWQE3-CONTRACT-2",
    integrity_contract_id: "PWQE3-INTEGRITY-1",
    package_version: "3.1.0",
    prompt_release: "4.1.0",
    snapshot_manifest: snapshotManifest,
    sources: { ifs: source("IFS"), pv: source("PV"), attachment: source("ATT") },
    cross_layer_link_proofs: [],
  } as unknown as SynthesisBundle;
  const bundle = { ...withoutDigest, bundle_sha256: sha256Canonical(omit(withoutDigest, "bundle_sha256")) } as SynthesisBundle;
  const validation = validateSynthesisBundleCrossObject(bundle);
  if (!validation.ok) throw new Error(`Synthesis bundle failed canonical validation: ${JSON.stringify(validation.issues)}`);
  return bundle;
}
