import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import type { JsonObject } from "../../../question-engine/types.ts";
import { loadPwqe51SourcePackage, type Pwqe51SourcePackage } from "../../../question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../../report-contracts/delivery-validator.ts";
import { compilePwqe51Route, type Pwqe51CanonicalResponse } from "../../assessment/pwqe51-router.ts";
import type { Pwqe51ComparisonDecision } from "../../assessment/pwqe51-session.ts";
import { preparePwrp71Request } from "../pwrp71-adapter.ts";
import { pwrp71CanonicalResponseEvidenceFromRoute, type Pwrp71CanonicalResponseEvidence } from "../pwrp71-response-evidence.ts";
import { buildPwqe51RouterPacket } from "../pwqe51-packet.ts";
import { loadPwrp71SourcePackage } from "../pwrp71-source.ts";
import type { Pwrp71AuthoredProfileFixture, Pwrp71QualificationFixtures } from "./fixtures.ts";

export type QualificationFixtureStatus = "pending_router_parity" | "candidate_archive_pending_router_parity";

export interface Pwrp71FixturePacket {
  readonly profileId: string;
  readonly title: string;
  readonly packet: JsonObject;
  readonly packetSha256: string;
  readonly sourceHistorySha256?: string;
  readonly routerResultSha256?: string;
  readonly fixtureStatus: QualificationFixtureStatus;
  readonly routerParity: "pending";
  readonly issues: readonly { readonly code: string; readonly path: string; readonly message: string }[];
  readonly canonicalResponseEvidence?: Pwrp71CanonicalResponseEvidence;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a nonempty authored identifier.`);
  return value;
}

function rows(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) throw new Error(`${label} must be an authored array of objects.`);
  return value as Record<string, unknown>[];
}

function canonicalSha(value: unknown): string {
  return sha256Canonical(value);
}

/** Replays only explicit answer, occurrence and distinctness facts from P01–P09. */
export function buildPwrp71AuthoredProfilePacket(input: {
  readonly profile: Pwrp71AuthoredProfileFixture;
  readonly questionSource: Pwqe51SourcePackage;
}): Pwrp71FixturePacket {
  const { profile, questionSource } = input;
  const history = profile.authoredHistory;
  const episodes = rows(history.episodes, `${profile.id}.episodes`);
  const episodeById = new Map(episodes.map((episode) => [id(episode.id, `${profile.id} episode id`), episode]));
  const answerRows = rows(history.answers, `${profile.id}.answers`);
  const firstOccurrenceResponses = new Set<string>();
  const responses: Pwqe51CanonicalResponse[] = answerRows.map((answer) => {
    const responseId = id(answer.id, `${profile.id} authored response id`);
    const questionId = id(answer.item_id, `${responseId}.item_id`);
    const occurrenceId = id(answer.occurrence_id, `${responseId}.occurrence_id`);
    const episode = episodeById.get(occurrenceId);
    if (!episode) throw new Error(`${profile.id} answer ${responseId} references an occurrence absent from its authored profile.`);
    const selected = answer.selected;
    if (!Array.isArray(selected) || selected.some((choice) => typeof choice !== "string")) throw new Error(`${responseId}.selected must preserve the authored option IDs.`);
    const firstInOccurrence = !firstOccurrenceResponses.has(occurrenceId);
    firstOccurrenceResponses.add(occurrenceId);
    const status = id(answer.status, `${responseId}.status`) as Pwqe51CanonicalResponse["status"];
    return {
      responseId,
      questionId,
      occurrenceId,
      stepId: id(answer.step_id, `${responseId}.step_id`),
      selectedOptionIds: selected as string[],
      status,
      mode: id(answer.mode, `${responseId}.mode`) as Pwqe51CanonicalResponse["mode"],
      ...(firstInOccurrence && status === "answered" ? { basis: id(episode.basis, `${occurrenceId}.basis`) as Pwqe51CanonicalResponse["basis"] } : {}),
    };
  });
  if (new Set(responses.map((response) => response.responseId)).size !== responses.length) throw new Error(`${profile.id} authored response IDs are not unique.`);

  const distinctPairs: Array<readonly [string, string]> = [];
  const comparisonDecisions: Pwqe51ComparisonDecision[] = [];
  const episodeLinks: Array<{ occurrenceId: string; linkedFrom: string }> = [];
  for (const episode of episodes) {
    const occurrenceId = id(episode.id, `${profile.id} episode id`);
    const priorIds = episode.distinct_from;
    if (priorIds !== undefined) {
      if (!Array.isArray(priorIds) || priorIds.some((prior) => typeof prior !== "string" || !episodeById.has(prior))) {
        throw new Error(`${profile.id} ${occurrenceId}.distinct_from must retain its authored occurrence references.`);
      }
      for (const prior of priorIds as string[]) {
        distinctPairs.push([prior, occurrenceId]);
        comparisonDecisions.push({ firstOccurrenceId: prior, secondOccurrenceId: occurrenceId, relation: "different" });
      }
    }
    if (episode.linked_from !== undefined && episode.linked_from !== null) episodeLinks.push({ occurrenceId, linkedFrom: id(episode.linked_from, `${occurrenceId}.linked_from`) });
  }

  const historyDigest = profile.lineage.authoredHistory.sha256;
  const snapshotId = `pwrp71-${profile.id}-${historyDigest.slice(0, 16)}`;
  const route = compilePwqe51Route({
    responses,
    phase: responses.some((response) => response.questionId.startsWith("D")) ? "deepening" : "mapping",
    controls: [],
    optedInTopics: [],
    distinctPairs,
    ...(episodeLinks.length ? { episodeLinks } : {}),
  }, questionSource);
  const packet = buildPwqe51RouterPacket({
    snapshotId,
    responses,
    routerResult: route,
    pass: responses.some((response) => response.questionId.startsWith("D")) ? 2 : 1,
    controls: [],
    comparisonDecisions,
    source: questionSource,
  }) as JsonObject;
  const canonicalResponseEvidence = pwrp71CanonicalResponseEvidenceFromRoute(responses, route);
  const validatePacket = new Ajv2020({ allErrors: true, strict: false }).compile(questionSource.schemas.routerPacket as object);
  if (!validatePacket(packet)) {
    return {
      profileId: profile.id,
      title: profile.title,
      packet,
      packetSha256: canonicalSha(packet),
      sourceHistorySha256: historyDigest,
      routerResultSha256: canonicalSha(route),
      fixtureStatus: "pending_router_parity",
      routerParity: "pending",
      issues: (validatePacket.errors ?? []).map((entry) => ({ code: "router_packet_schema", path: entry.instancePath || "$", message: entry.message ?? "Packet schema validation failed." })),
    };
  }
  return {
    profileId: profile.id,
    title: profile.title,
    packet,
    packetSha256: canonicalSha(packet),
    sourceHistorySha256: historyDigest,
    routerResultSha256: canonicalSha(route),
    fixtureStatus: "pending_router_parity",
    routerParity: "pending",
    issues: [],
    canonicalResponseEvidence,
  };
}

/** Load either a replayed P history packet or an archived C candidate packet, always pending parity. */
export async function loadPwrp71FixturePacket(input: {
  readonly profileId: string;
  readonly fixtures: Pwrp71QualificationFixtures;
  readonly questionSource?: Pwqe51SourcePackage;
}): Promise<Pwrp71FixturePacket> {
  const profile = input.fixtures.profiles.find((candidate) => candidate.id === input.profileId);
  if (profile) return buildPwrp71AuthoredProfilePacket({ profile, questionSource: input.questionSource ?? await loadPwqe51SourcePackage() });
  const coverage = input.fixtures.coverageCandidates.find((candidate) => candidate.id === input.profileId);
  if (!coverage) throw new Error(`Unknown PWRP 7.1 fictional fixture ${input.profileId}.`);
  const packet = structuredClone(coverage.packet);
  const digest = canonicalSha(packet);
  const source = input.questionSource ?? await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const prepared = preparePwrp71Request({ packet, reportType: "MAP", questionSource: source, reportSource });
  return {
    profileId: coverage.id,
    title: `${coverage.id} candidate packet archive`,
    packet,
    packetSha256: digest,
    fixtureStatus: "candidate_archive_pending_router_parity",
    routerParity: "pending",
    issues: prepared.ok ? [] : prepared.issues,
  };
}

export function packetContentSha256(packet: JsonObject): string {
  const content = Object.fromEntries(Object.entries(packet).filter(([key]) => key !== "content_sha256"));
  return createHash("sha256").update(JSON.stringify(content), "utf8").digest("hex");
}
