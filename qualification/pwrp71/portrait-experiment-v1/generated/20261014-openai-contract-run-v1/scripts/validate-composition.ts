import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPwrp71SourcePackage } from "../../../../../../lib/server/reports/pwrp71-source.ts";
import { validatePwrp71ReportDraft } from "../../../../../../lib/server/reports/pwrp71-validation.ts";
import type { JsonObject } from "../../../../../../lib/question-engine/types.ts";
import { normalizeCompositionForPwrp71 } from "./composition-normalization.mjs";

type JsonRecord = Record<string, unknown>;
type JournalCall = JsonRecord & {
  profile?: string;
  stage?: string;
  status?: string;
  attemptNumber?: number;
  parsedOutputFile?: string;
};

const RUN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.cwd();
const PACKETS: Record<string, string> = {
  P02: "a28c19101cb596fca4e395806793944cc5135fc1b619a450161e3e9dcac8d497",
  C10: "109ad81a85793f0f114351e42e7f2f4f62e927a80a76e23b0afee4e112b87cb3",
};
function sha(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
function asRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return value as JsonRecord;
}
async function json<T>(file: string): Promise<T> { return JSON.parse(await readFile(file, "utf8")) as T; }
function writeNew(file: string, value: unknown): Promise<void> { return writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }); }

function providerOutput(response: JsonRecord): string {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  return output.flatMap((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return [];
    const content = (item as JsonRecord).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (part === null || typeof part !== "object" || Array.isArray(part)) return [];
      const row = part as JsonRecord;
      return row.type === "output_text" && typeof row.text === "string" ? [row.text] : [];
    });
  }).join("\n");
}

