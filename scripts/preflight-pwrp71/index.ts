import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical, sha256Text, normalizeLf } from "../../lib/report-contracts/delivery-validator.ts";
import { loadPwqe51SourcePackage, PWQE51_RELEASE_IDENTITY } from "../../lib/question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage, PWRP71_RELEASE_MANIFEST_SHA256 } from "../../lib/server/reports/pwrp71-source.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { buildGenerationPrompt } from "../../lib/server/reports/prompts.ts";
import { QUALIFICATION_MODEL_ORDER, UNQUALIFIED_MOCK_MODEL_POLICY } from "../../lib/server/openrouter/policy.ts";
import { GPT6_LUNA_BILLING_BASIS, GPT6_LUNA_BILLING_BASIS_SHA256, GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY, maximumQuotedCallCostMicros } from "../../lib/server/openrouter/qualification-budget.ts";
import { projectOpenRouterStrictSchemaObject } from "../../lib/server/openrouter/schema-projection.ts";
import { buildOpenRouterWirePayload, OPENROUTER_DEFAULT_ENDPOINT } from "../../lib/server/openrouter/wire.ts";
import { qualificationAttemptFingerprint } from "../../lib/server/reports/qualification/attempt-store.ts";
import { computePwqe51RouterRuntimeSha256 } from "../../lib/server/reports/qualification/runner.ts";
import { PWRP71_SEMANTIC_CASE_SET_SHA256 } from "../../lib/server/reports/pwrp71-readiness.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";

const REPORT_TYPE = "IFS" as const;
const PROFILES = ["C01", "C02"] as const;
const FIXTURE_ROOT = path.join(process.cwd(), "qualification", "pwrp71", "route_replays_v5");
const DEFAULT_RUN_ID = "gate10-c01-c02-ifs-live-diagnostic";
const OUTPUT_FILE = path.join(process.cwd(), "qualification", "pwrp71", "gate10-routing-budget-readiness", "provider-preflight", "c01-c02-ifs-no-dispatch.json");

interface FixtureManifest {
  readonly schemaVersion: string;
  readonly inputs: {
    readonly sourceCommit: string;
    readonly questionRelease: string;
    readonly routerVersion: string;
    readonly questionSourceSha256: string;
    readonly questionSourceManifestSha256: string;
    readonly reportRelease: string;
    readonly reportSourceManifestSha256: string;
  };
  readonly profiles: readonly {
    readonly profileId: string;
    readonly file: string;
    readonly artifactSha256: string;
    readonly mapping: string;
    readonly deepening: string;
    readonly deepeningPacketAccepted: boolean;
  }[];
}

function args(argv: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]!;
    if (!key.startsWith("--") || result.has(key) || !argv[i + 1] || argv[i + 1]!.startsWith("--")) throw new Error(`Invalid or duplicate flag: ${key}`);
    result.set(key, argv[++i]!);
  }
  return result;
}

