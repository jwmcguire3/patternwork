import assert from "node:assert/strict";
import test from "node:test";
import {
  P02_COMPOSITION_NO_DISPATCH_CALL_ID, P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256,
  P02_COMPOSITION_NO_DISPATCH_PACKET_SHA256, P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256,
  isConfirmedP02PreDispatchDnsFailure, isReconciledP02PreDispatchDnsFailure, sha256,
} from "./p02-no-dispatch-evidence.mjs";

function call() {
  return {
    callId: P02_COMPOSITION_NO_DISPATCH_CALL_ID, status: "unknown_cost", profile: "P02", reportType: "IFS",
    stage: "composition", attemptNumber: 1, diagnosticType: "FICTIONAL_P02_C10_IFS_EXPERIMENT",
    qualificationStatus: "FICTIONAL_DIAGNOSTIC_ONLY_NOT_ROUTING_QUALIFICATION_OR_PRODUCTION_APPROVAL",
    provider: "OpenAI direct API", endpoint: "https://api.openai.com/v1/responses", model: "gpt-6-luna",
    reasoningEffort: "max", serviceTier: "default", packetSha256: P02_COMPOSITION_NO_DISPATCH_PACKET_SHA256,
    requestBodySha256: P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256,
    dispatcherSha256: P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256,
    maxOutputTokens: 128_000, quotedReservationUpperBoundMicrodollars: 102_223,
    reservationMicrodollars: 300_000, responseStatus: null, responseId: null, responseFile: null,
    responseStatusValue: null, usage: null, outputTextFile: null, parsedOutputFile: null,
    transportError: "fetch failed", transportErrorDetails: { schemaVersion: "PATTERNWORK-TRANSPORT-ERROR-DETAILS-V1",
      causeChain: [
        { name: "TypeError", message: "fetch failed", code: null, syscall: null, hostname: null },
        { name: "Error", message: "getaddrinfo ENOTFOUND api.openai.com", code: "ENOTFOUND", syscall: "getaddrinfo", hostname: "api.openai.com" },
      ] },
    reservationCreatedAt: "2026-10-15T15:10:52.044Z", finishedAt: "2026-10-15T15:10:52.115Z",
  };
}

test("accepts only the exact P02 pre-HTTP DNS failure record", () => {
  assert.equal(isConfirmedP02PreDispatchDnsFailure(call()), true);
});

test("rejects changed request pins, an HTTP response, or a slower ambiguous failure", () => {
  for (const mutate of [
    (row) => { row.requestBodySha256 = "f".repeat(64); },
    (row) => { row.maxOutputTokens = 16_000; },
    (row) => { row.responseStatus = 200; },
    (row) => { row.responseFile = "responses/P02.composition.response.json"; },
    (row) => { row.finishedAt = "2026-10-15T15:10:54.115Z"; },
    (row) => { row.transportErrorDetails.causeChain[1].code = "ECONNRESET"; },
  ]) {
    const row = call(); mutate(row);
    assert.equal(isConfirmedP02PreDispatchDnsFailure(row), false);
  }
});

test("reconciled receipt and journal correction must bind the exact failed call", () => {
  const original = call();
  const bytes = Buffer.from(JSON.stringify({ reconciliationId: "recon-1" }));
  const receipt = {
    schemaVersion: "PATTERNWORK-PWRP71-P02-COMPOSITION-NO-DISPATCH-RECONCILIATION-V1",
    status: "failed_before_provider_dispatch", reconciliationId: "recon-1",
    callId: P02_COMPOSITION_NO_DISPATCH_CALL_ID,
    requestBodySha256: P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256,
    packetSha256: P02_COMPOSITION_NO_DISPATCH_PACKET_SHA256,
    failure: { code: "ENOTFOUND", syscall: "getaddrinfo", hostname: "api.openai.com", httpStatus: null, responseArtifactExists: false },
    disposition: { providerGenerationRequests: 0, generationCostMicrodollars: 0, humanApproval: false, routingQualification: false, productionApproval: false },
  };
  const correction = {
    correctionType: "no_dispatch_reconciliation", correctionId: "recon-1",
    callId: P02_COMPOSITION_NO_DISPATCH_CALL_ID, receiptFileSha256: sha256(bytes),
    correctedStatus: "failed_before_provider_dispatch", correctedReservationMicrodollars: 0,
  };
  const reconciled = { ...original, originalStatus: "unknown_cost", status: "failed_before_provider_dispatch",
    reservationMicrodollars: 0, noDispatchReconciliationFile: "P02-COMPOSITION-NO-DISPATCH-RECONCILIATION.json",
    noDispatchReconciliationFileSha256: sha256(bytes), noDispatchReconciliationId: "recon-1" };
  assert.equal(isReconciledP02PreDispatchDnsFailure(reconciled, receipt, bytes, correction), true);
  assert.equal(isReconciledP02PreDispatchDnsFailure(reconciled, receipt, Buffer.from("{}"), correction), false);
});
