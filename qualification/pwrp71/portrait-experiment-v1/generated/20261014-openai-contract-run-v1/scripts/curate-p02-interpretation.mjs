import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  P02_CALL_ID, P02_CURATION_RECEIPT, P02_CURATED_OUTPUT, P02_EXPERIMENT_SHA256,
  P02_PACKET_SHA256, P02_PARENT_HASHES, P02_RESPONSE_ID, deriveP02CuratedGraph,
  sha256, verifyP02ParentHashes,
} from "./p02-curation-policy.mjs";

const runDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const absolute = (relative) => path.join(runDir, ...relative.split("/"));
const parse = (bytes) => JSON.parse(bytes.toString("utf8"));

async function absent(file) {
  try { await access(absolute(file)); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new Error(`Curated artifact already exists; refusing overwrite: ${file}`);
}

async function main() {
  await Promise.all([absent(P02_CURATED_OUTPUT), absent(P02_CURATION_RECEIPT)]);
  const parentBytes = Object.fromEntries(await Promise.all(Object.keys(P02_PARENT_HASHES)
    .map(async (file) => [file, await readFile(absolute(file))])));
  verifyP02ParentHashes(parentBytes);
  const journal = parse(await readFile(absolute("BUDGET_JOURNAL.json")));
  const call = journal.calls?.find((row) => row.callId === P02_CALL_ID);
  const prepared = parse(parentBytes["prepared/P02.interpretation.input.json"]);
  const sourceIndex = parse(parentBytes["outputs/P02.source-observation-index-v3.json"]);
  const providerOutput = parse(parentBytes["outputs/P02.interpretation.attempt-5.json"]);
  const request = parse(parentBytes["requests/P02.interpretation.attempt-5.request.json"]);
  const response = parse(parentBytes["responses/P02.interpretation.attempt-5.response.json"]);
  const originalValidation = parse(parentBytes["outputs/P02.interpretation.attempt-5.validation.json"]);
  const sourceRecheck = parse(parentBytes["outputs/P02.interpretation.attempt-5.validation.source-recheck.json"]);
  if (call?.status !== "completed" || call.stage !== "interpretation" || call.profile !== "P02"
    || call.attemptNumber !== 5 || call.responseStatus !== 200 || call.responseStatusValue !== "completed"
    || call.responseId !== P02_RESPONSE_ID || call.responseFile !== "responses/P02.interpretation.attempt-5.response.json"
    || call.parsedOutputFile !== "outputs/P02.interpretation.attempt-5.json"
    || call.parsedOutputSha256 !== sha256(JSON.stringify(providerOutput))
    || call.packetSha256 !== P02_PACKET_SHA256 || call.experimentSha256 !== P02_EXPERIMENT_SHA256
    || call.requestBodySha256 !== P02_PARENT_HASHES["requests/P02.interpretation.attempt-5.request.json"]
    || request.model !== "gpt-6-luna" || request.reasoning?.effort !== "max"
    || response.id !== P02_RESPONSE_ID || response.status !== "completed" || response.model !== "gpt-6-luna"
    || originalValidation.status !== "source_reference_checks_failed"
    || sourceRecheck.status !== "source_reference_checks_failed"
    || originalValidation.modelOutputFileSha256 !== P02_PARENT_HASHES["outputs/P02.interpretation.attempt-5.json"]
    || sourceRecheck.modelOutputFileSha256 !== P02_PARENT_HASHES["outputs/P02.interpretation.attempt-5.json"]
    || sourceRecheck.sourceObservationIndexFileSha256 !== P02_PARENT_HASHES["outputs/P02.source-observation-index-v3.json"]
    || prepared.packetSha256 !== P02_PACKET_SHA256 || prepared.experimentSha256 !== P02_EXPERIMENT_SHA256) {
    throw new Error("P02 curation parent does not match exact completed attempt 5 and failed validation.");
  }
  const curated = deriveP02CuratedGraph(providerOutput, sourceIndex, prepared);
  const outputBytes = Buffer.from(`${JSON.stringify(curated.value, null, 2)}\n`, "utf8");
  const receipt = {
    schemaVersion: "PATTERNWORK-PWRP71-P02-CONSTRAINED-EVIDENCE-CORRECTION-V1",
    status: "source_validation_and_independent_review_required",
    profileId: "P02",
    reportType: "IFS",
    fixtureSet: "route-replays-v5",
    packetSha256: P02_PACKET_SHA256,
    experimentSha256: P02_EXPERIMENT_SHA256,
    sourceIdentity: prepared.sourceIdentity,
    provider: "OpenAI direct API",
    model: call.returnedModel,
    reasoningEffort: call.reasoningEffort,
    providerCallId: P02_CALL_ID,
    providerResponseId: P02_RESPONSE_ID,
    requestFile: "requests/P02.interpretation.attempt-5.request.json",
    requestFileSha256: P02_PARENT_HASHES["requests/P02.interpretation.attempt-5.request.json"],
    providerResponseFile: "responses/P02.interpretation.attempt-5.response.json",
    providerResponseFileSha256: P02_PARENT_HASHES["responses/P02.interpretation.attempt-5.response.json"],
    providerRawOutputFile: "outputs/P02.interpretation.attempt-5.raw-output.txt",
    providerRawOutputFileSha256: P02_PARENT_HASHES["outputs/P02.interpretation.attempt-5.raw-output.txt"],
    providerOutputFile: "outputs/P02.interpretation.attempt-5.json",
    providerOutputFileSha256: P02_PARENT_HASHES["outputs/P02.interpretation.attempt-5.json"],
    providerOutputCompactSha256: sha256(JSON.stringify(providerOutput)),
    originalValidationFile: "outputs/P02.interpretation.attempt-5.validation.json",
    originalValidationFileSha256: P02_PARENT_HASHES["outputs/P02.interpretation.attempt-5.validation.json"],
    validationParentFile: "outputs/P02.interpretation.attempt-5.validation.source-recheck.json",
    validationParentFileSha256: P02_PARENT_HASHES["outputs/P02.interpretation.attempt-5.validation.source-recheck.json"],
    preparedInputFile: "prepared/P02.interpretation.input.json",
    preparedInputFileSha256: P02_PARENT_HASHES["prepared/P02.interpretation.input.json"],
    sourceObservationIndexFile: "outputs/P02.source-observation-index-v3.json",
    sourceObservationIndexFileSha256: P02_PARENT_HASHES["outputs/P02.source-observation-index-v3.json"],
    curatedOutputFile: P02_CURATED_OUTPUT,
    curatedOutputFileSha256: sha256(outputBytes),
    curatedOutputCompactSha256: sha256(JSON.stringify(curated.value)),
    curationPolicy: curated.policy,
    exactEvidenceCorrections: curated.edits,
    omittedRecordIds: curated.removed,
    limitations: curated.limitations,
    rawPreservationHashes: Object.fromEntries(Object.entries(P02_PARENT_HASHES)
      .filter(([file]) => file.includes("attempt-5") && !file.includes("request"))),
    interpretation: "Experimental constrained evidence-correction derivative. The completed provider output and failed validation receipts remain unchanged and rejected. This artifact is not source validated, human approved, routing qualified, or released.",
  };
  await writeFile(absolute(P02_CURATED_OUTPUT), outputBytes, { flag: "wx" });
  await writeFile(absolute(P02_CURATION_RECEIPT), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  const afterBytes = Object.fromEntries(await Promise.all(Object.keys(P02_PARENT_HASHES)
    .map(async (file) => [file, await readFile(absolute(file))])));
  verifyP02ParentHashes(afterBytes);
  console.log(JSON.stringify({ status: receipt.status, curatedOutputFile: P02_CURATED_OUTPUT,
    curatedOutputFileSha256: receipt.curatedOutputFileSha256, receiptFile: P02_CURATION_RECEIPT,
    rawParentHashesUnchanged: true }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