async function main(): Promise<void> {
  const profile = process.argv[2];
  if (profile !== "P02" && profile !== "C10") throw new Error("Only P02 or C10 can be validated.");
  let compositionAttempt = 1;
  let curatedDerivative = false;
  let curatedP02Derivative = false;
  let p02SchemaProjectionV3 = false;
  for (let index = 3; index < process.argv.length; index += 1) {
    const option = process.argv[index];
    if (option === "--curated-v2" && !curatedDerivative) curatedDerivative = true;
    else if (option === "--curated-p02-v1" && !curatedP02Derivative) curatedP02Derivative = true;
    else if (option === "--p02-schema-projection-v3" && !p02SchemaProjectionV3) p02SchemaProjectionV3 = true;
    else if (option === "--attempt" && !Number.isNaN(Number(process.argv[index + 1]))) compositionAttempt = Number(process.argv[++index]);
    else throw new Error("Optional syntax is --attempt <positive integer>, --curated-v2, --curated-p02-v1, or --p02-schema-projection-v3.");
  }
  if (curatedDerivative && (profile !== "C10" || curatedP02Derivative)) throw new Error("--curated-v2 is limited to the C10 omission-only derivative.");
  if (curatedP02Derivative && (profile !== "P02" || curatedDerivative)) throw new Error("--curated-p02-v1 is limited to the P02 evidence-correction derivative.");
  if (p02SchemaProjectionV3 && (profile !== "P02" || !curatedP02Derivative || curatedDerivative || compositionAttempt !== 2)) {
    throw new Error("--p02-schema-projection-v3 is limited to the curated P02 composition attempt 2.");
  }
  if (!Number.isSafeInteger(compositionAttempt) || compositionAttempt < 1) throw new Error("Attempt number must be a positive integer.");
  const compositionSuffix = compositionAttempt > 1 ? `.attempt-${compositionAttempt}` : "";
  const resultSuffix = `${compositionSuffix}${p02SchemaProjectionV3 ? ".schema-projection-v3" : ""}`;
  const compositionRelative = `outputs/${profile}.composition${compositionSuffix}.json`;
  const compositionPath = path.join(RUN_DIR, ...compositionRelative.split("/"));
  const compositionBytes = await readFile(compositionPath);
  const composition = asRecord(JSON.parse(compositionBytes.toString("utf8")), "Composition output");
  const prepared = asRecord(await json<unknown>(path.join(RUN_DIR, "prepared", `${profile}.interpretation.input.json`)), "Prepared input");
  const journal = asRecord(await json<unknown>(path.join(RUN_DIR, "BUDGET_JOURNAL.json")), "Budget journal");
  const calls = Array.isArray(journal.calls) ? journal.calls as JournalCall[] : [];
  const compositionCall = calls.find((call) => call.profile === profile && call.stage === "composition"
    && call.status === "completed" && (call.attemptNumber ?? 1) === compositionAttempt);
  const interpretationCall = calls
    .filter((call) => call.profile === profile && call.stage === "interpretation" && call.status === "completed" && call.parsedOutputFile)
    .sort((left, right) => (right.attemptNumber ?? 1) - (left.attemptNumber ?? 1))[0];
  if (!compositionCall || !interpretationCall) throw new Error("Exact completed interpretation and composition provider calls are required.");

  const interpretationAttempt = interpretationCall.attemptNumber ?? 1;
  const interpretationSuffix = interpretationAttempt > 1 ? `.attempt-${interpretationAttempt}` : "";
  const providerInterpretationRelative = `outputs/${profile}.interpretation${interpretationSuffix}.json`;
  const interpretationRelative = curatedDerivative ? "outputs/C10.interpretation.curated-v2.json"
    : curatedP02Derivative ? "outputs/P02.interpretation.curated-v1.json" : providerInterpretationRelative;
  const frozenRelative = curatedDerivative ? "outputs/C10.interpretation.curated-v2.frozen.json"
    : curatedP02Derivative ? "outputs/P02.interpretation.curated-v1.frozen.json" : `outputs/${profile}.interpretation${interpretationSuffix}.frozen.json`;
  if (interpretationCall.parsedOutputFile !== providerInterpretationRelative || compositionCall.parsedOutputFile !== compositionRelative
    || interpretationCall.responseStatus !== 200 || interpretationCall.responseStatusValue !== "completed"
    || interpretationCall.returnedModel !== "gpt-6-luna" || interpretationCall.returnedServiceTier !== "default"
    || interpretationCall.packetSha256 !== PACKETS[profile] || compositionCall.responseStatus !== 200
    || compositionCall.responseStatusValue !== "completed" || compositionCall.returnedModel !== "gpt-6-luna"
    || compositionCall.returnedServiceTier !== "default" || compositionCall.packetSha256 !== PACKETS[profile]) {
    throw new Error("Journal calls must be completed OpenAI responses for the exact profile, stage, packet, and attempt.");
  }

  const providerInterpretationBytes = await readFile(path.join(RUN_DIR, ...providerInterpretationRelative.split("/")));
  const providerInterpretation = asRecord(JSON.parse(providerInterpretationBytes.toString("utf8")), "Raw provider interpretation");
  const interpretationPath = path.join(RUN_DIR, ...interpretationRelative.split("/"));
  const interpretationBytes = curatedDerivative || curatedP02Derivative ? await readFile(interpretationPath) : providerInterpretationBytes;
  const interpretation = asRecord(JSON.parse(interpretationBytes.toString("utf8")), "Interpretation graph");
  const compactInterpretationSha256 = sha(Buffer.from(JSON.stringify(interpretation), "utf8"));
  const compositionCompactSha256 = sha(Buffer.from(JSON.stringify(composition), "utf8"));
  if (interpretationCall.parsedOutputSha256 !== sha(Buffer.from(JSON.stringify(providerInterpretation), "utf8"))
    || compositionCall.parsedOutputSha256 !== compositionCompactSha256) {
    throw new Error("Provider output files do not match their journaled compact hashes.");
  }

  const responseFiles = [interpretationCall, compositionCall].map((call) => call.responseFile);
  const responseBodies: JsonRecord[] = [];
  for (let index = 0; index < responseFiles.length; index += 1) {
    const relative = responseFiles[index];
    if (typeof relative !== "string" || !relative.startsWith("responses/")) throw new Error("A provider response file is missing from the journal.");
    const response = asRecord(await json<unknown>(path.join(RUN_DIR, ...relative.split("/"))), "Provider response");
    const call = index === 0 ? interpretationCall : compositionCall;
    if (response.id !== call.responseId || response.model !== "gpt-6-luna" || response.service_tier !== "default"
      || response.status !== "completed") throw new Error("Raw provider response identity does not match its completed journal call.");
    responseBodies.push(response);
  }
  const responseInterpretation = JSON.parse(providerOutput(responseBodies[0])) as unknown;
  const responseComposition = JSON.parse(providerOutput(responseBodies[1])) as unknown;
  if (canonical(responseInterpretation) !== canonical(providerInterpretation) || canonical(responseComposition) !== canonical(composition)) {
    throw new Error("Parsed provider outputs differ from their retained raw Responses API bodies.");
  }

  const validationRelative = curatedDerivative ? "outputs/C10.interpretation.validation.curated-v2.json"
    : curatedP02Derivative ? "outputs/P02.interpretation.attempt-5.validation.p02-curated-v1.json" : `outputs/${profile}.interpretation${interpretationSuffix}.validation.json`;
  const reviewRelative = curatedDerivative ? "outputs/C10.interpretation.sol-review.curated-v2.json"
    : curatedP02Derivative ? "outputs/P02.interpretation.curated-v1.sol-review.json" : `outputs/${profile}.interpretation${interpretationSuffix}.sol-review.json`;
  const reviewTextRelative = curatedDerivative ? "outputs/C10.interpretation.sol-review.curated-v2.md"
    : curatedP02Derivative ? "outputs/P02.interpretation.curated-v1.sol-review.md" : `outputs/${profile}.interpretation${interpretationSuffix}.sol-review.md`;
  const validationPath = path.join(RUN_DIR, ...validationRelative.split("/"));
  const reviewPath = path.join(RUN_DIR, ...reviewRelative.split("/"));
  const reviewTextPath = path.join(RUN_DIR, ...reviewTextRelative.split("/"));
  const frozenPath = path.join(RUN_DIR, ...frozenRelative.split("/"));
  const [validationBytes, reviewBytes, reviewTextBytes, frozenBytes] = await Promise.all([
    readFile(validationPath), readFile(reviewPath), readFile(reviewTextPath), readFile(frozenPath),
  ]);
  const validation = asRecord(JSON.parse(validationBytes.toString("utf8")), "Interpretation validation receipt");
  const review = asRecord(JSON.parse(reviewBytes.toString("utf8")), "Interpretation Sol review receipt");
  const frozen = asRecord(JSON.parse(frozenBytes.toString("utf8")), "Frozen interpretation");
  const sourceIdentity = prepared.sourceIdentity;
  let curationBytes: Uint8Array | null = null;
  let curation: JsonRecord | null = null;
  if (curatedDerivative || curatedP02Derivative) {
    const curationRelative = curatedDerivative ? "outputs/C10.interpretation.curated-v2.derivation.json" : "outputs/P02.interpretation.curated-v1.derivation.json";
    curationBytes = await readFile(path.join(RUN_DIR, ...curationRelative.split("/")));
    curation = asRecord(JSON.parse(Buffer.from(curationBytes).toString("utf8")), "Interpretation derivation receipt");
    if (curatedDerivative) {
    const correctionBytes = await readFile(path.join(RUN_DIR, "outputs", "C10-JOURNAL-METADATA-CORRECTION.json"));
    const correction = asRecord(JSON.parse(correctionBytes.toString("utf8")), "C10 journal correction");
    const currentJournal = asRecord(await json<unknown>(path.join(RUN_DIR, "BUDGET_JOURNAL.json")), "Budget journal");
    const journalCorrections = Array.isArray(currentJournal.journalCorrections) ? currentJournal.journalCorrections : [];
    const recordedCorrection = journalCorrections.find((entry) => entry !== null && typeof entry === "object"
      && !Array.isArray(entry) && (entry as JsonRecord).correctionId === correction.correctionId);
    const recordedCorrectionProjection = { ...correction };
    delete recordedCorrectionProjection.journalFileAfterSha256;
    const providerOutputBytes = await readFile(path.join(RUN_DIR, "outputs", "C10.interpretation.json"));
    if (curation.schemaVersion !== "PATTERNWORK-PWRP71-C10-OMISSION-ONLY-CURATION-V1"
      || curation.profileId !== "C10" || curation.packetSha256 !== PACKETS.C10
      || curation.experimentSha256 !== prepared.experimentSha256
      || curation.curatedOutputFile !== interpretationRelative || curation.curatedOutputFileSha256 !== sha(interpretationBytes)
      || curation.providerOutputFile !== providerInterpretationRelative
      || curation.providerOutputFileSha256 !== sha(providerOutputBytes)
      || curation.providerCallId !== interpretationCall.callId
      || curation.journalFileSha256 !== correction.journalFileBeforeSha256
      || !recordedCorrection || canonical(recordedCorrection) !== canonical(recordedCorrectionProjection)
      || correction.callId !== interpretationCall.callId || correction.monetaryCountersChanged !== false) {
      throw new Error("C10 derivative receipt does not bind to the exact provider parent and append-only recorded journal metadata correction.");
    }
    } else {
      const sourceIndexBytes = await readFile(path.join(RUN_DIR, "outputs", "P02.source-observation-index-v3.json"));
      const rejectedValidationBytes = await readFile(path.join(RUN_DIR, "outputs", "P02.interpretation.attempt-5.validation.source-recheck.json"));
      const rejectedValidation = asRecord(JSON.parse(Buffer.from(rejectedValidationBytes).toString("utf8")), "Rejected P02 parent validation");
      const rawProviderBytes = await readFile(path.join(RUN_DIR, ...providerInterpretationRelative.split("/")));
      const providerResponseBytes = await readFile(path.join(RUN_DIR, "responses", "P02.interpretation.attempt-5.response.json"));
      const originalValidationBytes = await readFile(path.join(RUN_DIR, "outputs", "P02.interpretation.attempt-5.validation.json"));
      const originalValidation = asRecord(JSON.parse(originalValidationBytes.toString("utf8")), "Original P02 validation");
      const rawHashes = asRecord(curation.rawPreservationHashes, "P02 raw preservation hashes");
      const omittedRecordIds = asRecord(curation.omittedRecordIds, "P02 omitted record IDs");
      if (curation.schemaVersion !== "PATTERNWORK-PWRP71-P02-CONSTRAINED-EVIDENCE-CORRECTION-V1"
        || curation.curationPolicy !== "constrained_p02_authored_evidence_correction_v1"
        || curation.status !== "source_validation_and_independent_review_required"
        || curation.profileId !== "P02" || curation.packetSha256 !== PACKETS.P02
        || curation.experimentSha256 !== prepared.experimentSha256
        || curation.sourceIdentity === undefined || canonical(curation.sourceIdentity) !== canonical(sourceIdentity)
        || curation.curatedOutputFile !== interpretationRelative || curation.curatedOutputFileSha256 !== sha(interpretationBytes)
        || curation.providerOutputFile !== providerInterpretationRelative || curation.providerOutputFileSha256 !== sha(rawProviderBytes)
        || curation.providerResponseFile !== "responses/P02.interpretation.attempt-5.response.json"
        || curation.providerResponseFileSha256 !== sha(providerResponseBytes)
        || curation.providerCallId !== interpretationCall.callId
        || curation.providerResponseId !== interpretationCall.responseId
        || curation.validationParentFile !== "outputs/P02.interpretation.attempt-5.validation.source-recheck.json"
        || curation.validationParentFileSha256 !== sha(rejectedValidationBytes)
        || rejectedValidation.status !== "source_reference_checks_failed"
        || rejectedValidation.modelOutputFileSha256 !== sha(rawProviderBytes)
        || originalValidation.status !== "source_reference_checks_failed"
        || curation.sourceObservationIndexFile !== "outputs/P02.source-observation-index-v3.json"
        || curation.sourceObservationIndexFileSha256 !== sha(sourceIndexBytes)
        || rawHashes["responses/P02.interpretation.attempt-5.response.json"] !== sha(providerResponseBytes)
        || rawHashes["outputs/P02.interpretation.attempt-5.json"] !== sha(rawProviderBytes)
        || rawHashes["outputs/P02.interpretation.attempt-5.validation.json"] !== sha(originalValidationBytes)
        || !Array.isArray(curation.exactEvidenceCorrections) || !Array.isArray(omittedRecordIds.claims)) {
        throw new Error("P02 derivative receipt does not bind to its exact rejected provider parent, current source index, packet, and source identity.");
      }
    }
  }
  const graph = {
    claims: interpretation.claims,
    name_registry: interpretation.name_registry,
    relationships: interpretation.relationships,
    priority_claim_ids: interpretation.priority_claim_ids,
    observed_strengths: interpretation.observed_strengths,
    counterexamples: interpretation.counterexamples,
    open_questions: interpretation.open_questions,
  };
  const outputSha256 = sha(interpretationBytes);
  const expectedReceiptBinding = (receipt: JsonRecord): boolean => receipt.profileId === profile
    && receipt.attemptNumber === interpretationAttempt && receipt.packetSha256 === PACKETS[profile]
    && receipt.experimentSha256 === prepared.experimentSha256
    && canonical(receipt.sourceIdentity) === canonical(sourceIdentity)
    && receipt.modelOutputFile === interpretationRelative
    && receipt.modelOutputFileSha256 === outputSha256
    && receipt.modelOutputCompactSha256 === compactInterpretationSha256;
  const reviewArtifacts = review.artifacts as JsonRecord | undefined;
  const reviewBindings = review.bindings as JsonRecord | undefined;
  const independentCuratedReviewBinding = curatedDerivative && curation
    ? review.status === "accepted_for_composition"
      && review.reviewerType === "independent_sol_model_review"
      && review.humanApproval === false && review.routingQualification === false && review.reportApproval === false
      && review.profileId === profile && review.reportType === "IFS"
      && review.packetSha256 === PACKETS[profile] && review.experimentSha256 === prepared.experimentSha256
      && canonical(review.sourceIdentity) === canonical(sourceIdentity)
      && reviewArtifacts?.curatedOutputFile === interpretationRelative
      && reviewArtifacts?.curatedOutputFileSha256 === outputSha256
      && reviewArtifacts?.curationReceiptFileSha256 === (curationBytes ? sha(curationBytes) : null)
      && reviewArtifacts?.sourceValidationFileSha256 === sha(validationBytes)
      && reviewArtifacts?.reviewTextFile === reviewTextRelative
      && typeof reviewArtifacts?.reviewTextSha256 === "string"
      && sha(reviewTextBytes) === reviewArtifacts.reviewTextSha256
    : curatedP02Derivative && curation
      ? review.verdict === "accepted_for_composition"
        && review.reviewType === "fresh_read_only_subagent_model_review"
        && review.humanApproval === false && review.routingQualification === false && review.reportApproval === false
        && review.profileId === "P02" && review.stage === "interpretation_before_composition"
        && reviewBindings?.derivativeFile === interpretationRelative && reviewBindings.derivativeSha256 === outputSha256
        && reviewBindings?.curationReceiptFile === "outputs/P02.interpretation.curated-v1.derivation.json"
        && reviewBindings.curationReceiptSha256 === (curationBytes ? sha(curationBytes) : null)
        && reviewBindings?.sourceValidationReceiptFile === validationRelative
        && reviewBindings.sourceValidationReceiptSha256 === sha(validationBytes)
        && reviewBindings?.sourceObservationIndexFile === "outputs/P02.source-observation-index-v3.json"
        && reviewBindings.sourceObservationIndexSha256 === curation.sourceObservationIndexFileSha256
        && reviewBindings?.packetSha256 === PACKETS.P02 && reviewBindings.fixtureSet === "route-replays-v5"
        && reviewBindings?.providerCallId === interpretationCall.callId
        && reviewBindings.providerResponseId === interpretationCall.responseId
        && Array.isArray(review.concreteIssues) && review.concreteIssues.length === 0
        && typeof frozen.independentReviewTextFileSha256 === "string"
        && sha(reviewTextBytes) === frozen.independentReviewTextFileSha256
        && frozen.independentReviewFile === reviewRelative && frozen.independentReviewFileSha256 === sha(reviewBytes)
      : false;
  if (prepared.profileId !== profile || prepared.packetSha256 !== PACKETS[profile]
    || prepared.experimentSha256 !== "eecb94ff118569ff44288fc81333aa42d0dee6dd868b514e02d3f0e09b47db33"
    || prepared.sourceIdentity === undefined || (prepared.evidencePacket as JsonObject).content_sha256 !== PACKETS[profile]
    || validation.status !== "source_reference_checks_passed" || !expectedReceiptBinding(validation)
    || validation.modelOutputFileSha256 !== outputSha256
    || (curatedDerivative || curatedP02Derivative ? !independentCuratedReviewBinding
      : review.status !== "accepted_for_composition" || review.reviewType !== "model_review_not_human_approval"
        || !expectedReceiptBinding(review) || review.modelOutputFileSha256 !== outputSha256
        || typeof review.reviewTextFileSha256 !== "string" || sha(reviewTextBytes) !== review.reviewTextFileSha256)
    || frozen.status !== "source_checked_and_reviewed_for_composition" || frozen.profileId !== profile
    || frozen.attemptNumber !== interpretationAttempt || frozen.packetSha256 !== PACKETS[profile]
    || frozen.experimentSha256 !== prepared.experimentSha256 || canonical(frozen.sourceIdentity) !== canonical(sourceIdentity)
    || frozen.modelOutputFile !== interpretationRelative || frozen.modelOutputFileSha256 !== outputSha256
    || frozen.modelOutputCompactSha256 !== compactInterpretationSha256
    || ((curatedDerivative || curatedP02Derivative) && (frozen.derivativeKind !== (curatedDerivative ? "omission_only_experimental_curation" : "source_evidence_correction_and_omission")
      || frozen.curationReceiptFile !== (curatedDerivative ? "outputs/C10.interpretation.curated-v2.derivation.json" : "outputs/P02.interpretation.curated-v1.derivation.json")
      || frozen.curationReceiptFileSha256 !== (curationBytes ? sha(curationBytes) : null)
      || frozen.parentProviderOutputFile !== providerInterpretationRelative
      || frozen.parentProviderOutputFileSha256 !== (curation?.providerOutputFileSha256 ?? null)))
    || frozen.graphCompactSha256 !== sha(Buffer.from(JSON.stringify(graph), "utf8"))
    || canonical({ claims: frozen.claims, name_registry: frozen.name_registry, relationships: frozen.relationships,
      priority_claim_ids: frozen.priority_claim_ids, observed_strengths: frozen.observed_strengths,
      counterexamples: frozen.counterexamples, open_questions: frozen.open_questions }) !== canonical(graph)
    || frozen.validationReceiptFileSha256 !== sha(validationBytes)
    || frozen.solReviewReceiptFileSha256 !== sha(reviewBytes)) {
    throw new Error("Interpretation must have an exact current output, accepted source/Sol receipts, and unmodified frozen graph before composition validation.");
  }

  const packet = prepared.evidencePacket as JsonObject;
  const packetRecord = packet as JsonRecord;
  const packetContent = Object.fromEntries(Object.entries(packetRecord).filter(([key]) => key !== "content_sha256"));
  if (packetRecord.content_sha256 !== PACKETS[profile]
    || sha(Buffer.from(canonical(packetContent), "utf8")) !== PACKETS[profile]) {
    throw new Error("Prepared packet content does not match the fixed profile digest.");
  }
  const reportSource = await loadPwrp71SourcePackage(ROOT);
  // This projection is a reviewed, versioned repair for the C10 intermediate
  // graph only. Keep the pre-existing P02 path as a passthrough so this C10
  // repair cannot silently change another profile's evidence semantics.
  const normalization = profile === "C10" || curatedP02Derivative
    ? normalizeCompositionForPwrp71({
      profile,
      composition,
      interpretation,
      schema: reportSource.schemas.reportDraft,
      packetSha256: PACKETS[profile],
      compositionSha256: sha(compositionBytes),
      interpretationSha256: sha(interpretationBytes),
    })
    : {
      claims: interpretation.claims,
      nameRegistry: undefined,
      relationships: undefined,
      reflectionQuestions: composition.reflection_questions,
      contentStatus: composition.content_status,
      receipt: {
        schemaVersion: "PATTERNWORK-PWRP71-COMPOSITION-NORMALIZATION-NOT-APPLIED-V1",
        status: "legacy_passthrough",
        profileId: profile,
        providerOutputUnmodified: true,
        interpretationGraphUnmodified: true,
      },
    };
  const normalizationRelative = `outputs/${profile}.composition${resultSuffix}.normalization.json`;
  const normalizationBytes = Buffer.from(`${JSON.stringify(normalization.receipt, null, 2)}\n`, "utf8");
  await writeNew(path.join(RUN_DIR, ...normalizationRelative.split("/")), normalization.receipt);
  const draft = {
    report_release: (prepared.sourceIdentity as JsonRecord).reportRelease,
    release_id: packetRecord.release_id,
    snapshot_id: packetRecord.snapshot_id,
    evidence_sha256: PACKETS[profile],
    report_type: "IFS",
    title: composition.title,
    title_claim_ids: composition.title_claim_ids,
    content_status: normalization.contentStatus,
    sections: composition.sections,
    claims: normalization.claims,
    name_registry: normalization.nameRegistry ?? frozen.name_registry,
    relationships: normalization.relationships ?? frozen.relationships,
    reflection_questions: normalization.reflectionQuestions,
  } as JsonObject;
  const result = validatePwrp71ReportDraft({ value: draft, reportType: "IFS", snapshotId: String(packetRecord.snapshot_id), packet, source: reportSource });
  const draftRelative = `outputs/${profile}.report-draft${resultSuffix}.json`;
  const draftBytes = Buffer.from(`${JSON.stringify(draft, null, 2)}\n`, "utf8");
  await writeFile(path.join(RUN_DIR, ...draftRelative.split("/")), draftBytes, { flag: "wx" });
  const receipt: JsonRecord = {
    schemaVersion: "PATTERNWORK-PWRP71-EXPERIMENTAL-COMPOSITION-VALIDATION-V1",
    status: result.ok ? "pwrp71_draft_validated" : "pwrp71_draft_rejected",
    ok: result.ok,
    checkedAt: new Date().toISOString(),
    profileId: profile,
    reportType: "IFS",
    packetSha256: PACKETS[profile],
    experimentSha256: prepared.experimentSha256,
    sourceIdentity,
    compositionAttemptNumber: compositionAttempt,
    compositionCallId: compositionCall.callId,
    compositionResponseId: compositionCall.responseId,
    compositionResponseFile: compositionCall.responseFile,
    compositionResponseFileSha256: sha(await readFile(path.join(RUN_DIR, ...String(compositionCall.responseFile).split("/")))),
    compositionOutputFile: compositionRelative,
    compositionOutputFileSha256: sha(compositionBytes),
    compositionNormalizationFile: normalizationRelative,
    compositionNormalizationFileSha256: sha(normalizationBytes),
    compositionNormalizationPolicy: p02SchemaProjectionV3
      ? "deterministic_p02_candidate-response-function_relationship_and_dependency-evidence_projection_to_pinned_report_schema; provider request, output, prompt, graph, schema and source evidence remain unchanged; temporal sequence remains in claim evidence"
      : curatedP02Derivative
      ? "deterministic_p02_evidence-correction-derivative_to_pinned_report_schema_projection; provider request, provider output, prompt and schema bytes remain unchanged"
      : "deterministic_c10_intermediate_graph_to_pinned_report_schema_projection; provider request, provider output, prompt and schema bytes remain unchanged",
    interpretationAttemptNumber: interpretationAttempt,
    interpretationCallId: interpretationCall.callId,
    interpretationResponseId: interpretationCall.responseId,
    interpretationResponseFile: interpretationCall.responseFile,
    interpretationResponseFileSha256: sha(await readFile(path.join(RUN_DIR, ...String(interpretationCall.responseFile).split("/")))),
    interpretationOutputFile: interpretationRelative,
    interpretationOutputFileSha256: outputSha256,
    ...(curatedDerivative && curationBytes ? {
      interpretationCurationReceiptFile: "outputs/C10.interpretation.curated-v2.derivation.json",
      interpretationCurationReceiptFileSha256: sha(curationBytes),
      interpretationDerivativeKind: "omission_only_experimental_curation",
    } : {}),
    ...(curatedP02Derivative && curationBytes ? {
      interpretationCurationReceiptFile: "outputs/P02.interpretation.curated-v1.derivation.json",
      interpretationCurationReceiptFileSha256: sha(curationBytes),
      interpretationDerivativeKind: "source_evidence_correction_and_omission",
    } : {}),
    frozenInterpretationFile: frozenRelative,
    frozenInterpretationFileSha256: sha(frozenBytes),
    interpretationValidationReceiptFile: validationRelative,
    interpretationValidationReceiptFileSha256: sha(validationBytes),
    interpretationSolReviewReceiptFile: reviewRelative,
    interpretationSolReviewReceiptFileSha256: sha(reviewBytes),
    reportDraftFile: draftRelative,
    reportDraftFileSha256: sha(draftBytes),
    issues: result.issues,
    qualificationBoundary: "Local production PWRP 7.1 draft validation for a fictional experimental report; not routing qualification, human approval, or production authorization.",
  };
  let artifactFile: string | null = null;
  let artifactFileSha256: string | null = null;
  let markdownFile: string | null = null;
  if (result.ok) {
    artifactFile = `outputs/${profile}.validated-artifact${resultSuffix}.json`;
    const artifactBytes = Buffer.from(`${JSON.stringify(result.value, null, 2)}\n`, "utf8");
    await writeFile(path.join(RUN_DIR, ...artifactFile.split("/")), artifactBytes, { flag: "wx" });
    artifactFileSha256 = sha(artifactBytes);
    markdownFile = `outputs/${profile}.report${resultSuffix}.md`;
    await writeFile(path.join(RUN_DIR, ...markdownFile.split("/")), `${result.value.report_markdown}\n`, { flag: "wx" });
  }
  receipt.validatedArtifactFile = artifactFile;
  receipt.validatedArtifactFileSha256 = artifactFileSha256;
  receipt.reportMarkdownFile = markdownFile;
  const receiptPath = path.join(RUN_DIR, "outputs", `${profile}.composition${resultSuffix}.validation.json`);
  await writeNew(receiptPath, receipt);
  console.log(JSON.stringify({ profileId: profile, ok: result.ok, status: receipt.status, issueCount: result.issues.length,
    reportDraftFile: draftRelative, validatedArtifactFile: artifactFile, receiptFile: path.relative(RUN_DIR, receiptPath).replaceAll("\\", "/") }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
