import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { loadPwrp71FictionalDiagnosticFixture } from "../../lib/server/reports/qualification/runner.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { buildOpenRouterWirePayload } from "../../lib/server/openrouter/wire.ts";
import { qualificationAttemptFingerprint } from "../../lib/server/reports/qualification/attempt-store.ts";
import {
  buildFictionalDiagnosticRequest,
  FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
} from "./diagnostic.ts";

const ROOT = "qualification/pwrp71/gate11-fictional-ifs-diagnostic";
const TEMPLATE = `${ROOT}/provider-preflight/c01-c02-ifs-openai-only-fresh-budget-epoch-2-no-dispatch-20261011.json`;
const STOPPED_RUN = `${ROOT}/live/${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}/run.json`;
const OUTPUT = `${ROOT}/provider-preflight/c01-c02-ifs-openai-only-non-zdr-continuation-v2-no-dispatch-20261011.json`;
const VARIANT = "openai-non-zdr-continuation-1";
const EXPECTED_STOPPED_RUN_SHA256 = "3959ea731dc6effa86703060023007bb1a9f97fbbb8a0c3eff1d0f0a0ea254c6";

type RequestRow = {
  readonly profileId: string;
  readonly request: Record<string, unknown>;
  readonly packetSha256: string;
  readonly privacy?: Record<string, unknown>;
  readonly schemaCompatibility?: Record<string, unknown>;
  readonly [key: string]: unknown;
};
type Preflight = { readonly schemaVersion: string; readonly exactRequests: RequestRow[]; readonly candidate: Record<string, unknown>; readonly blockers: string[]; readonly [key: string]: unknown };

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function withoutProvider(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The preflight wire payload is invalid.");
  const copy = structuredClone(value) as Record<string, unknown>;
  delete copy.provider;
  return copy;
}

