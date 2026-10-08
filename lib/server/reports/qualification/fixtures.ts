import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../question-engine/types.ts";
import { sha256Canonical } from "../../../report-contracts/delivery-validator.ts";
import { PWRP71_SEMANTIC_CASE_SET_SHA256 } from "../pwrp71-readiness.ts";

const FIXTURE_DIRECTORY = "qualification/pwrp71";
const PROFILE_IDS = Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
const COVERAGE_IDS = Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);
const DIGEST = /^[a-f0-9]{64}$/u;
export const PWRP71_AUTHORED_WORKED_PATHS_SHA256 = "7a3422b052aa524429c3da8e608c06fa3ef6c323cc4f8728fbb09ca42e8dbf93" as const;

interface FixtureAssetRecord {
  readonly id: string;
  readonly role: "authored_plan" | "authored_history_state";
  readonly file: string;
  readonly sha256: string;
  readonly archivePath: string;
  readonly title: string;
  readonly sourceKind: string;
}

interface FixtureManifest {
  readonly manifestVersion: "pwrp71-fixtures-1";
  readonly sourceArchive: string;
  readonly sourceArchiveSha256: string;
  readonly profileFixtures: readonly FixtureAssetRecord[];
  readonly authoredWorkedPaths: { readonly file: string; readonly sha256: string; readonly archivePath: string; readonly sourceKind: string };
  readonly coverageCandidates: readonly {
    readonly id: string;
    readonly role: "candidate_packet_archive";
    readonly status: "candidate_archive_not_canonical_answer_history";
    readonly routerParity: "pending";
    readonly archivePath: string;
    readonly file: string;
    readonly sha256: string;
  }[];
  readonly semanticCasesFile: string;
  readonly semanticCasesBytesSha256: string;
}

export interface Pwrp71AuthoredProfileFixture {
  readonly id: string;
  readonly title: string;
  readonly sourceKind: string;
  readonly sourceArchive: string;
  readonly sourceArchiveSha256: string;
  readonly lineage: {
    readonly plan: { readonly archivePath: string; readonly sha256: string };
    readonly authoredHistory: { readonly archivePath: string; readonly sha256: string };
    readonly referenceStateArchive: { readonly archivePath: string; readonly sha256: string };
  };
  readonly authoredPlan: Readonly<Record<string, unknown>>;
  /** Exact authored P01–P09 worked-path entry; route targets/prose are not routing oracles. */
  readonly authoredHistory: Readonly<Record<string, unknown>>;
  /** Legacy unsigned archive state retained for provenance only and never replayed. */
  readonly referenceStateArchive: Readonly<Record<string, unknown>>;
  readonly routerParity: "pending";
  readonly qualificationStatus: "pending_router_parity";
}

export interface Pwrp71QualificationFixtures {
  readonly profiles: readonly Pwrp71AuthoredProfileFixture[];
  readonly coverageCandidates: readonly (FixtureManifest["coverageCandidates"][number] & { readonly packet: JsonObject })[];
  readonly fixtureSetSha256: string;
  readonly semanticCases: Readonly<Record<string, unknown>>;
  readonly semanticCaseSetSha256: typeof PWRP71_SEMANTIC_CASE_SET_SHA256;
  readonly semanticCasesCanonicalJsonSha256: string;
  readonly sourceArchive: string;
  readonly sourceArchiveSha256: string;
}

