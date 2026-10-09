import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { QUALIFICATION_MODEL_ORDER, UNQUALIFIED_MOCK_MODEL_POLICY } from "../../lib/server/openrouter/policy.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { computePwqe51RouterRuntimeSha256 } from "../../lib/server/reports/qualification/runner.ts";
import { verifyAuthoredResponsePacketBinding, verifySemanticEvidencePacket } from "../../lib/server/reports/qualification/semantic-evidence-verifier.ts";

type Row = Record<string, unknown>;
type CoverageClass = "fully_evidenced" | "partially_evidenced" | "valid_negative_case" | "unreachable_authored_branch" | "synthetic_contamination" | "implementation_defect" | "unresolved";

const ROOT = path.join(process.cwd(), "qualification", "pwrp71");
const AUDIT_ROOT = path.join(ROOT, "semantic-evidence-audit");
const IMPLEMENTATION_IDENTITY_FILES = [
  "lib/server/assessment/pwqe51-router.ts", "lib/server/assessment/pwqe51-session.ts",
  "lib/server/reports/qualification/session-replay.ts", "lib/server/reports/qualification/runner.ts",
  "lib/server/reports/qualification/semantic-evidence-verifier.ts", "lib/server/reports/pwqe51-packet.ts",
  "lib/server/reports/pwrp71-adapter.ts", "lib/server/reports/pwrp71-validation.ts", "lib/server/reports/pwrp71-review.ts",
];
const PROFILES = [...Array.from({ length: 9 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`), ...Array.from({ length: 16 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`)];
const EXTRA_ITEMS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  CQ01: { C01: ["M20", "M21"], C02: ["M20", "M21"] },
  CQ06: { C07: ["M02", "M03"] },
  CQ09: { C10: ["M13"] },
  CQ10: { C11: ["M13", "D86"] },
  CQ11: { C12: ["M17", "M18", "M19", "D42", "D44"] },
};
const OPTIONAL_ITEMS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  CQ07: { C08: ["D99"], C09: ["D99"] },
  CQ09: { C10: ["D36"] },
  CQ11: { C12: ["D45"] },
};
const CONTRASTS = [
  { id: "C01-vs-C02", distinction: "internal exclusion versus permission/privacy", requirements: { C01: ["D20", "D65", "D66", "D67", "D68"], C02: ["D20", "D65", "D66"] } },
  { id: "C03-vs-C04", distinction: "pride disallowed versus ambition privately allowed", requirements: { C03: ["D72", "D73", "D74"], C04: ["D72", "D73", "D74"] } },
  { id: "C08-vs-C09", distinction: "later return versus no return", requirements: { C08: ["D78", "D79"], C09: ["D78"] } },
  { id: "C15-vs-C16", distinction: "encouragement versus permission", requirements: { C15: ["D97", "D98"], C16: ["D97", "D98"] } },
];
const INTERPRETATION: Readonly<Record<string, { supported: readonly string[]; unsupported: readonly string[]; alternatives: readonly string[]; lineage: string }>> = {
  CQ01: { supported: ["C01 minimizes the request while describing internal judgment/compulsion and concealment; C02 minimizes the same outward request while preserving patience, choice, and a private boundary."], unsupported: ["A small request alone establishes an exile.", "C02's source-only withheld D67/D68 answers are active packet observations."], alternatives: ["C02 is a supported privacy/choice contrast, not evidence of an internal exclusion."], lineage: "Compare the same outward M20/M21 pattern across separate profile occurrences; bind each Deepening answer to its actual occurrence and first step." },
  CQ02: { supported: ["C03 describes pride as wrong and pushed away; C04 describes ambition as private while allowed internally."], unsupported: ["Either profile must be an exiled child.", "Only painful feelings can be excluded."], alternatives: ["C04 is an authored negative case against inferring pathology from privacy."], lineage: "Use each profile's D72-D74 observation on its own source-bound occurrence." },
  CQ03: { supported: ["D65 stance, D66 choice capacity, and C06's D75 clearer concerns remain separate observations."], unsupported: ["D65 alone proves Self leadership.", "Curiosity, calm, hindsight, or detachment proves Self leadership."], alternatives: ["C01 judgment/compulsion, C02 patience/choice, and C06 curiosity/choice illustrate distinct combinations."], lineage: "Keep each response bound to its authored occurrence and step; D75 is present for C06 only." },
  CQ04: { supported: ["C05 reports a local conclusion that feels certain and discounts counterevidence."], unsupported: ["The rule's origin, childhood acquisition, immutable character, or a diagnosis."], alternatives: ["The available record is about a current rule; it does not decide how the rule began."], lineage: "D22/D70/D71 observations share C05's source occurrence; no historical origin observation is present." },
  CQ05: { supported: ["C06's failure and demand concerns become clearer and are described as pointing to different outcomes."], unsupported: ["A measured part count or one shared autonomous protector/exile."], alternatives: ["One actual episode can contain two distinguishable concerns without proving two entities."], lineage: "D13/D14/D75/D76 share the actual C06 episode and step; occurrence identity is not entity identity." },
  CQ06: { supported: ["C07 has two actual M02/M03 occasions explicitly confirmed different, with reported same pattern features and concern."], unsupported: ["Two IDs or matching outward actions alone prove one persistent part or role."], alternatives: ["Continuity is limited to the respondent's reported features; autonomous identity remains unestablished."], lineage: "Require the router-issued replay binding decision and current second actual M02 root; compare only its confirmed pair." },
  CQ07: { supported: ["C08 records an actual later return and reaction; C09 records no return in its described interval."], unsupported: ["D99 generalization is an independently sampled recurrence.", "C09's source-only withheld D79 answer is an active packet observation.", "A unique cause from adjacency."], alternatives: ["A reported urge, no return, or unknown order cannot be written as the same loop."], lineage: "C08 D07-D10/D78-D79 stay within its occurrence and explicit step graph; C09 D78=no is a separate profile." },
  CQ08: { supported: ["C10 preserves the ability to carry out a familiar task while still feeling strained, with function preceding settledness."], unsupported: ["Exact duration, an unseen daily baseline, physiological/vagal measurement, or automatically complete recovery."], alternatives: ["Functioning and subjective ease are separate channels; neither implies the other."], lineage: "M12/M14 and D80/D81/D83-D85 refer to C10's source occurrence; D84 is an estimate, not a timestamp." },
  CQ09: { supported: ["C10's later setting/attempt and later interpretation remain distinct from the first response; the concern still made sense but felt less urgent."], unsupported: ["The initial concern was false or later effects belong to the first action.", "More chronology than D36's explicit partial order."], alternatives: ["The authored first response, later attempt, and changed meaning can coexist without proving a completed recovery."], lineage: "M13/M14, D86/D100, and optional D36 must retain target/occurrence binding; D36 adds only the selected partial order." },
  CQ10: { supported: ["C11 separates company, the reported internal settling, practical/shared support, and what persisted after being alone."], unsupported: ["Universal co-regulation or physiological coupling."], alternatives: ["Company can coincide with a subjective change or practical help; this does not identify a physiological mechanism."], lineage: "M13, D86-D88 must remain on the authored later-day occurrence with their separate steps." },
  CQ11: { supported: ["C12 wanted reassurance, expected dismissal, and wanted to hide the need; D42 anchors a separate known-delay occasion."], unsupported: ["The other person's actual intention or behavior based only on remembered expectation.", "D45 is required when D43/D89/D90 and D42 already carry the distinction."], alternatives: ["Remembered prediction and observed conduct are separate evidence types."], lineage: "Bind D43/D44/D89/D90 to the contact occasion and D42 to the router-issued, explicitly different known-delay occasion." },
  CQ12: { supported: ["C13 keeps private importance, limited expression, wanted pace, expectations, and later exposure distinct."], unsupported: ["A lifetime ideal pace, clinical attachment classification, or subtype."], alternatives: ["The packet describes this connection and its specific pace, not a global pattern."], lineage: "D52/D53/D93-D95 stay bound to one actual connection." },
  CQ13: { supported: ["C14 combines outward acceptance with mixed guardedness and concern about whether changed behavior will persist."], unsupported: ["The other person's motive or inability to accept an apology."], alternatives: ["Concern about consistency does not itself establish refusal or motive."], lineage: "M24 and D50/D51/D96 remain in the same repair occurrence; no second person's intent is directly observed." },
  CQ14: { supported: ["C15 reports encouragement while retaining the decision; C16 describes waiting for approval as permission."], unsupported: ["A broad secure/insecure identity or attachment label."], alternatives: ["Support and permission have different reported effects in these two contexts."], lineage: "Compare D97/D98 within each profile; do not count the two reports as independent confirmations." },
};

