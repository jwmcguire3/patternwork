import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { loadPwrp71FictionalDiagnosticFixture } from "../../lib/server/reports/qualification/runner.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { buildOpenRouterWirePayload, OPENROUTER_DEFAULT_ENDPOINT } from "../../lib/server/openrouter/wire.ts";
import {
  buildFictionalDiagnosticRequest,
  FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
  FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
  FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID,
  FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256,
  FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID,
  OPENAI_SCHEMA_CORRECTION_MARKER,
} from "./diagnostic.ts";

const ROOT = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight";

const VARIANTS = [
  {
    template: `${ROOT}/c01-c02-ifs-openai-only-no-dispatch-20261011.json`,
    output: `${ROOT}/c01-c02-ifs-openai-only-schema-correction-no-dispatch-20261012.json`,
    templateRunId: FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
    runId: FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
    continuation: false,
  },
  {
    template: `${ROOT}/c01-c02-ifs-openai-only-continuation-no-dispatch-20261011.json`,
    output: `${ROOT}/c01-c02-ifs-openai-only-continuation-schema-correction-no-dispatch-20261012.json`,
    templateRunId: FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
    runId: FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
    continuation: true,
  },
  {
    template: `${ROOT}/c01-c02-ifs-openai-only-fresh-budget-epoch-2-no-dispatch-20261011.json`,
    output: `${ROOT}/c01-c02-ifs-openai-only-fresh-budget-epoch-2-schema-correction-no-dispatch-20261012.json`,
    templateRunId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
    runId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
    continuation: false,
  },
  {
    template: `${ROOT}/c01-c02-ifs-openai-only-non-zdr-continuation-v2-no-dispatch-20261011.json`,
    output: `${ROOT}/c01-c02-ifs-openai-only-non-zdr-continuation-schema-correction-no-dispatch-20261012.json`,
    templateRunId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
    runId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
    continuation: false,
    allowNonZdrContinuation: true,
  },
  {
    template: `${ROOT}/c01-c02-ifs-openai-only-non-zdr-continuation-v2-no-dispatch-20261011.json`,
    output: `${ROOT}/c01-c02-ifs-openai-only-schema-correction-continuation-no-dispatch-20261012.json`,
    templateRunId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
    runId: FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID,
    continuation: false,
    allowNonZdrContinuation: true,
    schemaCorrectionContinuation: true,
    schemaCorrection: true,
  },
] as const;

type RequestRow = {
  readonly profileId: string;
  readonly request: Record<string, unknown>;
  readonly packetSha256: string;
  readonly schemaCompatibility?: Record<string, unknown>;
  readonly [key: string]: unknown;
};

type Preflight = {
  readonly schemaVersion: string;
  readonly exactRequests: RequestRow[];
  readonly candidate: Record<string, unknown>;
  readonly budgetEpochAuthorization?: Record<string, unknown>;
  readonly ownerAuthorizedPrivacyContinuation?: Record<string, unknown>;
  readonly runId: string;
  readonly [key: string]: unknown;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stripProjectedEnumTypes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripProjectedEnumTypes);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const next = Object.fromEntries(Object.entries(record).map(([key, child]) => [key, stripProjectedEnumTypes(child)]));
  if (("enum" in next || "const" in next) && typeof next.type === "string") delete next.type;
  return next;
}

