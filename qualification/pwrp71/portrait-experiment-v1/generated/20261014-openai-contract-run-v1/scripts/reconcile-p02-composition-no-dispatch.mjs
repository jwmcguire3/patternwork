import { createHash, randomUUID } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  P02_COMPOSITION_NO_DISPATCH_CALL_ID,
  P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256,
  P02_COMPOSITION_NO_DISPATCH_PACKET_SHA256,
  P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256,
  isConfirmedP02PreDispatchDnsFailure,
} from "./p02-no-dispatch-evidence.mjs";

const RUN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOURNAL = path.join(RUN_DIR, "BUDGET_JOURNAL.json");
const RECEIPT_NAME = "P02-COMPOSITION-NO-DISPATCH-RECONCILIATION.json";
const RECEIPT = path.join(RUN_DIR, RECEIPT_NAME);
const REVIEW = path.join(RUN_DIR, "outputs", "P02-COMPOSITION-TRANSPORT-REVIEW.json");
const PREFLIGHT = path.join(RUN_DIR, "outputs", "P02-COMPOSITION-PROVIDER-PREFLIGHT.json");
const EXPECTED_JOURNAL_SHA256 = "5ef5b471e6f0100effc50cf750d8d6dc8125c5b59528fbdd9fb0fafd97e530c5";
const EXPECTED_REVIEW_SHA256 = "15c71ec3501e8c1776ade0c0e33764a1f062646d8db0dd033aa45df231ef3f30";
const EXPECTED_PREFLIGHT_SHA256 = "52514fef4e5ce3eaa4be0c8ca11c0321e8cb14056d79e6b2cbcf8aa7cf101f13";
const MICRODOLLARS = 1_000_000;
const OLD_UNKNOWN_CALL_IDS = [
  "017fbfd7-ec20-47a1-bb09-2f5242debd0b",
  "48899da5-ce4e-45f2-a493-21ed1db01d8b",
  "e6f9fe4c-500c-4a80-a6e2-230d2ed63fb9",
].sort();

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function assert(condition, message) { if (!condition) throw new Error(message); }
async function readIfPresent(file) {
  try { return await readFile(file); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}
async function atomicWrite(file, bytes) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temp, "wx");
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temp, file);
}

