import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  C10_CURATION_RECEIPT, C10_CURATED_OUTPUT, C10_PROVIDER_CALL_ID, C10_PROVIDER_OUTPUT,
  C10_PROVIDER_RESPONSE, deriveC10CuratedGraph, sha256,
} from "./c10-curation-policy.mjs";

const runDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedPacket = "109ad81a85793f0f114351e42e7f2f4f62e927a80a76e23b0afee4e112b87cb3";
const experimentSha256 = "eecb94ff118569ff44288fc81333aa42d0dee6dd868b514e02d3f0e09b47db33";
async function read(relative) { return readFile(path.join(runDir, ...relative.split("/"))); }
async function json(relative) { return JSON.parse((await read(relative)).toString("utf8")); }

async function main() {
  const [providerBytes, responseBytes, sourceIndexBytes, journalBytes, initialValidationBytes, preparedBytes] = await Promise.all([
    read(C10_PROVIDER_OUTPUT), read(C10_PROVIDER_RESPONSE), read("outputs/C10.source-observation-index-v3.json"),
    read("BUDGET_JOURNAL.json"), read("outputs/C10.interpretation.validation.json"), read("prepared/C10.interpretation.input.json"),
  ]);
  const [providerOutput, response, sourceIndex, journal, initialValidation, prepared] = [
    providerBytes, responseBytes, sourceIndexBytes, journalBytes, initialValidationBytes, preparedBytes,
  ].map((bytes) => JSON.parse(bytes.toString("utf8")));
  const call = journal.calls?.find((row) => row.callId === C10_PROVIDER_CALL_ID);
  const packetSha256 = sourceIndex.packetSha256;
  if (packetSha256 !== expectedPacket || sourceIndex.profileId !== "C10"
    || sourceIndex.status !== "source_cross_checked_fictional_evidence" || sourceIndex.fixtureSet !== "route-replays-v5"
    || call?.status !== "completed" || call.responseStatus !== 200 || call.responseStatusValue !== "completed"
    || call.returnedModel !== "gpt-6-luna" || call.reasoningEffort !== "max"
    || call.parsedOutputFile !== C10_PROVIDER_OUTPUT || call.responseFile !== C10_PROVIDER_RESPONSE
    || call.parsedOutputSha256 !== sha256(JSON.stringify(providerOutput)) || response.id !== call.responseId
    || response.status !== "completed" || response.model !== "gpt-6-luna"
    || initialValidation.status !== "source_reference_checks_failed"
    || initialValidation.modelOutputFileSha256 !== sha256(providerBytes)) {
    throw new Error("C10 curation parent must match the exact completed provider response, packet, journal call, and failed original validation.");
  }
  const curated = deriveC10CuratedGraph(providerOutput, sourceIndex);
  const curatedBytes = Buffer.from(`${JSON.stringify(curated.value, null, 2)}\n`, "utf8");
  const outputPath = path.join(runDir, ...C10_CURATED_OUTPUT.split("/"));
  await writeFile(outputPath, curatedBytes, { flag: "wx" });
  const receipt = {
    schemaVersion: "PATTERNWORK-PWRP71-C10-OMISSION-ONLY-CURATION-V1",
    status: "source_validation_and_independent_review_required",
    profileId: "C10",
    reportType: "IFS",
    fixtureSet: "route-replays-v5",
    packetSha256,
    experimentSha256,
    sourceIdentity: prepared.sourceIdentity,
    provider: "OpenAI direct API",
    model: call.returnedModel,
    reasoningEffort: call.reasoningEffort,
    providerCallId: call.callId,
    providerResponseId: call.responseId,
    providerOutputFile: C10_PROVIDER_OUTPUT,
    providerOutputFileSha256: sha256(providerBytes),
    providerOutputCompactSha256: sha256(JSON.stringify(providerOutput)),
    providerResponseFile: C10_PROVIDER_RESPONSE,
    providerResponseFileSha256: sha256(responseBytes),
    journalFile: "BUDGET_JOURNAL.json",
    journalFileSha256: sha256(journalBytes),
    originalValidationFile: "outputs/C10.interpretation.validation.json",
    originalValidationFileSha256: sha256(initialValidationBytes),
    sourceObservationIndexFile: "outputs/C10.source-observation-index-v3.json",
    sourceObservationIndexFileSha256: sha256(sourceIndexBytes),
    curatedOutputFile: C10_CURATED_OUTPUT,
    curatedOutputFileSha256: sha256(curatedBytes),
    curatedOutputCompactSha256: sha256(JSON.stringify(curated.value)),
    curationPolicy: curated.policy,
    guarantees: curated.guarantees,
    omittedRecords: curated.removals,
    interpretation: "Experimental derivative only. The raw provider output remains preserved and rejected. This derivative does not qualify routing, grant human approval, or authorize production use.",
  };
  await writeFile(path.join(runDir, ...C10_CURATION_RECEIPT.split("/")), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  const [providerAfter, responseAfter] = await Promise.all([read(C10_PROVIDER_OUTPUT), read(C10_PROVIDER_RESPONSE)]);
  if (sha256(providerAfter) !== sha256(providerBytes) || sha256(responseAfter) !== sha256(responseBytes)) {
    throw new Error("Curation modified the retained original provider artifacts.");
  }
  console.log(JSON.stringify({ status: receipt.status, curatedOutputFile: C10_CURATED_OUTPUT,
    curatedOutputSha256: receipt.curatedOutputFileSha256, providerOutputUnchanged: true,
    omittedRecords: receipt.omittedRecords.map(({ collection, originalIndex, recordId, reason }) => ({ collection, originalIndex, recordId, reason })),
    receiptFile: C10_CURATION_RECEIPT }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
