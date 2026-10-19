import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { isConfirmedC10PreDispatchDnsFailure, isReconciledC10PreDispatchDnsFailure } from "./c10-no-dispatch-evidence.mjs";

const exactCall = {
  callId: "b901a349-96e4-4751-8a91-cf995647dc9a",
  status: "unknown_cost",
  profile: "C10",
  reportType: "IFS",
  stage: "composition",
  attemptNumber: 1,
  provider: "OpenAI direct API",
  endpoint: "https://api.openai.com/v1/responses",
  model: "gpt-6-luna",
  reasoningEffort: "max",
  serviceTier: "default",
  packetSha256: "109ad81a85793f0f114351e42e7f2f4f62e927a80a76e23b0afee4e112b87cb3",
  requestBodySha256: "7f101eb0a1c5294d65496c912e6c86832d3aaa9cd70148d7f32c054d22370e59",
  dispatcherSha256: "6c73dc4b4a069a08d5f4c53629c0add3b0ec02c054ff63fa25694b945256d64b",
  maxOutputTokens: 12000,
  quotedReservationUpperBoundMicrodollars: 19034,
  reservationMicrodollars: 300000,
  responseStatus: null,
  transportError: "fetch failed",
  reservationCreatedAt: "2026-10-15T14:22:09.679Z",
  finishedAt: "2026-10-15T14:22:09.695Z",
  transportErrorDetails: {
    schemaVersion: "PATTERNWORK-TRANSPORT-ERROR-DETAILS-V1",
    causeChain: [
      { name: "TypeError", message: "fetch failed", code: null },
      { name: "Error", message: "getaddrinfo ENOTFOUND api.openai.com", code: "ENOTFOUND", syscall: "getaddrinfo", hostname: "api.openai.com", address: null, port: null },
    ],
  },
};

test("recognizes only the exact short pre-connection C10 DNS failure", () => {
  assert.equal(isConfirmedC10PreDispatchDnsFailure(exactCall), true);
});

test("accepts the reconciled record only when receipt and journal correction hashes bind", () => {
  const receipt = {
    schemaVersion: "PATTERNWORK-C10-COMPOSITION-NO-DISPATCH-RECONCILIATION-V1",
    status: "failed_before_provider_dispatch",
    reconciliationId: "reconcile-1",
    callId: exactCall.callId,
    requestBodySha256: exactCall.requestBodySha256,
    packetSha256: exactCall.packetSha256,
    failure: { code: "ENOTFOUND", syscall: "getaddrinfo", hostname: "api.openai.com", httpStatus: null, responseArtifactExists: false },
    disposition: { providerGenerationRequests: 0, generationCostMicrodollars: 0, humanApproval: false, routingQualification: false, productionApproval: false },
  };
  const receiptBytes = Buffer.from(JSON.stringify(receipt));
  const digest = createHash("sha256").update(receiptBytes).digest("hex");
  const call = { ...exactCall, status: "failed_before_provider_dispatch", originalStatus: "unknown_cost", reservationMicrodollars: 0,
    noDispatchReconciliationFile: "C10-COMPOSITION-NO-DISPATCH-RECONCILIATION.json", noDispatchReconciliationFileSha256: digest,
    noDispatchReconciliationId: receipt.reconciliationId };
  const correction = { correctionType: "no_dispatch_reconciliation", correctionId: receipt.reconciliationId,
    callId: exactCall.callId, receiptFileSha256: digest, correctedStatus: "failed_before_provider_dispatch", correctedReservationMicrodollars: 0 };
  assert.equal(isReconciledC10PreDispatchDnsFailure(call, receipt, receiptBytes, correction), true);
  assert.equal(isReconciledC10PreDispatchDnsFailure(call, receipt, receiptBytes, { ...correction, receiptFileSha256: "0".repeat(64) }), false);
});

for (const [label, change] of [
  ["wrong call", { callId: "another-call" }],
  ["wrong profile", { profile: "C03" }],
  ["wrong stage", { stage: "interpretation" }],
  ["different packet", { packetSha256: "0".repeat(64) }],
  ["different request", { requestBodySha256: "0".repeat(64) }],
  ["different dispatcher", { dispatcherSha256: "0".repeat(64) }],
  ["response exists", { responseId: "resp_present" }],
  ["usage exists", { usage: { input_tokens: 1, output_tokens: 1 } }],
  ["HTTP response exists", { responseStatus: 200 }],
  ["not DNS failure", { transportErrorDetails: { ...exactCall.transportErrorDetails, causeChain: [{}, { code: "UND_ERR_HEADERS_TIMEOUT" }] } }],
  ["long ambiguous outcome", { finishedAt: "2026-10-15T14:27:09.695Z" }],
]) {
  test(`rejects reconciliation for ${label}`, () => {
    assert.equal(isConfirmedC10PreDispatchDnsFailure({ ...exactCall, ...change }), false);
  });
}
