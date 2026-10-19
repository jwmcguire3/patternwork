import { createHash, randomUUID } from "node:crypto";
import { open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { C10_NO_DISPATCH_CALL_ID, isConfirmedC10PreDispatchDnsFailure } from "./c10-no-dispatch-evidence.mjs";

const RUN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOURNAL = path.join(RUN_DIR, "BUDGET_JOURNAL.json");
const RECEIPT = path.join(RUN_DIR, "C10-COMPOSITION-NO-DISPATCH-RECONCILIATION.json");
const MICRODOLLARS = 1_000_000;
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function assertJournal(journal) {
  const unresolved = journal.calls.filter((call) => call.status === "unknown_cost" || call.status === "reserved");
  if (journal.authorization?.aggregateCapMicrodollars !== 3_000_000
    || journal.limits?.perRequestReservationMicrodollars !== 300_000
    || journal.settledUpperBoundMicrodollars !== 121_677
    || journal.reservedMicrodollars !== 1_200_000
    || journal.remainingAuthorizationMicrodollars !== 1_678_323
    || unresolved.length !== 4
    || !unresolved.some((call) => call.callId === C10_NO_DISPATCH_CALL_ID)) {
    throw new Error("C10 reconciliation requires the exact pre-reconciliation $3 journal state.");
  }
}
async function atomicWrite(file, value) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temp, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally { await handle.close(); }
  await rename(temp, file);
}