function parseMicros(raw: string | undefined, flag: string): number | null {
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${flag} must be a positive safe integer in microdollars.`);
  return value;
}

async function main(): Promise<void> {
  const flags = args(process.argv.slice(2));
  const runId = flags.get("--run-id") ?? DEFAULT_RUN_ID;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/u.test(runId)) throw new Error("--run-id must use 1–80 letters, numbers, dots, underscores or hyphens.");
  const maxCallCostMicros = parseMicros(flags.get("--max-call-cost-micros"), "--max-call-cost-micros");
  const aggregateCostCapMicros = parseMicros(flags.get("--aggregate-cost-cap-micros"), "--aggregate-cost-cap-micros");
  const outputFile = path.resolve(flags.get("--output") ?? OUTPUT_FILE);
  const blockers: string[] = [];
  if (maxCallCostMicros === null) blockers.push("No explicit per-call ceiling was supplied; this dry run does not create live spending authorization.");
  if (aggregateCostCapMicros === null) blockers.push("No explicit aggregate qualification budget was supplied; this dry run does not create live spending authorization.");
  blockers.push("No independently reviewed, source-bound qualified routing receipt is present for the current router runtime and these packet digests.");
  blockers.push("No external human authorization to make a paid OpenRouter request was supplied; this command is permanently no-dispatch.");

  const [questionSource, reportSource, fixtureManifestText, currentRouterRuntimeSha256] = await Promise.all([
    loadPwqe51SourcePackage(process.cwd()),
    loadPwrp71SourcePackage(process.cwd()),
    readFile(path.join(FIXTURE_ROOT, "manifest.json"), "utf8"),
    computePwqe51RouterRuntimeSha256(process.cwd()),
  ]);
  const fixtureManifest = JSON.parse(fixtureManifestText) as FixtureManifest;
  const semanticCaseSetText = await readFile(path.join(process.cwd(), "qualification", "pwrp71", "SEMANTIC_CASES.json"), "utf8");
  const semanticCaseSetSha256 = sha256Text(normalizeLf(semanticCaseSetText));
  if (semanticCaseSetSha256 !== PWRP71_SEMANTIC_CASE_SET_SHA256) blockers.push("The semantic case source digest does not match the current readiness pin.");
  const fixtureManifestSha256 = sha256Text(normalizeLf(fixtureManifestText));
  const fixtureSetSha256 = sha256Canonical({
    schemaVersion: fixtureManifest.schemaVersion,
    manifestSha256: fixtureManifestSha256,
    casePins: fixtureManifest.profiles.map((entry) => ({ profileId: entry.profileId, artifactSha256: entry.artifactSha256, semanticResultSha256: (entry as FixtureManifest["profiles"][number] & { semanticResultSha256: string }).semanticResultSha256 })),
  });
  const manifestInputsMatch = fixtureManifest.inputs.questionRelease === PWQE51_RELEASE_IDENTITY.questionRelease
    && fixtureManifest.inputs.routerVersion === PWQE51_RELEASE_IDENTITY.routerVersion
    && fixtureManifest.inputs.questionSourceSha256 === PWQE51_RELEASE_IDENTITY.sourceSha256
    && fixtureManifest.inputs.questionSourceManifestSha256 === questionSource.sourceManifestSha256
    && fixtureManifest.inputs.reportRelease === PWQE51_RELEASE_IDENTITY.reportRelease
    && fixtureManifest.inputs.reportSourceManifestSha256 === reportSource.manifestSha256;
  if (!manifestInputsMatch) blockers.push("The retained v5 replay manifest does not match the loaded question/report source pins.");
  if (reportSource.manifestSha256 !== PWRP71_RELEASE_MANIFEST_SHA256) blockers.push("The PWRP 7.1 report source manifest digest does not match its pinned release constant.");

  const modelPin = UNQUALIFIED_MOCK_MODEL_POLICY.IFS;
  const pinnedTierName = QUALIFICATION_MODEL_ORDER[modelPin.pinnedTier]?.name;
  if (!pinnedTierName) throw new Error("IFS model policy references a missing qualification tier.");
  const preflightRequestRows: Array<Record<string, unknown>> = [];
  let plannedInitialReservationMicros = 0;
  for (const profileId of PROFILES) {
    const manifestEntry = fixtureManifest.profiles.find((entry) => entry.profileId === profileId);
    if (!manifestEntry) throw new Error(`The v5 manifest is missing ${profileId}.`);
    const artifactText = await readFile(path.join(FIXTURE_ROOT, manifestEntry.file), "utf8");
    const artifactSha256 = sha256Text(normalizeLf(artifactText));
    if (artifactSha256 !== manifestEntry.artifactSha256) throw new Error(`${profileId} v5 replay artifact digest does not match its manifest.`);
    const artifact = JSON.parse(artifactText) as Record<string, unknown>;
    const packets = artifact.packets as Record<string, { packet: JsonObject }>;
    const packetValidation = artifact.packetValidation as Record<string, { accepted?: boolean }>;
    const packet = packets.IFS?.packet;
    if (!packet) throw new Error(`${profileId} has no retained IFS packet in the selected v5 fixture set.`);
    if (manifestEntry.deepening !== "complete" || !manifestEntry.deepeningPacketAccepted || packetValidation.IFS?.accepted !== true) blockers.push(`${profileId} is not marked as a complete, accepted v5 IFS Deepening fixture.`);

    const prepared = preparePwrp71Request({ packet, reportType: REPORT_TYPE, questionSource, reportSource });
    if (!prepared.ok) {
      blockers.push(`${profileId} IFS packet did not prepare: ${prepared.issues.map((issue) => issue.code).join(", ")}.`);
      preflightRequestRows.push({ profileId, status: "blocked", packetSha256: sha256Canonical(packet), issues: prepared.issues });
      continue;
    }
    const prompt = buildGenerationPrompt(REPORT_TYPE, prepared.value.user_data);
    const request = {
      model: modelPin.model,
      reasoningEffort: modelPin.reasoningEffort,
      system: prepared.value.system,
      prompt,
      schemaName: "patternwork_ifs_pwrp71_candidate_1",
      schema: prepared.value.response_schema,
      maxOutputTokens: modelPin.maxOutputTokens,
      idempotencyKey: `pwrp71-qualification:${runId}:${profileId}:${REPORT_TYPE}:initial:${pinnedTierName}:attempt-1`,
    } as const;
    const wireRequest = {
      ...request,
      schema: projectOpenRouterStrictSchemaObject(request.schema),
      providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
      promptCacheOptions: { mode: "explicit" as const },
    };
    const body = buildOpenRouterWirePayload(wireRequest);
    const serializedBody = JSON.stringify(body);
    const maxQuotedCostMicros = maximumQuotedCallCostMicros(wireRequest);
    plannedInitialReservationMicros += maxQuotedCostMicros;
    const requestFingerprint = maxCallCostMicros !== null && aggregateCostCapMicros !== null
      ? qualificationAttemptFingerprint({ request, wireRequest, maxCallCostMicros, aggregateCostCapMicros })
      : null;
    if (maxCallCostMicros !== null && maxQuotedCostMicros > maxCallCostMicros) blockers.push(`${profileId} IFS initial request's conservative quoted ceiling (${maxQuotedCostMicros} micros) exceeds the supplied per-call cap.`);
    if (aggregateCostCapMicros !== null && maxQuotedCostMicros > aggregateCostCapMicros) blockers.push(`${profileId} IFS initial request's conservative quoted ceiling exceeds the supplied aggregate cap.`);
    preflightRequestRows.push({
      profileId,
      status: "request_prepared_no_dispatch",
      pseudonymousFixtureId: `fictional-${profileId}`,
      fixtureSet: "route-replays-v5",
      fixtureManifestSha256,
      fixtureSetSha256,
      fixtureArtifactSha256: artifactSha256,
      packetSha256: sha256Canonical(packet),
      packetContentSha256: packet.content_sha256,
      reportType: REPORT_TYPE,
      request: {
        model: request.model,
        reasoningEffort: request.reasoningEffort,
        systemSha256: sha256Text(request.system),
        promptSha256: sha256Text(request.prompt),
        schemaName: request.schemaName,
        localSchemaSha256: sha256Canonical(request.schema),
        wireSchemaSha256: sha256Canonical((body.response_format as Record<string, unknown>).json_schema),
        maxOutputTokens: request.maxOutputTokens,
        idempotencyHeader: request.idempotencyKey,
        endpoint: OPENROUTER_DEFAULT_ENDPOINT,
        finalWirePayloadSha256: sha256Text(serializedBody),
        wireRequestFingerprint: sha256Canonical({
          endpoint: OPENROUTER_DEFAULT_ENDPOINT,
          idempotencyHeader: request.idempotencyKey,
          exactWirePayloadSha256: sha256Text(serializedBody),
        }),
        requestFingerprint,
        finalWirePayload: body,
      },
      sourcePins: {
        questionRelease: PWQE51_RELEASE_IDENTITY.questionRelease,
        questionSourceSha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
        questionSourceManifestSha256: questionSource.sourceManifestSha256,
        routerRuntimeSha256: currentRouterRuntimeSha256,
        reportRelease: reportSource.policy.release,
        reportSourceManifestSha256: reportSource.manifestSha256,
        reportManifestSha256: PWRP71_RELEASE_MANIFEST_SHA256,
        promptBindingSha256: prepared.value.binding.prompt_sha256,
        evidenceBindingSha256: prepared.value.binding.evidence_sha256,
      },
      budget: {
        billingBasis: GPT6_LUNA_BILLING_BASIS,
        billingBasisSha256: GPT6_LUNA_BILLING_BASIS_SHA256,
        maxCallCostMicros,
        aggregateCostCapMicros,
        conservativeMaximumQuotedCostMicros: maxQuotedCostMicros,
        reservationSemantics: "Use full model context at published prompt price plus maxOutputTokens at published completion price; aggregate reservation is atomic before dispatch.",
        enforcementClass: "provider-dependent",
      },
      schemaCompatibility: {
        localSchemaValidatedByPreparation: true,
        strictOpenRouterSchemaProjectionApplied: true,
        modelPageListsResponseFormatJsonSchemaSupport: true,
        remoteAcceptance: "UNTESTED; no provider call was made.",
      },
      privacy: {
        privateNoteAndRawAnswerKeysExcludedByPreparedRequest: true,
        directIdentifierScanAppliedByPromptBuilder: true,
        zeroDataRetentionRequested: true,
        dataCollectionDenied: true,
      },
      repairsAndReviews: {
        everyCallUsesJournaledFinalWirePreflight: true,
        reviewerIsNewBillableAttempt: true,
        repairIsNewBillableAttempt: true,
        escalationIsNewBillableAttempt: true,
        automaticRetryForUnknownOutcome: false,
      },
    });
  }
  if (aggregateCostCapMicros !== null && plannedInitialReservationMicros > aggregateCostCapMicros) {
    blockers.push(`C01 and C02 initial IFS reservations total ${plannedInitialReservationMicros} micros, exceeding aggregateCostCapMicros ${aggregateCostCapMicros}.`);
  }

  const result = {
    schemaVersion: "PWRP71-GATE10-OPENROUTER-NO-DISPATCH-PREFLIGHT-V1",
    generatedAt: new Date().toISOString(),
    readiness: blockers.length ? "BLOCKED" : "PREFLIGHT_ONLY_NOT_AUTHORIZED",
    dispatchPerformed: false,
    providerCalls: 0,
    apiKeyRead: false,
    runId,
    candidate: { model: modelPin.model, reasoningEffort: modelPin.reasoningEffort, reportType: REPORT_TYPE },
    fixtureSet: "route-replays-v5",
    sourceManifestPins: {
      questionRelease: PWQE51_RELEASE_IDENTITY.questionRelease,
      questionSourceSha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
      questionSourceManifestSha256: questionSource.sourceManifestSha256,
      currentRouterRuntimeSha256,
      reportRelease: reportSource.policy.release,
      reportSourceManifestSha256: reportSource.manifestSha256,
      semanticCaseSetSha256,
    },
    exactRequests: preflightRequestRows,
    blockers: [...new Set(blockers)],
    boundary: "Local serialization and pricing preflight only. This does not establish remote wire compatibility, independent routing qualification, monetary authorization, report quality, human approval, or production activation.",
  };
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ readiness: result.readiness, dispatchPerformed: false, providerCalls: 0, outputFile, blockers: result.blockers, requests: preflightRequestRows.length }, null, 2)}\n`);
  if (preflightRequestRows.length !== PROFILES.length || preflightRequestRows.some((row) => row.status === "blocked")) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