function wireSchemaFromPayload(value: Record<string, unknown>): unknown {
  const responseFormat = value.response_format;
  if (!responseFormat || typeof responseFormat !== "object" || Array.isArray(responseFormat)) throw new Error("The OpenAI-only request has no response format.");
  const jsonSchema = (responseFormat as Record<string, unknown>).json_schema;
  if (!jsonSchema || typeof jsonSchema !== "object" || Array.isArray(jsonSchema)) throw new Error("The OpenAI-only request has no JSON Schema envelope.");
  const schema = (jsonSchema as Record<string, unknown>).schema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("The OpenAI-only request has no embedded JSON Schema.");
  return schema;
}

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const template = JSON.parse(await readFile(path.join(workspaceRoot, TEMPLATE), "utf8")) as Preflight;
  const parent = JSON.parse(await readFile(path.join(workspaceRoot, STOPPED_RUN), "utf8")) as {
    runSha256?: unknown;
    runFingerprint?: unknown;
    status?: unknown;
    budget?: Record<string, unknown>;
    providerDispatchCount?: unknown;
    attempts?: Array<Record<string, unknown>>;
  };
  if (template.schemaVersion !== "PWRP71-GATE10-OPENROUTER-NO-DISPATCH-PREFLIGHT-V1" || template.exactRequests.length !== 2
    || parent.runSha256 !== EXPECTED_STOPPED_RUN_SHA256
    || parent.status !== "diagnostic_stopped"
    || parent.providerDispatchCount !== 2
    || parent.budget?.unknownOrInFlightReservedCostMicros !== 230_000
    || parent.budget?.remainingAuthorizedMicros !== 2_770_000
    || parent.attempts?.length !== 2) {
    throw new Error("The exact stopped epoch-2 run, both retained reservations, or remaining budget does not match the completed non-ZDR diagnostic.");
  }

  const exactRequests: RequestRow[] = [];
  for (const profileId of ["C01", "C02"] as const) {
    const fixture = await loadPwrp71FictionalDiagnosticFixture({ profileId, workspaceRoot });
    const prepared = preparePwrp71Request({
      packet: fixture.packet,
      reportType: "IFS",
      questionSource: fixture.questionSource,
      reportSource: fixture.reportSource,
      canonicalResponseEvidence: fixture.canonicalResponseEvidence,
    });
    if (!prepared.ok) throw new Error(`${profileId} packet preparation failed: ${prepared.issues.map((issue) => issue.code).join(", ")}.`);
    const built = buildFictionalDiagnosticRequest({
      profileId,
      prepared: prepared.value,
      runId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
      continuation: false,
      allowNonZdrContinuation: true,
    });
    const prior = template.exactRequests.find((row) => row.profileId === profileId);
    if (!prior) throw new Error(`${profileId} is absent from the epoch-2 preflight template.`);
    const oldBody = prior.request.finalWirePayload;
    const newBody = buildOpenRouterWirePayload(built.wireRequest);
    if (sha256Canonical(withoutProvider(oldBody)) !== sha256Canonical(withoutProvider(newBody))) {
      throw new Error(`${profileId} prompt, schema, model or generation parameters changed during the privacy-policy-only continuation.`);
    }
    const serializedBody = JSON.stringify(newBody);
    const wirePayloadSha256 = sha256(serializedBody);
    const actualGenerationRequest = { ...built.request };
    delete actualGenerationRequest.includeUsage;
    const observedJournalAttemptFingerprint = qualificationAttemptFingerprint({
      request: actualGenerationRequest,
      wireRequest: built.wireRequest,
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      maxCallCostMicros: 115_000,
      aggregateCostCapMicros: 3_000_000,
    });
    const rowRequest = prior.request;
    exactRequests.push({
      ...prior,
      schemaCompatibility: {
        ...prior.schemaCompatibility,
        remoteAcceptance: profileId === "C01"
          ? "REJECTED: C01 reached OpenAI and returned HTTP 400 with upstream code invalid_json_schema; the sanitized receipt did not retain the provider's detailed schema path or explanation."
          : "NOT TESTED: C02 was not dispatched after C01 failed; no provider schema result is available.",
      },
      privacy: {
        ...prior.privacy,
        zeroDataRetentionRequested: false,
        dataCollectionDenied: true,
      },
      request: {
        ...rowRequest,
        wireSchemaSha256: sha256Canonical(wireSchemaFromPayload(newBody)),
        requestFingerprintBasis: "prepared_diagnostic_request",
        preparedRequestFingerprint: built.requestFingerprint,
        ...(profileId === "C01" ? { observedJournalAttemptFingerprint } : {}),
        requestCorrelationHeader: { name: "x-request-id", value: built.request.idempotencyKey, remoteIdempotencySemantics: "not_assumed" },
        finalWirePayloadSha256: wirePayloadSha256,
        wireRequestFingerprint: sha256Canonical({ endpoint: "https://openrouter.ai/api/v1/chat/completions", idempotencyHeader: built.request.idempotencyKey, exactWirePayloadSha256: wirePayloadSha256 }),
        requestFingerprint: built.requestFingerprint,
        finalWirePayload: newBody,
      },
    });
  }

  const document = {
    ...template,
    evidenceRecordRevision: 2,
    generatedAt: new Date().toISOString(),
    readiness: "BLOCKED",
    runId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
    candidate: { ...template.candidate, requestVariant: VARIANT },
    exactRequests,
    evidenceCorrections: [
      "The prior non-ZDR no-dispatch preflight incorrectly retained zeroDataRetentionRequested=true in descriptive metadata; this record reflects the actual request policy.",
      "The prior non-ZDR no-dispatch preflight's declared wireSchemaSha256 did not match its embedded wire schema; this record hashes the exact embedded strict wire schema.",
      "The live C01 attempt returned an OpenAI invalid_json_schema error. The exact rejected schema feature remains unknown because the sanitized provider receipt omitted error.raw.",
      "requestFingerprint remains the prepared diagnostic request identity required by the preflight contract; the observed C01 journal attempt fingerprint is recorded separately, while C02 has no observed attempt fingerprint because it was not dispatched.",
    ],
    blockers: [
      ...template.blockers,
      "The live C01 OpenAI-only non-ZDR attempt returned HTTP 400 with upstream code invalid_json_schema; exact schema incompatibility details are unavailable.",
    ],
    boundary: "No dispatch was performed by this preflight. The referenced live C01 request reached OpenAI and was rejected with invalid_json_schema. This does not identify the exact incompatible schema feature, produce a report, or qualify routing or production activation.",
    budgetEpochAuthorization: {
      ordinal: 2,
      operatorDirective: "billing starts over",
      priorRunId: "gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011",
      priorUnknownReservedMicros: 230_000,
      priorInvoiceStatusRemainsUnknown: true,
      priorReservationExcludedFromFreshAuthorizationCap: true,
      freshAggregateAuthorizationMicros: 3_000_000,
      stoppedRunSha256: parent.runSha256,
      stoppedRunFingerprint: parent.runFingerprint,
      retainedUnknownAttempts: [
        { profileId: "C01", requestVariant: "fresh-budget-epoch-2", responseStatus: 404, providerCode: "404", unknownReservedMicros: 115_000, invoiceStatusRemainsUnknown: true },
        { profileId: "C01", requestVariant: VARIANT, responseStatus: 400, providerName: "OpenAI", providerUpstreamCode: "invalid_json_schema", unknownReservedMicros: 115_000, invoiceStatusRemainsUnknown: true },
      ],
      totalUnknownReservedMicros: 230_000,
      remainingAuthorizationMicros: 2_770_000,
    },
    ownerAuthorizedPrivacyContinuation: {
      operatorDirective: "allow non zdr",
      providerSelection: "openai_only_no_fallbacks",
      zeroDataRetentionRequired: false,
      providerMayRetainPrompts: true,
      dataCollection: "deny",
      reportScope: "fictional C01/C02 IFS only",
    },
  };
  await writeFile(path.join(workspaceRoot, OUTPUT), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  const bytes = await readFile(path.join(workspaceRoot, OUTPUT));
  process.stdout.write(`${JSON.stringify({ output: OUTPUT, sha256: sha256(bytes.toString("utf8")), dispatchPerformed: false, providerCalls: 0, apiKeyRead: false, profiles: exactRequests.map((row) => row.profileId), parentRunSha256: parent.runSha256 }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
