import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface RouteProfileIndex {
  readonly profileId: string;
  readonly file: string;
  readonly artifactSha256: string;
  readonly semanticResultSha256: string;
  readonly mapping: "complete" | "partial";
  readonly deepening: "complete" | "partial" | "not_applicable";
  readonly originalAnswers: { readonly issuedAndAccepted: number; readonly unreached: number; readonly intentionallyForbidden: number };
  readonly replayConfirmed: boolean;
  readonly mappingPacketAccepted: boolean;
  readonly deepeningPacketAccepted: boolean;
  readonly adapterIssueCodes: readonly string[];
  readonly firstDivergence: string | null;
}

interface RouteManifest {
  readonly schemaVersion: string;
  readonly inputs: Readonly<Record<string, string>>;
  readonly profiles: readonly RouteProfileIndex[];
}

interface RouteArtifact {
  readonly profileId: string;
  readonly replay: {
    readonly completeness: { readonly mapping: string; readonly deepening: string; readonly sessionPhase: string };
    readonly submittedSourceToRuntimeResponses: readonly {
      readonly sourceResponseId: string;
      readonly runtimeResponseId: string;
      readonly questionId: string;
      readonly phase: string;
      readonly provenance: string;
    }[];
    readonly replayAndDistinctnessDecisions: readonly {
      readonly decisionId: string;
      readonly outcome: string;
      readonly sourceOccurrenceReference: string;
      readonly replayOccurrenceId?: string;
    }[];
    readonly contextDecisions: {
      readonly distinctness: readonly { readonly sourceReference: string; readonly otherReference: string; readonly outcome: string; readonly status: string; readonly reason?: string }[];
      readonly comparisonBindings: readonly { readonly responseId: string; readonly occurrenceIds: readonly [string, string]; readonly applied: boolean }[];
    };
    readonly unreachedOriginalAnswers: readonly { readonly responseId: string; readonly questionId: string; readonly occurrenceId: string; readonly classification: string; readonly reason: string }[];
    readonly completeResponseProvenance: readonly { readonly sourceResponseId: string; readonly runtimeResponseId?: string; readonly origin: string; readonly accepted: boolean }[];
  };
  readonly authoredAnswerDisposition: readonly { readonly responseId: string; readonly questionId: string | null; readonly classification: string; readonly reason: string }[];
  readonly packets: Readonly<Record<string, { readonly packet?: Readonly<Record<string, unknown>> } | undefined>>;
  readonly packetValidation: Readonly<Record<string, { readonly accepted: boolean; readonly issueCodes: readonly string[] } | undefined>>;
}

interface MatrixResult {
  readonly profileId: string;
  readonly reportType: string;
  readonly status: "accepted" | "blocked" | "failed";
  readonly usage?: { readonly status: string; readonly attempts?: number; readonly costMicros?: number };
  readonly validationIssues?: readonly { readonly code: string }[];
  readonly failure?: { readonly code: string };
}

interface MatrixRun {
  readonly runId: string;
  readonly status: string;
  readonly fixtureSet: string;
  readonly selectedProfiles: readonly string[];
  readonly selectedReports: readonly string[];
  readonly qualificationRunSha256: string;
  readonly totalReportedCostMicros: number;
  readonly sourcePins: {
    readonly fixtureManifestSha256: string;
    readonly fixtureSourceSha256: string;
    readonly fixtureSourceCommit: string;
    readonly routerRuntimeSha256: string;
  };
  readonly results: readonly MatrixResult[];
}

const DEFAULT_REPLAY_DIRECTORY = path.resolve(process.cwd(), "qualification", "pwrp71", "route_replays_v3");
const PROFILE_IDS = [...Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`), ...Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`)];
const REPORT_TYPES = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const;

