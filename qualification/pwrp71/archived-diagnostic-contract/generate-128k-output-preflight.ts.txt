import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { loadPwrp71FictionalDiagnosticFixture } from "../../lib/server/reports/qualification/runner.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { maximumQuotedCallCostMicros } from "../../lib/server/openrouter/qualification-budget.ts";
import { buildOpenRouterWirePayload, OPENROUTER_DEFAULT_ENDPOINT } from "../../lib/server/openrouter/wire.ts";
import {
  buildFictionalDiagnosticRequest,
  FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS,
  FICTIONAL_IFS_128K_OUTPUT_LIMIT,
  FICTIONAL_IFS_128K_OUTPUT_RUN_ID,
  FICTIONAL_IFS_128K_PARENT_SHA256,
  FICTIONAL_IFS_DIAGNOSTIC_PINS,
  FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL,
  FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
  FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID,
  FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID,
  OPENAI_128K_OUTPUT_MARKER,
  OPENAI_ERROR_DETAIL_RESEND_MARKER,
} from "./diagnostic.ts";

const ROOT = "qualification/pwrp71/gate11-fictional-ifs-diagnostic";
const TEMPLATE = `${ROOT}/provider-preflight/c01-c02-ifs-openai-only-schema-correction-continuation-no-dispatch-20261012.json`;
const PRICING_FILE = `${ROOT}/pricing-check-2026-10-12-openai-non-zdr-c01-c02-128k-output.json`;
const PREFLIGHT_FILE = `${ROOT}/provider-preflight/c01-c02-ifs-openai-only-non-zdr-128k-output-no-dispatch-20261012.json`;
const PRIOR_ATTEMPTS_RAW_SHA256 = "84391ad5f477f367c9066bf788f43e150a404095f9f38eba418c1b59b06f3fdf";
const PRIOR_DISPATCHES_RAW_SHA256 = "dcda92dcdf3cff6752fc1eedc241795ab1e4d18b39bafb2d31f55ce670cf5fe7";
const OPENAI_NON_ZDR_CONTINUATION_MARKER = "openai-non-zdr-continuation-1";
const UNKNOWN_ATTEMPT_IDS = [
  `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
  `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:${OPENAI_NON_ZDR_CONTINUATION_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
  `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID}:C01:${OPENAI_ERROR_DETAIL_RESEND_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
];

type RequestRow = {
  readonly profileId: string;
  readonly status: string;
  readonly packetSha256: string;
  readonly request: Record<string, unknown>;
  readonly [key: string]: unknown;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function writeImmutable(relative: string, value: unknown): Promise<Buffer> {
  const file = path.resolve(relative);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeFile(file, bytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readFile(file);
    if (!existing.equals(bytes)) throw new Error(`Immutable evidence already exists at ${relative} with different bytes.`);
    return existing;
  }
  return bytes;
}

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const template = JSON.parse(await readFile(path.join(workspaceRoot, TEMPLATE), "utf8")) as Record<string, unknown>;
  const sourcePins = template.sourceManifestPins as Record<string, unknown>;
  const templateRows = template.exactRequests as RequestRow[];
  if (template.runId !== FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID || template.dispatchPerformed !== false
    || template.providerCalls !== 0 || template.apiKeyRead !== false || templateRows.length !== 2
    || sourcePins.currentRouterRuntimeSha256 !== FICTIONAL_IFS_DIAGNOSTIC_PINS.routerRuntimeSha256
    || sourcePins.semanticCaseSetSha256 !== FICTIONAL_IFS_DIAGNOSTIC_PINS.semanticCaseSetSha256) {
    throw new Error("The pinned schema-correction preflight is not a valid zero-dispatch template.");
  }

  const exactRequests: RequestRow[] = [];
  let conservativeQuoteMicros = 0;
  for (const profileId of ["C01", "C02"] as const) {
    const fixture = await loadPwrp71FictionalDiagnosticFixture({ profileId, workspaceRoot });
    const prepared = preparePwrp71Request({
      packet: fixture.packet,
      reportType: "IFS",
      questionSource: fixture.questionSource,
      reportSource: fixture.reportSource,
      canonicalResponseEvidence: fixture.canonicalResponseEvidence,
    });
    if (!prepared.ok) throw new Error(`${profileId} packet failed production preparation: ${prepared.issues.map((issue) => issue.code).join(", ")}.`);
    const built = buildFictionalDiagnosticRequest({
      profileId,
      prepared: prepared.value,
      runId: FICTIONAL_IFS_128K_OUTPUT_RUN_ID,
      continuation: false,
      allowNonZdrContinuation: true,
      outputLimit128kContinuation: true,
    });
    conservativeQuoteMicros = maximumQuotedCallCostMicros(built.wireRequest);
    if (built.request.maxOutputTokens !== FICTIONAL_IFS_128K_OUTPUT_LIMIT
      || conservativeQuoteMicros > FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS) {
      throw new Error(`${profileId} 128k request exceeds the exact authorized $0.20 reservation.`);
    }
    const prior = templateRows.find((row) => row.profileId === profileId);
    if (!prior || prior.packetSha256 !== fixture.packetSha256) throw new Error(`${profileId} packet digest differs from the source-backed no-dispatch template.`);
    const finalWirePayload = buildOpenRouterWirePayload(built.wireRequest);
    const finalWirePayloadSha256 = sha256(JSON.stringify(finalWirePayload));
    exactRequests.push({
      ...prior,
      status: "request_prepared_no_dispatch",
      packetSha256: fixture.packetSha256,
      schemaCompatibility: {
        ...(typeof prior.schemaCompatibility === "object" && prior.schemaCompatibility !== null ? prior.schemaCompatibility : {}),
        remoteAcceptance: "UNTESTED. The request uses the pinned PWRP 7.1 schema with a 128k output limit; this no-dispatch record does not claim provider acceptance.",
      },
      request: {
        ...prior.request,
        model: built.request.model,
        reasoningEffort: built.request.reasoningEffort,
        systemSha256: sha256(built.request.system),
        promptSha256: sha256(built.request.prompt),
        schemaName: built.request.schemaName,
        localSchemaSha256: sha256Canonical(built.request.schema),
        wireSchemaSha256: sha256Canonical((finalWirePayload.response_format as { json_schema: { schema: unknown } }).json_schema.schema),
        maxOutputTokens: built.request.maxOutputTokens,
        requestCorrelationHeader: { name: "Idempotency-Key", value: built.request.idempotencyKey },
        endpoint: OPENROUTER_DEFAULT_ENDPOINT,
        finalWirePayloadSha256,
        wireRequestFingerprint: sha256Canonical({ endpoint: OPENROUTER_DEFAULT_ENDPOINT, idempotencyHeader: built.request.idempotencyKey, exactWirePayloadSha256: finalWirePayloadSha256 }),
        requestFingerprint: built.requestFingerprint,
        requestFingerprintBasis: "prepared_diagnostic_request",
        preparedRequestFingerprint: built.requestFingerprint,
        finalWirePayload,
      },
    });
  }

  const pricingSource = JSON.parse(await readFile(path.join(workspaceRoot, `${ROOT}/pricing-check-2026-10-12-openai-non-zdr-c01-c02-schema-correction.json`), "utf8")) as Record<string, unknown>;
  const pricingRouting = pricingSource.providerRouting as Record<string, unknown>;
  const pricingPrivacy = pricingSource.privacyAcknowledgement as Record<string, unknown>;
  const pricingLimits = pricingSource.limits as Record<string, unknown>;
  const pricing = {
    ...pricingSource,
    limits: {
      ...pricingLimits,
      pwrp71IfsMaxOutputTokens: FICTIONAL_IFS_128K_OUTPUT_LIMIT,
      perCallReservationMicros: FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS,
      aggregateAuthorizationMicros: 3_000_000,
      conservativeFullContextQuoteMicros: conservativeQuoteMicros,
    },
    providerRouting: { ...pricingRouting, providerAllowlist: ["OpenAI"], providerFallbacks: false },
    privacyAcknowledgement: {
      ...pricingPrivacy,
      latestOwnerDirective: "raise per call reservation to .2 and run",
      scope: "fictional C01/C02 IFS only; 128k output continuation",
    },
  };
  const pricingBytes = await writeImmutable(PRICING_FILE, pricing);

  const templateWithoutSchemaCorrection = Object.fromEntries(
    Object.entries(template).filter(([key]) => key !== "schemaCorrectionContinuation" && key !== "schemaCorrection"),
  );
  const preflight = {
    ...templateWithoutSchemaCorrection,
    evidenceRecordRevision: 4,
    generatedAt: new Date().toISOString(),
    runId: FICTIONAL_IFS_128K_OUTPUT_RUN_ID,
    candidate: {
      ...(template.candidate as Record<string, unknown>),
      requestVariant: OPENAI_128K_OUTPUT_MARKER,
      maxOutputTokens: FICTIONAL_IFS_128K_OUTPUT_LIMIT,
      perCallReservationMicros: FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS,
    },
    exactRequests,
    budgetEpochAuthorization: {
      ordinal: 4,
      continuationParentRunId: FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID,
      continuationParentRunSha256: FICTIONAL_IFS_128K_PARENT_SHA256,
      priorAttemptsRawSha256: PRIOR_ATTEMPTS_RAW_SHA256,
      priorDispatchesRawSha256: PRIOR_DISPATCHES_RAW_SHA256,
      totalUnknownReservedMicros: 345_000,
      reportedCostMicros: 12_138,
      remainingAuthorizationMicros: 2_642_862,
      aggregateAuthorizationMicros: 3_000_000,
      perCallReservationMicros: FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS,
      carriedUnknownAttemptIds: UNKNOWN_ATTEMPT_IDS,
      invoiceStatusRemainsUnknown: true,
    },
    ownerAuthorizedPrivacyContinuation: {
      ...(template.ownerAuthorizedPrivacyContinuation as Record<string, unknown>),
      reportScope: "fictional C01/C02 IFS only; 128k output continuation",
      latestOwnerDirective: "raise per call reservation to .2 and run",
      providerMayRetainPrompts: true,
    },
    blockers: [
      "No independently reviewed, source-bound qualified routing receipt is present for the current router runtime and these packet digests.",
      "This CLI-only fictional diagnostic does not qualify routing or authorize production activation.",
      "The parent C01 response ended at the earlier 20k output limit; provider acceptance of this 128k output request remains untested.",
    ],
    outputLimit128kContinuation: {
      parentRunId: FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID,
      parentRunSha256: FICTIONAL_IFS_128K_PARENT_SHA256,
      priorAttemptsRawSha256: PRIOR_ATTEMPTS_RAW_SHA256,
      priorDispatchesRawSha256: PRIOR_DISPATCHES_RAW_SHA256,
      maxOutputTokens: FICTIONAL_IFS_128K_OUTPUT_LIMIT,
      maxCallCostMicros: FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS,
      aggregateCostCapMicros: 3_000_000,
      priorUnknownReservedMicros: 345_000,
      priorReportedCostMicros: 12_138,
      operatorDirective: "raise per call reservation to .2 and run",
      dispatchPerformed: false,
      providerCalls: 0,
      apiKeyRead: false,
    },
    evidenceCorrections: [
      ...(Array.isArray(template.evidenceCorrections) ? template.evidenceCorrections : []),
      "This separately versioned request uses the model's published 128,000-token maximum output and a $0.20 per-call reservation; the existing $3 aggregate authorization and all parent reservations/costs remain counted.",
      "No provider call or API-key read occurred while generating this preflight.",
    ],
    boundary: "This regenerated record prepares only the pinned fictional C01/C02 IFS requests with zero provider calls and no API-key read. It does not establish provider acceptance, generate a report, qualify routing, or approve activation.",
    dispatchPerformed: false,
    providerCalls: 0,
    apiKeyRead: false,
    fixtureSet: "route-replays-v5",
  };
  await writeImmutable(PREFLIGHT_FILE, preflight);
  process.stdout.write(`${JSON.stringify({
    pricingFile: PRICING_FILE,
    pricingSha256: sha256(pricingBytes.toString("utf8")),
    preflightFile: PREFLIGHT_FILE,
    preflightSha256: sha256Canonical(preflight),
    packetDigests: exactRequests.map((row) => ({ profileId: row.profileId, packetSha256: row.packetSha256, requestFingerprint: row.request.requestFingerprint, payloadSha256: row.request.finalWirePayloadSha256 })),
    maxOutputTokens: FICTIONAL_IFS_128K_OUTPUT_LIMIT,
    conservativeFullContextQuoteMicros: conservativeQuoteMicros,
    perCallReservationMicros: FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS,
    aggregateAuthorizationMicros: 3_000_000,
    dispatchPerformed: false,
    providerCalls: 0,
    apiKeyRead: false,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
