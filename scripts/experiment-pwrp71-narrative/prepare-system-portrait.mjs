#!/usr/bin/env node
/**
 * Stage source-bound fictional P02/C10 IFS interpretation inputs.
 * Deliberately no network, API key read, provider dispatch or activation.
 * Never describe these staged inputs as PWRP 7.1 qualified drafts.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const PROFILE_IDS = Object.freeze(["P02", "C10"]);
export const ROOT = resolve(import.meta.dirname, "../..");
const EXPERIMENT_ROOT = "qualification/pwrp71/portrait-experiment-v1";
const FIXTURE_ROOT = "qualification/pwrp71/route_replays_v5";

function asRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(label + " must be an object");
  return value;
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}
const sha = value => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");

export function assertCandidate(input) {
  const { profileId, profile, fixture } = input;
  if (!PROFILE_IDS.includes(profileId)) throw Error("This experiment authorizes only P02 and C10");
  const expected = profileId === "P02" ? ["D61", "D02", "D03", "D07", "D08", "D09", "D10"] : ["D29", "D30", "D32", "D33", "D34", "D35", "D36", "D37", "D80", "D81", "D82", "D83", "D84", "D85", "D86", "D100"];
  if (!profile || profile.id !== profileId || fixture.profileId !== profileId) throw Error("Fixture/profile mismatch");
  if (fixture.replay?.completeness?.mapping !== "complete" || fixture.replay?.completeness?.deepening !== "complete") throw Error("Incomplete v5 session");
  if (fixture.replay?.semanticCore?.status !== "complete") throw Error("Authored semantic anchors incomplete");
  const packet = asRecord(fixture.packets?.IFS?.packet, "IFS packet");
  if (packet.format !== "patternwork-router-evidence-v1") throw Error("Unexpected packet format");
  if (packet.snapshot_id !== "fictional-" + profileId + "-deepening") throw Error("Unexpected snapshot");
  if (packet.release_id !== "PWQE-5.1.0-candidate.1") throw Error("Question release drift");
  const { content_sha256: packetDigest, ...content } = packet;
  if (!/^[a-f0-9]{64}$/.test(packetDigest || "") || packetDigest !== sha(content)) throw Error("Packet content digest mismatch");
  const source = fixture.sourceIdentity || {};
  if (source.questionSourceSha256 !== "a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832"
    || source.reportSourceManifestSha256 !== "026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5") throw Error("Source pins do not match expected release");
  const responses = fixture.replay.submittedSourceToRuntimeResponses || [];
  const authoredDeepening = new Set(responses.filter(r => r.phase === "deepening" && r.provenance === "original_authored_fictional_response").map(r => r.questionId));
  for (const questionId of expected) if (!authoredDeepening.has(questionId)) throw Error("Expected authored Deepening anchor missing: " + questionId);
  return { packet, packetDigest, authoredDeepening: [...authoredDeepening].sort() };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!["--profile", "--output", "--workspace-root"].includes(k) || !argv[i+1] || argv[i+1].startsWith("--")) throw Error("Usage: node prepare-system-portrait.mjs --profile P02|C10 --output <writable-output-dir> [--workspace-root path]");
    opts[k.slice(2)] = argv[++i];
  }
  if (!opts.profile || !opts.output) throw Error("Specify --profile and --output");
  if (!PROFILE_IDS.includes(opts.profile)) throw Error("Only P02 and C10 are allowed");
  return opts;
}

export async function prepare(root, profileId) {
  const readText = p => readFile(join(root, p), "utf8");
  const [pairs, fixtureText, interpret, compose, review] = await Promise.all([
    readText(EXPERIMENT_ROOT + "/candidate-pair.json"),
    readText(FIXTURE_ROOT + "/" + profileId + ".json"),
    readText(EXPERIMENT_ROOT + "/01_INTERPRETATION_CONTRACT.md"),
    readText(EXPERIMENT_ROOT + "/02_IFS_NARRATIVE_COMPOSER.md"),
    readText(EXPERIMENT_ROOT + "/03_NARRATIVE_REVIEW.md")
  ]);
  const pair = JSON.parse(pairs);
  const fixture = JSON.parse(fixtureText);
  const descriptor = pair.profiles.find(x => x.id === profileId);
  if (!descriptor) throw Error("Profile not selected by pair manifest");
  const { packet, packetDigest, authoredDeepening } = assertCandidate({ profileId, profile: descriptor, fixture });
  // This is a bounded experimental prompt bundle. It is not the provider's
  // active pinned request; only the real source adapter can prepare one.
  const base = {
    schemaVersion: "PATTERNWORK-IFS-SYSTEM-PORTRAIT-PREPARATION-V1",
    status: "EXPERIMENTAL_NOT_QUALIFIED",
    mode: "no_dispatch",
    profileId,
    fixtureSet: pair.fixtureSet,
    packetSha256: packetDigest,
    sourceIdentity: fixture.sourceIdentity,
    experimentSha256: sha({ interpret, compose, review, pair }),
    authoredDeepening,
    exclusions: descriptor.mustNotClaim,
    researchQuestion: descriptor.focus,
  };
  const interpretationInput = {
    ...base,
    stage: "interpretation",
    system: interpret,
    task: "Derive a supported IFS functional graph with source-bound claims, roles, stable names, relations, priorities, and evidence/scope limits. Do not generate final reader prose. Do not extrapolate a whole person's life from fictional cases.",
    evidencePacket: packet,
  };
  const compositionTemplate = {
    ...base,
    stage: "composition_after_validation",
    system: compose,
    inputRequired: "A validated, frozen interpretation graph from the immediately preceding stage; never compose from an unvalidated model output",
    claimToParagraphBindingRequired: true,
    packetAvailableForValidation: packetDigest,
  };
  const reviewerTemplate = {
    ...base,
    stage: "independent_evidence_and_reader_review",
    system: review,
    inputRequired: "Current original packet, frozen validated interpretation graph, proposed reader prose and claim bindings",
    reviewMustCheckOriginalPacket: true,
  };
  return { interpretationInput, compositionTemplate, reviewerTemplate };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = resolve(args["workspace-root"] || ROOT);
  const results = await prepare(root, args.profile);
  const out = resolve(args.output);
  await mkdir(out, { recursive: true });
  for (const [kind, value] of Object.entries(results)) {
    const stem = kind === "interpretationInput" ? "interpretation.input" : kind === "compositionTemplate" ? "composition.template" : "review.template";
    const filepath = join(out, args.profile + "." + stem + ".json");
    await writeFile(filepath, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  }
  console.log(JSON.stringify({ profile: args.profile, written: Object.keys(results).length, packetSha256: results.interpretationInput.packetSha256, status: "no_dispatch_unqualified" }));
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