function parseArgs(argv: readonly string[]): { readonly replayDirectory: string; readonly runFile: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--help" || name === "-h") {
      process.stdout.write("Usage: npm run pwqe51:replay:ledger -- --run qualification/pwrp71/route_replays_v3/offline-run/<run-id>/run.json [--replay-dir qualification/pwrp71/route_replays_v3]\n");
      process.exit(0);
    }
    if (name !== "--run" && name !== "--replay-dir") throw new Error(`Unknown argument: ${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--") || values.has(name)) throw new Error(`${name} requires one value and may be specified once.`);
    values.set(name, value);
    index += 1;
  }
  const runFile = values.get("--run");
  if (!runFile) throw new Error("--run must identify the offline qualification run JSON.");
  return { replayDirectory: path.resolve(values.get("--replay-dir") ?? DEFAULT_REPLAY_DIRECTORY), runFile: path.resolve(runFile) };
}

function normalizedTextSha256(value: string): string {
  return createHash("sha256").update(value.replace(/\r\n/gu, "\n"), "utf8").digest("hex");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function bindingStatus(artifact: RouteArtifact): "confirmed" | "unavailable" | "not_applicable" {
  if (artifact.replay.replayAndDistinctnessDecisions.length > 0) return "confirmed";
  const intents = artifact.replay.contextDecisions.distinctness;
  if (!intents.length) return "not_applicable";
  return intents.every((intent) => intent.status === "applied") ? "confirmed" : "unavailable";
}

function reportSummary(results: readonly MatrixResult[]) {
  const accepted = results.filter((result) => result.status === "accepted").map((result) => result.reportType);
  const blocked = results.filter((result) => result.status === "blocked").map((result) => result.reportType);
  const failed = results.filter((result) => result.status === "failed").map((result) => result.reportType);
  const mockAccepted = results.filter((result) => result.status === "accepted" && result.usage?.status === "mock").map((result) => result.reportType);
  const issueCodes = unique(results.flatMap((result) => (result.validationIssues ?? []).map((issue) => issue.code)));
  const failureCodes = unique(results.flatMap((result) => result.failure ? [result.failure.code] : []));
  return { accepted, blocked, failed, mockAccepted, issueCodes, failureCodes };
}

function markdownCell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
}

async function main(): Promise<void> {
  const { replayDirectory, runFile } = parseArgs(process.argv.slice(2));
  const manifestText = await readFile(path.join(replayDirectory, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText) as RouteManifest;
  const matrix = JSON.parse(await readFile(runFile, "utf8")) as MatrixRun;
  const manifestSha256 = normalizedTextSha256(manifestText);
  if (manifest.schemaVersion !== "PWQE51-ROUTE-REPLAY-V3-MANIFEST"
    || matrix.fixtureSet !== "route-replays-v3"
    || matrix.sourcePins.fixtureManifestSha256 !== manifestSha256
    || matrix.sourcePins.fixtureSourceSha256 !== manifest.inputs.v2ManifestSha256
    || matrix.sourcePins.fixtureSourceCommit !== manifest.inputs.sourceCommit) {
    throw new Error("The offline matrix does not bind the selected v3 replay manifest and source identities.");
  }
  const indexed = new Map(manifest.profiles.map((profile) => [profile.profileId, profile]));
  if (indexed.size !== PROFILE_IDS.length || PROFILE_IDS.some((profileId) => !indexed.has(profileId))) {
    throw new Error("The v3 replay manifest must include all 25 fictional profiles.");
  }
  if (PROFILE_IDS.some((profileId) => !matrix.selectedProfiles.includes(profileId))
    || REPORT_TYPES.some((reportType) => !matrix.selectedReports.includes(reportType))) {
    throw new Error("The offline matrix must include all profiles and all five report types.");
  }

  const profiles = [];
  for (const profileId of PROFILE_IDS) {
    const profile = indexed.get(profileId)!;
    const fileText = await readFile(path.join(replayDirectory, profile.file), "utf8");
    if (normalizedTextSha256(fileText) !== profile.artifactSha256) throw new Error(`${profileId} route replay artifact hash does not match the manifest.`);
    const artifact = JSON.parse(fileText) as RouteArtifact;
    if (artifact.profileId !== profileId) throw new Error(`${profileId} artifact profile identity mismatch.`);
    const runResults = matrix.results.filter((result) => result.profileId === profileId);
    if (runResults.length !== REPORT_TYPES.length || new Set(runResults.map((result) => result.reportType)).size !== REPORT_TYPES.length
      || REPORT_TYPES.some((reportType) => !runResults.some((result) => result.reportType === reportType))) {
      throw new Error(`${profileId} offline result set must contain one result for each report type.`);
    }
    const validationByType = artifact.packetValidation;
    const mappingPacketBuilt = Boolean(artifact.packets.MAP?.packet);
    const deepeningPacketBuilt = ["IFS", "PV", "ATT"].every((type) => Boolean(artifact.packets[type]?.packet));
    const distinctness = artifact.replay.contextDecisions.distinctness;
    const dispositionCounts = new Map<string, number>();
    for (const answer of artifact.authoredAnswerDisposition) {
      dispositionCounts.set(answer.classification, (dispositionCounts.get(answer.classification) ?? 0) + 1);
    }
    const report = reportSummary(runResults);
    const divergence = profile.firstDivergence?.replace(/pwep_[0-9a-f-]{36}/gu, "<server-occurrence-id>") ?? null;
    const divergenceQuestion = divergence?.match(/Router issued ([A-Z][0-9]+)\/([^ ]+)/u);
    profiles.push({
      profileId,
      sourceIdentity: {
        originalFixture: `${profileId}.json`,
        authoredFixtureSha256: (JSON.parse(fileText) as RouteArtifact & { readonly sourceIdentity: { readonly authoredFixtureSha256: string } }).sourceIdentity.authoredFixtureSha256,
        replayArtifactSha256: profile.artifactSha256,
        semanticResultSha256: profile.semanticResultSha256,
      },
      mapping: profile.mapping,
      deepening: profile.deepening,
      originalAnswers: {
        issuedAndAccepted: profile.originalAnswers.issuedAndAccepted,
        eligibleButNotReached: dispositionCounts.get("eligible_but_not_reached") ?? 0,
        ineligibleInCurrentContext: dispositionCounts.get("ineligible_in_current_context") ?? 0,
        intentionallyForbidden: profile.originalAnswers.intentionallyForbidden,
        sourceContractMismatch: dispositionCounts.get("source_contract_mismatch") ?? 0,
        implementationDefect: dispositionCounts.get("implementation_defect") ?? 0,
        dispositions: artifact.authoredAnswerDisposition,
      },
      acceptedSourceToRuntimeResponses: artifact.replay.submittedSourceToRuntimeResponses,
      syntheticMappingResponsesAccepted: artifact.replay.submittedSourceToRuntimeResponses.filter((answer) => answer.provenance === "new_synthetic_mapping_response").length,
      replayAndBindings: {
        status: bindingStatus(artifact),
        replayDecisions: artifact.replay.replayAndDistinctnessDecisions,
        distinctnessIntentCount: distinctness.length,
        distinctnessConfirmedCount: distinctness.filter((intent) => intent.status === "applied").length,
        distinctnessUnavailableCount: distinctness.filter((intent) => intent.status !== "applied").length,
        distinctness,
        comparisonBindings: artifact.replay.contextDecisions.comparisonBindings,
      },
      packets: {
        mapping: mappingPacketBuilt ? validationByType.MAP?.accepted ? "valid" : "invalid" : "not_built",
        deepening: deepeningPacketBuilt ? ["IFS", "PV", "ATT"].every((type) => validationByType[type]?.accepted) ? "valid" : "invalid" : "not_built",
        adapter: {
          mapping: mappingPacketBuilt ? validationByType.MAP?.accepted ? "accepted" : "rejected" : "not_attempted",
          deepening: deepeningPacketBuilt ? ["IFS", "PV", "ATT"].every((type) => validationByType[type]?.accepted) ? "accepted" : "rejected" : "not_attempted",
          issueCodes: profile.adapterIssueCodes,
        },
      },
      mockReports: report,
      remaining: {
        issueCodes: report.issueCodes,
        failureCodes: report.failureCodes,
        firstCausalDivergence: divergence,
        firstDivergentQuestion: divergenceQuestion ? `${divergenceQuestion[1]}/${divergenceQuestion[2]}` : null,
        exactUnreachedReasons: artifact.replay.unreachedOriginalAnswers.map((answer) => ({
          responseId: answer.responseId,
          questionId: answer.questionId,
          classification: answer.classification,
          reason: answer.reason,
        })),
      },
    });
  }

  const acceptedCount = matrix.results.filter((result) => result.status === "accepted").length;
  const blockedCount = matrix.results.filter((result) => result.status === "blocked").length;
  const failedCount = matrix.results.filter((result) => result.status === "failed").length;
  const output = {
    schemaVersion: "PWQE51-PWRP71-ROUTE-REPLAY-LEDGER-V1",
    qualificationBoundary: "internal_session_replay_and_offline_structural_mock_only; not independent routing qualification, semantic approval, or production evidence",
    sourceIdentity: manifest.inputs,
    routeReplayManifestSha256: manifestSha256,
    offlineRun: {
      runId: matrix.runId,
      qualificationRunSha256: matrix.qualificationRunSha256,
      status: matrix.status,
      fixtureSet: matrix.fixtureSet,
      fixtureSourceSha256: matrix.sourcePins.fixtureSourceSha256,
      routerRuntimeSha256: matrix.sourcePins.routerRuntimeSha256,
      results: matrix.results.length,
      accepted: acceptedCount,
      blocked: blockedCount,
      failed: failedCount,
      totalReportedCostMicros: matrix.totalReportedCostMicros,
    },
    profiles,
  };
  const jsonFile = path.join(replayDirectory, "qualification-ledger.json");
  const jsonText = `${JSON.stringify(output, null, 2)}\n`;
  await writeFile(jsonFile, jsonText, "utf8");

  const lines = [
    "# PWQE 5.1 / PWRP 7.1 fictional route replay ledger",
    "",
    `- Replay manifest SHA-256: \`${manifestSha256}\``,
    `- Offline run: \`${matrix.runId}\` (\`${matrix.qualificationRunSha256}\`)`,
    `- Matrix: ${matrix.results.length} results; ${acceptedCount} accepted, ${blockedCount} blocked, ${failedCount} failed; reported provider cost $${(matrix.totalReportedCostMicros / 1_000_000).toFixed(6)}.`,
    "- This is internal session replay and deterministic structural mock evidence. It does not establish independent routing qualification or semantic approval.",
    "",
    "| Profile | Mapping | Deepening | Original answers (issued / unreached / forbidden) | Replay/bindings | Packet | Adapter | Mock reports | Remaining reason |",
    "|---|---|---|---:|---|---|---|---|---|",
  ];
  for (const row of profiles) {
    const profile = indexed.get(row.profileId)!;
    const binding = row.replayAndBindings as { status: string; distinctnessConfirmedCount: number; distinctnessIntentCount: number; replayDecisions: readonly unknown[] };
    const packet = row.packets as { mapping: string; deepening: string; adapter: { mapping: string; deepening: string } };
    const reports = row.mockReports as ReturnType<typeof reportSummary>;
    const remaining = row.remaining as { issueCodes: string[]; firstCausalDivergence: string | null; exactUnreachedReasons: readonly { reason: string }[] };
    const reasonCodes = unique([...remaining.issueCodes, ...profile.adapterIssueCodes]);
    const specialReasons = unique(remaining.exactUnreachedReasons.map((entry) => entry.reason)
      .filter((reason) => !reason.startsWith("Router issued "))).slice(0, 2);
    const routeReason = remaining.firstCausalDivergence ?? "No route divergence recorded.";
    const bindingLabel = `${binding.status}; ${binding.replayDecisions.length} replay controls; ${binding.distinctnessConfirmedCount}/${binding.distinctnessIntentCount} distinctness intents confirmed`;
    const packetLabel = `MAP ${packet.mapping}; Deepening ${packet.deepening}`;
    const adapterLabel = `MAP ${packet.adapter.mapping}; Deepening ${packet.adapter.deepening}`;
    const reportsLabel = `${reports.accepted.join(",") || "none"} accepted; ${reports.blocked.join(",") || "none"} blocked; ${reports.failed.join(",") || "none"} failed`;
    const cause = `${reasonCodes.length ? `${reasonCodes.join(", ")}; ` : ""}${routeReason}${specialReasons.length ? `; authored branch: ${specialReasons.join("; ")}` : ""}`;
    lines.push(`| ${row.profileId} | ${profile.mapping} | ${profile.deepening} | ${profile.originalAnswers.issuedAndAccepted} / ${profile.originalAnswers.unreached} / ${profile.originalAnswers.intentionallyForbidden} | ${markdownCell(bindingLabel)} | ${markdownCell(packetLabel)} | ${markdownCell(adapterLabel)} | ${markdownCell(reportsLabel)} | ${markdownCell(cause)} |`);
  }
  lines.push(
    "",
    "The JSON ledger records every authored-answer disposition, source-to-runtime response correspondence, confirmed or unavailable binding, packet and adapter result, report status, and unreached-answer reason.",
  );
  await writeFile(path.join(replayDirectory, "qualification-ledger.md"), `${lines.join("\n")}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ runId: matrix.runId, profiles: profiles.length, results: matrix.results.length, accepted: acceptedCount, blocked: blockedCount, failed: failedCount, jsonFile, markdownFile: path.join(replayDirectory, "qualification-ledger.md") }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
