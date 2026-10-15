import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as openaiFetch } from "undici";
import { countPotentialProviderDispatches } from "./dispatch-budget.mjs";
import { safeTransportErrorRecord } from "./transport-error-details.mjs";
import {
  C10_CURATION_RECEIPT, C10_CURATED_FROZEN, C10_CURATED_OUTPUT, C10_CURATED_REVIEW,
  C10_CURATED_REVIEW_TEXT, C10_CURATED_VALIDATION, C10_PROVIDER_OUTPUT,
} from "./c10-curation-policy.mjs";
import {
  C10_NO_DISPATCH_CALL_ID, C10_NO_DISPATCH_REQUEST_SHA256, isReconciledC10PreDispatchDnsFailure,
} from "./c10-no-dispatch-evidence.mjs";
import {
  P02_CALL_ID, P02_CURATION_RECEIPT, P02_CURATED_OUTPUT, P02_PARENT_HASHES, P02_RESPONSE_ID,
  verifyP02ParentHashes,
} from "./p02-curation-policy.mjs";
import {
  P02_COMPOSITION_NO_DISPATCH_CALL_ID, P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256,
  P02_COMPOSITION_NO_DISPATCH_PACKET_SHA256, P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256,
  isReconciledP02PreDispatchDnsFailure,
} from "./p02-no-dispatch-evidence.mjs";

const P02_CURATED_FROZEN = "outputs/P02.interpretation.curated-v1.frozen.json";
const P02_CURATED_VALIDATION = "outputs/P02.interpretation.attempt-5.validation.p02-curated-v1.json";
const P02_CURATED_REVIEW = "outputs/P02.interpretation.curated-v1.sol-review.json";
const P02_CURATED_REVIEW_TEXT = "outputs/P02.interpretation.curated-v1.sol-review.md";

const runDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(runDir, "..", "..", "..", "..", "..");
const mergeCommit = "f7ebd87894e972c16bf9e38b955c2e0003a1aca6";
const timeoutRecoveryOf = "48899da5-ce4e-45f2-a493-21ed1db01d8b";
const timeoutRecoveryRequestSha256 = "25135d71e43d53433c583177342d69f6dbdbbdb757292d54d118d139edf03cd9";
const timeoutRecoveryDeadlineMilliseconds = 1_800_000;
const incompleteRecoveryAfterCall = "2b161376-277f-4e10-9e36-48d81736a4db";
const incompleteRecoveryResponseId = "resp_085577914562c28c016ad0c4b6d04887d2817c3e371086cda5";
const incompleteRecoveryResponseSha256 = "65f29d038c28e1f11e9998eb285231e72286a247156ba535d57fb1804a236848";
const incompleteRecoveryRequestSha256 = "f8c36e20ba9043a8bfc4392c7b11c174f6766d60b796ab175c4ee29cdd5b9cb6";
const incompleteRecoveryThirdCall = "e6f9fe4c-500c-4a80-a6e2-230d2ed63fb9";
const transportRecoveryAfterCall = "017fbfd7-ec20-47a1-bb09-2f5242debd0b";
const highOutputInterpretationTokens = 128_000;
const c10CompositionAttempt2CallId = "59ed2153-c048-46fa-8310-a86fa6b3a3c6";
const c10CompositionAttempt2ResponseId = "resp_08af161d252dc5f5016ad0e3dbfd3887d2a9b37e7319eb7628";
const c10CompositionAttempt2RequestSha256 = "7f101eb0a1c5294d65496c912e6c86832d3aaa9cd70148d7f32c054d22370e59";
const c10CompositionAttempt2ResponseSha256 = "c82d6365ffffa098604750c078e3e112abdf7aeb31ab1c05bb83a0168e6ae0fb";
const expected = {
  model: "gpt-6-luna",
  reasoningEffort: "max",
  serviceTier: "default",
  experimentSha256: "eecb94ff118569ff44288fc81333aa42d0dee6dd868b514e02d3f0e09b47db33",
  questionRelease: "PWQE-5.1.0-candidate.1",
  routerVersion: "PW-ROUTER-1.1.0-candidate.1",
  questionSourceSha256: "a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832",
  questionSourceManifestSha256: "144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc",
  reportManifestSha256: "026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5",
  packets: {
    P02: "a28c19101cb596fca4e395806793944cc5135fc1b619a450161e3e9dcac8d497",
    C10: "109ad81a85793f0f114351e42e7f2f4f62e927a80a76e23b0afee4e112b87cb3",
  },
  sourceIndexFiles: {
    P02: "6902ae1ace97a48ff8ea49e99c4ffc6a155bcfea6bcad570a5854587ff1f7417",
    C10: "d2765bfe4008dd49bc5e6a2c719178f8466adb81af03422506f48a5121289676",
  },
  c10InterpretationRequestSha256: "a264e2bbd73d44c8f0694755b0f645ef21ef4df9b14696cf6b57592609eb4139",
  contracts: {
    "01_INTERPRETATION_CONTRACT.md": "7f789c89bd72c074dc2c670d5ee750f453d43555233e80181fd547f68e64200d",
    "02_IFS_NARRATIVE_COMPOSER.md": "70d85bc8e4cd9707ec23122a0b5a2d28ba00585f8b5c5ef37e3c010a03bbb163",
    "03_NARRATIVE_REVIEW.md": "23ae3e2e77eb79442d82068d8210e41b61dc0324a738ef6f0b2dcd2ec171d670",
  },
  productionFiles: {
    "lib/server/reports/pwrp71-validation.ts": "802169dd06539dbec3ab0b488a6d3b49c5676b43f3cb56dfffa68b05c3cceef3",
    "lib/server/reports/pwrp71-source.ts": "3b4ddd071a8fa6eb7d4623d15f386305e98d5a3c9ebd7af332ed56ea8c0c6b39",
    "lib/question-engine/pwqe51-source.ts": "80899988bc7069b862a10a1a1eed27626c62ca937add5b297221f6d454c724c7",
    "reporting/schemas/report_draft.schema.json": "14e880841aab064593b777b9d113376a30338968e4b0375a38955b174e55b4ba",
    "reporting/prompts/00_SHARED_REPORT_PROMPT_v7.md": "1df01aa9fa1ca8d95be8302bccc149a90ebb1dfb26ac48afc022da75d17ca6a2",
    "reporting/prompts/02_IFS_REPORT_PROMPT.md": "2b73933a51df3e895696f2d0df664d06ee7352213963fb935e6215859518e828",
  },
  prepared: {
    P02: {
      "interpretation.input.json": "5cb46749aa39edabd3e8f6cf9a1e753c4c4c6aad8a14065c51dadbed7e8012de",
      "composition.template.json": "96ad865000efca128d2582d4fcb2583694a2f5bbac57cd75ff11889313b60bc1",
      "review.template.json": "4dbaab3e604add79147a0ba2654a7c7eca7cd9dfe79627f1ec2ab42fa5fba673",
    },
    C10: {
      "interpretation.input.json": "69517fd068f991ef625e6fed2e6dbd6e6801e3fc67008c09017341d6e68b58d6",
      "composition.template.json": "74cd491a25757eeab1c72ad1172d2e479b55d5b341568378b1270a9d7e0e119f",
      "review.template.json": "6098300080f4004db39bc5ff560156dbe5ee89629f38ba08d21c1d602e7b62b6",
    },
  },
  files: [
    "qualification/pwrp71/portrait-experiment-v1/01_INTERPRETATION_CONTRACT.md",
    "qualification/pwrp71/portrait-experiment-v1/02_IFS_NARRATIVE_COMPOSER.md",
    "qualification/pwrp71/portrait-experiment-v1/03_NARRATIVE_REVIEW.md",
    "qualification/pwrp71/portrait-experiment-v1/candidate-pair.json",
    "qualification/pwrp71/route_replays_v5/P02.json",
    "qualification/pwrp71/route_replays_v5/C10.json",
    "scripts/experiment-pwrp71-narrative/prepare-system-portrait.mjs",
  ],
};

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}

function parseArgs(argv) {
  const values = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const match = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!match) throw new Error(`Unexpected argument: ${argv[i]}`);
    const key = match[1];
    const value = match[2] ?? argv[++i];
    if (!value || values.has(key)) throw new Error(`Missing or duplicate --${key}`);
    values.set(key, value);
  }
  const allowed = new Set(["operator-authorized", "profile", "stage", "authorize-up-to-microdollars", "per-call-reservation-microdollars", "owner-authorized-timeout-recovery", "owner-authorized-incomplete-output-recovery", "owner-authorized-final-p02-interpretation", "owner-authorized-transport-recovery", "owner-authorized-continue-with-locked-unknown", "owner-authorized-c10-curated-graph", "owner-authorized-c10-composition-no-dispatch-recovery", "owner-authorized-c10-composition-output-recovery", "owner-authorized-p02-curated-evidence-correction", "owner-authorized-p02-composition-no-dispatch-recovery", "preflight-only"]);
  for (const key of values.keys()) if (!allowed.has(key)) throw new Error(`Unsupported argument: --${key}`);
  return values;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function verifyJournal(journal, aggregateCap, perCallReservation) {
  if (!Array.isArray(journal.calls)) throw new Error("Budget journal call list is invalid.");
  const activeReservation = journal.calls
    .filter((call) => call.status === "reserved" || call.status === "unknown_cost")
    .reduce((sum, call) => sum + Number(call.reservationMicrodollars ?? 0), 0);
  const settled = journal.calls
    .filter((call) => call.status === "completed" || call.status === "completed_needs_review")
    .reduce((sum, call) => sum + Number(call.usageCostUpperBoundMicrodollars ?? NaN), 0);
  const hasInvalidSettlement = journal.calls.some((call) =>
    (call.status === "completed" || call.status === "completed_needs_review")
    && (!Number.isSafeInteger(call.usageCostUpperBoundMicrodollars) || call.usageCostUpperBoundMicrodollars < 0));
  if (hasInvalidSettlement
    || !Number.isSafeInteger(journal.reservedMicrodollars)
    || !Number.isSafeInteger(journal.settledUpperBoundMicrodollars)
    || journal.reservedMicrodollars !== activeReservation
    || journal.settledUpperBoundMicrodollars !== settled
    || journal.remainingAuthorizationMicrodollars !== aggregateCap - settled - activeReservation
    || settled < 0 || activeReservation < 0
    || settled + activeReservation > aggregateCap
    || journal.calls.some((call) => (call.status === "reserved" || call.status === "unknown_cost")
      && call.reservationMicrodollars !== perCallReservation)) {
    throw new Error("Budget journal counters do not reconcile to durable call records or the authorized cap.");
  }
}

