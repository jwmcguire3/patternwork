import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { loadPwrp71FictionalDiagnosticFixture } from "../../lib/server/reports/qualification/runner.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { buildOpenRouterWirePayload } from "../../lib/server/openrouter/wire.ts";
import {
  buildFictionalDiagnosticRequest,
  FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
} from "./diagnostic.ts";

const TEMPLATE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-no-dispatch-20261011.json";
const OUTPUT = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-fresh-budget-epoch-2-no-dispatch-20261011.json";
const VARIANT = "fresh-budget-epoch-2";

type PreflightRequest = {
  readonly profileId: string;
  readonly request: Record<string, unknown>;
  readonly packetSha256: string;
  readonly [key: string]: unknown;
};

type Preflight = {
  readonly schemaVersion: string;
  readonly exactRequests: PreflightRequest[];
  readonly candidate: Record<string, unknown>;
  readonly [key: string]: unknown;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const template = JSON.parse(await readFile(path.join(workspaceRoot, TEMPLATE), "utf8")) as Preflight;
  if (template.schemaVersion !== "PWRP71-GATE10-OPENROUTER-NO-DISPATCH-PREFLIGHT-V1"
    || template.exactRequests.length !== 2) throw new Error("The source no-dispatch preflight is missing or has the wrong scope.");

  const nextRequests: PreflightRequest[] = [];
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
    const request = buildFictionalDiagnosticRequest({
      profileId,
      prepared: prepared.value,
      runId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
      continuation: false,
    });
    const row = template.exactRequests.find((entry) => entry.profileId === profileId);
    if (!row) throw new Error(`${profileId} is missing from the baseline preflight.`);
    const priorPayload = row.request.finalWirePayload;
    const nextPayload = buildOpenRouterWirePayload(request.wireRequest);
    // The wire request payload contains only model inputs; idempotency remains a
    // request header and therefore cannot alter the approved prompts or schema.
    const oldWirePayload = priorPayload as Record<string, unknown>;
    if (sha256Canonical(oldWirePayload) !== sha256Canonical(nextPayload)) {
      throw new Error(`${profileId} wire payload changed while preparing the new budget epoch.`);
    }
    const correlation = row.request.requestCorrelationHeader as Record<string, unknown>;
    const nextRow: PreflightRequest = {
      ...row,
      request: {
        ...row.request,
        requestCorrelationHeader: { ...correlation, value: request.request.idempotencyKey },
        requestFingerprint: request.requestFingerprint,
      },
    };
    nextRequests.push(nextRow);
  }

  const document = {
    ...template,
    generatedAt: new Date().toISOString(),
    runId: FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
    candidate: { ...template.candidate, requestVariant: VARIANT },
    exactRequests: nextRequests,
    budgetEpochAuthorization: {
      ordinal: 2,
      operatorDirective: "billing starts over",
      priorRunId: "gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011",
      priorUnknownReservedMicros: 230_000,
      priorInvoiceStatusRemainsUnknown: true,
      priorReservationExcludedFromFreshAuthorizationCap: true,
      freshAggregateAuthorizationMicros: 3_000_000,
    },
  };
  await writeFile(path.join(workspaceRoot, OUTPUT), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  const bytes = await readFile(path.join(workspaceRoot, OUTPUT));
  process.stdout.write(`${JSON.stringify({ output: OUTPUT, sha256: sha256(bytes.toString("utf8")), dispatchPerformed: false, providerCalls: 0, apiKeyRead: false, profiles: nextRequests.map((row) => row.profileId) }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