async function buildCorrectedRequests(input: {
  readonly workspaceRoot: string;
  readonly template: Preflight;
  readonly runId: string;
  readonly continuation: boolean;
  readonly allowNonZdrContinuation?: boolean;
  readonly schemaCorrectionContinuation?: boolean;
}): Promise<RequestRow[]> {
  const rows: RequestRow[] = [];
  for (const profileId of ["C01", "C02"] as const) {
    const fixture = await loadPwrp71FictionalDiagnosticFixture({ profileId, workspaceRoot: input.workspaceRoot });
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
      runId: input.runId,
      continuation: input.continuation,
      allowNonZdrContinuation: input.allowNonZdrContinuation,
      schemaCorrectionContinuation: input.schemaCorrectionContinuation,
    });
    const prior = input.template.exactRequests.find((entry) => entry.profileId === profileId);
    if (!prior || prior.packetSha256 !== fixture.packetSha256) throw new Error(`${profileId} packet row is missing or changed from its historical no-dispatch record.`);

    const finalWirePayload = buildOpenRouterWirePayload(built.wireRequest);
    const oldPayload = prior.request.finalWirePayload;
    const schema = (finalWirePayload.response_format as { json_schema: { schema: unknown } }).json_schema.schema;
    const normalizedPayload = structuredClone(finalWirePayload) as Record<string, unknown>;
    const normalizedFormat = normalizedPayload.response_format as { json_schema: { schema: unknown } };
    normalizedFormat.json_schema.schema = stripProjectedEnumTypes(schema);
    if (sha256Canonical(normalizedPayload) !== sha256Canonical(oldPayload)) {
      throw new Error(`${profileId} corrected wire body changed something beyond adding explicit types to enum/const schema nodes.`);
    }

    const payloadSha256 = sha256(JSON.stringify(finalWirePayload));
    const header = prior.request.requestCorrelationHeader as Record<string, unknown>;
    rows.push({
      ...prior,
      schemaCompatibility: {
        ...prior.schemaCompatibility,
        remoteAcceptance: profileId === "C01"
          ? "UNTESTED AFTER THE EXPLICIT-TYPE CORRECTION. The historical C01 request using the previous schema received invalid_json_schema; no request has tested this corrected wire schema."
          : "UNTESTED. C02 was not dispatched, and no request has tested this corrected wire schema.",
      },
      request: {
        ...prior.request,
        requestFingerprintBasis: "prepared_diagnostic_request",
        preparedRequestFingerprint: built.requestFingerprint,
        requestFingerprint: built.requestFingerprint,
        requestCorrelationHeader: { ...header, value: built.request.idempotencyKey },
        wireSchemaSha256: sha256Canonical(schema),
        finalWirePayloadSha256: payloadSha256,
        wireRequestFingerprint: sha256Canonical({
          endpoint: OPENROUTER_DEFAULT_ENDPOINT,
          idempotencyHeader: built.request.idempotencyKey,
          exactWirePayloadSha256: payloadSha256,
        }),
        finalWirePayload,
      },
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const results = [];
  for (const variant of VARIANTS) {
    const template = JSON.parse(await readFile(path.join(workspaceRoot, variant.template), "utf8")) as Preflight;
    if (template.schemaVersion !== "PWRP71-GATE10-OPENROUTER-NO-DISPATCH-PREFLIGHT-V1"
      || template.exactRequests.length !== 2 || template.runId !== variant.templateRunId) {
      throw new Error(`Historical no-dispatch template ${variant.template} is missing or has unexpected scope.`);
    }
    const exactRequests = await buildCorrectedRequests({
      workspaceRoot,
      template,
      runId: variant.runId,
      continuation: variant.continuation,
      allowNonZdrContinuation: "allowNonZdrContinuation" in variant ? variant.allowNonZdrContinuation : false,
      schemaCorrectionContinuation: "schemaCorrectionContinuation" in variant ? variant.schemaCorrectionContinuation : false,
    });
    const document = {
      ...template,
      evidenceRecordRevision: 3,
      generatedAt: new Date().toISOString(),
      runId: "schemaCorrection" in variant ? FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID : template.runId,
      ...( "schemaCorrection" in variant ? {
        candidate: { ...template.candidate, requestVariant: OPENAI_SCHEMA_CORRECTION_MARKER },
        budgetEpochAuthorization: {
          ...template.budgetEpochAuthorization,
          continuationParentRunId: FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID,
          continuationParentRunSha256: FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256,
          priorAttemptLedgerSha256: "9581a49c928dbad61ae612e7e9634cb5113110dc5cb22eac845030f197e26f62",
          priorDispatchLedgerSha256: "428d1ad1717d5eb5898ee227d17c1b4d42cab34678fba73756f32091f500a372",
          totalUnknownReservedMicros: 345_000,
          remainingAuthorizationMicros: 2_655_000,
          retainedUnknownAttempts: [
            { attemptId: `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:IFS:initial:openai-gpt-6-luna-max:attempt-1`, profileId: "C01", requestVariant: "fresh-budget-epoch-2", responseStatus: 404, unknownReservedMicros: 115_000, invoiceStatusRemainsUnknown: true },
            { attemptId: `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:openai-non-zdr-continuation-1:IFS:initial:openai-gpt-6-luna-max:attempt-1`, profileId: "C01", requestVariant: "openai-non-zdr-continuation-1", responseStatus: 400, providerName: "OpenAI", providerUpstreamCode: "invalid_json_schema", unknownReservedMicros: 115_000, invoiceStatusRemainsUnknown: true },
            { attemptId: `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID}:C01:openai-error-detail-resend-1:IFS:initial:openai-gpt-6-luna-max:attempt-1`, profileId: "C01", requestVariant: "openai-error-detail-resend-1", responseStatus: 400, providerName: "OpenAI", providerUpstreamCode: "invalid_json_schema", unknownReservedMicros: 115_000, invoiceStatusRemainsUnknown: true },
          ],
        },
        ownerAuthorizedPrivacyContinuation: {
          ...template.ownerAuthorizedPrivacyContinuation,
          reportScope: "fictional C01/C02 IFS only; corrected-schema continuation",
          latestOwnerDirective: "run requests for c01 and c02",
        },
        blockers: [
          "No independently reviewed, source-bound qualified routing receipt is present for the current router runtime and these packet digests.",
          "This CLI-only fictional diagnostic does not qualify routing or authorize production activation.",
          "OpenAI rejected the previous wire schema because report_release lacked a type; this corrected request has no provider acceptance evidence yet.",
        ],
        schemaCorrectionContinuation: {
          parentRunId: FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID,
          parentRunSha256: FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256,
          priorAttemptLedgerSha256: "9581a49c928dbad61ae612e7e9634cb5113110dc5cb22eac845030f197e26f62",
          priorDispatchLedgerSha256: "428d1ad1717d5eb5898ee227d17c1b4d42cab34678fba73756f32091f500a372",
          previousRejectedWireSchemaSha256: "8f0f6f91d4037a2c929253bc21e35c96bc3f86c4c28193cafefe22640fb5b451",
          priorUnknownReservedMicros: 345_000,
          remainingBeforeThisRunMicros: 2_655_000,
          operatorDirective: "run requests for c01 and c02",
          dispatchPerformed: false,
          providerCalls: 0,
          apiKeyRead: false,
        },
      } : {}),
      exactRequests,
      schemaCorrection: {
        change: "The strict wire projection now adds explicit primitive types to homogeneous enum/const schemas.",
        sourceSchemasChanged: false,
        reportPromptsChanged: false,
        fixtureEvidenceChanged: false,
        providerAcceptance: "untested",
        dispatchPerformed: false,
        providerCalls: 0,
        apiKeyRead: false,
      },
      evidenceCorrections: [
        ...(Array.isArray(template.evidenceCorrections) ? template.evidenceCorrections : []),
        "This version supersedes only the serialized request identity for the strict-schema explicit-type correction; the referenced prior provider rejection and earlier preflight remain unchanged historical records.",
      ],
      boundary: "This regenerated record prepared corrected fictional requests with zero provider calls and no API-key read. It does not establish provider acceptance, generate a report, qualify routing, or approve activation.",
    };
    const output = path.join(workspaceRoot, variant.output);
    let bytes: Buffer;
    try {
      const existingBytes = await readFile(output);
      const existing = JSON.parse(existingBytes.toString("utf8")) as Preflight;
      if (existing.runId !== document.runId
        || sha256Canonical(existing.exactRequests) !== sha256Canonical(exactRequests)
        || existing.dispatchPerformed !== false || existing.providerCalls !== 0 || existing.apiKeyRead !== false) {
        throw new Error(`Existing versioned preflight ${variant.output} differs from the freshly prepared request identity; it was preserved.`);
      }
      bytes = existingBytes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      bytes = await readFile(output);
    }
    results.push({ output: variant.output, sha256: sha256(bytes.toString("utf8")), profiles: exactRequests.map((row) => row.profileId), runId: document.runId });
  }
  process.stdout.write(`${JSON.stringify({ records: results, dispatchPerformed: false, providerCalls: 0, apiKeyRead: false }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