async function main() {
  if (process.argv.length !== 2) throw new Error("This reconciliation has no overridable CLI parameters.");
  const lockPath = path.join(RUN_DIR, ".dispatch.lock");
  let lock;
  let lockAcquired = false;
  try { lock = await open(lockPath, "wx"); }
  catch { throw new Error("An active or stale dispatch lock exists; refusing journal reconciliation."); }
  lockAcquired = true;

  let receiptCreated = false;
  let originalJournalBytes;
  try {
    originalJournalBytes = await readFile(JOURNAL);
    assert(sha256(originalJournalBytes) === EXPECTED_JOURNAL_SHA256,
      "The journal changed after the independent review; no reconciliation was made.");
    const journal = JSON.parse(originalJournalBytes.toString("utf8"));
    const unresolved = journal.calls.filter((call) => call.status === "unknown_cost" || call.status === "reserved");
    const oldUnresolved = unresolved.filter((call) => call.callId !== P02_COMPOSITION_NO_DISPATCH_CALL_ID).map((call) => call.callId).sort();
    assert(journal.authorization?.aggregateCapMicrodollars === 3_000_000
      && journal.limits?.perRequestReservationMicrodollars === 300_000
      && journal.limits?.automaticRetries === false
      && journal.settledUpperBoundMicrodollars === 152_189
      && journal.reservedMicrodollars === 1_200_000
      && journal.remainingAuthorizationMicrodollars === 1_647_811
      && unresolved.length === 4
      && JSON.stringify(oldUnresolved) === JSON.stringify(OLD_UNKNOWN_CALL_IDS),
    "The journal is not the exact reviewed $3 authorization state; no reconciliation was made.");

    const call = journal.calls.find((entry) => entry.callId === P02_COMPOSITION_NO_DISPATCH_CALL_ID);
    assert(isConfirmedP02PreDispatchDnsFailure(call),
      "The recorded call does not prove the exact pre-connection DNS failure; no reconciliation was made.");
    assert(call.requestFile === "requests/P02.composition.request.json"
      && call.dispatcherSha256 === P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256
      && call.packetSha256 === P02_COMPOSITION_NO_DISPATCH_PACKET_SHA256
      && call.requestBodySha256 === P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256,
    "The call identity differs from the reviewed P02 request, packet, or dispatcher.");
    assert(!journal.journalCorrections?.some((entry) => entry.correctionType === "no_dispatch_reconciliation"
      && entry.callId === P02_COMPOSITION_NO_DISPATCH_CALL_ID), "This call was already reconciled.");
    assert(await readIfPresent(RECEIPT) === null, "A reconciliation receipt already exists; refusing a second use.");

    const [reviewBytes, preflightBytes, dispatcherBytes] = await Promise.all([
      readFile(REVIEW), readFile(PREFLIGHT), readFile(path.join(RUN_DIR, "scripts", "dispatch-openai-experiment.mjs")),
    ]);
    assert(sha256(reviewBytes) === EXPECTED_REVIEW_SHA256, "The independent transport review changed after it was recorded.");
    assert(sha256(preflightBytes) === EXPECTED_PREFLIGHT_SHA256, "The provider preflight changed after it was recorded.");
    const review = JSON.parse(reviewBytes.toString("utf8"));
    const preflight = JSON.parse(preflightBytes.toString("utf8"));
    assert(review.status === "supports_failed_before_provider_http_dispatch_reconciliation"
      && review.callId === call.callId
      && review.bindings?.journalSnapshotSha256 === sha256(originalJournalBytes)
      && review.bindings?.dispatchImplementationSha256 === P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256
      && review.bindings?.requestFileSha256 === P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256
      && review.observedFailure?.nestedCode === "ENOTFOUND"
      && review.observedFailure?.nestedSyscall === "getaddrinfo"
      && review.observedFailure?.hostname === "api.openai.com"
      && review.observedFailure?.httpStatus === null
      && review.observedFailure?.responseArtifactFound === false
      && review.observedFailure?.usageFound === false
      && review.providerRequestMadeByThisReview === false
      && review.journalChangedByThisReview === false,
    "The independent review does not bind the exact no-dispatch failure currently in the journal.");
    assert(sha256(dispatcherBytes) === P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256,
      "The reviewed dispatcher implementation changed before reconciliation.");
    assert(preflight.schemaVersion === "PATTERNWORK-PWRP71-P02-PROVIDER-CONNECTIVITY-PREFLIGHT-V1"
      && preflight.status === "passed" && preflight.method === "GET"
      && preflight.endpoint === "https://api.openai.com/v1/models"
      && preflight.httpStatus === 200 && preflight.model === "gpt-6-luna"
      && preflight.modelVisible === true && preflight.generationRequests === 0
      && preflight.providerCostMicrodollars === 0 && preflight.apiKeyValueRecorded === false
      && Date.parse(preflight.checkedAt) > Date.parse(call.finishedAt),
    "A successful post-failure zero-cost model preflight is required before reconciliation.");

    const requestBytes = await readFile(path.join(RUN_DIR, ...call.requestFile.split("/")));
    assert(sha256(requestBytes) === call.requestBodySha256,
      "The retained request bytes do not match the request hash in the journal.");
    const absentArtifacts = [
      "responses/P02.composition.response.json",
      "outputs/P02.composition.raw-output.txt",
      "outputs/P02.composition.json",
      "requests/P02.composition.attempt-2.request.json",
      "responses/P02.composition.attempt-2.response.json",
      "outputs/P02.composition.attempt-2.raw-output.txt",
      "outputs/P02.composition.attempt-2.json",
    ];
    for (const relative of absentArtifacts) {
      assert(await readIfPresent(path.join(RUN_DIR, ...relative.split("/"))) === null,
        `Unexpected response or recovery artifact exists: ${relative}`);
    }

    const now = new Date().toISOString();
    const correctionId = randomUUID();
    const before = {
      reservedMicrodollars: journal.reservedMicrodollars,
      settledUpperBoundMicrodollars: journal.settledUpperBoundMicrodollars,
      remainingAuthorizationMicrodollars: journal.remainingAuthorizationMicrodollars,
    };
    const receipt = {
      schemaVersion: "PATTERNWORK-PWRP71-P02-COMPOSITION-NO-DISPATCH-RECONCILIATION-V1",
      status: "failed_before_provider_dispatch",
      reconciliationId: correctionId,
      recordedAt: now,
      diagnosticOnly: true,
      qualificationStatus: "FICTIONAL_DIAGNOSTIC_ONLY_NOT_ROUTING_QUALIFICATION_OR_PRODUCTION_APPROVAL",
      profileId: "P02",
      reportType: "IFS",
      stage: "composition",
      fixtureSet: "route-replays-v5",
      provider: "OpenAI direct API",
      model: "gpt-6-luna",
      callId: call.callId,
      packetSha256: call.packetSha256,
      requestBodySha256: call.requestBodySha256,
      requestFileSha256: sha256(requestBytes),
      dispatcherSha256: call.dispatcherSha256,
      independentReviewFile: "outputs/P02-COMPOSITION-TRANSPORT-REVIEW.json",
      independentReviewFileSha256: sha256(reviewBytes),
      providerPreflightFile: "outputs/P02-COMPOSITION-PROVIDER-PREFLIGHT.json",
      providerPreflightFileSha256: sha256(preflightBytes),
      failure: {
        code: "ENOTFOUND",
        syscall: "getaddrinfo",
        hostname: "api.openai.com",
        elapsedMilliseconds: Date.parse(call.finishedAt) - Date.parse(call.reservationCreatedAt),
        httpStatus: null,
        responseId: null,
        responseArtifactExists: false,
      },
      disposition: {
        providerGenerationRequests: 0,
        generationCostMicrodollars: 0,
        costStatement: "The exact POST failed before provider HTTP dispatch; no generation request reached the provider. No invoice amount is asserted.",
        invoiceAmountAssertion: false,
        releasedReservationMicrodollars: 300_000,
        humanApproval: false,
        routingQualification: false,
        productionApproval: false,
      },
      journalBeforeSha256: sha256(originalJournalBytes),
      budgetBefore: before,
      budgetAfter: {
        reservedMicrodollars: 900_000,
        settledUpperBoundMicrodollars: 152_189,
        remainingAuthorizationMicrodollars: 1_947_811,
      },
    };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");

    call.originalStatus = call.status;
    call.status = "failed_before_provider_dispatch";
    call.reservationMicrodollars = 0;
    call.noDispatchReconciliationFile = RECEIPT_NAME;
    call.noDispatchReconciliationFileSha256 = sha256(receiptBytes);
    call.noDispatchReconciliationId = correctionId;
    journal.reservedMicrodollars -= 300_000;
    journal.remainingAuthorizationMicrodollars = MICRODOLLARS * 3
      - journal.settledUpperBoundMicrodollars - journal.reservedMicrodollars;
    journal.journalCorrections ??= [];
    journal.journalCorrections.push({
      correctionId,
      correctionType: "no_dispatch_reconciliation",
      recordedAt: now,
      callId: call.callId,
      previousStatus: "unknown_cost",
      correctedStatus: "failed_before_provider_dispatch",
      previousReservationMicrodollars: 300_000,
      correctedReservationMicrodollars: 0,
      receiptFile: RECEIPT_NAME,
      receiptFileSha256: sha256(receiptBytes),
      journalBeforeSha256: receipt.journalBeforeSha256,
      before,
      after: receipt.budgetAfter,
      reason: "The exact ENOTFOUND/getaddrinfo failure occurred before provider HTTP dispatch; independent source review, current journal/request/dispatcher pins, absent response artifacts, and a later zero-generation authenticated model-list GET were verified.",
      monetaryInvoiceAssertion: false,
    });
    assert(journal.reservedMicrodollars === 900_000
      && journal.settledUpperBoundMicrodollars === 152_189
      && journal.remainingAuthorizationMicrodollars === 1_947_811,
    "Reconciliation would produce unexpected aggregate budget counters.");

    await atomicWrite(RECEIPT, receiptBytes);
    receiptCreated = true;
    try { await atomicWrite(JOURNAL, Buffer.from(`${JSON.stringify(journal, null, 2)}\n`, "utf8")); }
    catch (writeError) {
      await atomicWrite(JOURNAL, originalJournalBytes);
      await unlink(RECEIPT);
      receiptCreated = false;
      throw writeError;
    }
    console.log(JSON.stringify({
      status: receipt.status,
      callId: call.callId,
      providerGenerationRequests: 0,
      releasedReservationMicrodollars: 300_000,
      retainedUnknownCostReservationsMicrodollars: 900_000,
      settledUpperBoundMicrodollars: 152_189,
      remainingAuthorizationMicrodollars: 1_947_811,
      receipt: RECEIPT_NAME,
    }, null, 2));
  } catch (error) {
    if (receiptCreated && originalJournalBytes) {
      const current = await readIfPresent(JOURNAL);
      if (current && sha256(current) === EXPECTED_JOURNAL_SHA256) await unlink(RECEIPT).catch(() => {});
    }
    throw error;
  } finally {
    await lock?.close().catch(() => {});
    if (lockAcquired) await unlink(lockPath).catch(() => {});
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