async function main() {
  if (process.argv.length !== 2) throw new Error("This reconciliation has no overridable CLI parameters.");
  const lockPath = path.join(RUN_DIR, ".dispatch.lock");
  let lock;
  try { lock = await open(lockPath, "wx"); }
  catch { throw new Error("An active or stale dispatch lock exists; refusing journal reconciliation."); }
  try {
    const originalJournalBytes = await readFile(JOURNAL);
    const journal = JSON.parse(originalJournalBytes.toString("utf8"));
    assertJournal(journal);
    const call = journal.calls.find((entry) => entry.callId === C10_NO_DISPATCH_CALL_ID);
    if (!isConfirmedC10PreDispatchDnsFailure(call)) throw new Error("The recorded call does not prove the exact pre-connection DNS failure; no reconciliation was made.");
    if (journal.journalCorrections?.some((entry) => entry.correctionType === "no_dispatch_reconciliation" && entry.callId === C10_NO_DISPATCH_CALL_ID)) {
      throw new Error("This exact call has already been reconciled; no second correction is permitted.");
    }
    try { await readFile(RECEIPT); throw new Error("Reconciliation receipt already exists; refusing a second use."); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    const requestPath = path.join(RUN_DIR, ...call.requestFile.split("/"));
    const requestBytes = await readFile(requestPath);
    if (sha(requestBytes) !== call.requestBodySha256) throw new Error("The recorded C10 request file does not match its pinned request hash.");
    const responseCandidate = path.join(RUN_DIR, "responses", "C10.composition.response.json");
    try { await readFile(responseCandidate); throw new Error("A response artifact exists; this call cannot be reconciled as not dispatched."); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    const preflightPath = path.join(RUN_DIR, "C10_PROVIDER_PREFLIGHT.json");
    const preflightBytes = await readFile(preflightPath);
    const preflight = JSON.parse(preflightBytes.toString("utf8"));
    if (preflight.status !== "passed" || preflight.httpStatus !== 200 || preflight.model !== "gpt-6-luna"
      || preflight.modelVisible !== true || preflight.generationRequests !== 0 || preflight.providerCostMicrodollars !== 0
      || Date.parse(preflight.checkedAt) <= Date.parse(call.finishedAt)) {
      throw new Error("A successful post-failure zero-cost provider preflight is required before reconciliation.");
    }

    const now = new Date().toISOString();
    const receipt = {
      schemaVersion: "PATTERNWORK-C10-COMPOSITION-NO-DISPATCH-RECONCILIATION-V1",
      status: "failed_before_provider_dispatch",
      reconciliationId: randomUUID(),
      recordedAt: now,
      diagnosticOnly: true,
      qualificationStatus: "FICTIONAL_DIAGNOSTIC_ONLY_NOT_ROUTING_QUALIFICATION_OR_PRODUCTION_APPROVAL",
      profileId: "C10",
      reportType: "IFS",
      stage: "composition",
      fixtureSet: "route-replays-v5",
      provider: "OpenAI direct API",
      model: "gpt-6-luna",
      callId: call.callId,
      packetSha256: call.packetSha256,
      requestBodySha256: call.requestBodySha256,
      requestFileSha256: sha(requestBytes),
      dispatcherSha256: call.dispatcherSha256,
      failure: {
        code: "ENOTFOUND",
        syscall: "getaddrinfo",
        hostname: "api.openai.com",
        elapsedMilliseconds: Date.parse(call.finishedAt) - Date.parse(call.reservationCreatedAt),
        httpStatus: null,
        responseId: null,
        responseArtifactExists: false,
      },
      independentReadOnlyAssessment: {
        reviewer: "audit_final_attempt subagent",
        conclusion: "The exact pre-connection DNS error and 16 ms duration show the POST failed before reaching OpenAI; this is technical no-dispatch evidence, not an invoice receipt.",
        reportArtifact: "conversation agent review on 2026-10-15; evidence independently checked against the durable journal and dispatcher source",
      },
      postFailurePreflight: {
        file: "C10_PROVIDER_PREFLIGHT.json",
        sha256: sha(preflightBytes),
        checkedAt: preflight.checkedAt,
        httpStatus: preflight.httpStatus,
        generationRequests: 0,
        providerCostMicrodollars: 0,
      },
      disposition: {
        providerGenerationRequests: 0,
        generationCostMicrodollars: 0,
        costStatement: "No generation request reached the provider. No invoice amount is asserted.",
        releasedReservationMicrodollars: call.reservationMicrodollars,
        humanApproval: false,
        routingQualification: false,
        productionApproval: false,
      },
      journalBeforeSha256: sha(originalJournalBytes),
    };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await open(RECEIPT, "wx").then(async (handle) => { try { await handle.writeFile(receiptBytes); await handle.sync(); } finally { await handle.close(); } });

    const before = {
      reservedMicrodollars: journal.reservedMicrodollars,
      settledUpperBoundMicrodollars: journal.settledUpperBoundMicrodollars,
      remainingAuthorizationMicrodollars: journal.remainingAuthorizationMicrodollars,
    };
    call.originalStatus = call.status;
    call.status = "failed_before_provider_dispatch";
    call.reservationMicrodollars = 0;
    call.noDispatchReconciliationFile = "C10-COMPOSITION-NO-DISPATCH-RECONCILIATION.json";
    call.noDispatchReconciliationFileSha256 = sha(receiptBytes);
    call.noDispatchReconciliationId = receipt.reconciliationId;
    journal.reservedMicrodollars -= 300_000;
    journal.remainingAuthorizationMicrodollars = MICRODOLLARS * 3 - journal.settledUpperBoundMicrodollars - journal.reservedMicrodollars;
    journal.journalCorrections ??= [];
    journal.journalCorrections.push({
      correctionId: receipt.reconciliationId,
      correctionType: "no_dispatch_reconciliation",
      recordedAt: now,
      callId: call.callId,
      previousStatus: "unknown_cost",
      correctedStatus: "failed_before_provider_dispatch",
      previousReservationMicrodollars: 300_000,
      correctedReservationMicrodollars: 0,
      receiptFile: receipt.disposition ? "C10-COMPOSITION-NO-DISPATCH-RECONCILIATION.json" : null,
      receiptFileSha256: sha(receiptBytes),
      journalBeforeSha256: receipt.journalBeforeSha256,
      before,
      after: {
        reservedMicrodollars: journal.reservedMicrodollars,
        settledUpperBoundMicrodollars: journal.settledUpperBoundMicrodollars,
        remainingAuthorizationMicrodollars: journal.remainingAuthorizationMicrodollars,
      },
      reason: "Exact ENOTFOUND/getaddrinfo error occurred before any provider HTTP connection; no response or usage exists. A post-failure authenticated model-list GET succeeded with zero generation requests.",
      monetaryInvoiceAssertion: false,
    });
    if (journal.reservedMicrodollars !== 900_000 || journal.settledUpperBoundMicrodollars !== 121_677
      || journal.remainingAuthorizationMicrodollars !== 1_978_323) throw new Error("Reconciliation would produce unexpected aggregate budget counters.");
    await atomicWrite(JOURNAL, journal);
    console.log(JSON.stringify({ status: receipt.status, callId: call.callId, providerGenerationRequests: 0,
      releasedReservationMicrodollars: 300_000, remainingAuthorizationMicrodollars: journal.remainingAuthorizationMicrodollars,
      receipt: "C10-COMPOSITION-NO-DISPATCH-RECONCILIATION.json" }, null, 2));
  } finally {
    await lock?.close().catch(() => {});
    await import("node:fs/promises").then(({ unlink }) => unlink(lockPath).catch(() => {}));
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
