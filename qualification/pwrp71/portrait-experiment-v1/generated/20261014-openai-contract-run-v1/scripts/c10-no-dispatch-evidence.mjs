import { createHash } from "node:crypto";

export const C10_NO_DISPATCH_CALL_ID = "b901a349-96e4-4751-8a91-cf995647dc9a";
export const C10_NO_DISPATCH_REQUEST_SHA256 = "7f101eb0a1c5294d65496c912e6c86832d3aaa9cd70148d7f32c054d22370e59";
export const C10_NO_DISPATCH_PACKET_SHA256 = "109ad81a85793f0f114351e42e7f2f4f62e927a80a76e23b0afee4e112b87cb3";
export const C10_NO_DISPATCH_DISPATCHER_SHA256 = "6c73dc4b4a069a08d5f4c53629c0add3b0ec02c054ff63fa25694b945256d64b";

export function isConfirmedC10PreDispatchDnsFailure(call) {
  if (!call || call.callId !== C10_NO_DISPATCH_CALL_ID || call.status !== "unknown_cost"
    || call.profile !== "C10" || call.reportType !== "IFS" || call.stage !== "composition"
    || call.attemptNumber !== 1 || call.provider !== "OpenAI direct API"
    || call.endpoint !== "https://api.openai.com/v1/responses" || call.model !== "gpt-6-luna"
    || call.reasoningEffort !== "max" || call.serviceTier !== "default"
    || call.packetSha256 !== C10_NO_DISPATCH_PACKET_SHA256
    || call.requestBodySha256 !== C10_NO_DISPATCH_REQUEST_SHA256
    || call.dispatcherSha256 !== C10_NO_DISPATCH_DISPATCHER_SHA256
    || call.maxOutputTokens !== 12_000 || call.quotedReservationUpperBoundMicrodollars !== 19_034
    || call.reservationMicrodollars !== 300_000 || call.responseStatus !== null
    || call.responseId != null || call.responseFile != null || call.responseStatusValue != null
    || call.usage != null || call.outputTextFile != null || call.parsedOutputFile != null) return false;

  const chain = call.transportErrorDetails?.causeChain;
  if (call.transportError !== "fetch failed" || call.transportErrorDetails?.schemaVersion !== "PATTERNWORK-TRANSPORT-ERROR-DETAILS-V1"
    || !Array.isArray(chain) || chain.length !== 2
    || chain[0]?.name !== "TypeError" || chain[0]?.message !== "fetch failed"
    || chain[1]?.name !== "Error" || chain[1]?.message !== "getaddrinfo ENOTFOUND api.openai.com"
    || chain[1]?.code !== "ENOTFOUND" || chain[1]?.syscall !== "getaddrinfo"
    || chain[1]?.hostname !== "api.openai.com" || chain[1]?.address != null || chain[1]?.port != null) return false;

  const started = Date.parse(call.reservationCreatedAt);
  const finished = Date.parse(call.finishedAt);
  return Number.isFinite(started) && Number.isFinite(finished) && finished >= started && finished - started <= 1_000;
}

export function isReconciledC10PreDispatchDnsFailure(call, receipt, receiptBytes, correction) {
  const originalRecord = call && {
    ...call,
    status: call.originalStatus,
    reservationMicrodollars: 300_000,
  };
  return isConfirmedC10PreDispatchDnsFailure(originalRecord)
    && call.status === "failed_before_provider_dispatch"
    && call.reservationMicrodollars === 0
    && call.noDispatchReconciliationFile === "C10-COMPOSITION-NO-DISPATCH-RECONCILIATION.json"
    && call.noDispatchReconciliationFileSha256 === sha256(receiptBytes)
    && call.noDispatchReconciliationId === receipt?.reconciliationId
    && receipt?.schemaVersion === "PATTERNWORK-C10-COMPOSITION-NO-DISPATCH-RECONCILIATION-V1"
    && receipt?.status === "failed_before_provider_dispatch"
    && receipt?.callId === C10_NO_DISPATCH_CALL_ID
    && receipt?.requestBodySha256 === C10_NO_DISPATCH_REQUEST_SHA256
    && receipt?.packetSha256 === C10_NO_DISPATCH_PACKET_SHA256
    && receipt?.failure?.code === "ENOTFOUND"
    && receipt?.failure?.syscall === "getaddrinfo"
    && receipt?.failure?.hostname === "api.openai.com"
    && receipt?.failure?.httpStatus === null
    && receipt?.failure?.responseArtifactExists === false
    && receipt?.disposition?.providerGenerationRequests === 0
    && receipt?.disposition?.generationCostMicrodollars === 0
    && receipt?.disposition?.humanApproval === false
    && receipt?.disposition?.routingQualification === false
    && receipt?.disposition?.productionApproval === false
    && correction?.correctionType === "no_dispatch_reconciliation"
    && correction?.correctionId === receipt.reconciliationId
    && correction?.callId === C10_NO_DISPATCH_CALL_ID
    && correction?.receiptFileSha256 === sha256(receiptBytes)
    && correction?.correctedStatus === "failed_before_provider_dispatch"
    && correction?.correctedReservationMicrodollars === 0;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

