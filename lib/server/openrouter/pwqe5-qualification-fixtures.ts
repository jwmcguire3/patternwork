import { createHash } from "node:crypto";
import type { JsonObject } from "../../question-engine/types.ts";
import { loadPwqe5SourcePackage, type Pwqe5SourcePackage } from "../../question-engine/pwqe5-source.ts";
import { compilePwqe5Route, type Pwqe5CanonicalResponse } from "../assessment/pwqe5-router.ts";
import { createPwqe5SessionState, type Pwqe5SessionState } from "../assessment/pwqe5-session.ts";
import { buildPwqe6RouterPacket } from "../reports/pwqe6-packet.ts";
import { loadPwqe5OfflineQualificationFixtures, type Pwqe5OfflineNegativeCase, type Pwqe5OfflineProfileFixture } from "./pwqe5-qualification.ts";

export interface Pwqe5QualificationReviewReference {
  readonly title: string;
  readonly claims: readonly Record<string, unknown>[];
  readonly remaining_uncertainty: readonly string[];
  readonly must_not_claim: readonly string[];
  readonly stopping_reason: string;
}

export interface Pwqe5ProviderQualificationFixture {
  readonly id: string;
  readonly mappingSnapshotId: string;
  readonly deepeningSnapshotId: string;
  readonly mappingPacket: JsonObject;
  readonly reportPacket: JsonObject;
  readonly sourcePacketSha256: string;
  /** Authored editorial comparison material. Never include this in a provider prompt. */
  readonly reviewReference: Pwqe5QualificationReviewReference;
}

export interface Pwqe5ProviderQualificationFixtureSet {
  readonly qualificationMode: "pwqe5-provider-qualification";
  readonly source: Pwqe5SourcePackage;
  readonly questionRelease: string;
  readonly routerVersion: string;
  readonly promptRelease: string;
  readonly evidenceContract: string;
  readonly reportContract: string;
  readonly sourceSha256: string;
  readonly sourceManifestSha256: string;
  readonly workedPathsSha256: string;
  readonly negativeCasesSha256: string;
  readonly fixtureSetSha256: string;
  readonly negativeCases: readonly Pwqe5OfflineNegativeCase[];
  readonly negativeCaseIndex: readonly {
    readonly id: string;
    readonly profile: string;
    readonly evidence_indices: readonly number[];
  }[];
  readonly profiles: readonly Pwqe5ProviderQualificationFixture[];
}

type RawProfile = Pwqe5OfflineProfileFixture & {
  readonly title?: unknown;
  readonly claims?: unknown;
  readonly remaining_uncertainty?: unknown;
  readonly must_not_claim?: unknown;
  readonly stopping_reason?: unknown;
};

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`PWQE-5 qualification fixture rejected: ${path} must be an object.`);
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`PWQE-5 qualification fixture rejected: ${path} must be a non-empty string.`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(`PWQE-5 qualification fixture rejected: ${path} must be an array of strings.`);
  return value as string[];
}

function toCanonicalResponse(answer: Record<string, unknown>): Pwqe5CanonicalResponse {
  const selectedOptionIds = stringArray(answer.selected, `${String(answer.id)}.selected`);
  const status = asString(answer.status, `${String(answer.id)}.status`);
  const mode = asString(answer.mode, `${String(answer.id)}.mode`);
  if (!["answered", "none_fit", "not_sure", "no_event", "not_applicable", "skip"].includes(status)) {
    throw new Error(`PWQE-5 qualification fixture rejected: ${String(answer.id)} has an unsupported response status.`);
  }
  if (!["single", "simultaneous", "order_unknown", "ordered"].includes(mode)) {
    throw new Error(`PWQE-5 qualification fixture rejected: ${String(answer.id)} has an unsupported selection mode.`);
  }
  return {
    responseId: asString(answer.id, "answer.id"),
    questionId: asString(answer.item_id, `${String(answer.id)}.item_id`),
    occurrenceId: asString(answer.occurrence_id, `${String(answer.id)}.occurrence_id`),
    stepId: asString(answer.step_id, `${String(answer.id)}.step_id`),
    selectedOptionIds,
    status: status as Pwqe5CanonicalResponse["status"],
    mode: mode as Pwqe5CanonicalResponse["mode"],
  };
}