async function writeJsonAtomic(file, value) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temp, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, file);
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function verifyInputs(profile, stage, prepared, curatedC10 = false, curatedP02 = false) {
  if (prepared.profileId !== profile || prepared.fixtureSet !== "route-replays-v5" || prepared.packetSha256 !== expected.packets[profile]
    || prepared.status !== "EXPERIMENTAL_NOT_QUALIFIED" || prepared.mode !== "no_dispatch") {
    throw new Error(`Prepared ${profile} fixture or packet binding changed.`);
  }
  const identity = prepared.sourceIdentity;
  if (prepared.experimentSha256 !== expected.experimentSha256
    || identity.questionRelease !== expected.questionRelease
    || identity.routerVersion !== expected.routerVersion
    || identity.questionSourceSha256 !== expected.questionSourceSha256
    || identity.questionSourceManifestSha256 !== expected.questionSourceManifestSha256
    || identity.reportRelease !== "PWRP-7.1.0-candidate.1"
    || identity.reportSourceManifestSha256 !== expected.reportManifestSha256) {
    throw new Error("Prepared experiment or report-source identity changed.");
  }
  const actualManifest = sha256(await readFile(path.join(repoRoot, "reporting", "contracts", "report_release_manifest.json")));
  if (actualManifest !== expected.reportManifestSha256) throw new Error("Current PWRP 7.1 source manifest hash drifted.");
  const reportManifest = await readJson(path.join(repoRoot, "reporting", "contracts", "report_release_manifest.json"));
  for (const [relative, digest] of Object.entries(reportManifest.files ?? {})) {
    const file = path.join(repoRoot, "reporting", ...relative.split("/"));
    if (sha256(await readFile(file)) !== digest) throw new Error("Current PWRP 7.1 manifest member drifted: " + relative);
  }
  const questionManifestPath = path.join(repoRoot, "specs", "patternwork", "question-engine-v5.1", "assessment_runtime", "SOURCE_MANIFEST.json");
  const actualQuestionManifest = sha256(await readFile(questionManifestPath));
  if (actualQuestionManifest !== expected.questionSourceManifestSha256) throw new Error("Current PWQE 5.1 source manifest hash drifted.");
  const questionManifest = await readJson(questionManifestPath);
  for (const [relative, digest] of Object.entries(questionManifest.files ?? {})) {
    const file = path.join(repoRoot, "specs", "patternwork", "question-engine-v5.1", "assessment_runtime", ...relative.split("/"));
    if (sha256(await readFile(file)) !== digest) throw new Error("Current PWQE 5.1 manifest member drifted: " + relative);
  }
  for (const [relative, digest] of Object.entries(expected.productionFiles)) {
    if (sha256(await readFile(path.join(repoRoot, ...relative.split("/")))) !== digest) {
      throw new Error("Pinned PWRP 7.1 production validation source changed: " + relative);
    }
  }
  const questionSource = await readFile(path.join(repoRoot, "lib", "question-engine", "pwqe51-source.ts"), "utf8");
  for (const pin of [expected.questionSourceSha256, expected.questionSourceManifestSha256, expected.questionRelease, expected.routerVersion]) {
    if (!questionSource.includes(pin)) throw new Error(`Current PWQE source loader no longer pins ${pin}.`);
  }
  const preparedDir = path.join(runDir, "prepared");
  for (const [suffix, digest] of Object.entries(expected.prepared[profile])) {
    const file = path.join(preparedDir, profile + "." + suffix);
    if (sha256(await readFile(file)) !== digest) throw new Error("Prepared " + profile + " input hash drifted: " + suffix);
  }
  const { content_sha256: packetDigest, ...packetContent } = prepared.evidencePacket;
  if (packetDigest !== expected.packets[profile] || sha256(canonical(packetContent)) !== packetDigest) throw new Error("Prepared packet content digest verification failed.");
  const sourceIndexPath = path.join(runDir, "outputs", `${profile}.source-observation-index-v3.json`);
  const sourceIndexBytes = await readFile(sourceIndexPath);
  const sourceIndex = JSON.parse(sourceIndexBytes.toString("utf8"));
  if (sourceIndex.status !== "source_cross_checked_fictional_evidence"
    || sourceIndex.profileId !== profile || sourceIndex.fixtureSet !== "route-replays-v5"
    || sourceIndex.packetSha256 !== expected.packets[profile]
    || sha256(sourceIndexBytes) !== expected.sourceIndexFiles[profile]
    || !Array.isArray(sourceIndex.observations) || !Array.isArray(sourceIndex.sequenceEdges)) {
    throw new Error(`The ${profile} source-observation index is not current and packet-bound.`);
  }
  const commitType = git(["cat-file", "-t", mergeCommit]);
  if (commitType !== "commit") throw new Error("Pinned PR #20 merge commit is unavailable.");
  for (const relative of expected.files) {
    let stagedPath;
    if (relative.includes("route_replays_v5")) stagedPath = path.join(runDir, "qualification", "pwrp71", "route_replays_v5", path.basename(relative));
    else if (relative.startsWith("scripts/")) stagedPath = path.join(runDir, relative);
    else stagedPath = path.join(runDir, "qualification", "pwrp71", "portrait-experiment-v1", path.basename(relative));
    const expectedBlob = git(["rev-parse", `${mergeCommit}:${relative}`]);
    const actualBlob = git(["hash-object", "--", stagedPath]);
    if (expectedBlob !== actualBlob) throw new Error(`Staged input differs from PR #20 merge: ${relative}`);
  }
  const promptName = stage === "interpretation" ? "01_INTERPRETATION_CONTRACT.md" : "02_IFS_NARRATIVE_COMPOSER.md";
  const promptPath = path.join(runDir, "qualification", "pwrp71", "portrait-experiment-v1", promptName);
  if (sha256(await readFile(promptPath)) !== expected.contracts[promptName]) throw new Error(`${promptName} hash drifted.`);
  const compositionTemplate = stage === "composition" ? await readJson(path.join(runDir, "prepared", `${profile}.composition.template.json`)) : undefined;
  const promptText = stage === "interpretation" ? prepared.system : compositionTemplate.system;
  if (sha256(Buffer.from(promptText, "utf8")) !== expected.contracts[promptName]) throw new Error(`Prepared ${profile} prompt text differs from ${promptName}.`);
  if (stage === "composition") {
    const journal = await readJson(path.join(runDir, "BUDGET_JOURNAL.json"));
    const interpretationCall = journal.calls
      .filter((call) => call.profile === profile && call.stage === "interpretation" && call.status === "completed" && call.parsedOutputFile)
      .sort((left, right) => (right.attemptNumber ?? 1) - (left.attemptNumber ?? 1))[0];
    if (!interpretationCall) throw new Error("Composition requires a completed interpretation with a parsed provider output.");
    const attemptSuffix = (interpretationCall.attemptNumber ?? 1) > 1 ? `.attempt-${interpretationCall.attemptNumber}` : "";
    const expectedOutputRelative = `outputs/${profile}.interpretation${attemptSuffix}.json`;
    if (interpretationCall.parsedOutputFile !== expectedOutputRelative) throw new Error("Completed interpretation journal path is not the exact attempt-specific output path.");
    const rawOutputFile = path.join(runDir, ...interpretationCall.parsedOutputFile.split("/"));
    const rawOutputBytes = await readFile(rawOutputFile);
    const rawInterpretation = JSON.parse(rawOutputBytes.toString("utf8"));
    const rawCompactOutputHash = sha256(JSON.stringify(rawInterpretation));
    if (interpretationCall.parsedOutputSha256 !== rawCompactOutputHash) throw new Error("Raw provider interpretation differs from its completed journaled output.");
    const interpretationRelative = curatedC10 ? C10_CURATED_OUTPUT : curatedP02 ? P02_CURATED_OUTPUT : expectedOutputRelative;
    const frozenRelative = curatedC10 ? C10_CURATED_FROZEN : curatedP02 ? P02_CURATED_FROZEN : `outputs/${profile}.interpretation${attemptSuffix}.frozen.json`;
    const interpretationFile = path.join(runDir, ...interpretationRelative.split("/"));
    const outputBytes = curatedC10 || curatedP02 ? await readFile(interpretationFile) : rawOutputBytes;
    const interpretation = JSON.parse(outputBytes.toString("utf8"));
    const compactOutputHash = sha256(JSON.stringify(interpretation));
    const frozenPath = path.join(runDir, ...frozenRelative.split("/"));
    const frozen = await readJson(frozenPath);
    let curation = null;
    let curationBytes = null;
    if (curatedC10) {
      curationBytes = await readFile(path.join(runDir, ...C10_CURATION_RECEIPT.split("/")));
      curation = JSON.parse(curationBytes.toString("utf8"));
      const validationPath = path.join(runDir, ...C10_CURATED_VALIDATION.split("/"));
      const reviewPath = path.join(runDir, ...C10_CURATED_REVIEW.split("/"));
      const correctionPath = path.join(runDir, "outputs", "C10-JOURNAL-METADATA-CORRECTION.json");
      const journalPath = path.join(runDir, "BUDGET_JOURNAL.json");
      const [curatedValidation, curatedReview, correction, currentJournal] = await Promise.all([
        readJson(validationPath), readJson(reviewPath), readJson(correctionPath), readJson(journalPath),
      ]);
      const recordedCurationCorrection = currentJournal.journalCorrections?.find((entry) => entry.correctionId === correction.correctionId);
      const recordedCurationCorrectionProjection = { ...correction };
      delete recordedCurationCorrectionProjection.journalFileAfterSha256;
      const sourceIndexBytes = await readFile(path.join(runDir, "outputs", `${profile}.source-observation-index-v3.json`));
      if (curation.schemaVersion !== "PATTERNWORK-PWRP71-C10-OMISSION-ONLY-CURATION-V1"
        || curation.profileId !== "C10" || curation.packetSha256 !== expected.packets.C10
        || curation.experimentSha256 !== expected.experimentSha256
        || canonical(curation.sourceIdentity) !== canonical(prepared.sourceIdentity)
        || curation.providerCallId !== interpretationCall.callId
        || curation.providerOutputFile !== C10_PROVIDER_OUTPUT
        || curation.providerOutputFileSha256 !== sha256(rawOutputBytes)
        || curation.curatedOutputFile !== C10_CURATED_OUTPUT || curation.curatedOutputFileSha256 !== sha256(outputBytes)
        || correction.artifactType !== "append_only_journal_metadata_correction"
        || correction.callId !== interpretationCall.callId || correction.monetaryCountersChanged !== false
        || curation.journalFileSha256 !== correction.journalFileBeforeSha256
        || !recordedCurationCorrection || canonical(recordedCurationCorrection) !== canonical(recordedCurationCorrectionProjection)
        || curation.sourceObservationIndexFileSha256 !== sha256(sourceIndexBytes)
        || curatedValidation.status !== "source_reference_checks_passed"
        || curatedValidation.modelOutputFile !== C10_CURATED_OUTPUT
        || curatedValidation.modelOutputFileSha256 !== sha256(outputBytes)
        || curatedReview.status !== "accepted_for_composition"
        || curatedReview.reviewerType !== "independent_sol_model_review"
        || curatedReview.humanApproval !== false || curatedReview.routingQualification !== false
        || curatedReview.reportApproval !== false || curatedReview.profileId !== "C10"
        || curatedReview.reportType !== "IFS" || curatedReview.packetSha256 !== expected.packets.C10
        || curatedReview.experimentSha256 !== expected.experimentSha256
        || canonical(curatedReview.sourceIdentity) !== canonical(prepared.sourceIdentity)
        || curatedReview.artifacts?.curatedOutputFile !== C10_CURATED_OUTPUT
        || curatedReview.artifacts?.curatedOutputFileSha256 !== sha256(outputBytes)
        || curatedReview.artifacts?.curationReceiptFileSha256 !== sha256(curationBytes)
        || curatedReview.artifacts?.sourceValidationFileSha256 !== sha256(await readFile(validationPath))
        || curatedReview.artifacts?.reviewTextFile !== C10_CURATED_REVIEW_TEXT
        || !curation.guarantees?.providerOutputNotMutated
        || !curation.guarantees?.retainedClaimTextAndEvidenceSequenceReferencesCopiedVerbatim
        || !curation.guarantees?.danglingDependenciesToOmittedClaimsPrunedAndRecorded) {
        throw new Error("C10 curated interpretation is not bound to the exact current provider response, v5 source index, passed source validation, and accepted Sol review.");
      }
    }
    if (curatedP02) {
      curationBytes = await readFile(path.join(runDir, ...P02_CURATION_RECEIPT.split("/")));
      curation = JSON.parse(curationBytes.toString("utf8"));
      const validationPath = path.join(runDir, ...P02_CURATED_VALIDATION.split("/"));
      const reviewPath = path.join(runDir, ...P02_CURATED_REVIEW.split("/"));
      const reviewTextPath = path.join(runDir, ...P02_CURATED_REVIEW_TEXT.split("/"));
      const [curatedValidation, curatedReview, reviewTextBytes, currentJournal] = await Promise.all([
        readJson(validationPath), readJson(reviewPath), readFile(reviewTextPath), readJson(path.join(runDir, "BUDGET_JOURNAL.json")),
      ]);
      const parentEntries = await Promise.all(Object.keys(P02_PARENT_HASHES).map(async (relative) =>
        [relative, await readFile(path.join(runDir, ...relative.split("/")))]));
      const parentBytes = Object.fromEntries(parentEntries);
      verifyP02ParentHashes(parentBytes);
      const providerCall = currentJournal.calls.find((call) => call.callId === P02_CALL_ID);
      const parentValidationBytes = parentBytes["outputs/P02.interpretation.attempt-5.validation.source-recheck.json"];
      const providerBytes = parentBytes["outputs/P02.interpretation.attempt-5.json"];
      const providerResponseBytes = parentBytes["responses/P02.interpretation.attempt-5.response.json"];
      const sourceIndexBytes = parentBytes["outputs/P02.source-observation-index-v3.json"];
      if (curation.schemaVersion !== "PATTERNWORK-PWRP71-P02-CONSTRAINED-EVIDENCE-CORRECTION-V1"
        || curation.profileId !== "P02" || curation.reportType !== "IFS"
        || curation.fixtureSet !== "route-replays-v5" || curation.packetSha256 !== expected.packets.P02
        || curation.experimentSha256 !== expected.experimentSha256
        || canonical(curation.sourceIdentity) !== canonical(prepared.sourceIdentity)
        || curation.providerCallId !== P02_CALL_ID || curation.providerResponseId !== P02_RESPONSE_ID
        || curation.providerOutputFile !== "outputs/P02.interpretation.attempt-5.json"
        || curation.providerOutputFileSha256 !== sha256(providerBytes)
        || curation.providerResponseFileSha256 !== sha256(providerResponseBytes)
        || curation.validationParentFile !== "outputs/P02.interpretation.attempt-5.validation.source-recheck.json"
        || curation.validationParentFileSha256 !== sha256(parentValidationBytes)
        || curation.sourceObservationIndexFile !== "outputs/P02.source-observation-index-v3.json"
        || curation.sourceObservationIndexFileSha256 !== sha256(sourceIndexBytes)
        || curation.curatedOutputFile !== P02_CURATED_OUTPUT || curation.curatedOutputFileSha256 !== sha256(outputBytes)
        || providerCall?.status !== "completed" || providerCall?.attemptNumber !== 5
        || providerCall?.responseStatus !== 200 || providerCall?.responseStatusValue !== "completed"
        || providerCall?.responseId !== P02_RESPONSE_ID
        || providerCall?.parsedOutputFile !== "outputs/P02.interpretation.attempt-5.json"
        || providerCall?.parsedOutputSha256 !== curation.providerOutputCompactSha256
        || curatedValidation.status !== "source_reference_checks_passed"
        || curatedValidation.profileId !== "P02" || curatedValidation.attemptNumber !== 5
        || curatedValidation.modelOutputFile !== P02_CURATED_OUTPUT
        || curatedValidation.modelOutputFileSha256 !== sha256(outputBytes)
        || curatedValidation.sourceObservationIndexFileSha256 !== sha256(sourceIndexBytes)
        || curatedReview.verdict !== "accepted_for_composition"
        || curatedReview.reviewType !== "fresh_read_only_subagent_model_review"
        || curatedReview.humanApproval !== false || curatedReview.routingQualification !== false
        || curatedReview.reportApproval !== false || curatedReview.profileId !== "P02"
        || curatedReview.stage !== "interpretation_before_composition"
        || curatedReview.bindings?.derivativeFile !== P02_CURATED_OUTPUT
        || curatedReview.bindings?.derivativeSha256 !== sha256(outputBytes)
        || curatedReview.bindings?.curationReceiptFile !== P02_CURATION_RECEIPT
        || curatedReview.bindings?.curationReceiptSha256 !== sha256(curationBytes)
        || curatedReview.bindings?.sourceValidationReceiptFile !== P02_CURATED_VALIDATION
        || curatedReview.bindings?.sourceValidationReceiptSha256 !== sha256(await readFile(validationPath))
        || curatedReview.bindings?.sourceObservationIndexFile !== "outputs/P02.source-observation-index-v3.json"
        || curatedReview.bindings?.sourceObservationIndexSha256 !== sha256(sourceIndexBytes)
        || curatedReview.bindings?.packetSha256 !== expected.packets.P02
        || curatedReview.bindings?.fixtureSet !== "route-replays-v5"
        || curatedReview.bindings?.providerCallId !== P02_CALL_ID
        || curatedReview.bindings?.providerResponseId !== P02_RESPONSE_ID
        || !Array.isArray(curatedReview.concreteIssues) || curatedReview.concreteIssues.length !== 0
        || !Array.isArray(curatedReview.compositionConstraints) || curatedReview.compositionConstraints.length === 0
        || !Array.isArray(curation.exactEvidenceCorrections)
        || curation.interpretation !== "Experimental constrained evidence-correction derivative. The completed provider output and failed validation receipts remain unchanged and rejected. This artifact is not source validated, human approved, routing qualified, or released.") {
        throw new Error("P02 corrected-evidence derivative is not bound to its exact attempt-5 parent, current v5 source index, passed source validation, and independent Sol review.");
      }
    }
    const interpretationGraph = {
      claims: interpretation.claims,
      name_registry: interpretation.name_registry,
      relationships: interpretation.relationships,
      priority_claim_ids: interpretation.priority_claim_ids,
      observed_strengths: interpretation.observed_strengths,
      counterexamples: interpretation.counterexamples,
      open_questions: interpretation.open_questions,
    };
    const frozenGraph = {
      claims: frozen.claims,
      name_registry: frozen.name_registry,
      relationships: frozen.relationships,
      priority_claim_ids: frozen.priority_claim_ids,
      observed_strengths: frozen.observed_strengths,
      counterexamples: frozen.counterexamples,
      open_questions: frozen.open_questions,
    };
    if (frozen.profileId !== profile
      || frozen.attemptNumber !== (interpretationCall.attemptNumber ?? 1)
      || frozen.packetSha256 !== expected.packets[profile]
      || frozen.experimentSha256 !== expected.experimentSha256
      || canonical(frozen.sourceIdentity) !== canonical(prepared.sourceIdentity)
      || frozen.modelOutputFile !== interpretationRelative
      || frozen.modelOutputFileSha256 !== sha256(outputBytes)
      || frozen.modelOutputCompactSha256 !== compactOutputHash
      || canonical(frozenGraph) !== canonical(interpretationGraph)
      || frozen.graphCompactSha256 !== sha256(JSON.stringify({
        claims: interpretation.claims,
        name_registry: interpretation.name_registry,
        relationships: interpretation.relationships,
        priority_claim_ids: interpretation.priority_claim_ids,
        observed_strengths: interpretation.observed_strengths,
        counterexamples: interpretation.counterexamples,
        open_questions: interpretation.open_questions,
      }))
      || !interpretationCall || interpretationCall.status !== "completed"
      || interpretationCall.parsedOutputSha256 !== rawCompactOutputHash
      || (curatedP02 && (frozen.derivativeKind !== "source_evidence_correction_and_omission"
        || frozen.curationReceiptFile !== P02_CURATION_RECEIPT
        || frozen.curationReceiptFileSha256 !== sha256(curationBytes)
        || frozen.parentProviderOutputFile !== "outputs/P02.interpretation.attempt-5.json"
        || frozen.parentProviderOutputFileSha256 !== curation.providerOutputFileSha256))) {
      throw new Error("Frozen interpretation does not bind to this exact provider output, journal call, experiment, packet, and source identity.");
    }
    const validationReceiptPath = path.join(runDir, ...(curatedC10 ? C10_CURATED_VALIDATION.split("/")
      : curatedP02 ? P02_CURATED_VALIDATION.split("/") : `outputs/${profile}.interpretation${attemptSuffix}.validation.json`.split("/")));
    const reviewReceiptPath = path.join(runDir, ...(curatedC10 ? C10_CURATED_REVIEW.split("/")
      : curatedP02 ? P02_CURATED_REVIEW.split("/") : `outputs/${profile}.interpretation${attemptSuffix}.sol-review.json`.split("/")));
    const reviewTextRelative = curatedC10 ? C10_CURATED_REVIEW_TEXT
      : curatedP02 ? P02_CURATED_REVIEW_TEXT : `outputs/${profile}.interpretation${attemptSuffix}.sol-review.md`;
    const reviewTextPath = path.join(runDir, ...reviewTextRelative.split("/"));
    const validationBytes = await readFile(validationReceiptPath);
    const reviewBytes = await readFile(reviewReceiptPath);
    const reviewTextBytes = await readFile(reviewTextPath);
    const validation = JSON.parse(validationBytes.toString("utf8"));
    const review = JSON.parse(reviewBytes.toString("utf8"));
    const pinsMatch = (receipt) => receipt.profileId === profile
      && receipt.attemptNumber === (interpretationCall.attemptNumber ?? 1)
      && receipt.packetSha256 === expected.packets[profile]
      && receipt.experimentSha256 === expected.experimentSha256
      && canonical(receipt.sourceIdentity) === canonical(prepared.sourceIdentity)
      && receipt.modelOutputFile === interpretationRelative
      && receipt.modelOutputCompactSha256 === compactOutputHash;
    const reviewBindingMatches = curatedC10
      ? review.status === "accepted_for_composition" && review.reviewerType === "independent_sol_model_review"
        && review.humanApproval === false && review.routingQualification === false && review.reportApproval === false
        && review.profileId === profile && review.reportType === "IFS"
        && review.packetSha256 === expected.packets[profile] && review.experimentSha256 === expected.experimentSha256
        && canonical(review.sourceIdentity) === canonical(prepared.sourceIdentity)
        && review.artifacts?.curatedOutputFile === interpretationRelative
        && review.artifacts?.curatedOutputFileSha256 === sha256(outputBytes)
        && review.artifacts?.curationReceiptFileSha256 === sha256(curationBytes)
        && review.artifacts?.sourceValidationFileSha256 === sha256(validationBytes)
        && review.artifacts?.reviewTextFile === reviewTextRelative
      : curatedP02
        ? review.verdict === "accepted_for_composition"
          && review.reviewType === "fresh_read_only_subagent_model_review"
          && review.humanApproval === false && review.routingQualification === false && review.reportApproval === false
          && review.profileId === "P02" && review.stage === "interpretation_before_composition"
          && review.bindings?.derivativeFile === interpretationRelative
          && review.bindings?.derivativeSha256 === sha256(outputBytes)
          && review.bindings?.curationReceiptFile === P02_CURATION_RECEIPT
          && review.bindings?.curationReceiptSha256 === sha256(curationBytes)
          && review.bindings?.sourceValidationReceiptFile === P02_CURATED_VALIDATION
          && review.bindings?.sourceValidationReceiptSha256 === sha256(validationBytes)
          && review.bindings?.sourceObservationIndexFile === "outputs/P02.source-observation-index-v3.json"
          && review.bindings?.sourceObservationIndexSha256 === sha256(sourceIndexBytes)
          && review.bindings?.packetSha256 === expected.packets.P02
          && review.bindings?.fixtureSet === "route-replays-v5"
          && review.bindings?.providerCallId === P02_CALL_ID && review.bindings?.providerResponseId === P02_RESPONSE_ID
          && Array.isArray(review.concreteIssues) && review.concreteIssues.length === 0
      : pinsMatch(review) && review.status === "accepted_for_composition"
        && review.reviewType === "model_review_not_human_approval"
        && review.modelOutputFileSha256 === sha256(outputBytes);
    if (!pinsMatch(validation) || validation.status !== "source_reference_checks_passed"
      || validation.modelOutputFileSha256 !== sha256(outputBytes)
      || frozen.validationReceiptFileSha256 !== sha256(validationBytes)
      || !reviewBindingMatches
      || sha256(reviewTextBytes) !== (curatedC10 ? review.artifacts?.reviewTextSha256 : curatedP02 ? frozen.independentReviewTextFileSha256 : review.reviewTextFileSha256)
      || frozen.solReviewReceiptFileSha256 !== sha256(reviewBytes)
      || (curatedP02 && (frozen.independentReviewFile !== P02_CURATED_REVIEW
        || frozen.independentReviewFileSha256 !== sha256(reviewBytes)
        || frozen.independentReviewTextFile !== P02_CURATED_REVIEW_TEXT
        || frozen.independentReviewTextFileSha256 !== sha256(reviewTextBytes)))) {
      throw new Error("Composition requires the reviewed, source-checked frozen interpretation for this exact profile and packet.");
    }
    const packet = prepared.evidencePacket;
    const observationById = new Map(packet.observations.map((observation) => [observation.id, observation]));
    const edgeById = new Map(packet.sequence_edges.map((edge) => [edge.id, edge]));
    const claimIds = new Set((frozen.claims ?? []).map((claim) => claim.id));
    if (claimIds.size !== (frozen.claims ?? []).length) throw new Error("Frozen interpretation repeats claim IDs.");
    for (const claim of frozen.claims ?? []) {
      const usedObservations = [...(claim.evidence_ids ?? []), ...(claim.counterevidence_ids ?? [])].map((id) => observationById.get(id));
      if (usedObservations.some((observation) => !observation
        || !observation.selection_reason?.includes("original_authored_fictional_response")
        || packet.superseded_response_ids.includes(observation.response_id)
        || packet.invalidated_response_ids.includes(observation.response_id))) {
        throw new Error("Frozen interpretation cites missing, synthetic, superseded, or invalidated evidence.");
      }
      for (const edgeId of claim.sequence_edge_ids ?? []) {
        const edge = edgeById.get(edgeId);
        if (!edge || edge.relation !== "before"
          || !new Set(["reported_temporal_relation_not_causality", "reported_recovery_order"]).has(edge.meaning)
          || usedObservations.some((observation) => observation.occurrence_id !== edge.occurrence_id)
          || !edge.evidence_ids.every((id) => claim.evidence_ids.includes(id))) {
          throw new Error("Frozen interpretation sequence claim lacks the exact same-occurrence noncausal edge evidence.");
        }
      }
      if (["reported", "supported_interpretation"].includes(claim.kind)) {
        const occurrenceIds = [...new Set(usedObservations.filter(Boolean).map((observation) => observation.occurrence_id))];
        if (!claim.scope || !occurrenceIds.length
          || canonical([...claim.scope.occurrence_ids].sort()) !== canonical(occurrenceIds.sort())) {
          throw new Error("Claim occurrence scope does not equal its source observation occurrence lineage.");
        }
        if (claim.scope.level === "reported_tendency" || claim.scope.level === "recurring_within_context" || claim.scope.level === "across_sampled_contexts") {
          throw new Error("The one-occurrence fictional fixture cannot support a recurring or across-context scope.");
        }
      }
      for (const dependency of claim.depends_on_claim_ids ?? []) if (!claimIds.has(dependency)) throw new Error("Claim dependency references an unknown claim.");
    }
    for (const name of frozen.name_registry ?? []) {
      if (!name.supporting_claim_ids?.length || name.supporting_claim_ids.some((id) => !claimIds.has(id))) throw new Error("Name registry has an unsupported or missing claim binding.");
    }
    const nameIds = new Set((frozen.name_registry ?? []).map((name) => name.name_id));
    for (const relation of frozen.relationships ?? []) {
      if (!nameIds.has(relation.from_name_id) || !nameIds.has(relation.to_name_id)
        || relation.claim_ids.some((id) => !claimIds.has(id))) throw new Error("Relationship references an unsupported name or claim.");
    }
    return { frozen, compositionTemplate, sourceIndex, sourceIndexFileSha256: sha256(sourceIndexBytes),
      ...(curatedC10 || curatedP02 ? { curation, curationReceiptFile: curatedC10 ? C10_CURATION_RECEIPT : P02_CURATION_RECEIPT, curationReceiptFileSha256: sha256(curationBytes),
        interpretationGraphFile: interpretationRelative, interpretationGraphFileSha256: sha256(outputBytes) } : {}) };
  }
  return { sourceIndex, sourceIndexFileSha256: sha256(sourceIndexBytes) };
}

