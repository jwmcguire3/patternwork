import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { loadPwqe51SourcePackage, PWQE51_RELEASE_IDENTITY, PWQE51_SOURCE_MANIFEST_SHA256 } from "../../lib/question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { replayFictionalPwqe51Session, type FictionalHistoryV2 } from "../../lib/server/reports/qualification/session-replay.ts";

const V2_DIRECTORY = path.join(process.cwd(), "qualification", "pwrp71", "constructed_histories_v2");
const DEFAULT_OUTPUT = path.join(process.cwd(), "qualification", "pwrp71", "route_replays_v4");
const VALID_PROFILES = [...Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`), ...Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`)];
const DIGEST = /^[a-f0-9]{64}$/u;
const V2_MANIFEST_SHA256 = "77d050e360778965c29041ba86f1233343596969915a49961ae68778797a52ee";
const V2_PROFILE_SHA256: Readonly<Record<string, string>> = {
  P01: "4d86af702d6c90c809556a55215a1688210bd751709fb2f2c0c5f760a03f2cf8",
  P02: "b47d80f9f0194055c8461145d75c559422abf34a0377682aa8cfa22e8ac990dc",
  P03: "d0f578c0b03bd1e370e260894ea4bed07a600797dc23e2db2cec90a44999e33c",
  P04: "5b560cc3ec22ab5cc4163d327c94d64050a05264f9220e1fc861f1b02a315ca5",
  P05: "636ce9b29dae9aac1f59799616bb489ece1a0683249811016de0e6446f69ed72",
  P06: "a6ffa28c659736c41152578936128ee9dae61961a6ba99762dd1e13ed4e120a5",
  P07: "6ce6fd27af8267fbfe2485ba31c1dc517d25acf797c95b1d68bb42fc5246dce4",
  P08: "eb1fac0c50a53aa1eeb70cd5f9104edb46a3446eaaa2dcf629f35e3b41499ee3",
  P09: "dbca12c92c7cac667d36c63fffab890b7f56c9f457b4bff8406c7d99d3464e3f",
  C01: "200569ca5d77e1e56a844034ce788c5d30824d8aa902e566a5612c695995396c",
  C02: "09af2a7c6a8d175076283ffdf30a9328e56e789828899a9eee7180f018a4b4af",
  C03: "94ca2e529c05dd0b13e8d5c2bd71ed54ac501dfdd44811b5e0dffa7ccc047d42",
  C04: "b985e3b4de71d318014352453056123a00634720a0a2505b80a0d3a379908a62",
  C05: "f67ce3e7163bbfb6377f78fbe3c08d4dfa8ea4790d644910bcc337d2c3ce0a06",
  C06: "f2baee9ec9b9971c51d2fd2ad9b91bf8af51586dc51dc93c8686c40795940d0a",
  C07: "db2bce6872c1049a164f793dec0d49a29661ba16109fb656bee92bb40ff1803b",
  C08: "c21040dcaf4a6abc3d301ae345ecdb3ae28037fa5bd312d406187f2ced6058dd",
  C09: "444a5346d925580d2bc2e0a3726130b41f309b4ca4c8baf137fdcf52c18e16ac",
  C10: "db6e0b9e8296741324c1aef0e4b481f70468ce4114a599ee8c2907df944d3b81",
  C11: "5ae867aa4f76b656ba46fe77afac07823a5d2080596745db396959bba7915ec9",
  C12: "639c2cc1b57a9b9e87eeedac21a488ed24fcac4dc994d97039ffe9b2f88d62c2",
  C13: "a9876d0b711cd11a933b89ba6ab2cdc2f8d3c3ea7174645c183ae879098cc2bb",
  C14: "eb1ad2ee0340645db091009c955228f93feb2c2d27d8fe0b08bea94f8f960797",
  C15: "8880cbce9b3168447017d80af4e08ad13b80efa3c7c98daaea80fad7533ab407",
  C16: "a4cc2a8dbb3438772fbc02b6103749011405e884f8e9d32af3d8ad2217bcf813",
};

interface V2Manifest {
  readonly schemaVersion: "PWQE51-FICTIONAL-HISTORIES-V2-MANIFEST";
  readonly sourceCommit: string;
  readonly sourceRelease: string;
  readonly profiles: readonly { readonly id: string; readonly file: string }[];
}

