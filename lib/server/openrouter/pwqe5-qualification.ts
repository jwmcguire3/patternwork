import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import { loadPwqe5SourcePackage, PWQE5_SOURCE_DIRECTORY } from "../reports/pwqe6-source.ts";
import { PWQE5_NEGATIVE_CASES_SHA256, PWQE5_QUALIFICATION_FIXTURE_SET_SHA256, PWQE5_WORKED_PATHS_SHA256 } from "./policy.ts";

const WORKED_PATHS_PATH = "examples/worked_paths.json";
const NEGATIVE_CASES_PATH = "examples/negative_cases.json";
const EXPECTED_PROFILE_IDS = ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09"] as const;

export interface Pwqe5OfflineProfileFixture {
  readonly id: string;
  readonly fictional: true;
  readonly episodes: readonly Record<string, unknown>[];
  readonly answers: readonly Record<string, unknown>[];
}

export interface Pwqe5OfflineNegativeCase {
  readonly id: string;
  readonly unsupported_claim: string;
  readonly profile: string;
  readonly evidence_indices: readonly number[];
  readonly reason: string;
}

export interface Pwqe5OfflineQualificationFixtures {
  readonly qualificationMode: "offline-source-fixtures";
  readonly qualificationStatus: "source-verified-only";
  readonly providerCalls: 0;
  readonly approvalStatus: "not-reviewed";
  readonly questionRelease: string;
  readonly routerVersion: string;
  readonly promptRelease: string;
  readonly evidenceContract: string;
  readonly reportContract: "patternwork-report-v6-design";
  readonly routerPacketSchemaId: "urn:patternwork:router-evidence:1";
  readonly reportDraftSchemaRevision: "draft-2020-12";
  readonly sourceSha256: string;
  readonly sourceManifestSha256: string;
  readonly workedPathsSha256: string;
  readonly negativeCasesSha256: string;
  readonly fixtureSetSha256: string;
  readonly profileFixtureCount: 9;
  readonly negativeCaseCount: number;
  readonly profiles: readonly Pwqe5OfflineProfileFixture[];
  readonly negativeCases: readonly Pwqe5OfflineNegativeCase[];
  readonly checks: readonly {
    readonly id: string;
    readonly status: "passed";
    readonly detail: string;
  }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseJson(text: string, source: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`PWQE-5 offline fixtures rejected: ${source} is invalid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
}

function requireRecord(value: unknown, source: string): Record<string, unknown> {
  if (!record(value)) throw new Error(`PWQE-5 offline fixtures rejected: ${source} must be an object.`);
  return value;
}

/**
 * Loads and structurally checks the authored fictional P01–P09 and negative-case
 * examples. This is an offline source-fixture audit only; it never generates reports,
 * invokes a provider, creates approval evidence, or activates a model policy.
 */
export async function loadPwqe5OfflineQualificationFixtures(workspaceRoot = process.cwd()): Promise<Pwqe5OfflineQualificationFixtures> {
  const source = await loadPwqe5SourcePackage(workspaceRoot);
  const packageRoot = path.join(workspaceRoot, ...PWQE5_SOURCE_DIRECTORY.split("/"));
  const [workedBytes, negativeBytes] = await Promise.all([
    readFile(path.join(packageRoot, WORKED_PATHS_PATH)),
    readFile(path.join(packageRoot, NEGATIVE_CASES_PATH)),
  ]);
  const workedValue = requireRecord(parseJson(workedBytes.toString("utf8"), WORKED_PATHS_PATH), WORKED_PATHS_PATH);
  const rawProfiles = workedValue.profiles;
  if (!Array.isArray(rawProfiles)) throw new Error("PWQE-5 offline fixtures rejected: worked paths must contain a profiles array.");
  const profiles = rawProfiles.map((value, index) => requireRecord(value, `worked path profile ${index}`)) as unknown as Pwqe5OfflineProfileFixture[];
  if (profiles.length !== EXPECTED_PROFILE_IDS.length
    || profiles.some((profile, index) => profile.id !== EXPECTED_PROFILE_IDS[index] || profile.fictional !== true)) {
    throw new Error("PWQE-5 offline fixtures rejected: expected exactly the authored fictional P01–P09 profiles.");
  }

  for (const profile of profiles) {
    if (!Array.isArray(profile.episodes) || !Array.isArray(profile.answers)) {
      throw new Error(`PWQE-5 offline fixtures rejected: ${profile.id} must contain episode and answer arrays.`);
    }
    const episodeIds = profile.episodes.map((episode) => episode.id);
    const answerIds = profile.answers.map((answer) => answer.id);
    if (episodeIds.some((id) => typeof id !== "string") || new Set(episodeIds).size !== episodeIds.length
      || answerIds.some((id) => typeof id !== "string") || new Set(answerIds).size !== answerIds.length) {
      throw new Error(`PWQE-5 offline fixtures rejected: ${profile.id} has missing or duplicate episode/answer IDs.`);
    }
    const knownEpisodes = new Set(episodeIds as string[]);
    for (const answer of profile.answers) {
      if (typeof answer.occurrence_id === "string" && !knownEpisodes.has(answer.occurrence_id)) {
        throw new Error(`PWQE-5 offline fixtures rejected: ${profile.id} answer references unknown occurrence ${answer.occurrence_id}.`);
      }
    }
  }

  const negativeValue = parseJson(negativeBytes.toString("utf8"), NEGATIVE_CASES_PATH);
  if (!Array.isArray(negativeValue)) throw new Error("PWQE-5 offline fixtures rejected: negative cases must be an array.");
  const negativeCases = negativeValue.map((value, index) => requireRecord(value, `negative case ${index}`)) as unknown as Pwqe5OfflineNegativeCase[];
  if (negativeCases.length === 0 || negativeCases.some((entry) => typeof entry.id !== "string"
    || typeof entry.unsupported_claim !== "string" || !entry.unsupported_claim.trim()
    || typeof entry.profile !== "string"
    || typeof entry.reason !== "string" || !entry.reason.trim()
    || !Array.isArray(entry.evidence_indices)
    || entry.evidence_indices.some((index) => !Number.isSafeInteger(index) || index < 1))) {
    throw new Error("PWQE-5 offline fixtures rejected: a negative case is missing its claim, profile, evidence indices, or rationale.");
  }
  if (new Set(negativeCases.map((entry) => entry.id)).size !== negativeCases.length) {
    throw new Error("PWQE-5 offline fixtures rejected: negative-case IDs are not unique.");
  }
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  for (const entry of negativeCases) {
    const profile = profilesById.get(entry.profile);
    if (profile && entry.evidence_indices.some((index) => index > profile.answers.length)) {
      throw new Error(`PWQE-5 offline fixtures rejected: ${entry.id} references an answer outside ${profile.id}.`);
    }
  }

  const workedPathsSha256 = sha256Bytes(workedBytes);
  const negativeCasesSha256 = sha256Bytes(negativeBytes);
  if (workedPathsSha256 !== PWQE5_WORKED_PATHS_SHA256 || negativeCasesSha256 !== PWQE5_NEGATIVE_CASES_SHA256) {
    throw new Error("PWQE-5 offline fixtures rejected: example hashes do not match the qualification-pinned fixture sources.");
  }
  const fixtureSetSha256 = sha256Canonical({
    questionRelease: source.identities.release,
    routerVersion: source.identities.routerVersion,
    promptRelease: source.identities.promptRelease,
    evidenceContract: source.identities.evidenceContract,
    reportContract: "patternwork-report-v6-design",
    routerPacketSchemaId: "urn:patternwork:router-evidence:1",
    reportDraftSchemaRevision: "draft-2020-12",
    sourceSha256: source.identities.sourceSha256,
    sourceManifestSha256: source.sourceManifestSha256,
    workedPathsSha256,
    negativeCasesSha256,
    profileIds: profiles.map((profile) => profile.id),
    negativeCaseIds: negativeCases.map((entry) => entry.id),
  });
  if (fixtureSetSha256 !== PWQE5_QUALIFICATION_FIXTURE_SET_SHA256) {
    throw new Error("PWQE-5 offline fixtures rejected: fixture set digest does not match the qualification-pinned source release.");
  }
  const checks = [
    { id: "source-package-pinned", status: "passed" as const, detail: `Loaded the byte-pinned ${source.identities.release} source package.` },
    { id: "fictional-worked-paths", status: "passed" as const, detail: `Validated ${profiles.length} fictional profiles and their episode references.` },
    { id: "negative-semantics", status: "passed" as const, detail: `Validated ${negativeCases.length} unsupported-claim cases and their evidence references.` },
    { id: "provider-boundary", status: "passed" as const, detail: "No provider transport was created or called; no report output or approval was produced." },
  ];

  return {
    qualificationMode: "offline-source-fixtures",
    qualificationStatus: "source-verified-only",
    providerCalls: 0,
    approvalStatus: "not-reviewed",
    questionRelease: source.identities.release,
    routerVersion: source.identities.routerVersion,
    promptRelease: source.identities.promptRelease,
    evidenceContract: source.identities.evidenceContract,
    reportContract: "patternwork-report-v6-design",
    routerPacketSchemaId: "urn:patternwork:router-evidence:1",
    reportDraftSchemaRevision: "draft-2020-12",
    sourceSha256: source.identities.sourceSha256,
    sourceManifestSha256: source.sourceManifestSha256,
    workedPathsSha256,
    negativeCasesSha256,
    fixtureSetSha256,
    profileFixtureCount: 9,
    negativeCaseCount: negativeCases.length,
    profiles,
    negativeCases,
    checks,
  };
}
