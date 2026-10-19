import { createHash } from "node:crypto";

export const P02_COMPOSITION_NO_DISPATCH_CALL_ID = "c1a9db49-3d79-4f4a-bfd4-f7eb962c5329";
export const P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256 = "952e7c4588a2b88b8eb740dcc44c192071874c6d6203cea052753d51b103447b";
export const P02_COMPOSITION_NO_DISPATCH_PACKET_SHA256 = "a28c19101cb596fca4e395806793944cc5135fc1b619a450161e3e9dcac8d497";
export const P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256 = "98b0358969b6c626fd21f54b15de1cd3299724c9b836ffcd63a507a2d728b742";

export function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function isConfirmedP02PreDispatchDnsFailure(call) {
  if (!call || call.callId !== P02_COMPOSITION_NO_DISPATCH_CALL_ID || call.status !== "unknown_cost"
    || call.profile !== "P02" || call.reportType !== "IFS" || call.stage !== "composition"
    || call.attemptNumber !== 1 || call.diagnosticType !== "FICTIONAL_P02_C10_IFS_EXPERIMENT"
    || call.qualificationStatus !== "FICTIONAL_DIAGNOSTIC_ONLY_NOT_ROUTING_QUALIFICATION_OR_PRODUCTION_APPROVAL"
    || call.provider !== "OpenAI direct API" || call.endpoint !== "https://api.openai.com/v1/responses"
    || call.model !== "gpt-6-luna" || call.reasoningEffort !== "max" || call.serviceTier !== "default"
    || call.packetSha256 !== P02_COMPOSITION_NO_DISPATCH_PACKET_SHA256
    || call.requestBodySha256 !== P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256
    || call.dispatcherSha256 !== P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256
    || call.maxOutputTokens !== 128_000 || call.quotedReservationUpperBoundMicrodollars !== 102_223
    || call.reservationMicrodollars !== 300_000 || call.responseStatus !== null
    || call.responseId != null || call.responseFile != null || call.responseStatusValue != null
    || call.usage != null || call.outputTextFile != null || call.parsedOutputFile != null) return false;

  const chain = call.transportErrorDetails?.causeChain;
  if (call.transportError !== "fetch failed"
    || call.transportErrorDetails?.schemaVersion !== "PATTERNWORK-TRANSPORT-ERROR-DETAILS-V1"
    || !Array.isArray(chain) || chain.length !== 2
    || chain[0]?.name !== "TypeError" || chain[0]?.message !== "fetch failed"
    || chain[1]?.name !== "Error" || chain[1]?.message !== "getaddrinfo ENOTFOUND api.openai.com"
    || chain[1]?.code !== "ENOTFOUND" || chain[1]?.syscall !== "getaddrinfo"
    || chain[1]?.hostname !== "api.openai.com" || chain[1]?.address != null || chain[1]?.port != null) return false;

  const started = Date.parse(call.reservationCreatedAt);
  const finished = Date.parse(call.finishedAt);
  return Number.isFinite(started) && Number.isFinite(finished) && finished >= started && finished - started <= 1_000;
}

export function isReconciledP02PreDispatchDnsFailure(call, receipt, receiptBytes, correction) {
  const original = call && { ...call, status: call.originalStatus, reservationMicrodollars: 300_000 };
  return isConfirmedP02PreDispatchDnsFailure(original)
    && call.status === "failed_before_provider_dispatch" && call.reservationMicrodollars === 0
    && call.noDispatchReconciliationFile === "P02-COMPOSITION-NO-DISPATCH-RECONCILIATION.json"
    && call.noDispatchReconciliationFileSha256 === sha256(receiptBytes)
    && call.noDispatchReconciliationId === receipt?.reconciliationId
    && receipt?.schemaVersion === "PATTERNWORK-PWRP71-P02-COMPOSITION-NO-DISPATCH-RECONCILIATION-V1"
    && receipt?.status === "failed_before_provider_dispatch"
    && receipt?.callId === P02_COMPOSITION_NO_DISPATCH_CALL_ID
    && receipt?.requestBodySha256 === P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256
    && receipt?.packetSha256 === P02_COMPOSITION_NO_DISPATCH_PACKET_SHA256
    && receipt?.failure?.code === "ENOTFOUND" && receipt?.failure?.syscall === "getaddrinfo"
    && receipt?.failure?.hostname === "api.openai.com" && receipt?.failure?.httpStatus === null
    && receipt?.failure?.responseArtifactExists === false
    && receipt?.disposition?.providerGenerationRequests === 0
    && receipt?.disposition?.generationCostMicrodollars === 0
    && receipt?.disposition?.humanApproval === false
    && receipt?.disposition?.routingQualification === false
    && receipt?.disposition?.productionApproval === false
    && correction?.correctionType === "no_dispatch_reconciliation"
    && correction?.correctionId === receipt.reconciliationId
    && correction?.callId === P02_COMPOSITION_NO_DISPATCH_CALL_ID
    && correction?.receiptFileSha256 === sha256(receiptBytes)
    && correction?.correctedStatus === "failed_before_provider_dispatch"
    && correction?.correctedReservationMicrodollars === 0;
}