function parseArgs(argv: readonly string[]): { profiles: readonly string[]; output: string } {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      process.stdout.write("Usage: npm run pwqe51:replay:fictional -- [--profiles P01,C01] [--output-dir qualification/pwrp71/route_replays_v4]\n");
      process.exit(0);
    }
    if (flag !== "--profiles" && flag !== "--output-dir") throw new Error(`Unknown argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--") || flags.has(flag)) throw new Error(`${flag} requires one value and may be specified once.`);
    flags.set(flag, value);
    index += 1;
  }
  const profiles = (flags.get("--profiles") ?? VALID_PROFILES.join(",")).split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  if (!profiles.length || new Set(profiles).size !== profiles.length || profiles.some((id) => !VALID_PROFILES.includes(id))) {
    throw new Error(`--profiles must be unique IDs from ${VALID_PROFILES.join(", ")}.`);
  }
  return { profiles, output: path.resolve(flags.get("--output-dir") ?? DEFAULT_OUTPUT) };
}

function digestText(value: string): string {
  return createHash("sha256").update(value.replace(/\r\n/gu, "\n"), "utf8").digest("hex");
}

function normalizeRuntimeIds(value: string): string {
  return value.replace(/pwep_[0-9a-f-]{36}/gu, "<server-occurrence-id>")
    .replace(/pwr_[0-9a-f]{40}/gu, "<server-response-id>");
}

async function atomicWrite(file: string, contents: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(contents, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, file);
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function main(): Promise<void> {
  const { profiles, output } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(path.join(V2_DIRECTORY, "manifest.json"), "utf8")) as V2Manifest;
  if (manifest.schemaVersion !== "PWQE51-FICTIONAL-HISTORIES-V2-MANIFEST" || manifest.sourceRelease !== PWQE51_RELEASE_IDENTITY.questionRelease) {
    throw new Error("The authored v2 history manifest does not match the pinned PWQE 5.1 source release.");
  }
  const manifestText = await readFile(path.join(V2_DIRECTORY, "manifest.json"), "utf8");
  const v2ManifestSha256 = digestText(manifestText);
  if (v2ManifestSha256 !== V2_MANIFEST_SHA256) throw new Error("The authored v2 manifest digest drifted from its source pin.");
  const profileById = new Map(manifest.profiles.map((profile) => [profile.id, profile]));
  if (profiles.some((id) => !profileById.has(id))) throw new Error("The v2 manifest is missing a requested profile.");

  const [questionSource, reportSource] = await Promise.all([loadPwqe51SourcePackage(), loadPwrp71SourcePackage()]);
  const profileIndex: Array<Record<string, unknown>> = [];
  const focusedBranchIndex: Array<Record<string, unknown>> = [];
  for (const profileId of profiles) {
    const sourceFile = path.join(V2_DIRECTORY, profileById.get(profileId)!.file);
    const sourceText = await readFile(sourceFile, "utf8");
    const history = JSON.parse(sourceText) as FictionalHistoryV2 & Record<string, unknown>;
    if (history.profile?.id !== profileId) throw new Error(`${profileId} source fixture identity mismatch.`);
    const authoredFixtureSha256 = digestText(sourceText);
    if (!DIGEST.test(authoredFixtureSha256) || authoredFixtureSha256 !== V2_PROFILE_SHA256[profileId]) throw new Error(`${profileId} authored fixture digest drifted from the v2 source pin.`);
    const replay = replayFictionalPwqe51Session({ history, questionSource, reportSource });
    const sourceProvenance = Array.isArray(history.responseProvenance) ? history.responseProvenance : [];
    const supersededResponseIds = new Set(replay.state.routerResult.supersededResponseIds);
    const invalidatedResponseIds = new Set(replay.state.routerResult.invalidatedResponses.map((row) => row.responseId));
    const currentResponses = replay.state.responses.filter((response) => !supersededResponseIds.has(response.responseId) && !invalidatedResponseIds.has(response.responseId));
    const packets = Object.fromEntries(Object.entries(replay.packets).map(([reportType, packetResult]) => [reportType, packetResult ? { packet: packetResult.packet } : undefined]));
    const packetValidation = Object.fromEntries(Object.entries(replay.packets).map(([reportType, packetResult]) => [reportType, {
      accepted: packetResult?.adapterAccepted ?? false,
      issueCodes: (packetResult?.issues ?? []).map((issue) => object(issue).code).filter((code): code is string => typeof code === "string"),
    }]));
    const submittedSemantic = replay.submitted.map((row) => ({
      sourceResponseId: row.sourceResponseId,
      questionId: row.questionId,
      stepId: row.stepId,
      phase: row.phase,
      provenance: row.provenance,
    }));
    const traceSemantic = replay.routingTrace.map((row) => ({
      phase: row.phase,
      questionId: row.candidate.questionId,
      stepId: row.candidate.stepId,
      variantId: row.candidate.variantId ?? null,
      result: row.result,
    }));
    const completenessSemantic = [
      replay.mappingComplete,
      replay.deepeningStarted,
      replay.deepeningComplete,
      replay.semanticCore.status,
      replay.semanticCore.requiredSourceResponseIds,
      replay.semanticCore.acceptedSourceResponseIds,
    ];
    const unreachedById = new Map(replay.unreachedOriginalAnswers.map((answer) => [answer.responseId, answer]));
    const authoredAnswerDisposition = replay.responseProvenance
      .filter((row) => row.origin.startsWith("original_authored_fictional_"))
      .map((row) => {
        const unreached = unreachedById.get(row.sourceResponseId);
        return {
          responseId: row.sourceResponseId,
          runtimeResponseId: row.runtimeResponseId ?? null,
          questionId: [...history.mappingResponses, ...history.deepeningResponses].find((answer) => answer.responseId === row.sourceResponseId)?.questionId ?? null,
          classification: row.accepted ? "route_issued_and_accepted"
            : unreached?.classification ?? "ineligible_in_current_context",
          reason: unreached?.reason ?? (row.accepted ? "The production session issued and accepted this authored answer." : "No matching server-issued candidate reached this authored answer."),
        };
      });
    const intentionallyForbidden = Array.isArray(history.withheldAuthoredAnswers)
      ? history.withheldAuthoredAnswers.map((answer) => ({ ...object(answer), classification: "intentionally_forbidden" })) : [];
    const allAuthoredAnswerDisposition = [...authoredAnswerDisposition, ...intentionallyForbidden];
    const semanticResultSha256 = sha256Canonical({
      submitted: submittedSemantic,
      trace: traceSemantic,
      completeness: completenessSemantic,
      packets: packetValidation,
      syntheticDeepeningAnswerAudit: replay.syntheticDeepeningAnswerAudit.map((entry) => ({
        profileId: entry.profileId,
        sourceQuestionId: entry.sourceQuestionId,
        selectedOptionIds: entry.selectedOptionIds,
        status: entry.status,
        selectionMode: entry.selectionMode,
        occurrenceReference: normalizeRuntimeIds(entry.occurrenceReference),
        step: entry.step,
        existingFictionalFacts: entry.existingFictionalFacts.map(({ responseId, questionId, occurrenceId, stepId, selectedOptionIds, status, evidenceKind, contextRelation }) => ({
          responseId,
          questionId,
          ...(occurrenceId ? { occurrenceId: normalizeRuntimeIds(occurrenceId) } : {}),
          ...(stepId ? { stepId } : {}),
          ...(selectedOptionIds ? { selectedOptionIds } : {}),
          status,
          ...(evidenceKind ? { evidenceKind } : {}),
          ...(contextRelation ? { contextRelation } : {}),
        })),
        rationale: entry.rationale,
        scenarioRole: entry.scenarioRole,
        changesIntendedSemanticTest: entry.changesIntendedSemanticTest,
        provenance: entry.provenance,
        outcome: entry.outcome,
      })),
      syntheticRespondentControls: JSON.parse(normalizeRuntimeIds(JSON.stringify(replay.syntheticRespondentControls))) as unknown,
      replayDecisions: replay.replayDecisions.map(({ sourceOccurrenceReference, outcome }) => ({ sourceOccurrenceReference, outcome })),
      authoredAnswerDisposition: allAuthoredAnswerDisposition.map((value) => {
        const row = object(value);
        return {
          responseId: typeof row.responseId === "string" ? row.responseId : typeof row.sourceAnswerRef === "string" ? row.sourceAnswerRef : null,
          questionId: typeof row.questionId === "string" ? row.questionId : null,
          classification: typeof row.classification === "string" ? row.classification : "",
          reason: typeof row.reason === "string" ? normalizeRuntimeIds(row.reason) : "",
        };
      }),
    });
    const artifact = {
      schemaVersion: "PWQE51-ROUTE-REPLAY-V4",
      profileId,
      sourceIdentity: {
        v2ManifestSha256,
        sourceCommit: manifest.sourceCommit,
        authoredFixtureFile: profileById.get(profileId)!.file,
        authoredFixtureSha256,
        questionRelease: PWQE51_RELEASE_IDENTITY.questionRelease,
        routerVersion: PWQE51_RELEASE_IDENTITY.routerVersion,
        questionSourceSha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
        questionSourceManifestSha256: PWQE51_SOURCE_MANIFEST_SHA256,
        reportRelease: reportSource.manifest.report_release,
        reportSourceManifestSha256: reportSource.manifestSha256,
      },
      originalAuthoredFixtureIdentity: object(history.profile),
      sourceResponseProvenance: sourceProvenance,
      originalAuthoredAnswers: history.originalAuthoredResponses ?? history.mappingResponses.filter((answer) => sourceProvenance.some((entry) => entry.responseId === answer.responseId && entry.origin === "original_authored_fictional_answer")),
      newSyntheticMappingAnswers: history.syntheticMappingResponses ?? history.mappingResponses.filter((answer) => sourceProvenance.some((entry) => entry.responseId === answer.responseId && entry.origin === "new_synthetic_mapping_answer")),
      newSyntheticDeepeningAnswers: replay.submitted.filter((answer) => answer.provenance === "new_synthetic_deepening_answer"),
      syntheticDeepeningAnswerAudit: replay.syntheticDeepeningAnswerAudit,
      syntheticRespondentControls: replay.syntheticRespondentControls,
      declaredFictionalDecisions: {
        topicPermissionEvents: history.topicPermissionEvents ?? [],
        originalConfiguredReferentRoles: history.originalConfiguredReferentRoles ?? [],
        syntheticReferentRoles: history.syntheticReferentRoles ?? [],
        mappingControls: history.mappingControls ?? [],
        intendedDeepeningContext: history.intendedDeepeningContext ?? {},
        distinctnessIntents: history.distinctnessIntents ?? [],
        comparisonBindingIntents: history.comparisonBindingIntents ?? [],
        intentionallyForbiddenAnswers: Array.isArray(history.withheldAuthoredAnswers) ? history.withheldAuthoredAnswers : [],
      },
      authoredAnswerDisposition: allAuthoredAnswerDisposition,
      replay: {
        state: replay.state,
        occurrenceReferenceToServerId: replay.occurrenceReferenceToServerId,
        submittedSourceToRuntimeResponses: replay.submitted,
        completeResponseProvenance: replay.responseProvenance,
        newSyntheticDeepeningAnswers: replay.submitted.filter((answer) => answer.provenance === "new_synthetic_deepening_answer"),
        syntheticDeepeningAnswerAudit: replay.syntheticDeepeningAnswerAudit,
        syntheticRespondentControls: replay.syntheticRespondentControls,
        routingDecisionTrace: replay.routingTrace,
        replayAndDistinctnessDecisions: replay.replayDecisions,
        unreachedOriginalAnswers: replay.unreachedOriginalAnswers,
        firstDivergence: replay.firstDivergence ?? null,
        completeness: {
          mapping: replay.mappingComplete ? "complete" : "partial",
          deepening: replay.deepeningComplete ? "complete" : replay.deepeningStarted ? "partial" : "not_applicable",
          sessionPhase: replay.state.phase,
          sessionPass: replay.state.pass,
        },
        semanticCore: replay.semanticCore,
        finalTargetResolutionState: replay.finalTargetResolutions,
        episodeRegistry: replay.episodeRegistry,
        sequenceGraph: replay.sequenceGraph,
        missingnessHistory: replay.missingness,
        contextDecisions: replay.contextDecisions,
        fictionalControlHistory: replay.fictionalControlHistory,
        currentResponses,
        supersededResponseIds: [...supersededResponseIds],
        invalidatedResponses: replay.state.routerResult.invalidatedResponses,
        comparisonDecisions: replay.state.comparisonDecisions ?? [],
      },
      packets,
      packetValidation,
      qualificationBoundary: "internal_fictional_session_replay_only; not independent routing qualification or production evidence",
    };
    const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
    const artifactFile = `${profileId}.json`;
    await atomicWrite(path.join(output, artifactFile), artifactText);

    const requiredAnchorIds = replay.semanticCore.requiredSourceResponseIds;
    const requiredAnchorSet = new Set(requiredAnchorIds);
    const branchAnswers = history.deepeningResponses.filter((answer) => requiredAnchorSet.has(answer.responseId)
      || (!requiredAnchorIds.length && (history.intendedDeepeningContext?.focusOccurrenceId === answer.occurrenceId)));
    const relevantOccurrenceRefs = new Set(branchAnswers.map((answer) => answer.occurrenceId));
    if (!relevantOccurrenceRefs.size && history.intendedDeepeningContext?.focusOccurrenceId) relevantOccurrenceRefs.add(history.intendedDeepeningContext.focusOccurrenceId);
    const provenanceById = new Map(sourceProvenance.map((entry) => [entry.responseId, entry]));
    const describeResponse = (answer: FictionalHistoryV2["mappingResponses"][number] | FictionalHistoryV2["deepeningResponses"][number]) => {
      const routeResponse = replay.submitted.find((entry) => entry.sourceResponseId === answer.responseId);
      const disposition = replay.unreachedOriginalAnswers.find((entry) => entry.responseId === answer.responseId);
      const traceEntry = replay.routingTrace.find((entry) => entry.sourceResponseId === answer.responseId);
      const question = questionSource.questionBank.items.find((item) => item.id === answer.questionId);
      const variant = answer.variantId ? questionSource.questionBank.variants.find((item) => item.id === answer.variantId && item.replaces === answer.questionId) : undefined;
      return {
        sourceResponse: answer,
        provenance: provenanceById.get(answer.responseId)?.origin ?? answer.provenance ?? "original_authored_fictional_response",
        questionContract: question ? {
          id: question.id,
          stage: question.stage,
          prompt: question.prompt,
          episodeFamily: question.episode_family,
          stepBinding: question.step_binding,
          selection: question.selection,
          optionsInSourceOrder: (variant?.options ?? question.options).map((option) => ({ id: option.id, text: option.text, reportedValue: option.reported_value ?? option.text })),
          responseControls: question.response_controls,
          ...(variant ? { variantId: variant.id, variantCapture: variant.captures } : {}),
        } : null,
        fullSessionRoute: routeResponse ? {
          status: "issued_and_accepted",
          runtimeResponseId: routeResponse.runtimeResponseId,
          runtimeOccurrenceId: routeResponse.occurrenceId,
          stepId: routeResponse.stepId,
          phase: routeResponse.phase,
          selection: routeResponse.selectedOptionIds,
        } : {
          status: disposition?.classification ?? "not_issued_or_not_accepted",
          reason: disposition?.reason ?? "The full-session route did not administer this source response.",
          ...(traceEntry ? { trace: traceEntry } : {}),
        },
      };
    };
    const branchFile = `${profileId}.json`;
    const branch = {
      schemaVersion: "PWQE51-FOCUSED-ROUTER-CONTRACT-CASE-V1",
      profileId,
      caseKind: "focused_router_contract_case",
      fullAssessmentTranscript: false,
      independentlyReviewedRoutingEvidence: false,
      semanticClaim: history.profile.title ?? profileId,
      status: requiredAnchorIds.length === 0 ? "no_authored_deepening_semantic_anchors"
        : replay.semanticCore.status === "complete" ? "all_authored_semantic_anchors_issued_in_full_session"
          : "authored_semantic_anchors_not_fully_issued_in_full_session",
      sourcePins: {
        v2ManifestSha256,
        authoredFixtureFile: profileById.get(profileId)!.file,
        authoredFixtureSha256,
        routeReplayArtifactFile: artifactFile,
        routeReplayArtifactSha256: digestText(artifactText),
        semanticResultSha256,
        questionRelease: PWQE51_RELEASE_IDENTITY.questionRelease,
        routerVersion: PWQE51_RELEASE_IDENTITY.routerVersion,
        questionSourceSha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
        reportRelease: reportSource.manifest.report_release,
      },
      separationRules: {
        sourceAnswersRemainUnchanged: true,
        syntheticMappingScaffoldIsNotEvidenceForThisSemanticClaim: true,
        syntheticDeepeningAnswersAreContextOnly: true,
        routerMustIssueEveryQuestion: true,
        occurrenceAndBindingMustMatchExactly: true,
      },
      authoredCore: {
        requiredSourceResponseIds: requiredAnchorIds,
        acceptedSourceResponseIds: replay.semanticCore.acceptedSourceResponseIds,
        status: replay.semanticCore.status,
        ...(replay.semanticCore.reason ? { reason: replay.semanticCore.reason } : {}),
        exactSourceAnswers: branchAnswers.map(describeResponse),
      },
      occurrenceConditions: [...relevantOccurrenceRefs].map((occurrenceId) => {
        const episode = history.episodes?.find((entry) => entry.occurrenceId === occurrenceId);
        const mapAnswers = history.mappingResponses.filter((answer) => answer.occurrenceId === occurrenceId);
        return {
          fixtureOccurrenceReference: occurrenceId,
          runtimeOccurrenceId: replay.occurrenceReferenceToServerId[occurrenceId] ?? null,
          episodeFamily: episode?.episodeFamily ?? null,
          basis: episode?.basis ?? null,
          origin: episode?.origin ?? null,
          originalMappingContext: mapAnswers.filter((answer) => (provenanceById.get(answer.responseId)?.origin ?? answer.provenance) === "original_authored_fictional_answer").map(describeResponse),
          syntheticMappingScaffoldContextOnly: mapAnswers.filter((answer) => (provenanceById.get(answer.responseId)?.origin ?? answer.provenance)?.includes("synthetic_mapping_answer")).map(describeResponse),
          referentRoles: [...(history.originalConfiguredReferentRoles ?? []), ...(history.syntheticReferentRoles ?? [])].filter((entry) => entry.occurrenceId === occurrenceId),
        };
      }),
      entryAndPermissionContext: {
        focusOccurrenceId: history.intendedDeepeningContext?.focusOccurrenceId ?? null,
        focusTopics: history.intendedDeepeningContext?.focusTopics ?? [],
        permissionOnlyTopics: [...(history.intendedDeepeningContext?.optedInTopics ?? []), ...(history.topicPermissionEvents ?? []).filter((event) => event.outcome === "opt_in").map((event) => event.topic)],
        actualAppliedFocusTopics: replay.contextDecisions.focusTopics,
        focusTopicsApplied: replay.contextDecisions.focusTopicsApplied,
        topicPermissionEvents: history.topicPermissionEvents ?? [],
      },
      distinctnessIntents: (history.distinctnessIntents ?? []).filter((intent) => relevantOccurrenceRefs.has(intent.sourceOccurrenceId) || relevantOccurrenceRefs.has(intent.otherOccurrenceId)).map((intent) => ({
        ...intent,
        runtimeDecision: replay.contextDecisions.distinctness.find((entry) => entry.sourceReference === intent.sourceOccurrenceId && entry.otherReference === intent.otherOccurrenceId) ?? null,
      })),
      comparisonBindingIntents: (history.comparisonBindingIntents ?? []).filter((intent) => requiredAnchorSet.has(intent.responseId)),
      intentionallyForbiddenAnswers: Array.isArray(history.withheldAuthoredAnswers) ? history.withheldAuthoredAnswers : [],
      focusedBranchExecution: "not_executed_as_a_separate_transcript; full-session source-answer results are shown per response",
    };
    const branchText = `${JSON.stringify(branch, null, 2)}\n`;
    await atomicWrite(path.join(output, "focused-branches", branchFile), branchText);
    focusedBranchIndex.push({
      profileId,
      file: branchFile,
      artifactSha256: digestText(branchText),
      fullAssessmentTranscript: false,
      status: branch.status,
      semanticClaim: history.profile.title ?? profileId,
      requiredAnchorCount: requiredAnchorIds.length,
      acceptedAnchorCount: replay.semanticCore.acceptedSourceResponseIds.length,
    });
    profileIndex.push({
      profileId,
      profileTitle: history.profile.title ?? profileId,
      file: artifactFile,
      artifactSha256: digestText(artifactText),
      semanticResultSha256,
      mapping: replay.mappingComplete ? "complete" : "partial",
      deepening: replay.deepeningComplete ? "complete" : replay.deepeningStarted ? "partial" : "not_applicable",
      originalAnswers: {
        issuedAndAccepted: replay.responseProvenance.filter((row) => row.accepted && row.origin.startsWith("original_authored_fictional_")).length,
        unreached: replay.unreachedOriginalAnswers.length,
        intentionallyForbidden: Array.isArray(history.withheldAuthoredAnswers) ? history.withheldAuthoredAnswers.length : 0,
      },
      sourceContractMismatchCount: replay.unreachedOriginalAnswers.filter((answer) => answer.classification === "source_contract_mismatch").length,
      implementationDefectCount: replay.unreachedOriginalAnswers.filter((answer) => answer.classification === "implementation_defect").length,
      syntheticMappingScaffoldAnswersAdministered: replay.submitted.filter((answer) => answer.provenance === "new_synthetic_mapping_response").length,
      newSyntheticDeepeningAnswers: replay.syntheticDeepeningAnswerAudit.length,
      syntheticRespondentControls: replay.syntheticRespondentControls.length,
      semanticCore: replay.semanticCore.status,
      semanticDistinctionStatus: replay.semanticCore.status === "complete" ? "preserved_in_exact_original_semantic_anchors"
        : replay.semanticCore.status === "unavailable" ? "cannot_be_claimed_no_authored_deepening_anchors"
          : "partial_or_unverified_exact_original_semantic_anchors",
      requiredSemanticCoreResponseIds: replay.semanticCore.requiredSourceResponseIds,
      acceptedSemanticCoreResponseIds: replay.semanticCore.acceptedSourceResponseIds,
      replayConfirmed: replay.replayDecisions.some((decision) => decision.outcome === "different"),
      mappingPacketAccepted: replay.packets.MAP?.adapterAccepted ?? false,
      deepeningPacketAccepted: (replay.packets.IFS?.adapterAccepted && replay.packets.PV?.adapterAccepted && replay.packets.ATT?.adapterAccepted) ?? false,
      adapterIssueCodes: Object.values(packetValidation).flatMap((entry) => Array.isArray(entry.issueCodes) ? entry.issueCodes : []),
      firstDivergence: replay.firstDivergence ?? null,
    });
  }

  const focusedBranchManifest = {
    schemaVersion: "PWQE51-FOCUSED-ROUTER-CONTRACT-CASES-V1-MANIFEST",
    qualificationBoundary: "focused source-bound case specifications; not full assessment transcripts or independent routing qualification",
    sourceIdentity: {
      v2ManifestSha256,
      sourceCommit: manifest.sourceCommit,
      questionRelease: PWQE51_RELEASE_IDENTITY.questionRelease,
      routerVersion: PWQE51_RELEASE_IDENTITY.routerVersion,
      questionSourceSha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
      reportRelease: reportSource.manifest.report_release,
    },
    profiles: focusedBranchIndex,
  };
  const focusedBranchManifestText = `${JSON.stringify(focusedBranchManifest, null, 2)}\n`;
  await atomicWrite(path.join(output, "focused-branches", "manifest.json"), focusedBranchManifestText);

  const rootCauseLines = [
    "# PWQE 5.1 / PWRP 7.1 v4 first-divergence and respondent-resolution ledger",
    "",
    "The exact question-selection causes and pre-response context audit are preserved in `root-cause-ledger.md` (the v3 baseline captured before fictional respondent answers were added). This v4 ledger records how the source-bound policy handled those routes and whether the original authored Deepening anchors survived.",
    "",
    `- Constructed-history source commit: \`${manifest.sourceCommit}\`.`,
    "- Implementation branch base commit: `fbc0bf440d3f79668c8987a8ef2f2d1738a82c42`.",
    `- V2 source manifest SHA-256: \`${v2ManifestSha256}\`.`,
    "- All new Deepening answers are recorded with `new_synthetic_deepening_answer`; all respondent controls are recorded separately.",
    "- Cohort B cases are in `focused-branches/`; they are source-bound case specifications, not complete assessment transcripts and not independent routing review.",
    "- Packet acceptance below is a source/structure result. It is not semantic approval, reviewer approval, or provider quality.",
    "",
    "| Profile | Fictional case | Mapping | Deepening | Semantic anchors accepted / required | Original answers issued / unreached / forbidden / mismatch | Synthetic Mapping scaffold / synthetic Deepening answers | MAP packet | Deepening packets | Semantic distinction status |",
    "|---|---|---|---|---:|---|---|---|---|---|",
  ];
  for (const row of profileIndex) {
    const original = row.originalAnswers as { issuedAndAccepted: number; unreached: number; intentionallyForbidden: number };
    const mismatches = Number(row.sourceContractMismatchCount ?? 0);
    const anchorRequired = Array.isArray(row.requiredSemanticCoreResponseIds) ? row.requiredSemanticCoreResponseIds.length : 0;
    const anchorAccepted = Array.isArray(row.acceptedSemanticCoreResponseIds) ? row.acceptedSemanticCoreResponseIds.length : 0;
    const classification = String(row.semanticDistinctionStatus ?? "unclassified").replace(/\|/gu, "\\|");
    rootCauseLines.push(`| ${row.profileId} | ${String(row.profileTitle ?? row.profileId).replace(/\|/gu, "\\|")} | ${row.mapping} | ${row.deepening} | ${anchorAccepted} / ${anchorRequired} | ${original.issuedAndAccepted} / ${original.unreached} / ${original.intentionallyForbidden} / ${mismatches} | ${row.syntheticMappingScaffoldAnswersAdministered} / ${row.newSyntheticDeepeningAnswers} | ${row.mappingPacketAccepted ? "accepted" : "unavailable"} | ${row.deepeningPacketAccepted ? "accepted" : "unavailable"} | ${classification} |`);
  }
  rootCauseLines.push(
    "",
    "## Discrepancy and interpretation notes",
    "",
    "- `M10.observable` remains distinct from base `M10`. P05, C10, and C11 preserve their authored base-item answers and use the supported skip control for the router-issued variant; no answer was translated between contracts.",
    "- P03 and C12 answer a real router-issued D42 known-distance prompt on a linked actual `known_delay` occurrence. The question explicitly asks about a different time; the D42 response is accepted with `actual_recalled` basis and the target-resolution observation. Packet construction records the distinct pair only from that route evidence.",
    "- C07's comparison pair requires an explicit replay binding and actual second M02 root. Occurrence IDs alone do not establish distinctness. P01 follows its separately source-authorized controlled replay path.",
    "- C02's D67/D68 and C09's D79 answers remain intentionally forbidden. A router-issued forbidden question produces a discrepancy and supported skip only.",
    "- P07 has no authored Deepening semantic anchors. Its completed Deepening route cannot qualify a semantic claim by adding novel synthetic answers.",
    "- High synthetic response volume, including inherited Mapping scaffold, can make a structurally valid packet a weak test of the original case. The full answer-level audit and focused branch case file preserve that distinction.",
    "",
  );
  await atomicWrite(path.join(output, "v4-root-cause-ledger.md"), rootCauseLines.join("\n"));

  const index = {
      schemaVersion: "PWQE51-ROUTE-REPLAY-V4-MANIFEST",
    qualificationStatus: "internal_session_replay_not_independent_qualification",
    inputs: {
      v2ManifestSha256,
      sourceCommit: manifest.sourceCommit,
      questionRelease: PWQE51_RELEASE_IDENTITY.questionRelease,
      routerVersion: PWQE51_RELEASE_IDENTITY.routerVersion,
      questionSourceSha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
      questionSourceManifestSha256: PWQE51_SOURCE_MANIFEST_SHA256,
      reportRelease: reportSource.manifest.report_release,
      reportSourceManifestSha256: reportSource.manifestSha256,
    },
    focusedBranches: {
      manifestFile: "focused-branches/manifest.json",
      manifestSha256: digestText(focusedBranchManifestText),
      fullAssessmentTranscript: false,
    },
    rootCauseLedger: "v4-root-cause-ledger.md",
    profiles: profileIndex,
  };
  const indexText = `${JSON.stringify(index, null, 2)}\n`;
  await atomicWrite(path.join(output, "manifest.json"), indexText);
  process.stdout.write(`${JSON.stringify({ outputDirectory: output, profiles: profileIndex.length, manifestSha256: digestText(indexText), results: profileIndex.map(({ profileId, mapping, deepening, mappingPacketAccepted, deepeningPacketAccepted, firstDivergence }) => ({ profileId, mapping, deepening, mappingPacketAccepted, deepeningPacketAccepted, firstDivergence })) }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