function verifyRouteCoverage(responses: readonly Pwqe5CanonicalResponse[], route: ReturnType<typeof compilePwqe5Route>, profileId: string, pass: string): void {
  if (route.invalidatedResponses.length) {
    throw new Error(`PWQE-5 qualification fixture rejected: ${profileId} ${pass} has invalidated responses: ${route.invalidatedResponses.map((item) => item.responseId).join(", ")}.`);
  }
  const responseIds = new Set(responses.map((response) => response.responseId));
  const represented = new Set(route.observations.map((item) => item.responseId));
  const missing = new Set(route.missingness.map((item) => item.responseId));
  for (const response of responses) {
    if (response.status === "answered") {
      if (!represented.has(response.responseId)) throw new Error(`PWQE-5 qualification fixture rejected: ${profileId} ${pass} answer ${response.responseId} produced neither evidence nor an explicit missingness record.`);
    } else if (!missing.has(response.responseId)) {
      throw new Error(`PWQE-5 qualification fixture rejected: ${profileId} ${pass} non-answer ${response.responseId} has no explicit missingness record.`);
    }
  }
  for (const id of [...represented, ...missing]) {
    if (!responseIds.has(id)) throw new Error(`PWQE-5 qualification fixture rejected: ${profileId} ${pass} route references an unknown response ${id}.`);
  }
}

function packetForPass(input: {
  readonly profileId: string;
  readonly pass: 1 | 2;
  readonly responses: readonly Pwqe5CanonicalResponse[];
  readonly source: Pwqe5SourcePackage;
}): JsonObject {
  const { profileId, pass, responses, source } = input;
  const phase = pass === 1 ? "mapping" : "deepening";
  const route = compilePwqe5Route({ responses, phase }, source);
  verifyRouteCoverage(responses, route, profileId, phase);
  const initial = createPwqe5SessionState(source);
  const state: Pwqe5SessionState = {
    ...initial,
    pass,
    phase,
    responses,
    routerResult: route,
    currentInteraction: null,
  };
  return buildPwqe6RouterPacket({ snapshotId: `qualification-${profileId}-${phase}`, state, source }) as JsonObject;
}

function reviewReference(profile: RawProfile): Pwqe5QualificationReviewReference {
  if (!Array.isArray(profile.claims)) throw new Error(`PWQE-5 qualification fixture rejected: ${profile.id}.claims must be an array.`);
  return {
    title: asString(profile.title, `${profile.id}.title`),
    claims: profile.claims.map((claim, index) => asObject(claim, `${profile.id}.claims[${index}]`)),
    remaining_uncertainty: stringArray(profile.remaining_uncertainty, `${profile.id}.remaining_uncertainty`),
    must_not_claim: stringArray(profile.must_not_claim, `${profile.id}.must_not_claim`),
    stopping_reason: asString(profile.stopping_reason, `${profile.id}.stopping_reason`),
  };
}

/**
 * Adapts byte-pinned authored profiles into separate Mapping and Pass-2 router
 * packets. It never calls a provider and keeps all authored review prose out of
 * packet inputs.
 */
export async function buildPwqe5QualificationFixtureSet(workspaceRoot = process.cwd()): Promise<Pwqe5ProviderQualificationFixtureSet> {
  const [offline, source] = await Promise.all([
    loadPwqe5OfflineQualificationFixtures(workspaceRoot),
    loadPwqe5SourcePackage(workspaceRoot),
  ]);
  const rawProfiles = offline.profiles as readonly RawProfile[];
  const profiles = rawProfiles.map((profile) => {
    const responses = profile.answers.map((answer) => toCanonicalResponse(asObject(answer, `${profile.id}.answer`)));
    const questionById = new Map(source.questionBank.items.map((question) => [question.id, question]));
    const mappingResponses = responses.filter((response) => {
      const question = questionById.get(response.questionId);
      if (!question) throw new Error(`PWQE-5 qualification fixture rejected: ${profile.id} references unknown item ${response.questionId}.`);
      return question.stage === "mapping";
    });
    const mappingPacket = packetForPass({ profileId: profile.id, pass: 1, responses: mappingResponses, source });
    const reportPacket = packetForPass({ profileId: profile.id, pass: 2, responses, source });
    const sourcePacketSha256 = createHash("sha256").update(`${String(mappingPacket.content_sha256)}:${String(reportPacket.content_sha256)}`).digest("hex");
    return {
      id: profile.id,
      mappingSnapshotId: `qualification-${profile.id}-mapping`,
      deepeningSnapshotId: `qualification-${profile.id}-deepening`,
      mappingPacket,
      reportPacket,
      sourcePacketSha256,
      reviewReference: reviewReference(profile),
    };
  });
  return {
    qualificationMode: "pwqe5-provider-qualification",
    source,
    questionRelease: offline.questionRelease,
    routerVersion: offline.routerVersion,
    promptRelease: offline.promptRelease,
    evidenceContract: offline.evidenceContract,
    reportContract: offline.reportContract,
    sourceSha256: offline.sourceSha256,
    sourceManifestSha256: offline.sourceManifestSha256,
    workedPathsSha256: offline.workedPathsSha256,
    negativeCasesSha256: offline.negativeCasesSha256,
    fixtureSetSha256: offline.fixtureSetSha256,
    negativeCases: offline.negativeCases,
    negativeCaseIndex: offline.negativeCases.map(({ id, profile, evidence_indices }) => ({ id, profile, evidence_indices })),
    profiles,
  };
}
