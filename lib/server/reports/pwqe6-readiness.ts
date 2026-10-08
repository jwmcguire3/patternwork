import {
  activateReviewedPwqe5QualificationManifest,
  type ActivatedReportModelPolicy,
} from "../openrouter/policy.ts";
import { loadPwqe5SourcePackage } from "./pwqe6-source.ts";

export interface Pwqe6ReportActivation {
  readonly sourceManifestSha256: string;
  readonly qualificationManifestSha256: string;
  readonly modelPolicy: ActivatedReportModelPolicy;
}

/**
 * Verifies the byte-pinned PWQE5 source package and requires the deployment's
 * exact human-reviewed provider qualification manifest before live use.
 */
export async function assertPwqe6ReportActivationReady(input: {
  readonly workspaceRoot?: string;
  readonly snapshot?: unknown;
} = {}): Promise<Pwqe6ReportActivation> {
  const source = await loadPwqe5SourcePackage(input.workspaceRoot);
  const activation = activateReviewedPwqe5QualificationManifest(
    process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON,
    process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256,
  );
  if (activation.manifest.sourceManifestSha256 !== source.sourceManifestSha256
    || activation.manifest.sourceSha256 !== source.identities.sourceSha256
    || activation.manifest.questionRelease !== source.identities.release
    || activation.manifest.routerVersion !== source.identities.routerVersion
    || activation.manifest.promptRelease !== source.identities.promptRelease
    || activation.manifest.evidenceContract !== source.identities.evidenceContract) {
    throw new Error("Reviewed PWQE5 activation does not bind the loaded question, router, prompt, and evidence source package.");
  }
  if (input.snapshot !== undefined) {
    const snapshot = input.snapshot && typeof input.snapshot === "object" && !Array.isArray(input.snapshot)
      ? input.snapshot as Record<string, unknown>
      : undefined;
    const packet = snapshot?.router_packet && typeof snapshot.router_packet === "object" && !Array.isArray(snapshot.router_packet)
      ? snapshot.router_packet as Record<string, unknown>
      : undefined;
    const sourceBinding = packet?.source_binding && typeof packet.source_binding === "object" && !Array.isArray(packet.source_binding)
      ? packet.source_binding as Record<string, unknown>
      : undefined;
    if (!snapshot || !packet || !sourceBinding
      || snapshot.contract_id !== source.identities.release
      || snapshot.integrity_contract_id !== source.identities.evidenceContract
      || snapshot.packet_version !== "urn:patternwork:router-evidence:1"
      || packet.release_id !== source.identities.release
      || packet.format !== source.identities.evidenceContract
      || packet.snapshot_id !== snapshot.snapshot_id
      || snapshot.source_manifest_sha256 !== source.sourceManifestSha256
      || sourceBinding.question_release !== source.identities.release
      || sourceBinding.runtime_version !== source.identities.routerVersion
      || sourceBinding.source_sha256 !== source.identities.sourceSha256) {
      throw new Error("PWQE6 report input snapshot does not bind to the activated source, router, and evidence schema.");
    }
  }
  return {
    sourceManifestSha256: source.sourceManifestSha256,
    qualificationManifestSha256: activation.manifestSha256,
    modelPolicy: activation.policy,
  };
}
