import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  C10_CURATION_RECEIPT, C10_CURATED_FROZEN, C10_CURATED_OUTPUT, C10_CURATED_REVIEW,
  C10_CURATED_REVIEW_TEXT, C10_CURATED_VALIDATION, C10_PROVIDER_OUTPUT,
} from "./c10-curation-policy.mjs";
import {
  P02_CURATION_RECEIPT, P02_CURATED_OUTPUT, P02_PARENT_HASHES, P02_CALL_ID, P02_RESPONSE_ID,
  verifyP02ParentHashes,
} from "./p02-curation-policy.mjs";

const runDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pins = {
  experimentSha256: "eecb94ff118569ff44288fc81333aa42d0dee6dd868b514e02d3f0e09b47db33",
  packets: {
    P02: "a28c19101cb596fca4e395806793944cc5135fc1b619a450161e3e9dcac8d497",
    C10: "109ad81a85793f0f114351e42e7f2f4f62e927a80a76e23b0afee4e112b87cb3",
  },
};
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}
async function readJson(file) { return JSON.parse(await readFile(file, "utf8")); }

async function main() {
  const profile = process.argv[2];
  const curatedC10 = process.argv.includes("--curated");
  const curatedP02 = process.argv.includes("--curated-p02-v1");
  const curated = curatedC10 || curatedP02;
  const args = process.argv.slice(3).filter((arg) => arg !== "--curated" && arg !== "--curated-p02-v1");
  const attemptArgument = args[0];
  if (!["P02", "C10"].includes(profile)) throw new Error("Only P02 or C10 can be frozen.");
  if (curatedC10 && (profile !== "C10" || curatedP02 || args.length !== 0)) throw new Error("--curated is limited to the exact C10 omission-only derivative.");
  if (curatedP02 && (profile !== "P02" || curatedC10 || args.length !== 2 || attemptArgument !== "--attempt" || Number(args[1]) !== 5)) throw new Error("--curated-p02-v1 is limited to the exact P02 attempt-5 evidence-correction derivative.");
  if (attemptArgument !== undefined && (attemptArgument !== "--attempt" || args.length !== 2)) throw new Error("Optional syntax is --attempt <positive integer>, --curated, and --curated-p02-v1.");
  const attemptNumber = attemptArgument === undefined ? 1 : Number(args[1]);
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) throw new Error("Attempt number must be a positive integer.");
  const suffix = attemptNumber > 1 ? `.attempt-${attemptNumber}` : "";
  const outputRelative = curatedC10 ? C10_CURATED_OUTPUT : curatedP02 ? "outputs/P02.interpretation.curated-v1.json" : `outputs/${profile}.interpretation${suffix}.json`;
  const outputPath = path.join(runDir, outputRelative);
  const outputBytes = await readFile(outputPath);
  const output = JSON.parse(outputBytes.toString("utf8"));
  const validationRelative = curatedC10 ? C10_CURATED_VALIDATION : curatedP02 ? "outputs/P02.interpretation.attempt-5.validation.p02-curated-v1.json" : `outputs/${profile}.interpretation${suffix}.validation.json`;
  const reviewRelative = curatedC10 ? C10_CURATED_REVIEW : curatedP02 ? "outputs/P02.interpretation.curated-v1.sol-review.json" : `outputs/${profile}.interpretation${suffix}.sol-review.json`;
  const reviewTextRelative = curatedC10 ? C10_CURATED_REVIEW_TEXT : curatedP02 ? "outputs/P02.interpretation.curated-v1.sol-review.md" : `outputs/${profile}.interpretation${suffix}.sol-review.md`;
  const validationPath = path.join(runDir, ...validationRelative.split("/"));
  const reviewPath = path.join(runDir, ...reviewRelative.split("/"));
  const validationBytes = await readFile(validationPath);
  const reviewBytes = await readFile(reviewPath);
  const validation = JSON.parse(validationBytes.toString("utf8"));
  const review = JSON.parse(reviewBytes.toString("utf8"));
  const prepared = await readJson(path.join(runDir, "prepared", `${profile}.interpretation.input.json`));
  const curationRelative = curatedC10 ? C10_CURATION_RECEIPT : P02_CURATION_RECEIPT;
  const curationPath = path.join(runDir, ...curationRelative.split("/"));
  const curationBytes = curated ? await readFile(curationPath) : null;
  const curation = curationBytes ? JSON.parse(curationBytes.toString("utf8")) : null;
  const sourceIndexRelative = curatedP02 ? "outputs/P02.source-observation-index-v3.json" : "outputs/C10.source-observation-index-v3.json";
  const compactOutputSha256 = sha256(JSON.stringify(output));
  const graph = {
    claims: output.claims,
    name_registry: output.name_registry,
    relationships: output.relationships,
    priority_claim_ids: output.priority_claim_ids,
    observed_strengths: output.observed_strengths,
    counterexamples: output.counterexamples,
    open_questions: output.open_questions,
  };
  const outputSha256 = sha256(outputBytes);
  const expectedBinding = (receipt) => receipt.profileId === profile
    && receipt.attemptNumber === attemptNumber
    && receipt.packetSha256 === pins.packets[profile]
    && receipt.experimentSha256 === pins.experimentSha256
    && canonical(receipt.sourceIdentity) === canonical(prepared.sourceIdentity)
    && receipt.modelOutputFile === outputRelative
    && receipt.modelOutputFileSha256 === outputSha256
    && receipt.modelOutputCompactSha256 === compactOutputSha256;
  const p02Bindings = review.bindings ?? {};
  const curatedReviewBinding = curatedC10
    ? review.status === "accepted_for_composition"
      && review.reviewerType === "independent_sol_model_review"
      && review.humanApproval === false && review.routingQualification === false && review.reportApproval === false
      && review.profileId === profile && review.reportType === "IFS"
      && review.packetSha256 === pins.packets[profile] && review.experimentSha256 === pins.experimentSha256
      && canonical(review.sourceIdentity) === canonical(prepared.sourceIdentity)
      && review.artifacts?.curatedOutputFile === outputRelative
      && review.artifacts?.curatedOutputFileSha256 === outputSha256
      && review.artifacts?.curationReceiptFileSha256 === sha256(curationBytes)
      && review.artifacts?.sourceValidationFileSha256 === sha256(validationBytes)
      && review.artifacts?.reviewTextFile === reviewTextRelative
    : curatedP02
      ? review.verdict === "accepted_for_composition"
        && review.reviewType === "fresh_read_only_subagent_model_review"
        && review.humanApproval === false && review.routingQualification === false && review.reportApproval === false
        && review.profileId === "P02" && review.stage === "interpretation_before_composition"
        && p02Bindings.derivativeFile === outputRelative && p02Bindings.derivativeSha256 === outputSha256
        && p02Bindings.curationReceiptFile === curationRelative && p02Bindings.curationReceiptSha256 === sha256(curationBytes)
        && p02Bindings.sourceValidationReceiptFile === validationRelative && p02Bindings.sourceValidationReceiptSha256 === sha256(validationBytes)
        && p02Bindings.sourceObservationIndexFile === "outputs/P02.source-observation-index-v3.json"
        && p02Bindings.sourceObservationIndexSha256 === curation.sourceObservationIndexFileSha256
        && p02Bindings.packetSha256 === pins.packets.P02 && p02Bindings.fixtureSet === "route-replays-v5"
        && p02Bindings.providerCallId === P02_CALL_ID && p02Bindings.providerResponseId === P02_RESPONSE_ID
        && Array.isArray(review.concreteIssues) && review.concreteIssues.length === 0
      : false;
  if (curatedC10) {
    const providerBytes = await readFile(path.join(runDir, ...C10_PROVIDER_OUTPUT.split("/")));
    const providerResponseBytes = await readFile(path.join(runDir, "responses", "C10.interpretation.response.json"));
    const journalBytes = await readFile(path.join(runDir, "BUDGET_JOURNAL.json"));
    const correction = await readJson(path.join(runDir, "outputs", "C10-JOURNAL-METADATA-CORRECTION.json"));
    const journal = JSON.parse(journalBytes.toString("utf8"));
    const providerCall = journal.calls.find((call) => call.callId === curation.providerCallId);
    const sourceIndexBytes = await readFile(path.join(runDir, ...sourceIndexRelative.split("/")));
    if (curation?.schemaVersion !== "PATTERNWORK-PWRP71-C10-OMISSION-ONLY-CURATION-V1"
      || curation.profileId !== "C10" || curation.packetSha256 !== pins.packets.C10
      || curation.experimentSha256 !== pins.experimentSha256
      || canonical(curation.sourceIdentity) !== canonical(prepared.sourceIdentity)
      || curation.curatedOutputFile !== outputRelative || curation.curatedOutputFileSha256 !== outputSha256
      || curation.providerOutputFile !== C10_PROVIDER_OUTPUT
      || curation.providerOutputFileSha256 !== sha256(providerBytes)
      || curation.providerResponseFileSha256 !== sha256(providerResponseBytes)
      || providerCall?.status !== "completed" || providerCall?.responseId !== curation.providerResponseId
      || providerCall?.parsedOutputSha256 !== curation.providerOutputCompactSha256
      || correction.callId !== providerCall.callId || correction.monetaryCountersChanged !== false
      || curation.journalFileSha256 !== correction.journalFileBeforeSha256
      || correction.journalFileAfterSha256 !== sha256(journalBytes)
      || curation.sourceObservationIndexFileSha256 !== sha256(sourceIndexBytes)
      || !curation.guarantees?.providerOutputNotMutated
      || !curation.guarantees?.retainedClaimTextAndEvidenceSequenceReferencesCopiedVerbatim
      || !curation.guarantees?.danglingDependenciesToOmittedClaimsPrunedAndRecorded) {
      throw new Error("C10 derivative curation receipt does not bind to the exact preserved provider output and current pins.");
    }
  }
  if (curatedP02) {
    const parentEntries = await Promise.all(Object.keys(P02_PARENT_HASHES).map(async (relative) =>
      [relative, await readFile(path.join(runDir, ...relative.split("/")))]));
    const parentBytes = Object.fromEntries(parentEntries);
    verifyP02ParentHashes(parentBytes);
    const journalBytes = await readFile(path.join(runDir, "BUDGET_JOURNAL.json"));
    const journal = JSON.parse(journalBytes.toString("utf8"));
    const providerCall = journal.calls.find((call) => call.callId === P02_CALL_ID);
    const originalValidation = JSON.parse(parentBytes["outputs/P02.interpretation.attempt-5.validation.json"].toString("utf8"));
    const sourceRecheck = JSON.parse(parentBytes["outputs/P02.interpretation.attempt-5.validation.source-recheck.json"].toString("utf8"));
    const sourceIndexBytes = parentBytes[sourceIndexRelative];
    const providerResponseBytes = parentBytes["responses/P02.interpretation.attempt-5.response.json"];
    const providerBytes = parentBytes["outputs/P02.interpretation.attempt-5.json"];
    if (curation?.schemaVersion !== "PATTERNWORK-PWRP71-P02-CONSTRAINED-EVIDENCE-CORRECTION-V1"
      || curation.status !== "source_validation_and_independent_review_required"
      || curation.profileId !== "P02" || curation.packetSha256 !== pins.packets.P02
      || curation.experimentSha256 !== pins.experimentSha256
      || canonical(curation.sourceIdentity) !== canonical(prepared.sourceIdentity)
      || curation.providerCallId !== P02_CALL_ID || curation.providerResponseId !== P02_RESPONSE_ID
      || curation.providerOutputFile !== "outputs/P02.interpretation.attempt-5.json"
      || curation.providerOutputFileSha256 !== sha256(providerBytes)
      || curation.providerResponseFileSha256 !== sha256(providerResponseBytes)
      || curation.sourceObservationIndexFile !== sourceIndexRelative
      || curation.sourceObservationIndexFileSha256 !== sha256(sourceIndexBytes)
      || curation.curatedOutputFile !== outputRelative || curation.curatedOutputFileSha256 !== outputSha256
      || providerCall?.status !== "completed" || providerCall?.responseId !== P02_RESPONSE_ID
      || providerCall?.responseFile !== curation.providerResponseFile
      || providerCall?.parsedOutputSha256 !== curation.providerOutputCompactSha256
      || originalValidation.status !== "source_reference_checks_failed"
      || sourceRecheck.status !== "source_reference_checks_failed"
      || curation.validationParentFile !== "outputs/P02.interpretation.attempt-5.validation.source-recheck.json"
      || curation.validationParentFileSha256 !== sha256(parentBytes["outputs/P02.interpretation.attempt-5.validation.source-recheck.json"])
      || curation.curationPolicy !== "constrained_p02_authored_evidence_correction_v1"
      || !Array.isArray(curation.exactEvidenceCorrections) || !Array.isArray(curation.omittedRecordIds?.claims)) {
      throw new Error("P02 constrained-evidence derivative receipt does not bind to the exact preserved provider output and current source pins.");
    }
  }
  if (prepared.profileId !== profile || prepared.packetSha256 !== pins.packets[profile]
    || prepared.experimentSha256 !== pins.experimentSha256
    || !expectedBinding(validation) || validation.status !== "source_reference_checks_passed"
    || (curated ? !curatedReviewBinding
      : (!expectedBinding(review) || review.status !== "accepted_for_composition"
        || review.reviewType !== "model_review_not_human_approval" || !review.reviewTextFileSha256))) {
    throw new Error("Cannot freeze: source validation and accepted Sol review do not bind to this exact interpretation attempt.");
  }
  const reviewTextPath = path.join(runDir, ...reviewTextRelative.split("/"));
  const reviewTextBytes = await readFile(reviewTextPath);
  const reviewTextSha256 = curatedC10 ? review.artifacts?.reviewTextSha256
    : curatedP02 ? sha256(reviewTextBytes) : review.reviewTextFileSha256;
  if (sha256(reviewTextBytes) !== reviewTextSha256) throw new Error("Sol review text hash does not match its receipt.");
  const frozen = {
    schemaVersion: "PATTERNWORK-PWRP71-FROZEN-INTERPRETATION-V1",
    status: "source_checked_and_reviewed_for_composition",
    profileId: profile,
    attemptNumber,
    packetSha256: pins.packets[profile],
    experimentSha256: pins.experimentSha256,
    sourceIdentity: prepared.sourceIdentity,
    modelOutputFile: outputRelative,
    modelOutputFileSha256: outputSha256,
    modelOutputCompactSha256: compactOutputSha256,
    ...(curated ? {
      derivativeKind: curatedC10 ? "omission_only_experimental_curation" : "source_evidence_correction_and_omission",
      curationReceiptFile: curationRelative,
      curationReceiptFileSha256: sha256(curationBytes),
      parentProviderOutputFile: curatedC10 ? C10_PROVIDER_OUTPUT : "outputs/P02.interpretation.attempt-5.json",
      parentProviderOutputFileSha256: curation.providerOutputFileSha256,
      ...(curatedP02 ? { independentReviewFile: reviewRelative, independentReviewFileSha256: sha256(reviewBytes),
        independentReviewTextFile: reviewTextRelative, independentReviewTextFileSha256: reviewTextSha256 } : {}),
    } : {}),
    graphCompactSha256: sha256(JSON.stringify(graph)),
    validationReceiptFileSha256: sha256(validationBytes),
    solReviewReceiptFileSha256: sha256(reviewBytes),
    claims: output.claims,
    name_registry: output.name_registry,
    relationships: output.relationships,
    priority_claim_ids: output.priority_claim_ids,
    observed_strengths: output.observed_strengths,
    counterexamples: output.counterexamples,
    open_questions: output.open_questions,
  };
  const frozenRelative = curatedC10 ? C10_CURATED_FROZEN : curatedP02 ? "outputs/P02.interpretation.curated-v1.frozen.json" : `outputs/${profile}.interpretation${suffix}.frozen.json`;
  const frozenPath = path.join(runDir, ...frozenRelative.split("/"));
  await writeFile(frozenPath, `${JSON.stringify(frozen, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: frozen.status, profileId: profile, attemptNumber, modelOutputFile: outputRelative, frozenPath: path.relative(runDir, frozenPath).replaceAll("\\", "/"), modelOutputCompactSha256: compactOutputSha256 }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
