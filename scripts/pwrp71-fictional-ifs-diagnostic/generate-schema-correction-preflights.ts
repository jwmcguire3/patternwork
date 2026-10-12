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
} from "./diagnostic.ts";

const ROOT = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight";

const VARIANTS = [
  {
    template: `${ROOT}/c01-c02-ifs-openai-only-no-dispatch-20261011.json`,
    output: `${ROOT}/c01-c02-ifs-openai-only-schema-correction-no-dispatch-20261012.json`,
    runId: FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
    continuation: false,
  },
  {
    template: `${ROOT}/c01-c02-ifs-openai-only-continuation-no-dispatch-20261011.json`,
    output: `${ROOT}/c01-c02-ifs-openai-only-continuation-schema-correction-no-dispatch-20261012.json`,
    runId: FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
    continuation: true,
  },
  {
    template: `${ROOT}/c01-c02-ifs-openai-only-fresh-budget-epoch-2-no-dispatch-20261011.json`,
    output: `${ROOT}/c01-c02-ifs-openai-only-fresh-budget-epoch-2-schema-correction-no-dispatch-20261012.json`,
    runId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
    continuation: false,
  },
  {
    template: `${ROOT}/c01-c02-ifs-openai-only-non-zdr-continuation-v2-no-dispatch-20261011.json`,
    output: `${ROOT}/c01-c02-ifs-openai-only-non-zdr-continuation-schema-correction-no-dispatch-20261012.json`,
    runId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
    continuation: false,
    allowNonZdrContinuation: true,
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
      || template.exactRequests.length !== 2 || template.runId !== variant.runId) {
      throw new Error(`Historical no-dispatch template ${variant.template} is missing or has unexpected scope.`);
    }
    const exactRequests = await buildCorrectedRequests({
      workspaceRoot,
      template,
      runId: variant.runId,
      continuation: variant.continuation,
      allowNonZdrContinuation: "allowNonZdrContinuation" in variant ? variant.allowNonZdrContinuation : false,
    });
    const document = {
      ...template,
      evidenceRecordRevision: 3,
      generatedAt: new Date().toISOString(),
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
    await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    const bytes = await readFile(output);
    results.push({ output: variant.output, sha256: sha256(bytes.toString("utf8")), profiles: exactRequests.map((row) => row.profileId) });
  }
  process.stdout.write(`${JSON.stringify({ records: results, dispatchPerformed: false, providerCalls: 0, apiKeyRead: false }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