function sha(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function isRecord(value: unknown): value is Row { return typeof value === "object" && value !== null && !Array.isArray(value); }
function array(value: unknown): Row[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }
function readRecord(value: unknown): Row { return isRecord(value) ? value : {}; }
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function equalStringArrays(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
async function readJson(file: string): Promise<Row> { return JSON.parse(await readFile(file, "utf8")) as Row; }
async function writeJson(file: string, value: unknown): Promise<void> { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

async function hashTree(root: string): Promise<Row[]> {
  const found: Row[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const bytes = await readFile(full);
        found.push({ path: path.relative(root, full).replaceAll(path.sep, "/"), sha256: sha(bytes), bytes: bytes.byteLength });
      }
    }
  };
  await walk(root);
  return found.sort((left, right) => String(left.path).localeCompare(String(right.path)));
}

async function summarizeOfflineRun(input: {
  readonly runDirectory: string;
  readonly fixtureSet: "route-replays-v4" | "route-replays-v5";
  readonly fixtureManifestBytes: Uint8Array;
}): Promise<{ json: Row; markdown: string }> {
  const { runDirectory, fixtureSet, fixtureManifestBytes } = input;
  const [runBytes, attemptsBytes] = await Promise.all([readFile(path.join(runDirectory, "run.json")), readFile(path.join(runDirectory, "attempts.json"))]);
  const run = JSON.parse(runBytes.toString("utf8")) as Row;
  const attemptsDocument = JSON.parse(attemptsBytes.toString("utf8")) as Row;
  const results = array(run.results);
  const attempts = array(attemptsDocument.attempts);
  const sourcePins = readRecord(run.sourcePins);
  const byKey = new Map(results.map((result) => [`${String(result.profileId)}:${String(result.reportType)}`, result]));
  const perProfile = PROFILES.map((profileId) => {
    const layers = Object.fromEntries(["MAP", "IFS", "PV", "ATT", "SYNTHESIS"].map((reportType) => {
      const result = byKey.get(`${profileId}:${reportType}`);
      return [reportType, result?.status ?? "missing"];
    }));
    return { profileId, layers, allAccepted: Object.values(layers).every((status) => status === "accepted"),
      synthesisDependenciesAcceptedSameProfile: ["IFS", "PV", "ATT"].every((layer) => layers[layer] === "accepted") };
  });
  const reportFiles = await hashTree(path.join(runDirectory, "reports"));
  let totalClaims = 0;
  let allArtifactsBound = true;
  let allDraftsInsufficientEvidence = true;
  for (const result of results) {
    const artifactPath = path.join(runDirectory, String(result.artifactFile));
    const artifactBytes = await readFile(artifactPath);
    const artifact = JSON.parse(artifactBytes.toString("utf8")) as Row;
    const draft = readRecord(artifact.draft);
    const claims = array(draft.claims);
    totalClaims += claims.length;
    if (readRecord(artifact.digests).artifact_sha256 !== result.artifactSha256
      || sha(Buffer.from(String(artifact.report_markdown ?? ""))) !== result.markdownSha256) allArtifactsBound = false;
    if (draft.content_status !== "insufficient_evidence") allDraftsInsufficientEvidence = false;
  }
  const accepted = results.length === 125 && results.every((result) => result.status === "accepted")
    && perProfile.length === 25 && perProfile.every((profile) => profile.allAccepted)
    && results.every((result) => array(result.validationIssues).length === 0 && array(result.reviewerReceipts).length === 1
      && readRecord(array(result.reviewerReceipts)[0]).verdict === "accept")
    && attempts.length === 250 && attempts.every((attempt) => attempt.status === "completed" && attempt.usageStatus === "mock")
    && attempts.every((attempt) => readRecord(attempt.usage).costMicros === 0 && readRecord(attempt.usage).totalTokens === 0)
    && run.status === "offline_complete" && run.fixtureSet === fixtureSet
    && sourcePins.fixtureSet === fixtureSet && sourcePins.fixtureManifestSha256 === sha(fixtureManifestBytes)
    && run.totalReportedCostMicros === 0 && run.reservedUnknownCostMicros === 0 && array(run.blockers).length === 0
    && perProfile.every((profile) => profile.synthesisDependenciesAcceptedSameProfile) && allArtifactsBound;
  if (!accepted) throw new Error("The pinned v5 offline run failed the independent summary invariants.");
  const summary: Row = {
    schemaVersion: "PWRP71-OFFLINE-RUN-SUMMARY-V1",
    runId: run.runId,
    status: run.status,
    routeParity: run.routeParity,
    fixtureSet: run.fixtureSet,
    fixtureManifestSha256: sourcePins.fixtureManifestSha256,
    qualificationRunSha256: run.qualificationRunSha256,
    runJsonSha256: sha(runBytes),
    attemptsJsonSha256: sha(attemptsBytes),
    reportFileInventorySha256: sha(Buffer.from(JSON.stringify(reportFiles))),
    reportFileCount: reportFiles.length,
    selectedProfiles: PROFILES.length,
    selectedReports: ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"],
    resultCount: results.length,
    acceptedResultCount: results.filter((result) => result.status === "accepted").length,
    resultsByType: Object.fromEntries(["MAP", "IFS", "PV", "ATT", "SYNTHESIS"].map((type) => [type, results.filter((result) => result.reportType === type).length])),
    validationIssueCount: results.reduce((sum, result) => sum + array(result.validationIssues).length, 0),
    structuralReviewerReceipts: results.reduce((sum, result) => sum + array(result.reviewerReceipts).length, 0),
    reviewerVerdicts: [...new Set(results.flatMap((result) => array(result.reviewerReceipts).map((receipt) => receipt.verdict)))],
    attemptCount: attempts.length,
    attemptStatuses: [...new Set(attempts.map((attempt) => attempt.status))],
    usageStatus: [...new Set(attempts.map((attempt) => attempt.usageStatus))],
    requestedModel: [...new Set(results.map((result) => result.requestedModel))],
    reasoningEffort: [...new Set(results.map((result) => result.reasoningEffort))],
    reportModelPolicySha256: readRecord(run.candidatePolicy).reportModelPolicySha256,
    costCapMicros: run.costCapMicros,
    totalReportedCostMicros: run.totalReportedCostMicros,
    reservedUnknownCostMicros: run.reservedUnknownCostMicros,
    tokenUsage: { input: 0, output: 0, reasoning: 0, total: 0 },
    synthesisDependencyIntegrity: { acceptedSameProfileIfsPvAttPreconditions: perProfile.filter((profile) => profile.synthesisDependenciesAcceptedSameProfile).length,
      profiles: perProfile.length, runnerEnforcesAcceptedSameProfileLayers: true, serializedDependencyReceiptIds: false },
    resultArtifactDigestsMatchReceipts: allArtifactsBound,
    totalDraftClaimCount: totalClaims,
    allDraftsInsufficientEvidence,
    semanticReportQualityEstablished: false,
    liveProviderUsed: false,
    profiles: perProfile,
    sourcePins,
    qualificationNote: "Deterministic mock structure and validation only. Empty insufficient-evidence drafts do not establish semantic accuracy, report quality, or human approval.",
  };
  const markdown = [
    `# PWRP 7.1 ${fixtureSet} offline run summary`, "",
    `Run: \`${String(summary.runId)}\`; qualification digest: \`${String(summary.qualificationRunSha256)}\`.`,
    `Fixture set: \`${String(summary.fixtureSet)}\`; manifest SHA-256: \`${String(summary.fixtureManifestSha256)}\`.`,
    "", "## Result", "",
    "The run completed with 125/125 structurally accepted mock results (25 profiles × 5 report types), zero validation issues, and 125 structural reviewer receipts. All 250 recorded attempts are completed offline mocks; reported cost, unknown reserved cost, and token usage are zero.",
    "", "The pinned policy requested `openai/gpt-6-luna` at `max` reasoning effort. The deterministic mock produced empty `insufficient_evidence` drafts with zero claims. Structural acceptance does not establish semantic quality or human approval.",
    "", "Synthesis was accepted for 25/25 profiles after the runner's per-profile accepted IFS, PV, and ATT layer checks. The saved run records the per-profile outcomes but does not serialize layer dependency receipt IDs.",
    "", "`routeParity` remains `pending`; routing qualification is not implied by this offline run.",
    "", "## Profile outcomes", "", "| Profile | MAP | IFS | PV | ATT | SYNTHESIS | Same-profile synthesis prerequisites |", "|---|---|---|---|---|---|---|",
    ...perProfile.map((profile) => `| ${profile.profileId} | ${profile.layers.MAP} | ${profile.layers.IFS} | ${profile.layers.PV} | ${profile.layers.ATT} | ${profile.layers.SYNTHESIS} | ${profile.synthesisDependenciesAcceptedSameProfile ? "accepted" : "missing"} |`),
    "", `Run JSON SHA-256: \`${String(summary.runJsonSha256)}\`; attempts SHA-256: \`${String(summary.attemptsJsonSha256)}\`; report-file inventory SHA-256: \`${String(summary.reportFileInventorySha256)}\`.`,
  ].join("\n");
  return { json: summary, markdown };
}

interface ProfileEvidence {
  readonly profileId: string;
  readonly requiredAuthoredResponses: readonly Row[];
  readonly optionalAuthoredResponses: readonly Row[];
  readonly baselineActualCurrentObservations: readonly Row[];
  readonly actualCurrentObservations: readonly Row[];
  readonly baselineActualEvidenceLineage: Readonly<Record<string, unknown>>;
  readonly actualEvidenceLineage: Readonly<Record<string, unknown>>;
  readonly negativeControls: readonly Row[];
  readonly syntheticAnswerInvolvement: Readonly<Record<string, unknown>>;
  readonly baselineBoundAuthoredResponseIds: readonly string[];
  readonly baselineMissingAuthoredResponseIds: readonly string[];
  readonly baselineStatus: CoverageClass;
  readonly revisedStatus: CoverageClass;
  readonly verifier: ReturnType<typeof verifySemanticEvidencePacket>;
}

async function auditProfile(input: {
  readonly profileId: string;
  readonly caseId: string;
  readonly relevantItems: readonly string[];
  readonly history: Row;
  readonly baselineArtifact: Row;
  readonly revisedArtifact: Row;
  readonly questionSource: Awaited<ReturnType<typeof loadPwqe51SourcePackage>>;
}): Promise<ProfileEvidence> {
  const { profileId, caseId, relevantItems, history, baselineArtifact, revisedArtifact, questionSource } = input;
  const optionalItems = OPTIONAL_ITEMS[caseId]?.[profileId] ?? [];
  const requiredItems = unique([...relevantItems, ...(EXTRA_ITEMS[caseId]?.[profileId] ?? [])]).filter((item) => !optionalItems.includes(item));
  const allSource = [...array(history.mappingResponses), ...array(history.deepeningResponses)];
  const sourceProvenance = new Map(array(history.responseProvenance).map((row) => [row.responseId, row]));
  const original = (answer: Row): boolean => String(sourceProvenance.get(answer.responseId)?.origin ?? answer.provenance ?? "").startsWith("original_authored_fictional_");
  const authoredFor = (items: readonly string[]) => allSource.filter((answer) => items.includes(String(answer.questionId)) && original(answer));
  const requiredAnswers = authoredFor(requiredItems);
  const optionalAnswers = authoredFor(optionalItems);
  const baselineReplay = readRecord(baselineArtifact.replay);
  const baselineSubmitted = array(baselineReplay.submittedSourceToRuntimeResponses);
  const baselineState = readRecord(baselineReplay.state);
  const baselineStateResponses = array(baselineState.responses);
  const baselineResponseById = new Map(baselineStateResponses.map((response) => [response.responseId, response]));
  const baselineCurrentIds = new Set(array(baselineReplay.currentResponses).map((response) => response.responseId).filter((id): id is string => typeof id === "string"));
  const baselineOccurrences = readRecord(baselineReplay.occurrenceReferenceToServerId);
  const baselinePacketRows = readRecord(baselineArtifact.packets);
  const currentReplay = readRecord(revisedArtifact.replay);
  const submitted = array(currentReplay.submittedSourceToRuntimeResponses);
  const occurrenceMap = readRecord(currentReplay.occurrenceReferenceToServerId);
  const packetRows = readRecord(revisedArtifact.packets);
  const actualCurrentObservations: Row[] = [];
  const baselineActualCurrentObservations: Row[] = [];
  const evidenceIndexes: Row[] = [];
  const materialMatched = new Set<string>();
  const baselineMaterialMatched = new Set<string>();
  for (const sourceAnswer of [...requiredAnswers, ...optionalAnswers]) {
    const sourceId = String(sourceAnswer.responseId);
    const runtime = submitted.find((row) => row.sourceResponseId === sourceId);
    const phase = array(history.mappingResponses).some((row) => row.responseId === sourceId) ? "MAP" : "IFS";
    const packet = readRecord(readRecord(packetRows[phase]).packet);
    const observations = array(packet.observations);
    const expectedOccurrence = typeof sourceAnswer.occurrenceId === "string" ? occurrenceMap[sourceAnswer.occurrenceId] : undefined;
    const sourceQuestion = questionSource.questionBank.items.find((question) => question.id === sourceAnswer.questionId);
    const matching = runtime ? observations.filter((observation) => observation.response_id === runtime.runtimeResponseId
      && observation.item_id === sourceAnswer.questionId && observation.occurrence_id === expectedOccurrence
      && (observation.step_id === sourceAnswer.stepId || (sourceQuestion?.selection.mode === "partial_order" && typeof observation.step_id === "string" && observation.step_id.startsWith(`${String(sourceAnswer.stepId)}/`)))
      && strings(sourceAnswer.selectedOptionIds).includes(String(observation.option_id))) : [];
    const matchedOptionIds = unique(matching.map((observation) => String(observation.option_id)));
    const fullyBound = !!runtime && matching.length === strings(sourceAnswer.selectedOptionIds).length && matchedOptionIds.length === strings(sourceAnswer.selectedOptionIds).length;
    if (fullyBound && requiredAnswers.includes(sourceAnswer)) materialMatched.add(sourceId);
    const baselineRuntime = baselineSubmitted.find((row) => row.sourceResponseId === sourceId && row.status === "answered");
    const baselinePacket = readRecord(readRecord(baselinePacketRows[phase]).packet);
    const baselinePacketStale = new Set([...strings(baselinePacket.superseded_response_ids), ...strings(baselinePacket.invalidated_response_ids)]);
    const baselineExpectedOccurrence = typeof sourceAnswer.occurrenceId === "string" ? baselineOccurrences[sourceAnswer.occurrenceId] : undefined;
    const baselineMatching = baselineRuntime ? array(baselinePacket.observations).filter((observation) => observation.response_id === baselineRuntime.runtimeResponseId
      && observation.item_id === sourceAnswer.questionId && observation.occurrence_id === baselineExpectedOccurrence
      && (observation.step_id === sourceAnswer.stepId || (sourceQuestion?.selection.mode === "partial_order" && typeof observation.step_id === "string" && observation.step_id.startsWith(`${String(sourceAnswer.stepId)}/`)))
      && strings(sourceAnswer.selectedOptionIds).includes(String(observation.option_id))) : [];
    const baselineCanonical = baselineRuntime ? baselineResponseById.get(baselineRuntime.runtimeResponseId) : undefined;
    const baselineMatchedOptionIds = unique(baselineMatching.map((observation) => String(observation.option_id)));
    const baselineFullyBound = !!baselineRuntime && baselineCurrentIds.has(String(baselineRuntime.runtimeResponseId))
      && !baselinePacketStale.has(String(baselineRuntime.runtimeResponseId)) && baselineCanonical?.status === "answered"
      && equalStringArrays(strings(baselineCanonical.selectedOptionIds), strings(sourceAnswer.selectedOptionIds))
      && baselineMatching.length === strings(sourceAnswer.selectedOptionIds).length
      && baselineMatchedOptionIds.length === strings(sourceAnswer.selectedOptionIds).length;
    if (baselineFullyBound && requiredAnswers.includes(sourceAnswer)) baselineMaterialMatched.add(sourceId);
    const baselineItemResult = {
      sourceResponseId: sourceId,
      itemId: sourceAnswer.questionId,
      selectedOptionIds: strings(sourceAnswer.selectedOptionIds),
      selectedOptionText: strings(sourceAnswer.selectedOptionIds).map((optionId) => sourceQuestion?.options.find((option) => option.id === optionId)?.text ?? optionId),
      sourceOccurrenceId: sourceAnswer.occurrenceId,
      sourceStepId: sourceAnswer.stepId,
      sourceProvenance: sourceProvenance.get(sourceId)?.origin ?? "source_fixture_authored_response",
      runtimeResponseId: baselineRuntime?.runtimeResponseId ?? null,
      actualCurrentResponseIDs: baselineFullyBound && typeof baselineRuntime?.runtimeResponseId === "string" ? [baselineRuntime.runtimeResponseId] : [],
      occurrenceId: baselineRuntime?.occurrenceId ?? null,
      stepId: baselineRuntime?.stepId ?? null,
      targetIds: baselineRuntime?.targetIds ?? [],
      observationIds: baselineMatching.map((observation) => observation.id),
      packetPhase: phase,
      status: baselineFullyBound ? "current_packet_bound" : baselineRuntime ? "lineage_or_option_mismatch" : "not_administered",
      optional: optionalItems.includes(String(sourceAnswer.questionId)),
    };
    if (requiredItems.includes(String(sourceAnswer.questionId))) baselineActualCurrentObservations.push(baselineItemResult);
    const contractQuestion = sourceQuestion;
    const optionIds = strings(sourceAnswer.selectedOptionIds);
    const optionTexts = optionIds.map((optionId) => contractQuestion?.options.find((option) => option.id === optionId)?.text ?? optionId);
    const itemResult = {
      sourceResponseId: sourceId,
      itemId: sourceAnswer.questionId,
      selectedOptionIds: optionIds,
      selectedOptionText: optionTexts,
      sourceOccurrenceId: sourceAnswer.occurrenceId,
      sourceStepId: sourceAnswer.stepId,
      sourceProvenance: sourceProvenance.get(sourceId)?.origin ?? "source_fixture_authored_response",
      runtimeResponseId: runtime?.runtimeResponseId ?? null,
      actualCurrentResponseIDs: runtime?.runtimeResponseId ? [runtime.runtimeResponseId] : [],
      occurrenceId: runtime?.occurrenceId ?? null,
      stepId: runtime?.stepId ?? null,
      targetIds: runtime?.targetIds ?? [],
      observationIds: matching.map((observation) => observation.id),
      packetPhase: phase,
      status: fullyBound ? "current_packet_bound" : runtime ? "lineage_or_option_mismatch" : "not_administered",
      optional: optionalItems.includes(String(sourceAnswer.questionId)),
    };
    evidenceIndexes.push(itemResult);
    if (requiredItems.includes(String(sourceAnswer.questionId))) actualCurrentObservations.push(itemResult);
  }
  const baselineMissingRequired = requiredAnswers.filter((answer) => !baselineMaterialMatched.has(String(answer.responseId)));
  const baselineVerifier = verifySemanticEvidencePacket({ artifact: baselineArtifact, history, questionSource, requirePacketProvenance: false });
  const baselineAuthoredBindingFailures = verifyAuthoredResponsePacketBinding({ history, artifact: baselineArtifact });
  const sourceMismatchIds = new Set(array(baselineReplay.unreachedOriginalAnswers)
    .filter((answer) => answer.classification === "source_contract_mismatch").map((answer) => answer.responseId));
  const baselineHasSourceMismatch = baselineMissingRequired.some((answer) => sourceMismatchIds.has(answer.responseId));
  const baselineSyntheticResponses = baselineSubmitted.filter((row) => String(row.provenance).startsWith("new_synthetic_"));
  const baselineSyntheticProvenanceMissing = baselineSyntheticResponses.some((row) => !observationsFor(baselineArtifact)
    .some((observation) => observation.response_id === row.runtimeResponseId
      && typeof observation.selection_reason === "string" && observation.selection_reason.includes(String(row.provenance))));
  const baselineClass: CoverageClass = baselineVerifier.status === "fail" || baselineAuthoredBindingFailures.length
    ? "implementation_defect"
    : !baselineMissingRequired.length && requiredAnswers.length > 0 ? baselineSyntheticProvenanceMissing ? "synthetic_contamination" : "fully_evidenced"
      : baselineHasSourceMismatch ? "unreachable_authored_branch"
        : baselineMissingRequired.every((answer) => !baselineSubmitted.some((row) => row.sourceResponseId === answer.responseId && row.status === "answered"))
          ? "unreachable_authored_branch" : "partially_evidenced";
  const verification = verifySemanticEvidencePacket({ artifact: revisedArtifact, history, questionSource });
  const authoredBindingFailures = verifyAuthoredResponsePacketBinding({ history, artifact: revisedArtifact });
  const requiredCoveragePass = requiredAnswers.length > 0 && requiredAnswers.every((answer) => materialMatched.has(String(answer.responseId)));
  const revisedClass: CoverageClass = requiredCoveragePass && verification.status === "pass" && authoredBindingFailures.length === 0
    ? "fully_evidenced" : verification.failures.length || authoredBindingFailures.length ? "implementation_defect" : "partially_evidenced";
  const packetRowsForProfile = Object.entries(packetRows).map(([type, value]) => ({ type, packet: readRecord(readRecord(value).packet) }));
  const allPacketObservations = packetRowsForProfile.flatMap(({ packet }) => array(packet.observations));
  const withheld = array(history.withheldAuthoredAnswers).filter((answer) => relevantItems.includes(String(answer.questionId)));
  const negativeControls = withheld.map((answer) => ({
    sourceAnswer: answer,
    preservedAsSourceOnly: true,
    appearedInBaselineOrRevisedPacket: [...array(readRecord(baselineArtifact.packets).MAP && readRecord(readRecord(readRecord(baselineArtifact.packets).MAP).packet).observations), ...allPacketObservations]
      .some((observation) => observation.item_id === answer.questionId && strings(answer.selectedOptionIds).includes(String(observation.option_id))),
  }));
  const baselineAllRelevantOccurrences = new Set(baselineActualCurrentObservations.map((row) => row.occurrenceId).filter((value): value is string => typeof value === "string"));
  const baselinePacketRowsForProfile = Object.entries(baselinePacketRows).map(([type, value]) => ({ type, packet: readRecord(readRecord(value).packet) }));
  const baselineCurrentEdges = baselinePacketRowsForProfile.flatMap(({ type, packet }) => array(packet.sequence_edges)
    .filter((edge) => baselineAllRelevantOccurrences.has(String(edge.occurrence_id))).map((edge) => ({ packetType: type, ...edge })));
  const baselineCurrentTargets = baselinePacketRowsForProfile.flatMap(({ type, packet }) => array(packet.target_resolutions)
    .filter((target) => baselineAllRelevantOccurrences.has(String(target.occurrence_id))).map((target) => ({ packetType: type, ...target })));
  const baselineComparisons = array(readRecord(baselineReplay.contextDecisions).distinctness)
    .filter((decision) => baselineAllRelevantOccurrences.has(String(decision.sourceOccurrenceId)) || baselineAllRelevantOccurrences.has(String(decision.otherOccurrenceId)));
  const baselineActualEvidenceLineage = { occurrenceIds: [...baselineAllRelevantOccurrences], sequenceEvidence: baselineCurrentEdges, targetLineage: baselineCurrentTargets, comparisonEvidence: baselineComparisons };
  const allRelevantOccurrences = new Set(actualCurrentObservations.map((row) => row.occurrenceId).filter((value): value is string => typeof value === "string"));
  const currentEdges = packetRowsForProfile.flatMap(({ type, packet }) => array(packet.sequence_edges)
    .filter((edge) => allRelevantOccurrences.has(String(edge.occurrence_id))).map((edge) => ({ packetType: type, ...edge })));
  const currentTargets = packetRowsForProfile.flatMap(({ type, packet }) => array(packet.target_resolutions)
    .filter((target) => allRelevantOccurrences.has(String(target.occurrence_id))).map((target) => ({ packetType: type, ...target })));
  const comparisons = array(currentReplay.contextDecisions && readRecord(currentReplay.contextDecisions).distinctness)
    .filter((decision) => allRelevantOccurrences.has(String(decision.sourceOccurrenceId)) || allRelevantOccurrences.has(String(decision.otherOccurrenceId)));
  const submittedForProfile = submitted.filter((row) => row.status === "answered");
  const syntheticMapping = submittedForProfile.filter((row) => row.phase === "mapping" && row.provenance === "new_synthetic_mapping_response");
  return {
    profileId,
    requiredAuthoredResponses: evidenceIndexes.filter((row) => !row.optional),
    optionalAuthoredResponses: evidenceIndexes.filter((row) => row.optional),
    baselineActualCurrentObservations,
    actualCurrentObservations,
    baselineActualEvidenceLineage,
    actualEvidenceLineage: { occurrenceIds: [...allRelevantOccurrences], sequenceEvidence: currentEdges, targetLineage: currentTargets, comparisonEvidence: comparisons },
    negativeControls,
    baselineBoundAuthoredResponseIds: [...baselineMaterialMatched],
    baselineMissingAuthoredResponseIds: baselineMissingRequired.map((answer) => String(answer.responseId)),
    syntheticAnswerInvolvement: {
      newlySyntheticMappingResponses: syntheticMapping.map((row) => ({ sourceResponseId: row.sourceResponseId, runtimeResponseId: row.runtimeResponseId, itemId: row.questionId, optionIds: row.selectedOptionIds, occurrenceId: row.occurrenceId, stepId: row.stepId, provenance: row.provenance })),
      syntheticMappingResponsesInRelevantItems: syntheticMapping.filter((row) => requiredItems.includes(String(row.questionId))).map((row) => row.sourceResponseId),
      newSyntheticDeepeningAnswerCount: array(currentReplay.syntheticDeepeningAnswerAudit).length,
      doesNotSubstituteForAuthoredAnswers: true,
    },
    baselineStatus: baselineClass,
    revisedStatus: revisedClass,
    verifier: { ...verification, failures: [...verification.failures, ...authoredBindingFailures] },
  };
}

function observationsFor(artifact: Row): Row[] {
  return Object.values(readRecord(artifact.packets)).flatMap((value) => array(readRecord(readRecord(value).packet).observations));
}

function isOriginalAuthoredResponse(history: Row, responseId: unknown): boolean {
  return array(history.responseProvenance).some((row) => row.responseId === responseId && String(row.origin).startsWith("original_authored_fictional_"));
}

function sourceResponsePacketBinding(history: Row, artifact: Row, sourceResponseId: string): Row | null {
  const submitted = array(readRecord(artifact.replay).submittedSourceToRuntimeResponses).find((row) => row.sourceResponseId === sourceResponseId);
  if (!submitted || typeof submitted.runtimeResponseId !== "string") return null;
  const phase = array(history.mappingResponses).some((row) => row.responseId === sourceResponseId) ? "MAP" : "IFS";
  const packet = readRecord(readRecord(artifact.packets)[phase]);
  const observations = array(readRecord(packet.packet).observations).filter((row) => row.response_id === submitted.runtimeResponseId);
  return observations.length ? { runtimeResponseId: submitted.runtimeResponseId, observations, status: "current_packet_bound" } : null;
}

async function main(): Promise<void> {
  const [casesSource, sourceManifestText, v3ManifestText, v4ManifestText, v5ManifestText, questionSource, reportSource, ...implementationBytes] = await Promise.all([
    readFile(path.join(ROOT, "SEMANTIC_CASES.json")),
    readFile(path.join(ROOT, "constructed_histories_v2", "manifest.json")),
    readFile(path.join(ROOT, "route_replays_v3", "manifest.json")),
    readFile(path.join(ROOT, "route_replays_v4", "manifest.json")),
    readFile(path.join(ROOT, "route_replays_v5", "manifest.json")),
    loadPwqe51SourcePackage(),
    loadPwrp71SourcePackage(),
    ...IMPLEMENTATION_IDENTITY_FILES.map((file) => readFile(path.join(process.cwd(), file))),
  ]);
  const routerRuntimeSha256 = await computePwqe51RouterRuntimeSha256(process.cwd());
  const sourceManifest = JSON.parse(sourceManifestText.toString("utf8")) as Row;
  const v3Manifest = JSON.parse(v3ManifestText.toString("utf8")) as Row;
  const v4Manifest = JSON.parse(v4ManifestText.toString("utf8")) as Row;
  const v5Manifest = JSON.parse(v5ManifestText.toString("utf8")) as Row;
  const semanticCasesSha256 = sha(casesSource);
  const codeIdentity = Object.fromEntries(IMPLEMENTATION_IDENTITY_FILES.map((file, index) => [file, sha(implementationBytes[index] as Uint8Array)]));
  const sourceCases = JSON.parse(casesSource.toString("utf8")) as Row;
  const caseRows = array(sourceCases.cases);
  if (v3Manifest.schemaVersion !== "PWQE51-ROUTE-REPLAY-V3-MANIFEST" || array(v3Manifest.profiles).length !== 25) {
    throw new Error("The preserved v3 fixture identity or profile count drifted from the audited source.");
  }
  if (semanticCasesSha256 !== "aadc23bbcd8efb180fbccbe54f127024c7b4ea5593b60ca18afb5d4baaa0c819" || caseRows.length !== 14) {
    throw new Error("The authoritative semantic case file bytes or case count drifted from the audited source.");
  }
  const sourceProfiles = new Map(array(sourceManifest.profiles).map((row) => [String(row.id), String(row.file)]));
  const v4Profiles = new Map(array(v4Manifest.profiles).map((row) => [String(row.profileId), row]));
  const v5Profiles = new Map(array(v5Manifest.profiles).map((row) => [String(row.profileId), row]));
  if (PROFILES.some((id) => !sourceProfiles.has(id) || !v4Profiles.has(id) || !v5Profiles.has(id))) throw new Error("At least one authored profile is absent from the v2/v4/v5 index.");
  const v5SecondManifestText = await readFile(path.join(AUDIT_ROOT, "reproducibility-second", "manifest.json"));
  const v5SecondManifest = JSON.parse(v5SecondManifestText.toString("utf8")) as Row;
  const secondProfiles = new Map(array(v5SecondManifest.profiles).map((row) => [String(row.profileId), row]));
  const reproducibilityRows = PROFILES.map((profileId) => ({
    profileId,
    firstSemanticResultSha256: v5Profiles.get(profileId)!.semanticResultSha256,
    secondSemanticResultSha256: secondProfiles.get(profileId)?.semanticResultSha256 ?? null,
    matched: v5Profiles.get(profileId)!.semanticResultSha256 === secondProfiles.get(profileId)?.semanticResultSha256,
    physicalArtifactHashMatched: v5Profiles.get(profileId)!.artifactSha256 === secondProfiles.get(profileId)?.artifactSha256,
  }));
  if (reproducibilityRows.some((row) => !row.matched)) throw new Error("The second v5 replay did not reproduce every normalized semantic result.");
  const loaded = new Map<string, { history: Row; baseline: Row; revised: Row }>();
  const verifierRows: Row[] = [];
  for (const profileId of PROFILES) {
    const [history, baseline, revised] = await Promise.all([
      readJson(path.join(ROOT, "constructed_histories_v2", sourceProfiles.get(profileId)!)),
      readJson(path.join(ROOT, "route_replays_v4", `${profileId}.json`)),
      readJson(path.join(ROOT, "route_replays_v5", `${profileId}.json`)),
    ]);
    loaded.set(profileId, { history, baseline, revised });
    const v4Verification = verifySemanticEvidencePacket({ artifact: baseline, history, questionSource, requirePacketProvenance: false });
    const v5Verification = verifySemanticEvidencePacket({ artifact: revised, history, questionSource });
    const v5AuthoredBindingFailures = verifyAuthoredResponsePacketBinding({ artifact: revised, history });
    verifierRows.push({ profileId, baseline: v4Verification, revised: { ...v5Verification, failures: [...v5Verification.failures, ...v5AuthoredBindingFailures], status: v5Verification.failures.length || v5AuthoredBindingFailures.length ? "fail" : "pass" } });
  }
  const experimentRoot = path.join(ROOT, "route_replays_v5", "experimental-fixtures", "body-detail-opt-in-at-mapping");
  const consentVariantProfiles = ["P05", "C10", "C11"];
  const consentComparisons: Row[] = [];
  for (const profileId of consentVariantProfiles) {
    const [noEntryConsent, mappingEntryConsent] = await Promise.all([
      readJson(path.join(experimentRoot, "unmodified-consent", `${profileId}.json`)),
      readJson(path.join(experimentRoot, "mapping-entry-consent", `${profileId}.json`)),
    ]);
    const history = loaded.get(profileId)!.history;
    const m10Source = [...array(history.mappingResponses), ...array(history.deepeningResponses)].find((answer) => answer.questionId === "M10");
    const permissionEvent = array(history.topicPermissionEvents).find((event) => event.topic === "body_detail" && event.outcome === "opt_in") ?? null;
    const summarize = (artifact: Row) => {
      const replay = readRecord(artifact.replay);
      const submitted = array(replay.submittedSourceToRuntimeResponses);
      const m10 = submitted.find((row) => row.sourceResponseId === m10Source?.responseId || row.questionId === "M10");
      const d36 = submitted.find((row) => row.questionId === "D36");
      const state = readRecord(replay.state);
      const route = readRecord(state.routerResult);
      return {
        mapping: readRecord(replay.completeness).mapping,
        deepening: readRecord(replay.completeness).deepening,
        mappingResponseCount: submitted.filter((row) => row.phase === "mapping").length,
        deepeningResponseCount: submitted.filter((row) => row.phase === "deepening").length,
        acceptedOriginalResponseCount: array(replay.completeResponseProvenance).filter((row) => row.accepted === true && String(row.origin).startsWith("original_authored_fictional_")).length,
        m10: m10 ? { sourceResponseId: m10.sourceResponseId, optionIds: m10.selectedOptionIds, variantId: m10.variantId ?? null, phase: m10.phase, provenance: m10.provenance } : null,
        authoredSemanticAnchorStatus: readRecord(replay.semanticCore).status,
        acceptedSemanticAnchorCount: array(readRecord(replay.semanticCore).acceptedSourceResponseIds).length,
        requiredSemanticAnchorCount: array(readRecord(replay.semanticCore).requiredSourceResponseIds).length,
        deepeningTargets: array(route.targets).map((target) => ({ targetId: target.targetId, state: target.state, candidateItems: target.candidateItems })),
        d36: d36 ? { sourceResponseId: d36.sourceResponseId, optionIds: d36.selectedOptionIds, mode: d36.mode, occurrenceId: d36.occurrenceId, stepId: d36.stepId } : null,
        adapterAccepted: Object.values(readRecord(artifact.packetValidation)).every((result) => readRecord(result).accepted === true),
        mappingEntryControls: readRecord(replay.contextDecisions).mappingEntryTopicOptIns ?? [],
      };
    };
    const baselineReplay = readRecord(noEntryConsent.replay);
    const entryReplay = readRecord(mappingEntryConsent.replay);
    const baselineSubmitted = array(baselineReplay.submittedSourceToRuntimeResponses);
    const entrySubmitted = array(entryReplay.submittedSourceToRuntimeResponses);
    const baselineSourceIds = new Set(baselineSubmitted.map((row) => String(row.sourceResponseId)));
    const entrySourceIds = new Set(entrySubmitted.map((row) => String(row.sourceResponseId)));
    const historyResponses = [...array(history.mappingResponses), ...array(history.deepeningResponses)];
    const historyResponseById = new Map(historyResponses.map((row) => [String(row.responseId), row]));
    const historyProvenanceById = new Map(array(history.responseProvenance).map((row) => [String(row.responseId), row]));
    const entryStateResponses = array(readRecord(entryReplay.state).responses);
    const entryStateResponseById = new Map(entryStateResponses.map((row) => [String(row.responseId), row]));
    const entryPacketByPhase: Readonly<Record<string, Row>> = Object.fromEntries(Object.entries(readRecord(mappingEntryConsent.packets)).map(([type, value]) => [type, readRecord(readRecord(value).packet)]));
    const baselineOccurrenceRefs = new Map(Object.entries(readRecord(baselineReplay.occurrenceReferenceToServerId)).map(([reference, id]) => [String(id), reference]));
    const baselineSyntheticAudits = array(baselineReplay.syntheticDeepeningAnswerAudit);
    const baselineRespondentControls = array(baselineReplay.syntheticRespondentControls);
    const responsesNoLongerAdministered = baselineSubmitted.filter((row) => !entrySourceIds.has(String(row.sourceResponseId))).map((row) => {
      const responseId = String(row.sourceResponseId);
      const audit = baselineSyntheticAudits.find((entry) => entry.sourceQuestionId === row.questionId
        && equalStringArrays(strings(entry.selectedOptionIds), strings(row.selectedOptionIds))
        && entry.serverOccurrenceId === row.occurrenceId && entry.step === row.stepId);
      const control = baselineRespondentControls.find((entry) => entry.questionId === row.questionId
        && (entry.occurrenceId === row.occurrenceId || entry.runtimeOccurrenceId === row.occurrenceId));
      const sourceLine = array(baselineReplay.completeResponseProvenance).find((entry) => entry.sourceResponseId === responseId);
      return {
        profileId,
        sourceResponseId: responseId,
        runtimeResponseId: row.runtimeResponseId,
        sourceQuestionId: row.questionId,
        selectedOptionIds: strings(row.selectedOptionIds),
        occurrenceAndStepLineage: { sourceOccurrenceReference: baselineOccurrenceRefs.get(String(row.occurrenceId)) ?? null,
          runtimeOccurrenceId: row.occurrenceId ?? null, stepId: row.stepId ?? null, phase: row.phase },
        parentAndTargetLineage: { parentResponseIds: strings(row.parentResponseIds), parentTargetIds: strings(row.parentTargetIds),
          targetIds: strings(row.targetIds), packetObservationIds: [] },
        status: row.status,
        mode: row.mode,
        provenanceCategory: row.provenance,
        provenanceUsage: sourceLine?.usage ?? null,
        fictionalRationale: audit?.rationale ?? control?.rationale ?? "The unmodified-consent route ended this branch before an authored response; no answer content was inferred.",
        whyNoLongerAdministered: row.questionId === "M10" && typeof row.variantId === "string"
          ? "This is the unmodified-consent M10.observable-variant skip. The Mapping-entry arm issues the unchanged base M10 source response; this skip is not translated or treated as an answer."
          : "The opt-in arm follows a different production route, so this baseline synthetic answer or control outcome is not issued in that arm.",
        authoredSemanticEvidence: false,
      };
    });
    const newlyAdministeredResponses = entrySubmitted.filter((row) => !baselineSourceIds.has(String(row.sourceResponseId))).map((row) => {
      const sourceId = String(row.sourceResponseId);
      const sourceAnswer = historyResponseById.get(sourceId);
      const sourceProvenance = historyProvenanceById.get(sourceId);
      const stateResponse = entryStateResponseById.get(String(row.runtimeResponseId)) ?? {};
      const packetType = row.phase === "mapping" ? "MAP" : "IFS";
      const packet = entryPacketByPhase[packetType] ?? {};
      const observation = array(packet.observations).find((entry) => entry.response_id === row.runtimeResponseId);
      const observationId = observation?.id;
      const targetLineage = array(packet.target_resolutions).filter((target) => strings(target.source_observation_ids).includes(String(observationId))
        || strings(target.resolution_observation_ids).includes(String(observationId)));
      const sequenceLineage = array(packet.sequence_edges).filter((edge) => strings(edge.evidence_ids).includes(String(observationId)));
      const question = questionSource.questionBank.items.find((item) => item.id === row.questionId);
      const variant = typeof row.variantId === "string" ? questionSource.questionBank.variants.find((entry) => entry.id === row.variantId && entry.replaces === row.questionId) : undefined;
      const options = variant?.options ?? question?.options ?? [];
      const provenance = String(row.provenance ?? "unclassified");
      const syntheticDeepeningAudit = array(entryReplay.syntheticDeepeningAnswerAudit).find((entry) => entry.sourceQuestionId === row.questionId
        && equalStringArrays(strings(entry.selectedOptionIds), strings(row.selectedOptionIds))
        && entry.serverOccurrenceId === row.occurrenceId && entry.step === row.stepId);
      const respondentControl = array(entryReplay.syntheticRespondentControls).find((entry) => entry.questionId === row.questionId
        && (entry.occurrenceId === row.occurrenceId || entry.runtimeOccurrenceId === row.occurrenceId));
      const affectedCaseIds = profileId === "C10" ? ["CQ08", "CQ09"] : profileId === "C11" ? ["CQ10"] : [];
      const routeEnabler = affectedCaseIds.length > 0 && row.phase === "mapping";
      const requiredSemanticResponseIds = new Set(affectedCaseIds.flatMap((caseId) => {
        const caseSource = caseRows.find((candidate) => candidate.id === caseId);
        if (!caseSource || !strings(caseSource.plan_ids).includes(profileId)) return [];
        const relevantItems = new Set(strings(caseSource.relevant_items));
        return historyResponses.filter((answer) => relevantItems.has(String(answer.questionId))
          && isOriginalAuthoredResponse(history, answer.responseId)).map((answer) => String(answer.responseId));
      }));
      return {
        profileId,
        sourceResponseId: sourceId,
        runtimeResponseId: row.runtimeResponseId,
        sourceQuestionId: row.questionId,
        selectedOptionIds: strings(row.selectedOptionIds),
        selectedOptions: strings(row.selectedOptionIds).map((optionId) => ({ optionId, text: options.find((option) => option.id === optionId)?.text ?? null,
          reportedValue: options.find((option) => option.id === optionId)?.reported_value ?? null })),
        occurrenceAndStepLineage: { sourceOccurrenceReference: sourceAnswer?.occurrenceId ?? null,
          runtimeOccurrenceId: row.occurrenceId ?? null, stepId: row.stepId ?? null, phase: row.phase },
        parentAndTargetLineage: { parentResponseIds: strings(stateResponse.parentResponseIds ?? stateResponse.parent_response_ids ?? row.parentResponseIds),
          parentOccurrenceId: stateResponse.parentOccurrenceId ?? stateResponse.parent_occurrence_id ?? row.parentOccurrenceId ?? null,
          parentTargetIds: strings(stateResponse.parentTargetIds ?? row.parentTargetIds), responseTargetIds: strings(row.targetIds ?? stateResponse.targetIds),
          targetResolutionRecords: targetLineage, sequenceRecords: sequenceLineage,
          packetObservationId: observationId ?? null },
        fictionalRationale: sourceProvenance?.note ?? syntheticDeepeningAudit?.rationale ?? respondentControl?.rationale ?? (provenance === "original_authored_fictional_response"
          ? "Original authored selection became reachable under the changed permission timing; selected option remains unchanged."
          : "The replay record contains no separate source-specific rationale."),
        sourceProvenanceCategory: provenance,
        archivedSourceProvenance: sourceProvenance?.origin ?? null,
        necessaryToRecoverAuthoredAnchorRoute: routeEnabler,
        routeEnablerForSemanticCaseIds: routeEnabler ? affectedCaseIds : [],
        newlyAuthoredSyntheticEvidenceInThisV5Run: provenance === "new_synthetic_deepening_answer" || provenance === "new_fictional_control_outcome",
        newlyReachedArchivedSyntheticScaffold: provenance === "new_synthetic_mapping_response",
        necessaryToRecoverIntendedSemanticEvidence: provenance === "original_authored_fictional_response" && requiredSemanticResponseIds.has(sourceId),
        directlySupportsSemanticCaseIds: provenance === "original_authored_fictional_response" && requiredSemanticResponseIds.has(sourceId) ? affectedCaseIds : [],
        affectsSemanticCaseIds: routeEnabler || (provenance === "original_authored_fictional_response" && requiredSemanticResponseIds.has(sourceId))
          || (syntheticDeepeningAudit?.changesIntendedSemanticTest === true) ? affectedCaseIds : [],
        apparentPsychologicalProfileEffect: provenance === "new_synthetic_mapping_response" || provenance === "new_synthetic_deepening_answer" || provenance === "new_fictional_control_outcome"
          ? "Adds fictional routing or missingness context and may distort a writer's impression if provenance is ignored; excluded as independent support for the authored distinction."
          : "Makes an unchanged source-authored selection available; it changes evidence availability, not the selected psychological content.",
      };
    });
    const applicableCaseIds = profileId === "C10" ? ["CQ08", "CQ09"] : profileId === "C11" ? ["CQ10"] : [];
    const consentCaseCoverage = await Promise.all(applicableCaseIds.map(async (caseId) => {
      const caseSource = caseRows.find((candidate) => candidate.id === caseId);
      const relevantItems = caseSource ? strings(caseSource.relevant_items) : [];
      const noEntryAudit = caseSource ? await auditProfile({ profileId, caseId, relevantItems, history, baselineArtifact: noEntryConsent,
        revisedArtifact: noEntryConsent, questionSource }) : undefined;
      const entryAudit = caseSource ? await auditProfile({ profileId, caseId, relevantItems, history, baselineArtifact: mappingEntryConsent,
        revisedArtifact: mappingEntryConsent, questionSource }) : undefined;
      return { caseId, noEntryClassification: noEntryAudit?.revisedStatus ?? "unresolved",
        mappingEntryClassification: entryAudit?.revisedStatus ?? "unresolved",
        missingRequiredAuthoredResponsesWithoutEntry: noEntryAudit?.requiredAuthoredResponses.filter((answer) => answer.status !== "current_packet_bound") ?? [],
        currentRequiredAuthoredResponsesWithEntry: entryAudit?.requiredAuthoredResponses,
        noEntryVerifier: noEntryAudit?.verifier, mappingEntryVerifier: entryAudit?.verifier };
    }));
    const entryControl = array(readRecord(entryReplay.contextDecisions).mappingEntryTopicOptIns)[0] ?? {};
    const controlAssessment = {
      kind: "topic_permission_control",
      sourceQuestionAndSelectedOption: { questionId: null, selectedOptionIds: [], topic: "body_detail" },
      effectiveOccurrenceAndStep: { occurrenceReference: null, runtimeOccurrenceId: null, stepOrBoundary: "before_mapping" },
      parentAndTargetLineage: { parentResponseIds: [], targetIds: [], basis: "session topic permission is not a response and creates no response target" },
      fictionalRationale: entryControl.rationale ?? null,
      sourceProvenanceCategory: entryControl.provenance ?? "new_synthetic_mapping_control",
      archivedPermissionProvenance: entryControl.archivedPermissionProvenance ?? permissionEvent?.provenance ?? null,
      necessaryToRecoverIntendedSemanticEvidence: applicableCaseIds.length > 0,
      affectsSemanticCaseIds: applicableCaseIds,
      apparentPsychologicalProfileEffect: "Adds permission only, not answer content; it changes which source question the router can issue and therefore the available route context.",
    };
    consentComparisons.push({
      profileId,
      originalM10: m10Source ? { responseId: m10Source.responseId, optionIds: m10Source.selectedOptionIds, sourceVariantId: m10Source.variantId ?? null } : null,
      archivedPermissionDeclaration: permissionEvent,
      baselineReplayApplicationBoundary: "deepening_start",
      experimentalReplayApplicationBoundary: "before_mapping",
      unmodifiedConsent: summarize(noEntryConsent),
      mappingEntryOptIn: summarize(mappingEntryConsent),
      exactM10OptionPreserved: JSON.stringify(readRecord(summarize(mappingEntryConsent).m10).optionIds) === JSON.stringify(m10Source?.selectedOptionIds),
      noOptionTranslation: true,
      controlAssessment,
      newlyAdministeredResponses,
      responsesNoLongerAdministered,
      consentCaseCoverage,
      negativeControlImplications: "The variant is applied only to P05/C10/C11. C02 D67/D68 and C09 D79 remain unadministered in the full v5 corpus; their unchanged v2 histories are checked in the profile-control comparison.",
      experimentArtifactHashes: {
        unmodifiedConsent: sha(Buffer.from(`${JSON.stringify(noEntryConsent, null, 2)}\n`)),
        mappingEntryConsent: sha(Buffer.from(`${JSON.stringify(mappingEntryConsent, null, 2)}\n`)),
      },
    });
  }
  const consentVariantManifest = {
    schemaVersion: "PWRP71-FICTIONAL-CONSENT-TIMING-EXPERIMENT-V1",
    variantId: "body-detail-opt-in-at-mapping-entry-v1",
    fixtureProvenance: "new_synthetic_mapping_control",
    sourceHistoryChanges: false,
    questionBankOrOptionTranslation: false,
    control: { topic: "body_detail", appliedBefore: "Mapping", preservesOriginalM10QuestionAndSelectedOption: true, translatesNoArchivedAnswers: true },
    profiles: consentComparisons,
    comparison: "Both configurations use the production session lifecycle and the same pinned v2 histories. Baseline permission is applied at Deepening start by the existing replay boundary; the experimental opt-in is available to the Mapping router from session creation.",
    sourceFiles: { v2ManifestSha256: v4Manifest.inputs && readRecord(v4Manifest.inputs).v2ManifestSha256, baselineOutput: "unmodified-consent/", variantOutput: "mapping-entry-consent/" },
  };
  const fixtureChangeLedger = {
    schemaVersion: "PWRP71-FICTIONAL-FIXTURE-CHANGE-LEDGER-V1",
    sourceHistoryChanges: false,
    newSelectionsAddedToArchivedHistories: 0,
    syntheticDeepeningAnswersObservedInEntryConsentDelta: consentComparisons.reduce((count, entry) => count
      + array(entry.newlyAdministeredResponses).filter((row) => row.sourceProvenanceCategory === "new_synthetic_deepening_answer").length, 0),
    unchangedConsentConfigurationPreserved: true,
    changes: consentComparisons.map((entry) => ({
      profileId: entry.profileId,
      control: entry.controlAssessment,
      newlyAdministeredResponses: entry.newlyAdministeredResponses,
      responsesNoLongerAdministered: entry.responsesNoLongerAdministered,
      caseCoverage: entry.consentCaseCoverage,
      negativeControlImplications: entry.negativeControlImplications,
    })),
  };
  const fixtureChangeMarkdown = [
    "# Fictional fixture change ledger",
    "",
    "The v2 authored histories remain unchanged. The experiment adds an explicitly marked Mapping-entry `body_detail` permission control and does not translate or replace archived selections. The full-session replay also generates separate synthetic Deepening answers; each is itemized with its rationale and provenance. Newly reached synthetic Mapping scaffold answers are identified as archived v2 scaffold, not as evidence for the authored semantic distinctions.",
    "",
    "| Profile | New control | Original selections | Archived synthetic Mapping | New synthetic Deepening | Old-branch outcomes dropped | Case coverage |",
    "|---|---|---:|---:|---:|---:|---|",
    ...consentComparisons.map((entry) => {
      const control = readRecord(entry.controlAssessment);
      const delta = array(entry.newlyAdministeredResponses);
      const original = delta.filter((row) => row.sourceProvenanceCategory === "original_authored_fictional_response").length;
      const synthetic = delta.filter((row) => row.sourceProvenanceCategory === "new_synthetic_mapping_response").length;
      const syntheticDeepening = delta.filter((row) => row.sourceProvenanceCategory === "new_synthetic_deepening_answer").length;
      const dropped = array(entry.responsesNoLongerAdministered).length;
      const coverage = array(entry.consentCaseCoverage).map((row) => `${String(row.caseId)} ${String(row.noEntryClassification)} → ${String(row.mappingEntryClassification)}`).join("; ") || "no authored CQ case assigned";
      return `| ${String(entry.profileId)} | ${String(control.sourceProvenanceCategory)} before Mapping | ${original} | ${synthetic} | ${syntheticDeepening} | ${dropped} | ${coverage} |`;
    }),
    "",
    "Every newly administered response includes its source option, source and runtime occurrence/step, packet target and sequence lineage, rationale, provenance class, semantic necessity, affected cases, and potential profile effect in `fixture-change-ledger.json`.",
  ].join("\n");
  const variantMarkdown = [
    "# Body-detail consent timing experiment",
    "",
    "The authored v2 files remain unchanged. Both fixture runs use the production session lifecycle; the variant adds an explicitly synthetic permission before Mapping. It preserves each source M10 option and does not translate between base M10 and M10.observable.",
    "",
    "| Profile | Archived permission provenance | No-entry M10 | Entry opt-in M10 | Mapping answers | Deepening answers | Anchors | D36 |",
    "|---|---|---|---|---:|---:|---|---|",
    ...consentComparisons.map((row) => {
      const normal = readRecord(row.unmodifiedConsent); const variant = readRecord(row.mappingEntryOptIn);
      return `| ${row.profileId} | ${String(readRecord(row.archivedPermissionDeclaration).provenance)} | ${JSON.stringify(readRecord(normal.m10).optionIds ?? null)} | ${JSON.stringify(readRecord(variant.m10).optionIds ?? null)} | ${normal.mappingResponseCount} → ${variant.mappingResponseCount} | ${normal.deepeningResponseCount} → ${variant.deepeningResponseCount} | ${String(normal.authoredSemanticAnchorStatus)} → ${String(variant.authoredSemanticAnchorStatus)} | ${normal.d36 ? "available" : "unreached"} → ${variant.d36 ? "available" : "unreached"} |`;
    }),
    "",
    "C10's ordered D36 response is additional bounded chronology; the applicable CQ08/CQ09 distinction does not depend on inventing order beyond D36's explicit partial order. P05 remains separately evaluated for its own authored anchors.",
  ].join("\n");
  const matrixCases: Row[] = [];
  const claimEvidenceCases: Row[] = [];
  for (const sourceCase of caseRows) {
    const caseId = String(sourceCase.id);
    const meta = INTERPRETATION[caseId];
    if (!meta) throw new Error(`Missing independent interpretation for ${caseId}.`);
    const profiles = strings(sourceCase.plan_ids);
    const profileEvidence: ProfileEvidence[] = [];
    for (const profileId of profiles) {
      const row = loaded.get(profileId)!;
      profileEvidence.push(await auditProfile({ profileId, caseId, relevantItems: strings(sourceCase.relevant_items), history: row.history,
        baselineArtifact: row.baseline, revisedArtifact: row.revised, questionSource }));
    }
    const statuses = profileEvidence.map((evidence) => evidence.revisedStatus);
    const revisedStatus: CoverageClass = statuses.every((status) => status === "fully_evidenced") ? "fully_evidenced"
      : statuses.some((status) => status === "implementation_defect") ? "implementation_defect" : "partially_evidenced";
    const baselineStatuses = profileEvidence.map((evidence) => evidence.baselineStatus);
    const baselineStatus: CoverageClass = baselineStatuses.every((status) => status === "fully_evidenced") ? "fully_evidenced"
      : baselineStatuses.some((status) => status === "implementation_defect") ? "implementation_defect"
        : baselineStatuses.some((status) => status === "unreachable_authored_branch") ? "unreachable_authored_branch"
          : baselineStatuses.some((status) => status === "synthetic_contamination") ? "synthetic_contamination"
            : baselineStatuses.some((status) => status === "valid_negative_case") ? "valid_negative_case"
              : baselineStatuses.some((status) => status === "partially_evidenced") ? "partially_evidenced" : "unresolved";
    const repaired = ["CQ08", "CQ09", "CQ10"].includes(caseId);
    const caseEntry = {
      caseId,
      name: sourceCase.name,
      profiles,
      requiredAuthoredItemOptionObservations: profileEvidence.flatMap((evidence) => evidence.requiredAuthoredResponses.map((row) => ({ profileId: evidence.profileId, ...row }))),
      optionalAuthoredItemOptionObservations: profileEvidence.flatMap((evidence) => evidence.optionalAuthoredResponses.map((row) => ({ profileId: evidence.profileId, ...row }))),
      v4ActualCurrentResponseIDs: profileEvidence.flatMap((evidence) => evidence.baselineActualCurrentObservations.flatMap((row) => Array.isArray(row.actualCurrentResponseIDs) ? (row.actualCurrentResponseIDs as string[]).map((id) => ({ profileId: evidence.profileId, sourceResponseId: row.sourceResponseId, responseId: id, itemId: row.itemId, optionIds: row.selectedOptionIds, observationIds: row.observationIds, occurrenceId: row.occurrenceId, stepId: row.stepId, targetIds: row.targetIds })) : [])),
      actualCurrentResponseIDs: profileEvidence.flatMap((evidence) => evidence.actualCurrentObservations.flatMap((row) => Array.isArray(row.actualCurrentResponseIDs) ? (row.actualCurrentResponseIDs as string[]).map((id) => ({ profileId: evidence.profileId, responseId: id, itemId: row.itemId, optionIds: row.selectedOptionIds, observationIds: row.observationIds, occurrenceId: row.occurrenceId, stepId: row.stepId })) : [])),
      requiredComparisonAndSequenceEvidence: { authoredExpectation: meta.lineage, actualByProfile: profileEvidence.map((evidence) => ({ profileId: evidence.profileId, v4: evidence.baselineActualEvidenceLineage, v5: evidence.actualEvidenceLineage })) },
      actualSupportedPropositions: [String(sourceCase.supported_distinction), ...meta.supported],
      unsupportedPropositions: [String(sourceCase.guard_against), ...meta.unsupported],
      counterexamplesAndAlternatives: meta.alternatives,
      negativeControlExpectations: profileEvidence.flatMap((evidence) => evidence.negativeControls.map((control) => ({ profileId: evidence.profileId, ...control }))),
      missingOrInvalidatedEvidence: profileEvidence.flatMap((evidence) => [
        ...evidence.requiredAuthoredResponses.filter((row) => row.status !== "current_packet_bound").map((row) => ({ profileId: evidence.profileId, ...row })),
        ...evidence.optionalAuthoredResponses.filter((row) => row.status !== "current_packet_bound").map((row) => ({ profileId: evidence.profileId, ...row })),
      ]),
      syntheticAnswerInvolvement: profileEvidence.map((evidence) => ({ profileId: evidence.profileId, ...evidence.syntheticAnswerInvolvement })),
      v4Classification: baselineStatus,
      v5Classification: revisedStatus,
      finalClassification: revisedStatus,
      repairCandidate: repaired ? {
        action: "separately labeled body_detail opt-in before Mapping, then replay the unchanged original answer through the production session route",
        variant: "body-detail-opt-in-at-mapping-entry-v1",
        newlyAuthoredControl: true,
        v2SourceChanged: false,
        verified: revisedStatus === "fully_evidenced",
      } : null,
      sourceAuthoredMeaning: sourceCase.supported_distinction,
      authoredGuard: sourceCase.guard_against,
      evidenceQualificationBoundary: "A current packet observation proves only the selected fictional answer with its recorded scope and lineage. It is not report quality, empirical evidence, clinical truth, or human approval.",
    };
    matrixCases.push(caseEntry);
    claimEvidenceCases.push({ caseId, name: sourceCase.name, profiles: profileEvidence.map((evidence) => ({
      profileId: evidence.profileId,
      requiredAuthoredResponses: evidence.requiredAuthoredResponses,
      optionalAuthoredResponses: evidence.optionalAuthoredResponses,
      currentPacketObservations: evidence.actualCurrentObservations,
      v4CurrentPacketObservations: evidence.baselineActualCurrentObservations,
      v4ActualEvidenceLineage: evidence.baselineActualEvidenceLineage,
      actualEvidenceLineage: evidence.actualEvidenceLineage,
      syntheticAnswerInvolvement: evidence.syntheticAnswerInvolvement,
      v4Classification: evidence.baselineStatus,
      v4BoundAuthoredResponseIds: evidence.baselineBoundAuthoredResponseIds,
      v4MissingAuthoredResponseIds: evidence.baselineMissingAuthoredResponseIds,
      v5Classification: evidence.revisedStatus,
      verifier: evidence.verifier,
    })) });
  }
  const v5Failures = verifierRows.flatMap((row) => {
    const revised = readRecord(row.revised);
    return [...array(revised.failures).map((failure) => `${String(row.profileId)}:${JSON.stringify(failure)}`)];
  });
  const matrix = {
    schemaVersion: "PWRP71-SEMANTIC-EVIDENCE-COVERAGE-MATRIX-V1",
    auditBasis: "independent source/response/packet-contract examination; never inferred from mock generator success or adapterAccepted flags",
    sourceIdentity: {
      startingBranch: "codex/pwqe51-fictional-session-replay-pwrp71-v4",
      startingCommit: "9b7095919c99861510be8498b822ae8983eaed87",
      questionRelease: sourceCases.question_release,
      questionSourceSha256: readRecord(sourceCases.source_binding).source_sha256,
      questionSourceManifestSha256: questionSource.sourceManifestSha256,
      routerVersion: readRecord(sourceCases.source_binding).runtime_version,
      routerRuntimeSha256,
      reportRelease: sourceCases.report_release,
      reportManifestSha256: reportSource.manifestSha256,
      promptSchemaIdentity: { reportDraftSchema: reportSource.policy.draft_schema, reviewSchema: reportSource.policy.review_schema, manifestFiles: reportSource.manifest.files },
      candidatePolicy: { candidates: QUALIFICATION_MODEL_ORDER, sha256: sha256Canonical(QUALIFICATION_MODEL_ORDER), mockedReportModelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
        mockedReportModelPolicySha256: sha256Canonical(UNQUALIFIED_MOCK_MODEL_POLICY) },
      semanticCaseSetSha256: semanticCasesSha256,
      v2SourceCommit: sourceManifest.sourceCommit,
      v2ManifestSha256: v4Manifest.inputs && readRecord(v4Manifest.inputs).v2ManifestSha256,
      v3ManifestSha256: sha(v3ManifestText),
      v4ManifestSha256: sha(v4ManifestText),
      v5ManifestSha256: sha(v5ManifestText),
      currentImplementationFileSha256: codeIdentity,
    },
    classifications: { baselineV4: "derived from exact source option, current response, occurrence, step, and packet observation bindings plus the independent verifier", revisedV5: "derived from original authored response-to-current-packet bindings plus the independent verifier" },
    cases: matrixCases,
  };
  const claimAudit = {
    schemaVersion: "PWRP71-SOURCE-TO-PACKET-CLAIM-EVIDENCE-AUDIT-V1",
    sourceFiles: { semanticCases: "SEMANTIC_CASES.json", authoredHistories: "constructed_histories_v2/", baselinePackets: "route_replays_v4/", revisedPackets: "route_replays_v5/" },
    verificationMethod: "Join original source response ID to production-session submission, then packet response_id, item_id, option_id, occurrence_id, and step_id; validate active status and pinned question option. Adapter acceptance is not used.",
    independentInvariantResults: verifierRows,
    cases: claimEvidenceCases,
  };
  const reproducibility = {
    schemaVersion: "PWQE51-V5-REPRODUCIBILITY-REPORT-V1",
    firstManifestSha256: sha(v5ManifestText),
    secondManifestSha256: sha(v5SecondManifestText),
    profileCount: reproducibilityRows.length,
    matchedSemanticResults: reproducibilityRows.filter((row) => row.matched).length,
    allSemanticResultsMatched: reproducibilityRows.every((row) => row.matched),
    physicalArtifactHashesDifferDueToRuntimeOccurrenceAndResponseIds: reproducibilityRows.filter((row) => !row.physicalArtifactHashMatched).length,
    profiles: reproducibilityRows,
  };
  const protectedSources = {
    schemaVersion: "PWRP71-PROTECTED-SOURCE-ARTIFACT-HASHES-V1",
    roots: {
      constructed_histories_v2: { manifestSha256: sha(sourceManifestText), files: await hashTree(path.join(ROOT, "constructed_histories_v2")) },
      route_replays_v3: { manifestSha256: sha(v3ManifestText), files: await hashTree(path.join(ROOT, "route_replays_v3")) },
      route_replays_v4: { manifestSha256: sha(v4ManifestText), files: await hashTree(path.join(ROOT, "route_replays_v4")) },
    },
  };
  const priorities = {
    schemaVersion: "PWRP71-AUTHORED-ANCHOR-RECOVERY-PRIORITIES-V1",
    judgments: [
      { profile: "C10", missing: ["D36 ordered recovery answer in v4"], materiality: "Its exact partial order is useful but not required to distinguish continued task function from ease or changed recovery conditions/meaning. The Mapping-entry opt-in experiment legitimately made this source answer available and retained its exact order in v5.", disposition: "recovered as optional authored branch evidence in v5" },
      { profile: "C11", missing: ["M13.company", "D87.settled", "D88.held", "D86.support"], materiality: "These are material to CQ10 because they separate company, internal effect, shared practical support, and aftermath. v4 did not preserve them in the packet.", disposition: "recovered through separately marked Mapping-entry opt-in in v5" },
      { profile: "C12", missing: ["D45.return"], materiality: "Optional to CQ11: D43/D89/D90 plus the actual D42 different-known-delay event preserve the intended wanted-versus-expected distinction.", disposition: "not needed for the authored semantic case; retain as optional branch observation" },
      { profile: "P05", missing: ["M10.words and some downstream authored answers in v4"], materiality: "Source-contract mismatch caused by M10.observable. The experiment shows the exact authored base M10 answer is issued if explicit body_detail permission exists at Mapping entry. No option translation; P05's unrelated authored anchor completeness remains separately assessed.", disposition: "recovered only in the separately labeled variant; original consent timing retained" },
      { profile: "P04", missing: ["D43", "D16"], materiality: "Not required by CQ01-CQ14; optional focused branch evidence.", disposition: "preserve as focused branch; do not synthesize" },
      { profile: "P06", missing: ["D01"], materiality: "Not required by CQ01-CQ14; optional focused branch evidence.", disposition: "preserve as focused branch; do not synthesize" },
      { profile: "P08", missing: ["D18"], materiality: "Not required by CQ01-CQ14; optional focused branch evidence.", disposition: "preserve as focused branch; do not synthesize" },
      { profile: "P09", missing: ["D61", "D07", "D08", "D11", "D10"], materiality: "Not required by CQ01-CQ14; preserve the legitimate route branch and do not force these items.", disposition: "preserve as focused branch; do not synthesize" },
      { profile: "P07", missing: ["no authored Deepening anchors"], materiality: "Absence is not a failure. An ordinary bounded packet can be useful; invented protectors or psychological problems would overreach.", disposition: "retain as positive restraint case; no recovery required" },
    ],
  };
  const profileControlRows: Row[] = [];
  for (const profileId of PROFILES) {
    const { history, baseline, revised } = loaded.get(profileId)!;
    const withholds = array(history.withheldAuthoredAnswers).map((answer) => {
      const sourceAnswerRef = answer.sourceAnswerRef;
      const matchingObservations = (artifact: Row) => observationsFor(artifact).filter((observation) => observation.item_id === answer.questionId
        && strings(answer.selectedOptionIds).includes(String(observation.option_id)));
      return { sourceAnswerRef, questionId: answer.questionId, selectedOptionIds: answer.selectedOptionIds, reason: answer.reason,
        baselinePacketObservations: matchingObservations(baseline).map((observation) => observation.id), revisedPacketObservations: matchingObservations(revised).map((observation) => observation.id),
        preservedAsSourceOnly: matchingObservations(baseline).length === 0 && matchingObservations(revised).length === 0 };
    });
    const currentHistoryAnswers = [...array(history.mappingResponses), ...array(history.deepeningResponses)];
    const acceptedOriginalCount = (artifact: Row) => array(readRecord(artifact.replay).completeResponseProvenance)
      .filter((row) => row.accepted === true && String(row.origin).startsWith("original_authored_fictional_")).length;
    profileControlRows.push({
      profileId,
      sourceAuthoredAnswerCount: currentHistoryAnswers.filter((answer) => isOriginalAuthoredResponse(history, answer.responseId)).length,
      v4AcceptedOriginalAnswerCount: acceptedOriginalCount(baseline),
      v5AcceptedOriginalAnswerCount: acceptedOriginalCount(revised),
      v4SyntheticMappingResponseCount: array(readRecord(baseline.replay).submittedSourceToRuntimeResponses).filter((row) => row.provenance === "new_synthetic_mapping_response").length,
      v5SyntheticMappingResponseCount: array(readRecord(revised.replay).submittedSourceToRuntimeResponses).filter((row) => row.provenance === "new_synthetic_mapping_response").length,
      v4SemanticCore: readRecord(readRecord(baseline.replay).semanticCore).status,
      v5SemanticCore: readRecord(readRecord(revised.replay).semanticCore).status,
      mappingEntryConsentVariant: readRecord(revised).experimentalFixtureVariant ?? null,
      intentionallyWithheldAnswers: withholds,
      negativeControlsPreserved: withholds.every((row) => row.preservedAsSourceOnly),
    });
  }
  const contrastRows = CONTRASTS.map((contrast) => {
    const sides = Object.entries(contrast.requirements).map(([profileId, items]) => {
      const { history, baseline, revised } = loaded.get(profileId)!;
      const answers = [...array(history.mappingResponses), ...array(history.deepeningResponses)]
        .filter((answer) => items.includes(String(answer.questionId)) && isOriginalAuthoredResponse(history, answer.responseId));
      const summarizeBindings = (artifact: Row) => answers.map((answer) => {
        const bound = sourceResponsePacketBinding(history, artifact, String(answer.responseId));
        return { sourceResponseId: answer.responseId, itemId: answer.questionId, optionIds: answer.selectedOptionIds,
          currentPacketBound: !!bound, observationIds: array(bound?.observations).map((observation) => observation.id) };
      });
      return { profileId, sourceOptionSelections: answers.map((answer) => ({ itemId: answer.questionId, optionIds: answer.selectedOptionIds })),
        v4: summarizeBindings(baseline), v5: summarizeBindings(revised),
        v5AllOriginalSelectionsBound: summarizeBindings(revised).every((entry) => entry.currentPacketBound) };
    });
    return { contrastId: contrast.id, intendedDistinction: contrast.distinction, profiles: sides };
  });
  const controlComparison = {
    schemaVersion: "PWRP71-PROFILE-POSITIVE-NEGATIVE-CONTROL-COMPARISON-V1",
    comparisonBasis: "v2 source selections, v4/v5 current packet observations, source-only withheld answers, and explicit semantic contrast pairs",
    profiles: profileControlRows,
    contrastPairs: contrastRows,
    allOriginalNegativeControlsPreserved: profileControlRows.every((profile) => profile.negativeControlsPreserved),
  };
  const controlMarkdown = [
    "# Profile positive and negative control comparison",
    "",
    "| Profile | Accepted original answers v4 → v5 | Synthetic Mapping answers v4 → v5 | Semantic core v4 → v5 | Withheld controls preserved |",
    "|---|---:|---:|---|---|",
    ...profileControlRows.map((profile) => `| ${profile.profileId} | ${profile.v4AcceptedOriginalAnswerCount} → ${profile.v5AcceptedOriginalAnswerCount} | ${profile.v4SyntheticMappingResponseCount} → ${profile.v5SyntheticMappingResponseCount} | ${String(profile.v4SemanticCore)} → ${String(profile.v5SemanticCore)} | ${profile.negativeControlsPreserved ? "yes" : "no"} |`),
    "",
    "## Semantic control pairs",
    "",
    ...contrastRows.map((row) => `- **${row.contrastId}:** ${row.intendedDistinction}. ${(row.profiles as Row[]).map((side) => `${side.profileId} ${(side.v5AllOriginalSelectionsBound ? "retained current authored observations" : "needs review")}`).join("; ")}.`),
  ].join("\n");
  const markdown = [
    "# Semantic evidence coverage matrix",
    "",
    `Case-set SHA-256: \`${semanticCasesSha256}\`. V4 baseline and v5 revised results are classified separately. Structural mock success is not a semantic result.`,
    "",
    "| Case | Profiles | V4 audit | V5 packet evidence | Prohibited conclusion |",
    "|---|---|---|---|---|",
    ...matrixCases.map((entry) => `| ${entry.caseId} | ${(entry.profiles as string[]).join(", ")} | ${entry.v4Classification} | ${entry.v5Classification} | ${INTERPRETATION[String(entry.caseId)]!.unsupported.join("; ").replaceAll("|", "\\|")} |`),
    "",
    "## Case evidence notes",
    "",
    ...matrixCases.flatMap((entry) => [
      `### ${entry.caseId} — ${String(entry.name).replaceAll("_", " ")}`,
      "",
      `- V4 classification: **${String(entry.v4Classification)}**. V5 classification: **${String(entry.v5Classification)}**.`,
      `- Supported distinction: ${INTERPRETATION[String(entry.caseId)]!.supported.join(" ")}`,
      `- Unsupported: ${INTERPRETATION[String(entry.caseId)]!.unsupported.join(" ")}`,
      `- Negative controls: ${((entry.negativeControlExpectations as Row[] | undefined) ?? []).length
        ? ((entry.negativeControlExpectations as Row[]).map((control) => `${String(control.profileId)} ${String(readRecord(control.sourceAnswer).questionId)} source answer remains ${control.appearedInBaselineOrRevisedPacket ? "in packet evidence (unexpected)" : "source-only and unadministered"}`).join("; "))
        : "none specified for this case"}`,
      `- Lineage: ${INTERPRETATION[String(entry.caseId)]!.lineage}`,
      `- Required authored observations: ${(entry.requiredAuthoredItemOptionObservations as Row[]).length}; current source-bound response/observation matches: v4 ${(entry.v4ActualCurrentResponseIDs as Row[]).length}, v5 ${(entry.actualCurrentResponseIDs as Row[]).length}.`,
      "- Synthetic Mapping and Deepening involvement is separately provenance-marked in the case JSON; it does not substitute for the selected original authored options listed above.",
      "",
    ]),
  ].join("\n");
  const offlineRunSummary = await summarizeOfflineRun({
    runDirectory: path.join(ROOT, "route_replays_v5", "offline-run", "pwrp71-v5-provenance-full-20261008-cap5usd"),
    fixtureSet: "route-replays-v5",
    fixtureManifestBytes: v5ManifestText,
  });
  const v4OfflineRunSummary = await summarizeOfflineRun({
    runDirectory: path.join(AUDIT_ROOT, "v4-baseline-offline", "pwrp71-v4-gate0-reproduction-20261008"),
    fixtureSet: "route-replays-v4",
    fixtureManifestBytes: v4ManifestText,
  });
  await writeJson(path.join(AUDIT_ROOT, "coverage-matrix.json"), matrix);
  await writeFile(path.join(AUDIT_ROOT, "coverage-matrix.md"), markdown, "utf8");
  await writeJson(path.join(AUDIT_ROOT, "claim-evidence-audit.json"), claimAudit);
  await writeJson(path.join(AUDIT_ROOT, "reproducibility-report.json"), reproducibility);
  await writeJson(path.join(AUDIT_ROOT, "protected-source-hashes.json"), protectedSources);
  await writeJson(path.join(AUDIT_ROOT, "anchor-recovery-priorities.json"), priorities);
  await writeJson(path.join(AUDIT_ROOT, "profile-control-comparison.json"), controlComparison);
  await writeFile(path.join(AUDIT_ROOT, "profile-control-comparison.md"), controlMarkdown, "utf8");
  await writeJson(path.join(AUDIT_ROOT, "offline-run-summary.json"), offlineRunSummary.json);
  await writeFile(path.join(AUDIT_ROOT, "offline-run-summary.md"), offlineRunSummary.markdown, "utf8");
  await writeJson(path.join(AUDIT_ROOT, "v4-offline-baseline-summary.json"), v4OfflineRunSummary.json);
  await writeFile(path.join(AUDIT_ROOT, "v4-offline-baseline-summary.md"), v4OfflineRunSummary.markdown, "utf8");
  await writeJson(path.join(experimentRoot, "variant-manifest.json"), consentVariantManifest);
  await writeFile(path.join(experimentRoot, "comparison.md"), variantMarkdown, "utf8");
  await writeJson(path.join(AUDIT_ROOT, "fixture-change-ledger.json"), fixtureChangeLedger);
  await writeFile(path.join(AUDIT_ROOT, "fixture-change-ledger.md"), fixtureChangeMarkdown, "utf8");
  const priorityMarkdown = ["# Authored anchor recovery priorities", "", ...priorities.judgments.map((entry) => `## ${entry.profile}\n\n- Missing: ${entry.missing.join(", ")}\n- Materiality: ${entry.materiality}\n- Disposition: **${entry.disposition}**\n`)].join("\n");
  await writeFile(path.join(AUDIT_ROOT, "anchor-recovery-priorities.md"), priorityMarkdown, "utf8");
  process.stdout.write(`${JSON.stringify({ semanticCasesSha256, cases: matrixCases.length, v5VerifierFailures: v5Failures.length, v5VerifierStatus: v5Failures.length ? "fail" : "pass", v4BaselineAcceptedResults: v4OfflineRunSummary.json.acceptedResultCount, v5OfflineRunAcceptedResults: offlineRunSummary.json.acceptedResultCount, outputDirectory: AUDIT_ROOT }, null, 2)}\n`);
  if (v5Failures.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