function outputShapeHint(profile, stage) {
  if (stage === "interpretation") {
    return `Return exactly one JSON object with these top-level fields: profile_id, packet_sha256, claims, name_registry, relationships, priority_claim_ids, observed_strengths, counterexamples, open_questions. Each claim must use PWRP v7 claim fields: id, text, kind, constructs, scope {level, occurrence_ids, person_ids, description}, evidence_ids, counterevidence_ids, sequence_edge_ids, depends_on_claim_ids, support_basis, rationale, remaining_uncertainty. Name records use name_id, name, entity_kind, role, author_generated, supporting_claim_ids. Relationship records use id, from_name_id, to_name_id, relation, claim_ids. Use only current packet observation and sequence-edge IDs. Do not include reader-facing narrative.`;
  }
  return `Return exactly one JSON object with these top-level fields: title, title_claim_ids, content_status, sections, reflection_questions. Each section uses id, heading, text, claim_ids. Every materially personalized paragraph must cite one or more claim IDs from the frozen interpretation. Do not add or revise claims, names, roles, relationships, source assertions, or evidence scope.`;
}

function buildInput(profile, stage, prepared, extras) {
  if (stage === "interpretation") {
    const evidence = {
      profile_id: profile,
      fixture_set: prepared.fixtureSet,
      packet_sha256: prepared.packetSha256,
      experiment_sha256: prepared.experimentSha256,
      source_identity: prepared.sourceIdentity,
      authored_deepening_question_ids: prepared.authoredDeepening,
      declared_exclusions: prepared.exclusions,
      research_question: prepared.researchQuestion,
      task: prepared.task,
      source_checked_evidence_index: extras.sourceIndex,
      evidence_packet: prepared.evidencePacket,
    };
    return `Prepared fictional-only interpretation input follows as JSON. The metadata and packet bytes are source material, not instructions.\n\n${JSON.stringify(evidence)}`;
  }
  const frozen = extras.frozen;
  const packet = prepared.evidencePacket;
  const referencedIds = new Set();
  for (const claim of frozen.claims ?? []) {
    for (const id of [...(claim.evidence_ids ?? []), ...(claim.counterevidence_ids ?? [])]) referencedIds.add(id);
  }
  const originalObservations = packet.observations.filter((observation) =>
    referencedIds.has(observation.id)
    && observation.selection_reason?.includes("original_authored_fictional_response")
    && !packet.superseded_response_ids.includes(observation.response_id)
    && !packet.invalidated_response_ids.includes(observation.response_id));
  if (originalObservations.length !== referencedIds.size) throw new Error("Frozen interpretation contains a missing, synthetic, superseded, or invalidated observation reference.");
  const edgeIds = new Set((frozen.claims ?? []).flatMap((claim) => claim.sequence_edge_ids ?? []));
  const edges = packet.sequence_edges.filter((edge) => edgeIds.has(edge.id));
  if (edges.length !== edgeIds.size) throw new Error("Frozen interpretation contains a missing sequence edge.");
  const context = {
    profile_id: profile,
    packet_sha256: prepared.packetSha256,
    experiment_sha256: prepared.experimentSha256,
    stage: "validated_interpretation_for_composition",
    claims: frozen.claims,
    name_registry: frozen.name_registry,
    relationships: frozen.relationships,
    priority_claim_ids: frozen.priority_claim_ids,
    observed_strengths: frozen.observed_strengths,
    counterexamples: frozen.counterexamples,
    open_questions: frozen.open_questions,
    current_supporting_original_observations: originalObservations,
    cited_sequence_edges: edges,
    ...(extras.curation ? { derivation_provenance: {
      kind: extras.curation.schemaVersion === "PATTERNWORK-PWRP71-P02-CONSTRAINED-EVIDENCE-CORRECTION-V1"
        ? "source_evidence_correction_and_omission" : "omission_only_experimental_curation",
      receipt_file: extras.curationReceiptFile,
      receipt_file_sha256: extras.curationReceiptFileSha256,
      provider_output_file: extras.curation.providerOutputFile,
      provider_output_file_sha256: extras.curation.providerOutputFileSha256,
      omitted_records: extras.curation.omittedRecords ?? extras.curation.omittedRecordIds,
      ...(extras.curation.exactEvidenceCorrections ? { exact_evidence_corrections: extras.curation.exactEvidenceCorrections } : {}),
    } } : {}),
  };
  return "Compose only from this source-checked, independently reviewed frozen interpretation and its current original fictional observations. The graph is the only source of new personalized assertions."
    + "\n\nRequired input boundary: " + extras.compositionTemplate.inputRequired
    + "\n\n" + JSON.stringify(context);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.get("operator-authorized") !== "yes") throw new Error("Explicit --operator-authorized yes is required.");
  const aggregateAuthorization = Number(args.get("authorize-up-to-microdollars"));
  const perCallReservation = Number(args.get("per-call-reservation-microdollars"));
  if (aggregateAuthorization !== 3_000_000 || perCallReservation !== 300_000) throw new Error("The only accepted explicit limits are $3.00 aggregate and $0.30 per request.");
  const profile = args.get("profile");
  const stage = args.get("stage");
  if (!new Set(["P02", "C10"]).has(profile) || !new Set(["interpretation", "composition"]).has(stage)) throw new Error("Only P02/C10 interpretation and composition are in scope.");
  const curatedGraphFlag = args.get("owner-authorized-c10-curated-graph");
  if (curatedGraphFlag !== undefined && curatedGraphFlag !== "yes") throw new Error("--owner-authorized-c10-curated-graph, when supplied, must be exactly yes.");
  const curatedC10 = curatedGraphFlag === "yes";
  const p02CuratedEvidenceFlag = args.get("owner-authorized-p02-curated-evidence-correction");
  if (p02CuratedEvidenceFlag !== undefined && p02CuratedEvidenceFlag !== "yes") throw new Error("--owner-authorized-p02-curated-evidence-correction, when supplied, must be exactly yes.");
  const curatedP02 = p02CuratedEvidenceFlag === "yes";
  if (curatedP02 && (profile !== "P02" || stage !== "composition")) throw new Error("The source-corrected derivative authorization is limited to P02 IFS composition.");
  if (profile === "P02" && stage === "composition" && !curatedP02) throw new Error("P02 composition requires explicit use of the source-validated attempt-5 evidence-correction derivative.");
  if (curatedC10 && (profile !== "C10" || stage !== "composition")) throw new Error("The omission-only derivative authorization is limited to C10 IFS composition.");
  if (profile === "C10" && stage === "composition" && !curatedC10) throw new Error("C10 composition requires explicit use of the source-validated omission-only derivative.");
  const recoveryFlag = args.get("owner-authorized-timeout-recovery");
  if (recoveryFlag !== undefined && recoveryFlag !== "yes") throw new Error("--owner-authorized-timeout-recovery, when supplied, must be exactly yes.");
  const timeoutRecovery = recoveryFlag === "yes";
  if (timeoutRecovery && (profile !== "P02" || stage !== "interpretation")) throw new Error("The owner-authorized timeout recovery applies only to the original P02 interpretation call.");
  const incompleteRecoveryFlag = args.get("owner-authorized-incomplete-output-recovery");
  if (incompleteRecoveryFlag !== undefined && incompleteRecoveryFlag !== "yes") throw new Error("--owner-authorized-incomplete-output-recovery, when supplied, must be exactly yes.");
  const incompleteRecovery = incompleteRecoveryFlag === "yes";
  if (incompleteRecovery && (profile !== "P02" || stage !== "interpretation")) throw new Error("The owner-authorized incomplete-output recovery applies only to P02 interpretation attempt 3.");
  const finalAttemptFlag = args.get("owner-authorized-final-p02-interpretation");
  if (finalAttemptFlag !== undefined && finalAttemptFlag !== "yes") throw new Error("--owner-authorized-final-p02-interpretation, when supplied, must be exactly yes.");
  const finalAttempt = finalAttemptFlag === "yes";
  if (finalAttempt && (profile !== "P02" || stage !== "interpretation")) throw new Error("The one-time final authorized request applies only to P02 interpretation attempt 4.");
  const transportRecoveryFlag = args.get("owner-authorized-transport-recovery");
  if (transportRecoveryFlag !== undefined && transportRecoveryFlag !== "yes") throw new Error("--owner-authorized-transport-recovery, when supplied, must be exactly yes.");
  const transportRecovery = transportRecoveryFlag === "yes";
  if (transportRecovery && (profile !== "P02" || stage !== "interpretation")) throw new Error("The owner-authorized transport recovery applies only to P02 interpretation attempt 5.");
  const continuationFlag = args.get("owner-authorized-continue-with-locked-unknown");
  if (continuationFlag !== undefined && continuationFlag !== "yes") throw new Error("--owner-authorized-continue-with-locked-unknown, when supplied, must be exactly yes.");
  const continueWithLockedUnknown = continuationFlag === "yes";
  if (curatedP02 && !continueWithLockedUnknown) throw new Error("P02 corrected-evidence composition requires the already authorized bounded continuation while preserving all unresolved reserves.");
  const p02NoDispatchRecoveryFlag = args.get("owner-authorized-p02-composition-no-dispatch-recovery");
  if (p02NoDispatchRecoveryFlag !== undefined && p02NoDispatchRecoveryFlag !== "yes") throw new Error("--owner-authorized-p02-composition-no-dispatch-recovery, when supplied, must be exactly yes.");
  const p02NoDispatchRecovery = p02NoDispatchRecoveryFlag === "yes";
  if (p02NoDispatchRecovery && (profile !== "P02" || stage !== "composition" || !curatedP02 || !continueWithLockedUnknown)) {
    throw new Error("The one-time no-dispatch recovery is limited to P02 curated composition and requires the existing bounded continuation authorization.");
  }
  const c10NoDispatchFlag = args.get("owner-authorized-c10-composition-no-dispatch-recovery");
  if (c10NoDispatchFlag !== undefined && c10NoDispatchFlag !== "yes") throw new Error("--owner-authorized-c10-composition-no-dispatch-recovery, when supplied, must be exactly yes.");
  const c10NoDispatchRecovery = c10NoDispatchFlag === "yes";
  if (c10NoDispatchRecovery && (profile !== "C10" || stage !== "composition" || !curatedC10 || !continueWithLockedUnknown)) {
    throw new Error("The one-time no-dispatch recovery is limited to C10 curated composition and requires the existing bounded continuation authorization.");
  }
  const c10CompositionOutputRecoveryFlag = args.get("owner-authorized-c10-composition-output-recovery");
  if (c10CompositionOutputRecoveryFlag !== undefined && c10CompositionOutputRecoveryFlag !== "yes") throw new Error("--owner-authorized-c10-composition-output-recovery, when supplied, must be exactly yes.");
  const c10CompositionOutputRecovery = c10CompositionOutputRecoveryFlag === "yes";
  if (c10CompositionOutputRecovery && (profile !== "C10" || stage !== "composition" || !curatedC10 || !continueWithLockedUnknown)) {
    throw new Error("The one-time 128,000-token incomplete-output recovery is limited to C10 curated composition and requires the existing bounded continuation authorization.");
  }
  if (c10NoDispatchRecovery && c10CompositionOutputRecovery) throw new Error("C10 no-dispatch and incomplete-output recoveries are distinct one-time authorizations and cannot be combined.");
  if ([timeoutRecovery, incompleteRecovery, finalAttempt, transportRecovery, continueWithLockedUnknown].filter(Boolean).length > 1) throw new Error("Recovery and continuation authorizations are mutually exclusive.");
  const preflightFlag = args.get("preflight-only");
  if (preflightFlag !== undefined && preflightFlag !== "yes") throw new Error("--preflight-only, when supplied, must be exactly yes.");
  const preflightOnly = preflightFlag === "yes";
  if (preflightOnly && !timeoutRecovery && !incompleteRecovery && !finalAttempt && !transportRecovery && !continueWithLockedUnknown) throw new Error("No-dispatch preflight requires one explicit recovery or continuation authorization.");
  if (!preflightOnly && !process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is unavailable; no request was prepared or dispatched.");

  const lockPath = path.join(runDir, ".dispatch.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch {
    throw new Error("Another dispatch process or stale dispatch lock exists; refusing to continue.");
  }
  let callId;
  let c10IndependentAfterP02EvidenceRejection = false;
  let c10NoDispatchCall = null;
  let p02NoDispatchCall = null;
  let c10CompositionAttempt2Call = null;
  let c10CompositionAttempt2RequestBytes = null;
  try {
    const journalPath = path.join(runDir, "BUDGET_JOURNAL.json");
    const journal = await readJson(journalPath);
    if (journal.authorization?.scope?.join(",") !== "P02,C10" || journal.authorization.provider !== "OpenAI direct API" || journal.authorization.model !== expected.model || journal.authorization.reasoningEffort !== expected.reasoningEffort) {
      throw new Error("Budget journal authorization scope does not match this run.");
    }
    if (journal.authorization.aggregateCapMicrodollars !== aggregateAuthorization || journal.limits?.perRequestReservationMicrodollars !== perCallReservation || journal.limits?.automaticRetries !== false) {
      throw new Error("Budget journal limits do not match the explicit authorization.");
    }
    verifyJournal(journal, aggregateAuthorization, perCallReservation);
    let recoveryOfCall = null;
    let recoveryAfterCall = null;
    if (timeoutRecovery) {
      recoveryOfCall = journal.calls.find((call) => call.callId === timeoutRecoveryOf);
      const unresolvedCalls = journal.calls.filter((call) => call.status === "unknown_cost" || call.status === "reserved");
      const priorRecoveryCalls = journal.calls.filter((call) => call.recoveryOfCallId === timeoutRecoveryOf);
      if (journal.calls.length !== 1 || !recoveryOfCall
        || recoveryOfCall.status !== "unknown_cost"
        || recoveryOfCall.profile !== "P02" || recoveryOfCall.stage !== "interpretation"
        || recoveryOfCall.reportType !== "IFS"
        || recoveryOfCall.model !== expected.model || recoveryOfCall.reasoningEffort !== expected.reasoningEffort
        || recoveryOfCall.packetSha256 !== expected.packets.P02
        || recoveryOfCall.requestBodySha256 !== timeoutRecoveryRequestSha256
        || recoveryOfCall.reservationMicrodollars !== perCallReservation
        || unresolvedCalls.length !== 1 || unresolvedCalls[0].callId !== timeoutRecoveryOf
        || priorRecoveryCalls.length !== 0) {
        throw new Error("The one-time timeout recovery does not match the exact unresolved P02 interpretation call; no dispatch was made.");
      }
    } else if (incompleteRecovery) {
      recoveryOfCall = journal.calls.find((call) => call.callId === timeoutRecoveryOf);
      recoveryAfterCall = journal.calls.find((call) => call.callId === incompleteRecoveryAfterCall);
      const unresolvedCalls = journal.calls.filter((call) => call.status === "unknown_cost" || call.status === "reserved");
      const responsePath = recoveryAfterCall?.responseFile ? path.join(runDir, ...recoveryAfterCall.responseFile.split("/")) : "";
      const responseDigest = responsePath ? sha256(await readFile(responsePath)) : "";
      if (journal.calls.length !== 2 || !recoveryOfCall || !recoveryAfterCall
        || recoveryOfCall.status !== "unknown_cost" || recoveryOfCall.callId !== timeoutRecoveryOf
        || recoveryOfCall.profile !== "P02" || recoveryOfCall.stage !== "interpretation" || recoveryOfCall.reportType !== "IFS"
        || recoveryOfCall.model !== expected.model || recoveryOfCall.reasoningEffort !== expected.reasoningEffort
        || recoveryOfCall.packetSha256 !== expected.packets.P02 || recoveryOfCall.requestBodySha256 !== timeoutRecoveryRequestSha256
        || recoveryOfCall.reservationMicrodollars !== perCallReservation
        || recoveryAfterCall.callId !== incompleteRecoveryAfterCall || recoveryAfterCall.attemptNumber !== 2
        || recoveryAfterCall.recoveryOfCallId !== timeoutRecoveryOf || recoveryAfterCall.profile !== "P02"
        || recoveryAfterCall.reportType !== "IFS" || recoveryAfterCall.stage !== "interpretation"
        || recoveryAfterCall.status !== "completed_needs_review" || recoveryAfterCall.responseStatus !== 200
        || recoveryAfterCall.responseId !== incompleteRecoveryResponseId || recoveryAfterCall.returnedModel !== expected.model
        || recoveryAfterCall.returnedServiceTier !== expected.serviceTier || recoveryAfterCall.responseStatusValue !== "incomplete"
        || recoveryAfterCall.finishReason !== "max_output_tokens" || recoveryAfterCall.requestBodySha256 !== timeoutRecoveryRequestSha256
        || recoveryAfterCall.requestFile !== "requests/P02.interpretation.attempt-2.request.json"
        || recoveryAfterCall.responseFile !== "responses/P02.interpretation.attempt-2.response.json"
        || recoveryAfterCall.packetSha256 !== expected.packets.P02
        || recoveryAfterCall.maxOutputTokens !== 16_000
        || recoveryAfterCall.reservationMicrodollars !== 0 || recoveryAfterCall.outputMissing !== true
        || recoveryAfterCall.usage?.input_tokens !== 30_597 || recoveryAfterCall.usage?.output_tokens !== 16_000
        || recoveryAfterCall.usage?.output_tokens_details?.reasoning_tokens !== 16_000
        || recoveryAfterCall.usageCostUpperBoundMicrodollars !== 19_650
        || responseDigest !== incompleteRecoveryResponseSha256
        || unresolvedCalls.length !== 1 || unresolvedCalls[0].callId !== timeoutRecoveryOf) {
        throw new Error("Attempt 3 is allowed only after the exact recorded incomplete P02 attempt 2 and while the original $0.30 unknown-cost reserve remains the sole unresolved call.");
      }
    } else if (finalAttempt) {
      const original = journal.calls.find((call) => call.callId === timeoutRecoveryOf);
      const incomplete = journal.calls.find((call) => call.callId === incompleteRecoveryAfterCall);
      const priorFinalAttempt = journal.calls.find((call) => call.callId === incompleteRecoveryThirdCall);
      const unresolvedCalls = journal.calls.filter((call) => call.status === "unknown_cost" || call.status === "reserved");
      const incompleteResponsePath = incomplete?.responseFile ? path.join(runDir, ...incomplete.responseFile.split("/")) : "";
      const incompleteResponseDigest = incompleteResponsePath ? sha256(await readFile(incompleteResponsePath)) : "";
      const priorAttemptRequestPath = priorFinalAttempt?.requestFile
        ? path.join(runDir, ...priorFinalAttempt.requestFile.split("/")) : "";
      const priorAttemptRequestDigest = priorAttemptRequestPath ? sha256(await readFile(priorAttemptRequestPath)) : "";
      const incompleteRequestPath = incomplete?.requestFile ? path.join(runDir, ...incomplete.requestFile.split("/")) : "";
      const incompleteRequestDigest = incompleteRequestPath ? sha256(await readFile(incompleteRequestPath)) : "";
      const nextAttemptFiles = [
        "requests/P02.interpretation.attempt-4.request.json",
        "responses/P02.interpretation.attempt-4.response.json",
        "outputs/P02.interpretation.attempt-4.raw-output.txt",
        "outputs/P02.interpretation.attempt-4.json",
      ];
      const nextAttemptFilesAbsent = (await Promise.all(nextAttemptFiles.map(async (relative) => {
        try { await readFile(path.join(runDir, ...relative.split("/"))); return false; }
        catch (error) { return error?.code === "ENOENT"; }
      }))).every(Boolean);
      if (journal.calls.length !== 3 || journal.calls[0]?.callId !== timeoutRecoveryOf
        || journal.calls[1]?.callId !== incompleteRecoveryAfterCall
        || journal.calls[2]?.callId !== incompleteRecoveryThirdCall
        || !original || !incomplete || !priorFinalAttempt
        || original.status !== "unknown_cost" || original.reservationMicrodollars !== perCallReservation
        || original.requestBodySha256 !== timeoutRecoveryRequestSha256
        || original.profile !== "P02" || original.reportType !== "IFS" || original.stage !== "interpretation"
        || original.provider !== "OpenAI direct API" || original.endpoint !== "https://api.openai.com/v1/responses"
        || original.model !== expected.model || original.reasoningEffort !== expected.reasoningEffort
        || original.serviceTier !== expected.serviceTier || original.packetSha256 !== expected.packets.P02
        || original.experimentSha256 !== expected.experimentSha256
        || incomplete.attemptNumber !== 2 || incomplete.status !== "completed_needs_review"
        || incomplete.recoveryOfCallId !== timeoutRecoveryOf || incomplete.profile !== "P02"
        || incomplete.reportType !== "IFS" || incomplete.stage !== "interpretation"
        || incomplete.provider !== "OpenAI direct API" || incomplete.endpoint !== "https://api.openai.com/v1/responses"
        || incomplete.model !== expected.model || incomplete.reasoningEffort !== expected.reasoningEffort
        || incomplete.serviceTier !== expected.serviceTier || incomplete.packetSha256 !== expected.packets.P02
        || incomplete.experimentSha256 !== expected.experimentSha256
        || incomplete.requestBodySha256 !== timeoutRecoveryRequestSha256
        || incomplete.requestFile !== "requests/P02.interpretation.attempt-2.request.json"
        || incomplete.reservationMicrodollars !== 0
        || incomplete.responseStatus !== 200 || incomplete.responseId !== incompleteRecoveryResponseId
        || incomplete.responseStatusValue !== "incomplete" || incomplete.finishReason !== "max_output_tokens"
        || incomplete.maxOutputTokens !== 16_000 || incomplete.outputMissing !== true
        || incomplete.usage?.input_tokens !== 30_597 || incomplete.usage?.output_tokens !== 16_000
        || incomplete.usage?.output_tokens_details?.reasoning_tokens !== 16_000
        || incomplete.usageCostUpperBoundMicrodollars !== 19_650
        || incompleteResponseDigest !== incompleteRecoveryResponseSha256
        || incompleteRequestDigest !== timeoutRecoveryRequestSha256
        || priorFinalAttempt.attemptNumber !== 3 || priorFinalAttempt.status !== "unknown_cost"
        || priorFinalAttempt.recoveryOfCallId !== timeoutRecoveryOf
        || priorFinalAttempt.recoveryAfterCallId !== incompleteRecoveryAfterCall
        || priorFinalAttempt.profile !== "P02" || priorFinalAttempt.reportType !== "IFS"
        || priorFinalAttempt.stage !== "interpretation"
        || priorFinalAttempt.provider !== "OpenAI direct API"
        || priorFinalAttempt.endpoint !== "https://api.openai.com/v1/responses"
        || priorFinalAttempt.model !== expected.model || priorFinalAttempt.reasoningEffort !== expected.reasoningEffort
        || priorFinalAttempt.serviceTier !== expected.serviceTier || priorFinalAttempt.packetSha256 !== expected.packets.P02
        || priorFinalAttempt.experimentSha256 !== expected.experimentSha256
        || priorFinalAttempt.promptContractSha256 !== expected.contracts["01_INTERPRETATION_CONTRACT.md"]
        || priorFinalAttempt.reservationMicrodollars !== perCallReservation
        || priorFinalAttempt.requestBodySha256 !== incompleteRecoveryRequestSha256
        || priorFinalAttempt.requestFile !== "requests/P02.interpretation.attempt-3.request.json"
        || priorFinalAttempt.maxOutputTokens !== highOutputInterpretationTokens
        || priorFinalAttempt.responseStatus !== null || priorFinalAttempt.responseId || priorFinalAttempt.responseFile
        || priorFinalAttempt.ownerAuthorizationRecord !== "user message 2026-10-15: authorize one more call and continue in-scope P02/C10 stages under $3"
        || priorAttemptRequestDigest !== incompleteRecoveryRequestSha256
        || unresolvedCalls.length !== 2
        || !unresolvedCalls.some((call) => call.callId === timeoutRecoveryOf)
        || !unresolvedCalls.some((call) => call.callId === incompleteRecoveryThirdCall)
        || journal.reservedMicrodollars !== 600_000 || journal.settledUpperBoundMicrodollars !== 19_650
        || journal.calls.some((call) => call.attemptNumber === 4)
        || !nextAttemptFilesAbsent) {
        throw new Error("The one-time final P02 interpretation attempt requires the exact three prior calls, both retained unknown-cost reserves, and unused attempt-4 artifacts.");
      }
      recoveryOfCall = priorFinalAttempt;
      recoveryAfterCall = incomplete;
    } else if (transportRecovery) {
      const original = journal.calls.find((call) => call.callId === timeoutRecoveryOf);
      const incomplete = journal.calls.find((call) => call.callId === incompleteRecoveryAfterCall);
      const thirdAttempt = journal.calls.find((call) => call.callId === incompleteRecoveryThirdCall);
      const fourthAttempt = journal.calls.find((call) => call.callId === transportRecoveryAfterCall);
      const unresolvedCalls = journal.calls.filter((call) => call.status === "unknown_cost" || call.status === "reserved");
      const fourthRequestPath = fourthAttempt?.requestFile ? path.join(runDir, ...fourthAttempt.requestFile.split("/")) : "";
      const fourthRequestDigest = fourthRequestPath ? sha256(await readFile(fourthRequestPath)) : "";
      const nextAttemptFiles = [
        "requests/P02.interpretation.attempt-5.request.json",
        "responses/P02.interpretation.attempt-5.response.json",
        "outputs/P02.interpretation.attempt-5.raw-output.txt",
        "outputs/P02.interpretation.attempt-5.json",
      ];
      const nextAttemptFilesAbsent = (await Promise.all(nextAttemptFiles.map(async (relative) => {
        try { await readFile(path.join(runDir, ...relative.split("/"))); return false; }
        catch (error) { return error?.code === "ENOENT"; }
      }))).every(Boolean);
      const expectedUnresolvedIds = [timeoutRecoveryOf, incompleteRecoveryThirdCall, transportRecoveryAfterCall].sort();
      if (journal.calls.length !== 4
        || journal.calls[0]?.callId !== timeoutRecoveryOf
        || journal.calls[1]?.callId !== incompleteRecoveryAfterCall
        || journal.calls[2]?.callId !== incompleteRecoveryThirdCall
        || journal.calls[3]?.callId !== transportRecoveryAfterCall
        || !original || original.status !== "unknown_cost" || original.reservationMicrodollars !== perCallReservation
        || original.requestBodySha256 !== timeoutRecoveryRequestSha256
        || !incomplete || incomplete.status !== "completed_needs_review" || incomplete.attemptNumber !== 2
        || incomplete.finishReason !== "max_output_tokens" || incomplete.maxOutputTokens !== 16_000
        || incomplete.usageCostUpperBoundMicrodollars !== 19_650
        || !thirdAttempt || thirdAttempt.status !== "unknown_cost" || thirdAttempt.attemptNumber !== 3
        || thirdAttempt.recoveryOfCallId !== timeoutRecoveryOf
        || thirdAttempt.requestBodySha256 !== incompleteRecoveryRequestSha256
        || thirdAttempt.maxOutputTokens !== highOutputInterpretationTokens
        || thirdAttempt.reservationMicrodollars !== perCallReservation
        || !fourthAttempt || fourthAttempt.status !== "unknown_cost" || fourthAttempt.attemptNumber !== 4
        || fourthAttempt.recoveryOfCallId !== incompleteRecoveryThirdCall
        || fourthAttempt.recoveryAfterCallId !== incompleteRecoveryAfterCall
        || fourthAttempt.profile !== "P02" || fourthAttempt.reportType !== "IFS" || fourthAttempt.stage !== "interpretation"
        || fourthAttempt.provider !== "OpenAI direct API" || fourthAttempt.endpoint !== "https://api.openai.com/v1/responses"
        || fourthAttempt.model !== expected.model || fourthAttempt.reasoningEffort !== expected.reasoningEffort
        || fourthAttempt.serviceTier !== expected.serviceTier || fourthAttempt.packetSha256 !== expected.packets.P02
        || fourthAttempt.experimentSha256 !== expected.experimentSha256
        || fourthAttempt.requestBodySha256 !== incompleteRecoveryRequestSha256
        || fourthAttempt.requestFile !== "requests/P02.interpretation.attempt-4.request.json"
        || fourthAttempt.maxOutputTokens !== highOutputInterpretationTokens
        || fourthAttempt.responseStatus !== null || fourthAttempt.responseId || fourthAttempt.responseFile
        || fourthAttempt.reservationMicrodollars !== perCallReservation
        || fourthRequestDigest !== incompleteRecoveryRequestSha256
        || canonical(unresolvedCalls.map((call) => call.callId).sort()) !== canonical(expectedUnresolvedIds)
        || journal.reservedMicrodollars !== 900_000 || journal.settledUpperBoundMicrodollars !== 19_650
        || journal.calls.some((call) => call.attemptNumber === 5)
        || !nextAttemptFilesAbsent) {
        throw new Error("The one-time transport-corrected P02 interpretation attempt requires the exact four prior call records, all unknown-cost reserves retained, and unused attempt-5 artifacts.");
      }
      recoveryOfCall = fourthAttempt;
      recoveryAfterCall = thirdAttempt;
    } else {
      const unresolvedCalls = journal.calls.filter((call) => call.status === "unknown_cost" || call.status === "reserved");
      if (continueWithLockedUnknown) {
        const original = journal.calls.find((call) => call.callId === timeoutRecoveryOf);
        const thirdAttempt = journal.calls.find((call) => call.callId === incompleteRecoveryThirdCall);
        const fourthAttempt = journal.calls.find((call) => call.callId === transportRecoveryAfterCall);
        const unresolvedIds = unresolvedCalls.map((call) => call.callId).sort();
        const expectedUnresolvedIds = [timeoutRecoveryOf, incompleteRecoveryThirdCall, transportRecoveryAfterCall].sort();
        if (canonical(unresolvedIds) !== canonical(expectedUnresolvedIds)
          || !original || original.status !== "unknown_cost" || original.reservationMicrodollars !== perCallReservation
          || original.requestBodySha256 !== timeoutRecoveryRequestSha256 || original.profile !== "P02"
          || original.reportType !== "IFS" || original.stage !== "interpretation"
          || !thirdAttempt || thirdAttempt.status !== "unknown_cost" || thirdAttempt.reservationMicrodollars !== perCallReservation
          || thirdAttempt.requestBodySha256 !== incompleteRecoveryRequestSha256
          || !fourthAttempt || fourthAttempt.status !== "unknown_cost" || fourthAttempt.reservationMicrodollars !== perCallReservation
          || fourthAttempt.requestBodySha256 !== incompleteRecoveryRequestSha256) {
          throw new Error("Continuation is allowed only with the exact attempt-1, attempt-3 and attempt-4 unknown-cost reserves retained.");
        }
        const successful = (targetProfile, targetStage, attempt = undefined) => journal.calls.find((call) =>
          call.profile === targetProfile && call.stage === targetStage && call.status === "completed"
          && call.responseStatus === 200 && call.responseStatusValue === "completed"
          && call.returnedModel === expected.model && call.returnedServiceTier === expected.serviceTier
          && call.parsedOutputFile && !call.outputMissing && !call.outputParseError
          && (attempt === undefined || call.attemptNumber === attempt));
        const outputIsCurrent = async (call) => {
          if (!call) return false;
          const suffix = (call.attemptNumber ?? 1) > 1 ? `.attempt-${call.attemptNumber}` : "";
          const expectedRelative = `outputs/${call.profile}.${call.stage}${suffix}.json`;
          if (call.parsedOutputFile !== expectedRelative) return false;
          try {
            const bytes = await readFile(path.join(runDir, ...expectedRelative.split("/")));
            return sha256(JSON.stringify(JSON.parse(bytes.toString("utf8")))) === call.parsedOutputSha256;
          } catch { return false; }
        };
        const finalInterpretation = successful("P02", "interpretation", 5);
        if (!finalInterpretation || finalInterpretation.callId === incompleteRecoveryThirdCall
          || finalInterpretation.recoveryOfCallId !== transportRecoveryAfterCall
          || finalInterpretation.recoveryAfterCallId !== incompleteRecoveryThirdCall
          || canonical(finalInterpretation.carriedUnknownCostCallIds ?? []) !== canonical(expectedUnresolvedIds)
          || finalInterpretation.requestBodySha256 !== incompleteRecoveryRequestSha256
          || finalInterpretation.packetSha256 !== expected.packets.P02
          || finalInterpretation.maxOutputTokens !== highOutputInterpretationTokens
          || !await outputIsCurrent(finalInterpretation)) {
          throw new Error("Continuation requires a current successful attempt-5 P02 interpretation with the exact 128,000-token request and all three prior unknown-cost reservations recorded.");
        }
        const compositionIsReviewed = async (targetProfile, call) => {
          if (!call || !await outputIsCurrent(call)) return false;
          const compositionSuffix = (call.attemptNumber ?? 1) > 1 ? `.attempt-${call.attemptNumber}` : "";
          const compositionOutputFile = `outputs/${targetProfile}.composition${compositionSuffix}.json`;
          const validationPath = path.join(runDir, "outputs", `${targetProfile}.composition.validation.json`);
          const reviewPath = path.join(runDir, "outputs", `${targetProfile}.composition.sol-review.json`);
          const reviewTextPath = path.join(runDir, "outputs", `${targetProfile}.composition.sol-review.md`);
          const draftPath = path.join(runDir, "outputs", `${targetProfile}.report-draft.json`);
          const artifactPath = path.join(runDir, "outputs", `${targetProfile}.validated-artifact.json`);
          try {
            const [compositionBytes, validationBytes, reviewBytes, reviewTextBytes, draftBytes, artifactBytes] = await Promise.all([
              readFile(path.join(runDir, ...compositionOutputFile.split("/"))), readFile(validationPath), readFile(reviewPath),
              readFile(reviewTextPath), readFile(draftPath), readFile(artifactPath),
            ]);
            const validation = JSON.parse(validationBytes.toString("utf8"));
            const review = JSON.parse(reviewBytes.toString("utf8"));
            const prepared = await readJson(path.join(runDir, "prepared", `${targetProfile}.interpretation.input.json`));
            const interpretationAttempt = validation.interpretationAttemptNumber;
            if (!Number.isSafeInteger(interpretationAttempt) || interpretationAttempt < 1) return false;
            const interpretationSuffix = interpretationAttempt > 1 ? `.attempt-${interpretationAttempt}` : "";
            const interpretationOutputFile = `outputs/${targetProfile}.interpretation${interpretationSuffix}.json`;
            const frozenInterpretationFile = `outputs/${targetProfile}.interpretation${interpretationSuffix}.frozen.json`;
            const interpretationResponseFile = `responses/${targetProfile}.interpretation${interpretationSuffix}.response.json`;
            const compositionResponseFile = `responses/${targetProfile}.composition${compositionSuffix}.response.json`;
            const interpretationCall = journal.calls.find((candidate) => candidate.profile === targetProfile
              && candidate.stage === "interpretation" && candidate.status === "completed"
              && (candidate.attemptNumber ?? 1) === interpretationAttempt);
            if (!interpretationCall || interpretationCall.parsedOutputFile !== interpretationOutputFile
              || interpretationCall.responseFile !== interpretationResponseFile || call.responseFile !== compositionResponseFile
              || !await outputIsCurrent(interpretationCall)) return false;
            const interpretationValidationPath = path.join(runDir, "outputs", `${targetProfile}.interpretation${interpretationSuffix}.validation.json`);
            const interpretationReviewPath = path.join(runDir, "outputs", `${targetProfile}.interpretation${interpretationSuffix}.sol-review.json`);
            const interpretationReviewTextPath = path.join(runDir, "outputs", `${targetProfile}.interpretation${interpretationSuffix}.sol-review.md`);
            const interpretationResponsePath = typeof interpretationCall.responseFile === "string"
              ? path.join(runDir, ...interpretationCall.responseFile.split("/")) : "";
            const compositionResponsePath = typeof call.responseFile === "string"
              ? path.join(runDir, ...call.responseFile.split("/")) : "";
            const [frozenBytes, interpretationValidationBytes, interpretationReviewBytes, interpretationReviewTextBytes,
              interpretationResponseBytes, compositionResponseBytes, interpretationOutputBytes] = await Promise.all([
              readFile(path.join(runDir, ...frozenInterpretationFile.split("/"))),
              readFile(interpretationValidationPath), readFile(interpretationReviewPath), readFile(interpretationReviewTextPath),
              readFile(interpretationResponsePath), readFile(compositionResponsePath),
              readFile(path.join(runDir, ...interpretationOutputFile.split("/"))),
            ]);
            const frozen = JSON.parse(frozenBytes.toString("utf8"));
            const interpretationValidation = JSON.parse(interpretationValidationBytes.toString("utf8"));
            const interpretationReview = JSON.parse(interpretationReviewBytes.toString("utf8"));
            const interpretationResponse = JSON.parse(interpretationResponseBytes.toString("utf8"));
            const compositionResponse = JSON.parse(compositionResponseBytes.toString("utf8"));
            const currentInterpretation = JSON.parse(interpretationOutputBytes.toString("utf8"));
            const interpretationOutputSha256 = sha256(interpretationOutputBytes);
            const interpretationOutputCompactSha256 = sha256(JSON.stringify(currentInterpretation));
            const graph = {
              claims: currentInterpretation.claims,
              name_registry: currentInterpretation.name_registry,
              relationships: currentInterpretation.relationships,
              priority_claim_ids: currentInterpretation.priority_claim_ids,
              observed_strengths: currentInterpretation.observed_strengths,
              counterexamples: currentInterpretation.counterexamples,
              open_questions: currentInterpretation.open_questions,
            };
            const interpretationReceiptMatches = (receipt) => receipt.profileId === targetProfile
              && receipt.attemptNumber === interpretationAttempt && receipt.packetSha256 === expected.packets[targetProfile]
              && receipt.experimentSha256 === expected.experimentSha256
              && canonical(receipt.sourceIdentity) === canonical(prepared.sourceIdentity)
              && receipt.modelOutputFile === interpretationOutputFile
              && receipt.modelOutputFileSha256 === interpretationOutputSha256
              && receipt.modelOutputCompactSha256 === interpretationOutputCompactSha256;
            const frozenChainMatches = frozen.status === "source_checked_and_reviewed_for_composition"
              && frozen.profileId === targetProfile && frozen.attemptNumber === interpretationAttempt
              && frozen.packetSha256 === expected.packets[targetProfile] && frozen.experimentSha256 === expected.experimentSha256
              && canonical(frozen.sourceIdentity) === canonical(prepared.sourceIdentity)
              && frozen.modelOutputFile === interpretationOutputFile && frozen.modelOutputFileSha256 === interpretationOutputSha256
              && frozen.modelOutputCompactSha256 === interpretationOutputCompactSha256
              && frozen.graphCompactSha256 === sha256(JSON.stringify(graph))
              && canonical({ claims: frozen.claims, name_registry: frozen.name_registry, relationships: frozen.relationships,
                priority_claim_ids: frozen.priority_claim_ids, observed_strengths: frozen.observed_strengths,
                counterexamples: frozen.counterexamples, open_questions: frozen.open_questions }) === canonical(graph)
              && frozen.validationReceiptFileSha256 === sha256(interpretationValidationBytes)
              && frozen.solReviewReceiptFileSha256 === sha256(interpretationReviewBytes)
              && interpretationValidation.status === "source_reference_checks_passed"
              && interpretationReceiptMatches(interpretationValidation)
              && interpretationReview.status === "accepted_for_composition"
              && interpretationReview.reviewType === "model_review_not_human_approval"
              && interpretationReceiptMatches(interpretationReview)
              && sha256(interpretationReviewTextBytes) === interpretationReview.reviewTextFileSha256
              && interpretationResponse.id === interpretationCall.responseId && interpretationResponse.status === "completed"
              && interpretationResponse.model === expected.model && interpretationResponse.service_tier === expected.serviceTier
              && compositionResponse.id === call.responseId && compositionResponse.status === "completed"
              && compositionResponse.model === expected.model && compositionResponse.service_tier === expected.serviceTier;
            if (!frozenChainMatches) return false;
            return validation.status === "pwrp71_draft_validated" && validation.ok === true
              && validation.profileId === targetProfile && validation.packetSha256 === expected.packets[targetProfile]
              && validation.reportType === "IFS" && validation.experimentSha256 === expected.experimentSha256
              && canonical(validation.sourceIdentity) === canonical(prepared.sourceIdentity)
              && validation.interpretationAttemptNumber === interpretationAttempt
              && validation.interpretationCallId === interpretationCall.callId
              && validation.interpretationResponseId === interpretationCall.responseId
              && validation.interpretationResponseFile === interpretationResponseFile
              && validation.interpretationResponseFileSha256 === sha256(interpretationResponseBytes)
              && validation.interpretationOutputFile === interpretationOutputFile
              && validation.interpretationOutputFileSha256 === interpretationOutputSha256
              && validation.frozenInterpretationFile === frozenInterpretationFile
              && validation.frozenInterpretationFileSha256 === sha256(frozenBytes)
              && validation.interpretationValidationReceiptFileSha256 === sha256(interpretationValidationBytes)
              && validation.interpretationSolReviewReceiptFileSha256 === sha256(interpretationReviewBytes)
              && validation.compositionAttemptNumber === (call.attemptNumber ?? 1)
              && validation.compositionCallId === call.callId && validation.compositionResponseId === call.responseId
              && validation.compositionResponseFile === call.responseFile
              && validation.compositionResponseFileSha256 === sha256(compositionResponseBytes)
              && call.responseStatus === 200 && call.responseStatusValue === "completed"
              && call.returnedModel === expected.model && call.returnedServiceTier === expected.serviceTier
              && validation.compositionOutputFile === compositionOutputFile
              && validation.compositionOutputFileSha256 === sha256(compositionBytes)
              && validation.reportDraftFile === `outputs/${targetProfile}.report-draft.json`
              && validation.reportDraftFileSha256 === sha256(draftBytes)
              && validation.validatedArtifactFile === `outputs/${targetProfile}.validated-artifact.json`
              && validation.validatedArtifactFileSha256 === sha256(artifactBytes)
              && review.status === "accepted_for_evaluation"
              && review.reviewType === "model_review_not_human_approval"
              && review.profileId === targetProfile && review.packetSha256 === expected.packets[targetProfile]
              && review.reportType === "IFS" && review.experimentSha256 === expected.experimentSha256
              && canonical(review.sourceIdentity) === canonical((await readJson(path.join(runDir, "prepared", `${targetProfile}.interpretation.input.json`))).sourceIdentity)
              && review.compositionOutputFile === compositionOutputFile
              && review.compositionOutputFileSha256 === sha256(compositionBytes)
              && review.validationReceiptFileSha256 === sha256(validationBytes)
              && review.validatedArtifactFileSha256 === sha256(artifactBytes)
              && review.reviewTextFileSha256 === sha256(reviewTextBytes);
          } catch { return false; }
        };
        const p02InterpretationWasRejectedForSourceEvidence = async () => {
          const call = finalInterpretation;
          if (!call || call.attemptNumber !== 5
            || journal.calls.some((candidate) => candidate.profile === "P02" && candidate.stage === "composition")
            || !await outputIsCurrent(call)) return false;
          const prepared = await readJson(path.join(runDir, "prepared", "P02.interpretation.input.json"));
          const outputRelative = "outputs/P02.interpretation.attempt-5.json";
          const outputBytes = await readFile(path.join(runDir, ...outputRelative.split("/")));
          const output = JSON.parse(outputBytes.toString("utf8"));
          const validation = await readJson(path.join(runDir, "outputs", "P02.interpretation.attempt-5.validation.json"));
          const response = await readJson(path.join(runDir, ...call.responseFile.split("/")));
          return call.responseStatus === 200 && call.responseStatusValue === "completed"
            && call.returnedModel === expected.model && call.returnedServiceTier === expected.serviceTier
            && response.id === call.responseId && response.status === "completed"
            && validation.status === "source_reference_checks_failed"
            && validation.profileId === "P02" && validation.attemptNumber === 5
            && validation.packetSha256 === expected.packets.P02
            && validation.experimentSha256 === expected.experimentSha256
            && canonical(validation.sourceIdentity) === canonical(prepared.sourceIdentity)
            && validation.modelOutputFile === outputRelative
            && validation.modelOutputFileSha256 === sha256(outputBytes)
            && validation.modelOutputCompactSha256 === sha256(JSON.stringify(output))
            && Array.isArray(validation.issues)
            && validation.issues.some((issue) => issue.code === "non_authored_or_missing_evidence");
        };
        if (profile === "P02" && stage === "composition") {
          const interpretation = finalInterpretation;
          const priorP02CompositionCalls = journal.calls.filter((call) => call.profile === "P02" && call.stage === "composition");
          if (!curatedP02 || !interpretation
            || (priorP02CompositionCalls.length > 0 && !p02NoDispatchRecovery)) {
            throw new Error("P02 composition requires explicit evidence-correction authorization, the successful parsed attempt-5 parent, and either an unused stage or its exact one-time no-dispatch recovery.");
          }
          const prepared = await readJson(path.join(runDir, "prepared", "P02.interpretation.input.json"));
          await verifyInputs("P02", "composition", prepared, false, true);
          if (p02NoDispatchRecovery) {
            p02NoDispatchCall = journal.calls.find((call) => call.callId === P02_COMPOSITION_NO_DISPATCH_CALL_ID);
            const reconciliationPath = path.join(runDir, "P02-COMPOSITION-NO-DISPATCH-RECONCILIATION.json");
            const reconciliationBytes = await readFile(reconciliationPath);
            const reconciliation = JSON.parse(reconciliationBytes.toString("utf8"));
            const correction = journal.journalCorrections?.find((entry) => entry.correctionType === "no_dispatch_reconciliation"
              && entry.callId === P02_COMPOSITION_NO_DISPATCH_CALL_ID);
            const originalRequestBytes = p02NoDispatchCall?.requestFile
              ? await readFile(path.join(runDir, ...p02NoDispatchCall.requestFile.split("/"))) : Buffer.alloc(0);
            const transportReviewBytes = await readFile(path.join(runDir, "outputs", "P02-COMPOSITION-TRANSPORT-REVIEW.json"));
            const transportReview = JSON.parse(transportReviewBytes.toString("utf8"));
            const providerPreflightBytes = await readFile(path.join(runDir, "outputs", "P02-COMPOSITION-PROVIDER-PREFLIGHT.json"));
            const providerPreflight = JSON.parse(providerPreflightBytes.toString("utf8"));
            const attempt2ProviderPreflightBytes = await readFile(path.join(runDir, "outputs", "P02-COMPOSITION-ATTEMPT2-PROVIDER-PREFLIGHT.json"));
            const attempt2ProviderPreflight = JSON.parse(attempt2ProviderPreflightBytes.toString("utf8"));
            const retryArtifacts = [
              "requests/P02.composition.attempt-2.request.json", "responses/P02.composition.attempt-2.response.json",
              "outputs/P02.composition.attempt-2.raw-output.txt", "outputs/P02.composition.attempt-2.json",
            ];
            const retryArtifactsAbsent = (await Promise.all(retryArtifacts.map(async (relative) => {
              try { await readFile(path.join(runDir, ...relative.split("/"))); return false; }
              catch (error) { return error?.code === "ENOENT"; }
            }))).every(Boolean);
            const unresolvedCalls = journal.calls.filter((call) => call.status === "unknown_cost" || call.status === "reserved");
            const expectedUnknownIds = [
              "017fbfd7-ec20-47a1-bb09-2f5242debd0b",
              "48899da5-ce4e-45f2-a493-21ed1db01d8b",
              "e6f9fe4c-500c-4a80-a6e2-230d2ed63fb9",
            ].sort();
            if (priorP02CompositionCalls.length !== 1
              || priorP02CompositionCalls[0]?.callId !== P02_COMPOSITION_NO_DISPATCH_CALL_ID
              || !isReconciledP02PreDispatchDnsFailure(p02NoDispatchCall, reconciliation, reconciliationBytes, correction)
              || sha256(originalRequestBytes) !== P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256
              || reconciliation.journalBeforeSha256 !== correction.journalBeforeSha256
              || reconciliation.dispatcherSha256 !== P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256
              || reconciliation.independentReviewFileSha256 !== sha256(transportReviewBytes)
              || transportReview.status !== "supports_failed_before_provider_http_dispatch_reconciliation"
              || transportReview.callId !== P02_COMPOSITION_NO_DISPATCH_CALL_ID
              || transportReview.bindings?.journalSnapshotSha256 !== reconciliation.journalBeforeSha256
              || transportReview.bindings?.dispatchImplementationSha256 !== P02_COMPOSITION_NO_DISPATCH_DISPATCHER_SHA256
              || transportReview.bindings?.requestFileSha256 !== P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256
              || reconciliation.providerPreflightFileSha256 !== sha256(providerPreflightBytes)
              || providerPreflight.status !== "passed" || providerPreflight.httpStatus !== 200
              || providerPreflight.model !== expected.model || providerPreflight.modelVisible !== true
              || providerPreflight.generationRequests !== 0 || providerPreflight.providerCostMicrodollars !== 0
              || Date.parse(providerPreflight.checkedAt) <= Date.parse(p02NoDispatchCall?.finishedAt)
              || attempt2ProviderPreflight.schemaVersion !== "PATTERNWORK-PWRP71-P02-ATTEMPT2-PROVIDER-PREFLIGHT-V1"
              || attempt2ProviderPreflight.status !== "passed" || attempt2ProviderPreflight.method !== "GET"
              || attempt2ProviderPreflight.endpoint !== "https://api.openai.com/v1/models"
              || attempt2ProviderPreflight.httpStatus !== 200 || attempt2ProviderPreflight.model !== expected.model
              || attempt2ProviderPreflight.modelVisible !== true || attempt2ProviderPreflight.generationRequests !== 0
              || attempt2ProviderPreflight.providerCostMicrodollars !== 0
              || attempt2ProviderPreflight.apiKeyValueRecorded !== false || attempt2ProviderPreflight.automaticRetries !== false
              || !Number.isFinite(Date.parse(attempt2ProviderPreflight.checkedAt))
              || Date.now() - Date.parse(attempt2ProviderPreflight.checkedAt) > 30 * 60_000
              || Date.parse(attempt2ProviderPreflight.checkedAt) <= Date.parse(p02NoDispatchCall?.finishedAt)
              || canonical(unresolvedCalls.map((call) => call.callId).sort()) !== canonical(expectedUnknownIds)
              || journal.reservedMicrodollars !== 900_000 || journal.settledUpperBoundMicrodollars !== 152_189
              || journal.remainingAuthorizationMicrodollars !== 1_947_811
              || !retryArtifactsAbsent) {
              throw new Error("P02 composition recovery requires the exact reviewed DNS no-dispatch correction, current journal/receipt pins, successful zero-cost provider preflight, retained prior reserves, and unused attempt-2 artifacts.");
            }
          }
        } else if (profile === "C10" && stage === "interpretation") {
          const p02Composition = successful("P02", "composition");
          const p02CompositionReviewed = await compositionIsReviewed("P02", p02Composition);
          const p02Rejected = !p02CompositionReviewed && await p02InterpretationWasRejectedForSourceEvidence();
          if ((!p02CompositionReviewed && !p02Rejected) || journal.calls.some((call) => call.profile === profile && call.stage === stage)) {
            throw new Error("C10 interpretation requires a reviewed P02 composition or the exact recorded P02 source-evidence rejection, and may run only once.");
          }
          c10IndependentAfterP02EvidenceRejection = p02Rejected;
        } else if (profile === "C10" && stage === "composition") {
          const p02Composition = successful("P02", "composition");
          const c10Interpretation = successful("C10", "interpretation");
          const p02CompositionReviewed = await compositionIsReviewed("P02", p02Composition);
          const p02Rejected = !p02CompositionReviewed && await p02InterpretationWasRejectedForSourceEvidence();
          if ((!p02CompositionReviewed && !p02Rejected) || !c10Interpretation || !await outputIsCurrent(c10Interpretation)) {
            throw new Error("C10 composition requires a current C10 interpretation plus reviewed P02 composition or the exact recorded P02 source-evidence rejection, and may run only once.");
          }
          const priorC10CompositionCalls = journal.calls.filter((call) => call.profile === "C10" && call.stage === "composition");
          if (c10NoDispatchRecovery) {
            c10NoDispatchCall = journal.calls.find((call) => call.callId === C10_NO_DISPATCH_CALL_ID);
            const receiptPath = path.join(runDir, "C10-COMPOSITION-NO-DISPATCH-RECONCILIATION.json");
            const receiptBytes = await readFile(receiptPath);
            const receipt = JSON.parse(receiptBytes.toString("utf8"));
            const correction = journal.journalCorrections?.find((entry) => entry.correctionType === "no_dispatch_reconciliation"
              && entry.callId === C10_NO_DISPATCH_CALL_ID);
            const requestBytes = c10NoDispatchCall?.requestFile
              ? await readFile(path.join(runDir, ...c10NoDispatchCall.requestFile.split("/"))) : Buffer.alloc(0);
            const preflightBytes = await readFile(path.join(runDir, "C10_PROVIDER_PREFLIGHT.json"));
            const preflight = JSON.parse(preflightBytes.toString("utf8"));
            const retryArtifacts = [
              "requests/C10.composition.attempt-2.request.json", "responses/C10.composition.attempt-2.response.json",
              "outputs/C10.composition.attempt-2.raw-output.txt", "outputs/C10.composition.attempt-2.json",
            ];
            const retryArtifactsAbsent = (await Promise.all(retryArtifacts.map(async (relative) => {
              try { await readFile(path.join(runDir, ...relative.split("/"))); return false; }
              catch (error) { return error?.code === "ENOENT"; }
            }))).every(Boolean);
            if (priorC10CompositionCalls.length !== 1 || priorC10CompositionCalls[0]?.callId !== C10_NO_DISPATCH_CALL_ID
              || !isReconciledC10PreDispatchDnsFailure(c10NoDispatchCall, receipt, receiptBytes, correction)
              || sha256(requestBytes) !== C10_NO_DISPATCH_REQUEST_SHA256
              || receipt.journalBeforeSha256 !== correction.journalBeforeSha256
              || receipt.postFailurePreflight?.sha256 !== sha256(preflightBytes)
              || preflight.status !== "passed" || preflight.httpStatus !== 200 || preflight.modelVisible !== true
              || preflight.generationRequests !== 0 || preflight.providerCostMicrodollars !== 0
              || Date.parse(preflight.checkedAt) <= Date.parse(c10NoDispatchCall?.finishedAt)
              || !retryArtifactsAbsent) {
              throw new Error("C10 composition recovery requires the exact reconciled pre-connection DNS failure, a current zero-cost connectivity preflight, the untouched request, and unused attempt-2 artifacts.");
            }
          } else if (c10CompositionOutputRecovery) {
            c10NoDispatchCall = journal.calls.find((call) => call.callId === C10_NO_DISPATCH_CALL_ID);
            c10CompositionAttempt2Call = journal.calls.find((call) => call.callId === c10CompositionAttempt2CallId);
            const receiptPath = path.join(runDir, "C10-COMPOSITION-NO-DISPATCH-RECONCILIATION.json");
            const receiptBytes = await readFile(receiptPath);
            const receipt = JSON.parse(receiptBytes.toString("utf8"));
            const correction = journal.journalCorrections?.find((entry) => entry.correctionType === "no_dispatch_reconciliation"
              && entry.callId === C10_NO_DISPATCH_CALL_ID);
            const noDispatchRequestBytes = c10NoDispatchCall?.requestFile
              ? await readFile(path.join(runDir, ...c10NoDispatchCall.requestFile.split("/"))) : Buffer.alloc(0);
            const attempt2RequestPath = c10CompositionAttempt2Call?.requestFile
              ? path.join(runDir, ...c10CompositionAttempt2Call.requestFile.split("/")) : "";
            c10CompositionAttempt2RequestBytes = attempt2RequestPath ? await readFile(attempt2RequestPath) : Buffer.alloc(0);
            const attempt2ResponseBytes = c10CompositionAttempt2Call?.responseFile
              ? await readFile(path.join(runDir, ...c10CompositionAttempt2Call.responseFile.split("/"))) : Buffer.alloc(0);
            const attempt2Preflight = await readJson(path.join(runDir, "C10-COMPOSITION-ATTEMPT2-PREFLIGHT.json"));
            const nextAttemptFiles = [
              "requests/C10.composition.attempt-3.request.json", "responses/C10.composition.attempt-3.response.json",
              "outputs/C10.composition.attempt-3.raw-output.txt", "outputs/C10.composition.attempt-3.json",
            ];
            const nextAttemptFilesAbsent = (await Promise.all(nextAttemptFiles.map(async (relative) => {
              try { await readFile(path.join(runDir, ...relative.split("/"))); return false; }
              catch (error) { return error?.code === "ENOENT"; }
            }))).every(Boolean);
            const unresolvedCalls = journal.calls.filter((call) => call.status === "unknown_cost" || call.status === "reserved");
            const expectedUnknownIds = [timeoutRecoveryOf, incompleteRecoveryThirdCall, transportRecoveryAfterCall].sort();
            const p02Interpretation = journal.calls.find((call) => call.callId === "189f5e43-b80e-4f50-9f84-ce8fd605468d");
            const priorRequest = c10CompositionAttempt2RequestBytes.length
              ? JSON.parse(c10CompositionAttempt2RequestBytes.toString("utf8")) : null;
            if (priorC10CompositionCalls.length !== 2
              || priorC10CompositionCalls[0]?.callId !== C10_NO_DISPATCH_CALL_ID
              || priorC10CompositionCalls[1]?.callId !== c10CompositionAttempt2CallId
              || !isReconciledC10PreDispatchDnsFailure(c10NoDispatchCall, receipt, receiptBytes, correction)
              || sha256(noDispatchRequestBytes) !== C10_NO_DISPATCH_REQUEST_SHA256
              || !c10CompositionAttempt2Call || c10CompositionAttempt2Call.attemptNumber !== 2
              || c10CompositionAttempt2Call.status !== "completed_needs_review"
              || c10CompositionAttempt2Call.profile !== "C10" || c10CompositionAttempt2Call.reportType !== "IFS"
              || c10CompositionAttempt2Call.stage !== "composition"
              || c10CompositionAttempt2Call.provider !== "OpenAI direct API"
              || c10CompositionAttempt2Call.endpoint !== "https://api.openai.com/v1/responses"
              || c10CompositionAttempt2Call.model !== expected.model || c10CompositionAttempt2Call.reasoningEffort !== expected.reasoningEffort
              || c10CompositionAttempt2Call.serviceTier !== expected.serviceTier
              || c10CompositionAttempt2Call.packetSha256 !== expected.packets.C10
              || c10CompositionAttempt2Call.experimentSha256 !== expected.experimentSha256
              || c10CompositionAttempt2Call.promptContractSha256 !== expected.contracts["02_IFS_NARRATIVE_COMPOSER.md"]
              || c10CompositionAttempt2Call.requestBodySha256 !== c10CompositionAttempt2RequestSha256
              || c10CompositionAttempt2Call.requestFile !== "requests/C10.composition.attempt-2.request.json"
              || c10CompositionAttempt2Call.responseFile !== "responses/C10.composition.attempt-2.response.json"
              || c10CompositionAttempt2Call.responseStatus !== 200
              || c10CompositionAttempt2Call.responseId !== c10CompositionAttempt2ResponseId
              || c10CompositionAttempt2Call.responseStatusValue !== "incomplete"
              || c10CompositionAttempt2Call.finishReason !== "max_output_tokens"
              || c10CompositionAttempt2Call.returnedModel !== expected.model
              || c10CompositionAttempt2Call.returnedServiceTier !== expected.serviceTier
              || c10CompositionAttempt2Call.maxOutputTokens !== 12_000
              || c10CompositionAttempt2Call.outputMissing !== true
              || c10CompositionAttempt2Call.usage?.input_tokens !== 10_281
              || c10CompositionAttempt2Call.usage?.output_tokens !== 12_000
              || c10CompositionAttempt2Call.usage?.output_tokens_details?.reasoning_tokens !== 12_000
              || c10CompositionAttempt2Call.usageCostUpperBoundMicrodollars !== 11_571
              || c10CompositionAttempt2Call.reservationMicrodollars !== 0
              || sha256(c10CompositionAttempt2RequestBytes) !== c10CompositionAttempt2RequestSha256
              || sha256(attempt2ResponseBytes) !== c10CompositionAttempt2ResponseSha256
              || attempt2Preflight.exitCode !== 0
              || attempt2Preflight.result?.status !== "fictional_c10_composition_attempt2_preflight_passed_no_dispatch"
              || attempt2Preflight.result?.requestBodySha256 !== c10CompositionAttempt2RequestSha256
              || attempt2Preflight.result?.providerDispatches !== 0
              || canonical(unresolvedCalls.map((call) => call.callId).sort()) !== canonical(expectedUnknownIds)
              || journal.reservedMicrodollars !== 900_000 || journal.settledUpperBoundMicrodollars !== 133_248
              || !p02Interpretation || p02Interpretation.attemptNumber !== 5
              || p02Interpretation.status !== "completed" || p02Interpretation.responseStatus !== 200
              || p02Interpretation.returnedModel !== expected.model || p02Interpretation.returnedServiceTier !== expected.serviceTier
              || !await p02InterpretationWasRejectedForSourceEvidence()
              || !priorRequest || priorRequest.max_output_tokens !== 12_000
              || !nextAttemptFilesAbsent) {
              throw new Error("C10 output recovery requires the exact reconciled attempt 1, incomplete attempt 2, unchanged source chain, retained P02 unknown-cost reserves, and unused attempt-3 artifacts.");
            }
          } else if (priorC10CompositionCalls.length) {
            throw new Error("C10 composition already has a dispatched or reconciled attempt; a separate exact no-dispatch recovery authorization is required.");
          }
          c10IndependentAfterP02EvidenceRejection = p02Rejected;
        } else {
          throw new Error("The owner-authorized continuation covers only P02 composition, then C10 interpretation and composition.");
        }
      } else {
        if (unresolvedCalls.length) throw new Error("A previous attempt has unknown or unsettled cost; stop without further dispatch.");
        if (journal.calls.some((call) => call.profile === profile && call.stage === stage)) throw new Error(`A ${profile} ${stage} attempt already exists; no repeated call is allowed by this runner.`);
      }
    }
    if (countPotentialProviderDispatches(journal.calls) >= journal.limits.maxGenerationRequests) {
      throw new Error("Provider generation request limit reached; proven pre-dispatch failures do not consume this limit.");
    }
    const accounted = journal.settledUpperBoundMicrodollars + journal.reservedMicrodollars;
    if (accounted + perCallReservation > aggregateAuthorization) throw new Error("Aggregate authorization would be exceeded by this reservation.");

    const inputFile = path.join(runDir, "prepared", `${profile}.interpretation.input.json`);
    const prepared = await readJson(inputFile);
    const extras = await verifyInputs(profile, stage, prepared, curatedC10, curatedP02);
    const instructions = stage === "interpretation" ? prepared.system : extras.compositionTemplate.system;
    const inputText = buildInput(profile, stage, prepared, extras);
    const maxOutputTokens = stage === "interpretation" || c10CompositionOutputRecovery || curatedP02 ? highOutputInterpretationTokens : 12_000;
    const request = {
      model: expected.model,
      reasoning: { effort: expected.reasoningEffort },
      service_tier: expected.serviceTier,
      store: false,
      truncation: "disabled",
      max_output_tokens: maxOutputTokens,
      instructions: `${instructions}\n\n${outputShapeHint(profile, stage)}`,
      input: [{ role: "user", content: [{ type: "input_text", text: inputText }] }],
      text: { format: { type: "json_object" } },
    };
    const serialized = JSON.stringify(request);
    const inputEnvelopeBytes = Buffer.byteLength(JSON.stringify({ instructions: request.instructions, input: request.input }), "utf8");
    const quotedReservationUpperBoundMicrodollars = Math.ceil(inputEnvelopeBytes * 0.25 + maxOutputTokens * 0.75);
    if (quotedReservationUpperBoundMicrodollars > perCallReservation) throw new Error("Conservative UTF-8 byte-based request bound exceeds the exact per-call reservation; no call was reserved or dispatched.");
    const requestHash = sha256(serialized);
    if (p02NoDispatchRecovery && (requestHash !== P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256 || maxOutputTokens !== highOutputInterpretationTokens)) {
      throw new Error("P02 no-dispatch recovery must repeat the exact pinned composition request with max_output_tokens=128000; no call was reserved or dispatched.");
    }
    if (c10NoDispatchRecovery && requestHash !== C10_NO_DISPATCH_REQUEST_SHA256) {
      throw new Error("C10 no-dispatch recovery must repeat the exact pinned composition request; no call was reserved or dispatched.");
    }
    if (c10CompositionOutputRecovery) {
      const attempt2Request = JSON.parse(c10CompositionAttempt2RequestBytes.toString("utf8"));
      const expectedAttempt3Request = { ...attempt2Request, max_output_tokens: highOutputInterpretationTokens };
      const onlyOutputLimitChanged = canonical(expectedAttempt3Request) === canonical(request);
      if (requestHash === c10CompositionAttempt2RequestSha256 || maxOutputTokens !== highOutputInterpretationTokens || !onlyOutputLimitChanged) {
        throw new Error("C10 attempt 3 must differ from the exact incomplete attempt-2 request only by max_output_tokens=128000; no call was reserved or dispatched.");
      }
      c10CompositionAttempt2RequestBytes = Buffer.from(JSON.stringify(expectedAttempt3Request), "utf8");
    }
    if (timeoutRecovery && requestHash !== recoveryOfCall.requestBodySha256) throw new Error("The recovery request body differs from the original timed-out request; no dispatch was made.");
    if (incompleteRecovery && requestHash !== incompleteRecoveryRequestSha256) throw new Error("Attempt 3 must differ from attempt 2 only by the approved 128,000 output-token cap.");
    if (finalAttempt && (requestHash !== incompleteRecoveryRequestSha256 || maxOutputTokens !== highOutputInterpretationTokens)) {
      throw new Error("Attempt 4 must repeat the pinned P02 interpretation request with exactly 128,000 output tokens; no dispatch was made.");
    }
    if (transportRecovery && (requestHash !== incompleteRecoveryRequestSha256 || maxOutputTokens !== highOutputInterpretationTokens)) {
      throw new Error("Attempt 5 must preserve the exact pinned P02 interpretation request with exactly 128,000 output tokens; only transport configuration may differ.");
    }
    const priorStageCalls = journal.calls.filter((call) => call.profile === profile && call.stage === stage);
    const attemptNumber = timeoutRecovery ? 2 : incompleteRecovery ? 3 : finalAttempt ? 4 : transportRecovery ? 5 : c10CompositionOutputRecovery ? 3 : priorStageCalls.length + 1;
    const attemptSuffix = attemptNumber > 1 ? `.attempt-${attemptNumber}` : "";
  if (profile === "C10" && stage === "interpretation" && continueWithLockedUnknown
    && requestHash !== expected.c10InterpretationRequestSha256) {
    throw new Error("C10 interpretation request body differs from its reviewed source-index-enriched preflight pin; no request was reserved or dispatched.");
  }
  if (preflightOnly) {
      console.log(JSON.stringify({
        status: c10CompositionOutputRecovery ? "fictional_c10_composition_attempt3_preflight_passed_no_dispatch" : c10NoDispatchRecovery ? "fictional_c10_composition_attempt2_preflight_passed_no_dispatch" : p02NoDispatchRecovery ? "fictional_p02_composition_attempt2_preflight_passed_no_dispatch" : transportRecovery ? "fictional_diagnostic_attempt5_preflight_passed_no_dispatch" : finalAttempt ? "fictional_diagnostic_attempt4_preflight_passed_no_dispatch" : "authorized_recovery_preflight_passed_no_dispatch",
        qualificationStatus: "FICTIONAL_DIAGNOSTIC_ONLY_NOT_ROUTING_QUALIFICATION_OR_PRODUCTION_APPROVAL",
        profile,
        reportType: "IFS",
        stage,
        attemptNumber,
        recoveryOfCallId: c10CompositionOutputRecovery ? c10CompositionAttempt2Call?.callId : c10NoDispatchRecovery ? c10NoDispatchCall?.callId : p02NoDispatchRecovery ? p02NoDispatchCall?.callId : recoveryOfCall?.callId ?? timeoutRecoveryOf,
        recoveryAfterCallId: c10CompositionOutputRecovery ? C10_NO_DISPATCH_CALL_ID : recoveryAfterCall?.callId ?? null,
        ...(c10NoDispatchRecovery ? { reconciledNoDispatchCallId: c10NoDispatchCall?.callId,
          noDispatchReconciliationFile: "C10-COMPOSITION-NO-DISPATCH-RECONCILIATION.json",
          noDispatchReconciliationFileSha256: c10NoDispatchCall?.noDispatchReconciliationFileSha256 } : {}),
        ...(p02NoDispatchRecovery ? { reconciledNoDispatchCallId: p02NoDispatchCall?.callId,
          noDispatchReconciliationFile: "P02-COMPOSITION-NO-DISPATCH-RECONCILIATION.json",
          noDispatchReconciliationFileSha256: p02NoDispatchCall?.noDispatchReconciliationFileSha256,
          providerPreflightFile: "outputs/P02-COMPOSITION-ATTEMPT2-PROVIDER-PREFLIGHT.json" } : {}),
        packetSha256: expected.packets[profile],
        sourceObservationIndexSha256: extras.sourceIndexFileSha256,
        requestBodySha256: requestHash,
        maxOutputTokens,
        inputEnvelopeBytes,
        quotedReservationUpperBoundMicrodollars,
        expectedRequestSha256: c10CompositionOutputRecovery ? sha256(c10CompositionAttempt2RequestBytes) : c10NoDispatchRecovery ? C10_NO_DISPATCH_REQUEST_SHA256
          : p02NoDispatchRecovery ? P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256
          : profile === "C10" && stage === "interpretation" && continueWithLockedUnknown
          ? expected.c10InterpretationRequestSha256
          : finalAttempt || transportRecovery || incompleteRecovery ? incompleteRecoveryRequestSha256 : timeoutRecovery ? recoveryOfCall.requestBodySha256 : null,
        matchesApprovedRequest: c10CompositionOutputRecovery ? requestHash === sha256(c10CompositionAttempt2RequestBytes)
          : c10NoDispatchRecovery ? requestHash === C10_NO_DISPATCH_REQUEST_SHA256
          : p02NoDispatchRecovery ? requestHash === P02_COMPOSITION_NO_DISPATCH_REQUEST_SHA256
          : profile === "C10" && stage === "interpretation" && continueWithLockedUnknown
          ? requestHash === expected.c10InterpretationRequestSha256
          : finalAttempt || transportRecovery || incompleteRecovery ? requestHash === incompleteRecoveryRequestSha256 : timeoutRecovery ? requestHash === recoveryOfCall.requestBodySha256 : null,
        model: expected.model,
        reasoningEffort: expected.reasoningEffort,
        serviceTier: expected.serviceTier,
        clientTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
        existingUnknownReservationMicrodollars: continueWithLockedUnknown
          ? journal.calls.filter((call) => call.status === "unknown_cost").reduce((sum, call) => sum + call.reservationMicrodollars, 0)
          : transportRecovery || finalAttempt
          ? journal.calls.filter((call) => call.status === "unknown_cost").reduce((sum, call) => sum + call.reservationMicrodollars, 0)
          : recoveryOfCall?.reservationMicrodollars ?? journal.calls.find((call) => call.callId === timeoutRecoveryOf)?.reservationMicrodollars,
        carriedUnknownCostCallIds: continueWithLockedUnknown
          ? journal.calls.filter((call) => call.status === "unknown_cost").map((call) => call.callId).sort()
          : transportRecovery
          ? [timeoutRecoveryOf, incompleteRecoveryThirdCall, transportRecoveryAfterCall].sort()
          : finalAttempt ? [timeoutRecoveryOf, incompleteRecoveryThirdCall].sort() : undefined,
        additionalReservationMicrodollars: perCallReservation,
        remainingAuthorizationAfterReservationMicrodollars: aggregateAuthorization - journal.settledUpperBoundMicrodollars - journal.reservedMicrodollars - perCallReservation,
        ...(curatedC10 || curatedP02 ? { interpretationGraphFile: extras.interpretationGraphFile,
          interpretationGraphFileSha256: extras.interpretationGraphFileSha256,
          curationReceiptFile: extras.curationReceiptFile,
          curationReceiptFileSha256: extras.curationReceiptFileSha256 } : {}),
        ...(curatedP02 ? { evidenceCorrectionDerivative: true,
          evidenceCorrectionCount: extras.curation.exactEvidenceCorrections.length,
          omittedClaimCount: extras.curation.omittedRecordIds.claims.length } : {}),
        providerDispatches: 0,
      }, null, 2));
      return;
    }
    const callDir = path.join(runDir, "requests");
    const requestFile = path.join(callDir, `${profile}.${stage}${attemptSuffix}.request.json`);
    await writeFile(requestFile, serialized, { flag: "wx" });
    const callScriptHash = sha256(await readFile(fileURLToPath(import.meta.url)));
    callId = randomUUID();
    journal.calls.push({
      callId,
      profile,
      reportType: "IFS",
      stage,
      attemptNumber,
      diagnosticType: "FICTIONAL_P02_C10_IFS_EXPERIMENT",
      qualificationStatus: "FICTIONAL_DIAGNOSTIC_ONLY_NOT_ROUTING_QUALIFICATION_OR_PRODUCTION_APPROVAL",
      ...(c10CompositionOutputRecovery ? {
        recoveryOfCallId: c10CompositionAttempt2Call?.callId,
        recoveryAfterCallId: C10_NO_DISPATCH_CALL_ID,
        carriedUnknownCostCallIds: journal.calls.filter((call) => call.status === "unknown_cost").map((call) => call.callId).sort(),
        priorIncompleteRequestSha256: c10CompositionAttempt2Call?.requestBodySha256,
        priorIncompleteResponseId: c10CompositionAttempt2Call?.responseId,
        changedRequestField: "max_output_tokens",
        changedFrom: 12_000,
        changedTo: highOutputInterpretationTokens,
        ownerAuthorizationRecord: "user message 2026-10-15: please just get a finished outcome; one bounded C10 composition attempt under the existing $3 P02/C10 authorization; user correction confirms 128k output limit",
        independentTechnicalReviewFile: "C10-COMPOSITION-RECOVERY-SOL-REVIEW.json",
        clientTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
        profileIndependenceReason: "The call is bound to C10's current source-checked and reviewed graph; P02 attempt 5 was rejected for source evidence and is not used as report evidence.",
      } : timeoutRecovery ? {
        recoveryOfCallId: timeoutRecoveryOf,
        ownerAuthorizationRecord: "user message 2026-10-15: allow it to take the time it needs; one deliberately reserved recovery attempt",
        clientTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
      } : incompleteRecovery ? {
        recoveryOfCallId: timeoutRecoveryOf,
        recoveryAfterCallId: incompleteRecoveryAfterCall,
        ownerAuthorizationRecord: "user message 2026-10-15: authorize one more call and continue in-scope P02/C10 stages under $3",
        clientTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
      } : finalAttempt ? {
        recoveryOfCallId: incompleteRecoveryThirdCall,
        recoveryAfterCallId: incompleteRecoveryAfterCall,
        carriedUnknownCostCallIds: [timeoutRecoveryOf, incompleteRecoveryThirdCall].sort(),
        ownerAuthorizationRecord: "user message 2026-10-15: please just get a finished outcome; one bounded attempt under the existing $3 P02/C10 authorization",
        clientTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
      } : transportRecovery ? {
        recoveryOfCallId: transportRecoveryAfterCall,
        recoveryAfterCallId: incompleteRecoveryThirdCall,
        carriedUnknownCostCallIds: [timeoutRecoveryOf, incompleteRecoveryThirdCall, transportRecoveryAfterCall].sort(),
        ownerAuthorizationRecord: "user message 2026-10-15: please just get a finished outcome; continue the approved P02/C10 experiment under the existing $3 authorization after the transport fix passed its local timeout control",
        clientTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
        transport: {
          implementation: "undici@7.28.0 fetch with a dedicated Agent",
          connectTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
          headersTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
          bodyTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
          overallAbortTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
          localPartialHeaderControl: "UNDICI_TIMEOUT_SMOKE.json",
        },
      } : continueWithLockedUnknown ? {
        ownerAuthorizationRecord: "user message 2026-10-15: authorize one more call and continue in-scope P02/C10 stages under $3",
        carriedUnknownCostCallIds: [timeoutRecoveryOf, incompleteRecoveryThirdCall, transportRecoveryAfterCall].sort(),
        clientTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
        ...(c10IndependentAfterP02EvidenceRejection ? {
          profileIndependenceReason: "P02 attempt-5 interpretation failed source-reference checks; C10 is evaluated only from its own current pinned source-authored packet.",
        } : {}),
      ...(c10NoDispatchRecovery ? {
        recoveryOfCallId: C10_NO_DISPATCH_CALL_ID,
        noDispatchReconciliationFile: "C10-COMPOSITION-NO-DISPATCH-RECONCILIATION.json",
        noDispatchReconciliationFileSha256: c10NoDispatchCall?.noDispatchReconciliationFileSha256,
        ownerAuthorizationRecord: "user message 2026-10-15: please just get a finished outcome; one exact C10 composition request after independently reviewed DNS no-dispatch reconciliation under the existing $3 cap",
        carriedUnknownCostCallIds: journal.calls.filter((call) => call.status === "unknown_cost").map((call) => call.callId).sort(),
        clientTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
        profileIndependenceReason: "P02 attempt-5 interpretation failed source-reference checks; C10 composition uses only C10's current source-checked and reviewed graph.",
      } : {}),
      ...(p02NoDispatchRecovery ? {
        recoveryOfCallId: P02_COMPOSITION_NO_DISPATCH_CALL_ID,
        noDispatchReconciliationFile: "P02-COMPOSITION-NO-DISPATCH-RECONCILIATION.json",
        noDispatchReconciliationFileSha256: p02NoDispatchCall?.noDispatchReconciliationFileSha256,
        providerPreflightFile: "outputs/P02-COMPOSITION-ATTEMPT2-PROVIDER-PREFLIGHT.json",
        providerPreflightFileSha256: sha256(await readFile(path.join(runDir, "outputs", "P02-COMPOSITION-ATTEMPT2-PROVIDER-PREFLIGHT.json"))),
        ownerAuthorizationRecord: "user message 2026-10-15: authorize P02/C10 tests up to $3 and please just get a finished outcome; one exact P02 IFS composition attempt under the existing cap after independently reviewed no-dispatch reconciliation",
        carriedUnknownCostCallIds: journal.calls.filter((call) => call.status === "unknown_cost").map((call) => call.callId).sort(),
        independentTechnicalReviewFile: "outputs/P02-COMPOSITION-TRANSPORT-REVIEW.json",
        clientTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds,
      } : {}),
      } : { clientTimeoutMilliseconds: timeoutRecoveryDeadlineMilliseconds }),
      provider: "OpenAI direct API",
      endpoint: "https://api.openai.com/v1/responses",
      model: expected.model,
      reasoningEffort: expected.reasoningEffort,
      serviceTier: expected.serviceTier,
      packetSha256: prepared.packetSha256,
      experimentSha256: prepared.experimentSha256,
      promptContractSha256: expected.contracts[stage === "interpretation" ? "01_INTERPRETATION_CONTRACT.md" : "02_IFS_NARRATIVE_COMPOSER.md"],
      ...(stage === "interpretation" ? {
        sourceObservationIndexFile: `outputs/${profile}.source-observation-index-v3.json`,
        sourceObservationIndexFileSha256: extras.sourceIndexFileSha256,
      } : {}),
      ...(curatedC10 || curatedP02 ? {
        interpretationGraphFile: extras.interpretationGraphFile,
        interpretationGraphFileSha256: extras.interpretationGraphFileSha256,
        curationReceiptFile: extras.curationReceiptFile,
        curationReceiptFileSha256: extras.curationReceiptFileSha256,
        ...(curatedP02 ? { evidenceCorrectionDerivative: true,
          evidenceCorrectionCount: extras.curation.exactEvidenceCorrections.length,
          omittedClaimCount: extras.curation.omittedRecordIds.claims.length } : {}),
      } : {}),
      requestBodySha256: requestHash,
      requestFile: path.relative(runDir, requestFile).replaceAll("\\", "/"),
      dispatcherSha256: callScriptHash,
      maxOutputTokens,
      inputEnvelopeBytes,
      quotedReservationUpperBoundMicrodollars,
      reservationMicrodollars: perCallReservation,
      status: "reserved",
      reservationCreatedAt: new Date().toISOString(),
    });
    journal.reservedMicrodollars += perCallReservation;
    journal.remainingAuthorizationMicrodollars = aggregateAuthorization - journal.settledUpperBoundMicrodollars - journal.reservedMicrodollars;
    verifyJournal(journal, aggregateAuthorization, perCallReservation);
    await writeJsonAtomic(journalPath, journal);

    let response;
    let raw;
    const providerAgent = new Agent({
      connections: 1,
      allowH2: false,
      connectTimeout: timeoutRecoveryDeadlineMilliseconds,
      headersTimeout: timeoutRecoveryDeadlineMilliseconds,
      bodyTimeout: timeoutRecoveryDeadlineMilliseconds,
    });
    try {
      response = await openaiFetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: serialized,
        signal: AbortSignal.timeout(timeoutRecoveryDeadlineMilliseconds),
        dispatcher: providerAgent,
      });
      raw = await response.text();
    } catch (error) {
      const current = await readJson(journalPath);
      const record = current.calls.find((call) => call.callId === callId);
      record.status = "unknown_cost";
      const safeTransportError = safeTransportErrorRecord(error);
      record.transportError = safeTransportError.summary;
      record.transportErrorDetails = safeTransportError.details;
      record.responseStatus = null;
      record.finishedAt = new Date().toISOString();
      await writeJsonAtomic(journalPath, current);
      throw new Error(`Dispatch outcome is unknown; reservation remains locked. ${record.transportError}`);
    } finally {
      await providerAgent.close().catch(() => {});
    }

    const responseFile = path.join(runDir, "responses", `${profile}.${stage}${attemptSuffix}.response.json`);
    await writeFile(responseFile, raw, { flag: "wx" });
    let body;
    try { body = JSON.parse(raw); } catch { body = { raw_unparsed: raw.slice(0, 1000) }; }
    const current = await readJson(journalPath);
    const record = current.calls.find((call) => call.callId === callId);
    record.responseStatus = response.status;
    record.responseId = body.id ?? null;
    record.returnedModel = body.model ?? null;
    record.returnedServiceTier = body.service_tier ?? null;
    record.responseStatusValue = body.status ?? null;
    record.finishReason = body.incomplete_details?.reason ?? (body.status === "completed" ? "completed" : body.status ?? null);
    record.responseFile = path.relative(runDir, responseFile).replaceAll("\\", "/");
    record.receivedAt = new Date().toISOString();

    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      record.status = "unknown_cost";
      record.error = body.error?.message ?? `HTTP ${response.status}; retain reservation and stop.`;
      await writeJsonAtomic(journalPath, current);
      throw new Error(`Provider response may have unknown billing outcome (HTTP ${response.status}); reservation remains locked.`);
    }
    if (!response.ok) {
      record.status = "rejected_no_generation";
      record.error = body.error?.message ?? `HTTP ${response.status}`;
      record.reservationMicrodollars = 0;
      current.reservedMicrodollars -= perCallReservation;
      current.remainingAuthorizationMicrodollars = aggregateAuthorization - current.settledUpperBoundMicrodollars - current.reservedMicrodollars;
      verifyJournal(current, aggregateAuthorization, perCallReservation);
      await writeJsonAtomic(journalPath, current);
      throw new Error(`Provider rejected the request before generation (HTTP ${response.status}): ${record.error}`);
    }
    if (!body.usage || !Number.isSafeInteger(body.usage.input_tokens) || !Number.isSafeInteger(body.usage.output_tokens)) {
      record.status = "unknown_cost";
      record.error = "Successful response did not provide usable token usage; reservation remains locked.";
      await writeJsonAtomic(journalPath, current);
      throw new Error(record.error);
    }
    const estimatedUpperBound = Math.ceil(body.usage.input_tokens * 0.25 + body.usage.output_tokens * 0.75);
    record.usage = body.usage;
    record.usageCostUpperBoundMicrodollars = estimatedUpperBound;
    record.costKind = "token-derived-conservative-upper-bound_not_invoice";
    const otherReservations = current.reservedMicrodollars - perCallReservation;
    if (estimatedUpperBound > perCallReservation
      || current.settledUpperBoundMicrodollars + otherReservations + estimatedUpperBound > aggregateAuthorization) {
      record.status = "unknown_cost";
      record.error = "Usage-derived upper bound exceeds the reserved per-call or aggregate amount; retain reservation and stop.";
      record.budgetInvariantFailure = true;
      record.finishedAt = new Date().toISOString();
      await writeJsonAtomic(journalPath, current);
      throw new Error(record.error);
    }
    record.reservationMicrodollars = 0;
    current.reservedMicrodollars -= perCallReservation;
    current.settledUpperBoundMicrodollars += estimatedUpperBound;
    current.remainingAuthorizationMicrodollars = aggregateAuthorization - current.settledUpperBoundMicrodollars - current.reservedMicrodollars;
    record.status = body.model === expected.model && body.service_tier === expected.serviceTier && body.status === "completed" ? "completed" : "completed_needs_review";
    if (body.model !== expected.model) record.modelMismatch = true;
    if (body.service_tier !== expected.serviceTier) record.serviceTierMismatch = true;
    if (body.status !== "completed") record.incomplete = true;
    record.finishedAt = new Date().toISOString();

    const outputText = body.output_text ?? (body.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n");
    if (outputText) {
      const textPath = path.join(runDir, "outputs", `${profile}.${stage}${attemptSuffix}.raw-output.txt`);
      await writeFile(textPath, outputText, { flag: "wx" });
      record.outputTextFile = path.relative(runDir, textPath).replaceAll("\\", "/");
      try {
        const parsed = JSON.parse(outputText);
        const outputPath = path.join(runDir, "outputs", `${profile}.${stage}${attemptSuffix}.json`);
        await writeFile(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, { flag: "wx" });
        record.parsedOutputFile = path.relative(runDir, outputPath).replaceAll("\\", "/");
        record.parsedOutputSha256 = sha256(JSON.stringify(parsed));
      } catch (error) {
        record.outputParseError = String(error instanceof Error ? error.message : error);
      }
    } else record.outputMissing = true;
    verifyJournal(current, aggregateAuthorization, perCallReservation);
    await writeJsonAtomic(journalPath, current);
    console.log(JSON.stringify({ callId, profile, stage, httpStatus: response.status, responseId: record.responseId, model: record.returnedModel, status: record.status, usage: record.usage, conservativeCostUpperBoundMicrodollars: estimatedUpperBound, remainingAuthorizationMicrodollars: current.remainingAuthorizationMicrodollars, responseFile: record.responseFile, outputFile: record.parsedOutputFile ?? null }, null, 2));
    if (record.modelMismatch || record.serviceTierMismatch || record.incomplete || record.outputMissing || record.outputParseError || !record.responseId) process.exitCode = 2;
  } finally {
    if (lock) await lock.close();
    try { await unlink(lockPath); } catch {}
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
