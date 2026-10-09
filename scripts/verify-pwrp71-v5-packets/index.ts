import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { computePwqe51RouterRuntimeSha256 } from "../../lib/server/reports/qualification/runner.ts";
import { verifyAuthoredResponsePacketBinding, verifySemanticEvidencePacket } from "../../lib/server/reports/qualification/semantic-evidence-verifier.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { pwrp71CanonicalResponseEvidenceFromSessionState } from "../../lib/server/reports/pwrp71-response-evidence.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";

type Row = Record<string, unknown>;
const ROOT = process.cwd();
const PWRP_ROOT = path.join(ROOT, "qualification", "pwrp71");
const FIXTURE_ROOT = path.join(PWRP_ROOT, "route_replays_v5");
const OUTPUT = path.join(PWRP_ROOT, "gate10-routing-budget-readiness", "packet-verification", "v5-current-contract-verification.json");
const PROFILES = [...Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`), ...Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`)];
const PACKET_TYPES = ["MAP", "IFS", "PV", "ATT"] as const;

function sha(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function normalizedSha(bytes: Uint8Array): string { return sha(Buffer.from(bytes.toString().replace(/\r\n/gu, "\n"), "utf8")); }
function object(value: unknown): Row { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Row : {}; }
function array(value: unknown): Row[] { return Array.isArray(value) ? value.filter((entry): entry is Row => typeof entry === "object" && entry !== null && !Array.isArray(entry)) : []; }
async function main(): Promise<void> {
  const outputPath = path.resolve(process.argv[2] ?? OUTPUT);
  const [questionSource, reportSource, fixtureManifestBytes, authoredManifestBytes, currentRouterRuntimeSha256] = await Promise.all([
    loadPwqe51SourcePackage(ROOT),
    loadPwrp71SourcePackage(ROOT),
    readFile(path.join(FIXTURE_ROOT, "manifest.json")),
    readFile(path.join(PWRP_ROOT, "constructed_histories_v2", "manifest.json")),
    computePwqe51RouterRuntimeSha256(ROOT),
  ]);
  const fixtureManifest = JSON.parse(fixtureManifestBytes.toString("utf8")) as Row;
  const authoredManifest = JSON.parse(authoredManifestBytes.toString("utf8")) as Row;
  const fixtureProfiles = new Map(array(fixtureManifest.profiles).map((entry) => [String(entry.profileId), entry]));
  const authoredFiles = new Map(array(authoredManifest.profiles).map((entry) => [String(entry.id), String(entry.file)]));
  const failures: string[] = [];
  if (fixtureProfiles.size !== 25 || authoredFiles.size !== 25) failures.push("fixture_or_authored_manifest_profile_count_not_25");
  const profileRows: Row[] = [];
  for (const profileId of PROFILES) {
    const manifestEntry = fixtureProfiles.get(profileId);
    const authoredFile = authoredFiles.get(profileId);
    if (!manifestEntry || !authoredFile) {
      failures.push(`${profileId}:missing_manifest_entry`);
      profileRows.push({ profileId, status: "fail", failures: ["missing_manifest_entry"] });
      continue;
    }
    const artifactBytes = await readFile(path.join(FIXTURE_ROOT, String(manifestEntry.file)));
    const artifactSha256 = normalizedSha(artifactBytes);
    const authoredBytes = await readFile(path.join(PWRP_ROOT, "constructed_histories_v2", authoredFile));
    const history = JSON.parse(authoredBytes.toString("utf8")) as Row;
    const artifact = JSON.parse(artifactBytes.toString("utf8")) as Row;
    const rowFailures: string[] = [];
    if (artifactSha256 !== manifestEntry.artifactSha256) rowFailures.push("fixture_artifact_sha256_mismatch");
    const semantic = verifySemanticEvidencePacket({ artifact, history, questionSource });
    const authoredBindingFailures = verifyAuthoredResponsePacketBinding({ artifact, history });
    rowFailures.push(...semantic.failures, ...authoredBindingFailures);
    const packets = object(artifact.packets);
    const canonicalResponseEvidence = pwrp71CanonicalResponseEvidenceFromSessionState(object(artifact.replay).state);
    const packetResults: Row[] = [];
    for (const reportType of PACKET_TYPES) {
      const packetRecord = object(packets[reportType]);
      const packet = object(packetRecord.packet) as JsonObject;
      const prepared = preparePwrp71Request({ packet, reportType, questionSource, reportSource,
        ...(reportType === "MAP" ? {} : { canonicalResponseEvidence }) });
      const issueCodes = prepared.ok ? [] : prepared.issues.map((issue) => issue.code);
      if (!prepared.ok) rowFailures.push(`${reportType}:adapter_rejected:${issueCodes.join(",")}`);
      packetResults.push({
        reportType,
        packetDigest: prepared.ok ? sha256Canonical(packet) : typeof packet.content_sha256 === "string" ? packet.content_sha256 : null,
        adapterAccepted: prepared.ok,
        issueCodes,
      });
    }
    profileRows.push({
      profileId,
      fixtureArtifactSha256: artifactSha256,
      semanticVerifierStatus: semantic.status,
      currentResponsesChecked: semantic.currentResponseCount,
      packetObservationsChecked: semantic.packetObservationCount,
      targetsChecked: semantic.checkedTargets,
      sequenceEdgesChecked: semantic.checkedSequenceEdges,
      distinctnessDecisionsChecked: semantic.checkedDistinctnessDecisions,
      packetResults,
      failures: rowFailures,
      status: rowFailures.length ? "fail" : "pass",
    });
    failures.push(...rowFailures.map((failure) => `${profileId}:${failure}`));
  }
  const result = {
    schemaVersion: "PWRP71-GATE10-V5-CURRENT-PACKET-CONTRACT-VERIFICATION-V1",
    generatedAt: new Date().toISOString(),
    status: failures.length ? "fail" : "pass",
    sourcePins: {
      questionRelease: questionSource.manifest.source_binding.question_release,
      questionSourceSha256: questionSource.manifest.source_binding.source_sha256,
      questionSourceManifestSha256: questionSource.sourceManifestSha256,
      reportRelease: reportSource.policy.release,
      reportSourceManifestSha256: reportSource.manifestSha256,
      currentRouterRuntimeSha256,
      semanticCaseSetSha256: normalizedSha(await readFile(path.join(PWRP_ROOT, "SEMANTIC_CASES.json"))),
      authoredHistoryManifestSha256: normalizedSha(authoredManifestBytes),
      fixtureManifestSha256: normalizedSha(fixtureManifestBytes),
      fixtureSourceCommit: object(fixtureManifest.inputs).sourceCommit,
    },
    checkedProfileCount: profileRows.length,
    passedProfileCount: profileRows.filter((row) => row.status === "pass").length,
    checkedPacketCount: profileRows.reduce((sum, row) => sum + array(row.packetResults).length, 0),
    passedPacketCount: profileRows.reduce((sum, row) => sum + array(row.packetResults).filter((packet) => packet.adapterAccepted === true).length, 0),
    checks: [
      "manifest-to-fixture content digests",
      "current response and authored source-option binding",
      "packet observation lineage, provenance, targets, sequences, distinctness, stale-response exclusion, and privacy fields",
      "PWRP 7.1 request preparation for MAP, IFS, PV, and ATT using current source contracts",
    ],
    qualificationBoundary: "Contract verifier and adapter self-tests over retained fictional packets. This is not Python/TypeScript parity, independent human review, real-session evidence, report-quality evaluation, or approval.",
    failures,
    profiles: profileRows,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ status: result.status, profiles: result.checkedProfileCount, passedProfiles: result.passedProfileCount, packets: result.checkedPacketCount, passedPackets: result.passedPacketCount, failures: result.failures.length, output: outputPath }, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