export class Pwrp71FixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Pwrp71FixtureError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Pwrp71FixtureError(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256(bytes: Uint8Array): string {
  // These source-pinned fixture assets are UTF-8 JSON text. Git may check them
  // out with CRLF on Windows, so hash their canonical LF representation while
  // still detecting every content change.
  const text = Buffer.from(bytes).toString("utf8").replace(/\r\n/gu, "\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function safeAssetPath(root: string, relative: string): string {
  if (path.isAbsolute(relative)) throw new Pwrp71FixtureError(`Fixture path must be relative: ${relative}`);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Pwrp71FixtureError(`Fixture path escapes its source directory: ${relative}`);
  }
  return resolved;
}

function assertExactIds(actual: readonly string[], expected: readonly string[], label: string): void {
  const found = [...actual].sort();
  const wanted = [...expected].sort();
  if (found.length !== wanted.length || found.some((id, index) => id !== wanted[index])) {
    throw new Pwrp71FixtureError(`${label} must contain exactly ${wanted.join(", ")}.`);
  }
}

/**
 * Load source-bound report qualification inputs. These are authored histories and
 * criteria only; this loader does not execute, infer, or approve router behavior.
 */
export async function loadPwrp71QualificationFixtures(options: {
  readonly workspaceRoot?: string;
  /** Test seam for exercising missing and drifted fixture directories. */
  readonly fixtureRoot?: string;
} = {}): Promise<Pwrp71QualificationFixtures> {
  const fixtureRoot = path.resolve(options.fixtureRoot ?? path.join(options.workspaceRoot ?? process.cwd(), FIXTURE_DIRECTORY));
  let manifest: FixtureManifest;
  try {
    manifest = parseJson<FixtureManifest>(await readFile(path.join(fixtureRoot, "fixture-manifest.json"), "utf8"), "PWRP71 fixture manifest");
  } catch (error) {
    if (error instanceof Pwrp71FixtureError) throw error;
    throw new Pwrp71FixtureError(`PWRP71 fixture manifest is missing or unreadable at ${fixtureRoot}.`);
  }
  if (manifest.manifestVersion !== "pwrp71-fixtures-1" || !DIGEST.test(manifest.sourceArchiveSha256)) {
    throw new Pwrp71FixtureError("PWRP71 fixture manifest version or source archive digest is invalid.");
  }

  if (!manifest.authoredWorkedPaths || manifest.authoredWorkedPaths.sha256 !== PWRP71_AUTHORED_WORKED_PATHS_SHA256
    || !DIGEST.test(manifest.authoredWorkedPaths.sha256)) {
    throw new Pwrp71FixtureError("The authored P01–P09 answer-history source is missing or does not match its archive content pin.");
  }
  let workedPathBytes: Buffer;
  try { workedPathBytes = await readFile(safeAssetPath(fixtureRoot, manifest.authoredWorkedPaths.file)); }
  catch { throw new Pwrp71FixtureError("The authored P01–P09 answer-history asset is missing or unreadable."); }
  if (sha256(workedPathBytes) !== manifest.authoredWorkedPaths.sha256) throw new Pwrp71FixtureError("The authored P01–P09 answer-history asset digest drifted.");
  const workedPaths = parseJson<unknown>(workedPathBytes.toString("utf8"), "P01–P09 authored answer histories");
  if (!isRecord(workedPaths) || !Array.isArray(workedPaths.profiles)) throw new Pwrp71FixtureError("The authored answer-history asset has no profiles array.");
  const workedById = new Map<string, Record<string, unknown>>();
  for (const candidate of workedPaths.profiles) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !PROFILE_IDS.includes(candidate.id)
      || candidate.fictional !== true || workedById.has(candidate.id)) {
      throw new Pwrp71FixtureError("Authored worked-path profiles must have unique fictional P01–P09 identities.");
    }
    workedById.set(candidate.id, candidate);
  }
  assertExactIds([...workedById.keys()], PROFILE_IDS, "PWRP 7.1 authored answer histories");

  const byProfile = new Map<string, Partial<Record<FixtureAssetRecord["role"], FixtureAssetRecord>>>();
  for (const asset of manifest.profileFixtures) {
    if (!PROFILE_IDS.includes(asset.id) || !["authored_plan", "authored_history_state"].includes(asset.role)
      || !DIGEST.test(asset.sha256) || !asset.archivePath || !asset.title || !asset.sourceKind) {
      throw new Pwrp71FixtureError(`PWRP71 fixture asset metadata is invalid for ${asset.id}.`);
    }
    const profile = byProfile.get(asset.id) ?? {};
    if (profile[asset.role]) throw new Pwrp71FixtureError(`Duplicate ${asset.role} fixture asset for ${asset.id}.`);
    profile[asset.role] = asset;
    byProfile.set(asset.id, profile);
  }
  assertExactIds([...byProfile.keys()], PROFILE_IDS, "PWRP71 authored profile fixtures");

  const profiles: Pwrp71AuthoredProfileFixture[] = [];
  for (const id of PROFILE_IDS) {
    const assets = byProfile.get(id)!;
    const planRecord = assets.authored_plan;
    const historyRecord = assets.authored_history_state;
    if (!planRecord || !historyRecord) throw new Pwrp71FixtureError(`${id} must include both its authored plan and history state.`);
    let planBytes: Buffer;
    let historyBytes: Buffer;
    try {
      planBytes = await readFile(safeAssetPath(fixtureRoot, planRecord.file));
    } catch {
      throw new Pwrp71FixtureError(`${id} authored plan fixture is missing or unreadable.`);
    }
    try {
      historyBytes = await readFile(safeAssetPath(fixtureRoot, historyRecord.file));
    } catch {
      throw new Pwrp71FixtureError(`${id} authored history fixture is missing or unreadable.`);
    }
    if (sha256(planBytes) !== planRecord.sha256) throw new Pwrp71FixtureError(`${id} authored plan digest drifted.`);
    if (sha256(historyBytes) !== historyRecord.sha256) throw new Pwrp71FixtureError(`${id} authored history digest drifted.`);
    const authoredPlan = parseJson<unknown>(planBytes.toString("utf8"), `${id} authored plan`);
    const referenceStateArchive = parseJson<unknown>(historyBytes.toString("utf8"), `${id} reference state archive`);
    const authoredHistory = workedById.get(id);
    if (!isRecord(authoredPlan) || !isRecord(referenceStateArchive) || !authoredHistory || authoredPlan.id !== id || authoredPlan.title !== planRecord.title
      || authoredPlan.source_kind !== planRecord.sourceKind) {
      throw new Pwrp71FixtureError(`${id} authored source identity does not match its fixture manifest.`);
    }
    profiles.push({
      id,
      title: planRecord.title,
      sourceKind: planRecord.sourceKind,
      sourceArchive: manifest.sourceArchive,
      sourceArchiveSha256: manifest.sourceArchiveSha256,
      lineage: {
        plan: { archivePath: planRecord.archivePath, sha256: planRecord.sha256 },
        authoredHistory: { archivePath: manifest.authoredWorkedPaths.archivePath, sha256: manifest.authoredWorkedPaths.sha256 },
        referenceStateArchive: { archivePath: historyRecord.archivePath, sha256: historyRecord.sha256 },
      },
      authoredPlan,
      authoredHistory,
      referenceStateArchive,
      routerParity: "pending",
      qualificationStatus: "pending_router_parity",
    });
  }

  const candidateIds = manifest.coverageCandidates.map((candidate) => candidate.id);
  assertExactIds(candidateIds, COVERAGE_IDS, "PWRP 7.1 coverage candidate archive index");
  for (const candidate of manifest.coverageCandidates) {
    if (candidate.role !== "candidate_packet_archive" || candidate.status !== "candidate_archive_not_canonical_answer_history"
      || candidate.routerParity !== "pending") {
      throw new Pwrp71FixtureError(`${candidate.id} must remain a pending candidate packet archive, not a canonical history or qualified output.`);
    }
  }
  const coverageCandidates: Pwrp71QualificationFixtures["coverageCandidates"][number][] = [];
  for (const candidate of manifest.coverageCandidates) {
    if (!DIGEST.test(candidate.sha256)) throw new Pwrp71FixtureError(`${candidate.id} candidate packet digest is invalid.`);
    let packetBytes: Buffer;
    try { packetBytes = await readFile(safeAssetPath(fixtureRoot, candidate.file)); }
    catch { throw new Pwrp71FixtureError(`${candidate.id} candidate packet archive is missing or unreadable.`); }
    if (sha256(packetBytes) !== candidate.sha256) throw new Pwrp71FixtureError(`${candidate.id} candidate packet archive digest drifted.`);
    const packet = parseJson<unknown>(packetBytes.toString("utf8"), `${candidate.id} candidate packet archive`);
    if (!isRecord(packet) || packet.release_id !== "PWQE-5.1.0-candidate.1" || !isRecord(packet.source_binding)
      || packet.source_binding.source_sha256 !== "a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832") {
      throw new Pwrp71FixtureError(`${candidate.id} candidate packet source binding is not the pinned PWQE 5.1 candidate identity.`);
    }
    coverageCandidates.push({ ...candidate, packet: packet as JsonObject });
  }

  let semanticBytes: Buffer;
  try {
    semanticBytes = await readFile(safeAssetPath(fixtureRoot, manifest.semanticCasesFile));
  } catch {
    throw new Pwrp71FixtureError("PWRP71 semantic case file is missing or unreadable.");
  }
  const semanticBytesSha256 = sha256(semanticBytes);
  if (semanticBytesSha256 !== manifest.semanticCasesBytesSha256 || semanticBytesSha256 !== PWRP71_SEMANTIC_CASE_SET_SHA256) {
    throw new Pwrp71FixtureError("PWRP71 semantic case source bytes drifted from the fixture manifest.");
  }
  const semanticCases = parseJson<unknown>(semanticBytes.toString("utf8"), "PWRP71 semantic cases");
  if (!isRecord(semanticCases) || !Array.isArray(semanticCases.cases)) {
    throw new Pwrp71FixtureError("PWRP71 semantic case source must contain a cases array.");
  }
  const semanticCasesCanonicalJsonSha256 = sha256Canonical(semanticCases);
  const fixtureSetSha256 = sha256Canonical({
    sourceArchiveSha256: manifest.sourceArchiveSha256,
    authoredWorkedPathsSha256: manifest.authoredWorkedPaths.sha256,
    profileFixtures: profiles.map((profile) => ({ id: profile.id, planSha256: profile.lineage.plan.sha256, authoredHistorySha256: profile.lineage.authoredHistory.sha256, referenceStateArchiveSha256: profile.lineage.referenceStateArchive.sha256 })),
    coverageCandidates: coverageCandidates.map(({ id, sha256: assetSha256, packet }) => ({ id, assetSha256, packetSha256: typeof packet.content_sha256 === "string" ? packet.content_sha256 : "" })),
    semanticCasesBytesSha256: semanticBytesSha256,
  });

  return {
    profiles,
    coverageCandidates,
    fixtureSetSha256,
    semanticCases,
    semanticCaseSetSha256: PWRP71_SEMANTIC_CASE_SET_SHA256,
    semanticCasesCanonicalJsonSha256,
    sourceArchive: manifest.sourceArchive,
    sourceArchiveSha256: manifest.sourceArchiveSha256,
  };
}
