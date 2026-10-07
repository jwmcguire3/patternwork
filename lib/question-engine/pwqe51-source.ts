import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { JsonSchema } from "../report-contracts/schema-validator.ts";

export const PWQE51_SOURCE_DIRECTORY = "specs/patternwork/question-engine-v5.1/assessment_runtime" as const;
export const PWQE51_SOURCE_MANIFEST_PATH = `${PWQE51_SOURCE_DIRECTORY}/SOURCE_MANIFEST.json` as const;
export const PWQE51_SOURCE_MANIFEST_SHA256 = "144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc" as const;

export const PWQE51_RELEASE_IDENTITY = {
  questionRelease: "PWQE-5.1.0-candidate.1",
  routerVersion: "PW-ROUTER-1.1.0-candidate.1",
  sourceSha256: "a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832",
  reportRelease: "PWRP-7.1.0-candidate.1",
} as const;

export interface Pwqe51SourceManifest {
  readonly source_binding: {
    readonly question_release: string;
    readonly runtime_version: string;
    readonly source_sha256: string;
  };
  readonly files: Readonly<Record<string, string>>;
  readonly counts: {
    readonly mapping: number;
    readonly deepening: number;
    readonly templates: number;
    readonly base_options: number;
    readonly variants: number;
    readonly targets: number;
  };
  readonly status: string;
}

export interface Pwqe51Option {
  readonly id: string;
  readonly text: string;
  readonly reported_value?: string;
  readonly candidate_signals?: readonly string[];
  readonly exclusive?: boolean;
}

export interface Pwqe51Question {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly stage: "mapping" | "deepening";
  readonly context: string;
  readonly episode_family: string;
  readonly captures: string;
  readonly step_binding: string;
  readonly prompt: string;
  readonly options: readonly Pwqe51Option[];
  readonly selection: Readonly<Record<string, unknown>>;
  readonly eligibility: {
    readonly requires_answered: readonly string[];
    readonly topic_opt_in: string | null;
    readonly actual_episode_required: boolean;
    readonly specific?: Readonly<Record<string, unknown>>;
  };
  readonly response_controls: readonly string[];
  readonly [key: string]: unknown;
}

export interface Pwqe51QuestionVariant {
  readonly id: string;
  readonly replaces: string;
  readonly when?: Readonly<Record<string, unknown>>;
  readonly prompt?: string;
  readonly options: readonly Pwqe51Option[];
  readonly captures?: string;
}

export interface Pwqe51QuestionBank {
  readonly release: string;
  readonly status: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly common_response_controls: readonly { readonly id: string; readonly text: string }[];
  readonly items: readonly Pwqe51Question[];
  readonly variants: readonly Pwqe51QuestionVariant[];
  readonly dynamic_slots: Readonly<Record<string, unknown>>;
}

export interface Pwqe51RoutingTargets {
  readonly release: string;
  readonly targets: readonly Readonly<Record<string, unknown>>[];
  readonly entry_points: readonly Readonly<Record<string, unknown>>[];
  readonly operators: Readonly<Record<string, unknown>>;
}

export interface Pwqe51SourcePackage {
  readonly manifest: Pwqe51SourceManifest;
  readonly sourceManifestSha256: typeof PWQE51_SOURCE_MANIFEST_SHA256;
  readonly questionBank: Pwqe51QuestionBank;
  readonly routingTargets: Pwqe51RoutingTargets;
  readonly itemGates: Readonly<{ readonly gates: Readonly<Record<string, Readonly<Record<string, unknown>>>> }>;
  readonly coverageRules: Readonly<{ readonly rules: readonly Readonly<Record<string, unknown>>[] }>;
  readonly schemas: { readonly routerPacket: JsonSchema };
}

export interface Pwqe51SourceIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type Pwqe51IntegrityResult =
  | { readonly ok: true; readonly value: Pwqe51SourceManifest; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly Pwqe51SourceIssue[] };

const FILES = {
  manifest: "SOURCE_MANIFEST.json",
  questionBank: "assessment/question_bank.json",
  routingTargets: "architecture/routing_targets.json",
  itemGates: "architecture/item_gates.json",
  coverageRules: "architecture/coverage_rules.json",
  routerPacketSchema: "schemas/router_packet.schema.json",
} as const;

const REQUIRED_NEW_COVERAGE_ITEMS = [
  ...Array.from({ length: 36 }, (_, index) => `D${String(index + 65).padStart(2, "0")}`),
  "D20", "D22", "D23",
].sort();

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function issue(code: string, source: string, message: string): Pwqe51SourceIssue {
  return { code, path: source, message };
}

function equalSet(actual: Iterable<string>, expected: Iterable<string>): boolean {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

async function walk(root: string, current = root): Promise<{ files: string[]; symlinks: string[] }> {
  const files: string[] = [];
  const symlinks: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) symlinks.push(relative);
    else if (entry.isDirectory()) {
      const nested = await walk(root, absolute);
      files.push(...nested.files);
      symlinks.push(...nested.symlinks);
    } else if (entry.isFile()) files.push(relative);
  }
  return { files, symlinks };
}

export async function verifyPwqe51SourceIntegrity(workspaceRoot = process.cwd()): Promise<Pwqe51IntegrityResult> {
  const issues: Pwqe51SourceIssue[] = [];
  let rawManifest: string;
  let manifest: Pwqe51SourceManifest;
  try {
    rawManifest = await readFile(path.join(workspaceRoot, PWQE51_SOURCE_MANIFEST_PATH), "utf8");
    manifest = JSON.parse(rawManifest) as Pwqe51SourceManifest;
  } catch (error) {
    return { ok: false, issues: [issue("pwqe51_manifest_unreadable", PWQE51_SOURCE_MANIFEST_PATH, String(error))] };
  }

  if (sha256(Buffer.from(rawManifest, "utf8")) !== PWQE51_SOURCE_MANIFEST_SHA256) {
    issues.push(issue("pwqe51_manifest_pin_drift", PWQE51_SOURCE_MANIFEST_PATH, "The candidate source manifest no longer matches its imported content pin."));
  }
  if (manifest.source_binding?.question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || manifest.source_binding?.runtime_version !== PWQE51_RELEASE_IDENTITY.routerVersion
    || manifest.source_binding?.source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || manifest.status !== "candidate_content_identity_not_production_activation") {
    issues.push(issue("pwqe51_source_binding", PWQE51_SOURCE_MANIFEST_PATH, "The candidate release identity or activation status does not match the pinned package."));
  }
  if (!record(manifest.files) || Object.keys(manifest.files).length !== 26) {
    issues.push(issue("pwqe51_source_population", PWQE51_SOURCE_MANIFEST_PATH, "The candidate source manifest must bind exactly 26 assessment runtime assets."));
  }

  const packageRoot = path.join(workspaceRoot, PWQE51_SOURCE_DIRECTORY);
  try {
    const observed = await walk(packageRoot);
    const expected = new Set([...Object.keys(manifest.files ?? {}), FILES.manifest]);
    for (const extra of observed.files) if (!expected.has(extra)) issues.push(issue("pwqe51_unexpected_file", extra, "An unpinned file was added to the immutable candidate source."));
    for (const missing of expected) if (!observed.files.includes(missing)) issues.push(issue("pwqe51_missing_file", missing, "A pinned candidate source file is missing."));
    for (const link of observed.symlinks) issues.push(issue("pwqe51_symlink", link, "Symbolic links are not allowed in the immutable candidate source."));

    for (const [relative, expectedDigest] of Object.entries(manifest.files ?? {})) {
      if (relative.startsWith("/") || relative.split("/").some((part) => part === "." || part === "..")
        || !/^[a-f0-9]{64}$/u.test(expectedDigest)) {
        issues.push(issue("pwqe51_unsafe_manifest_entry", relative, "Manifest entries must be safe relative paths with lowercase SHA-256 values."));
        continue;
      }
      try {
        const absolute = path.join(packageRoot, ...relative.split("/"));
        const metadata = await stat(absolute);
        if (!metadata.isFile()) throw new Error("Manifest entry is not a regular file.");
        const actualDigest = sha256(await readFile(absolute));
        if (actualDigest !== expectedDigest) issues.push(issue("pwqe51_source_hash_drift", relative, `Expected ${expectedDigest}; found ${actualDigest}.`));
      } catch (error) {
        if (!issues.some((entry) => entry.code === "pwqe51_missing_file" && entry.path === relative)) {
          issues.push(issue("pwqe51_source_unreadable", relative, String(error)));
        }
      }
    }
  } catch (error) {
    issues.push(issue("pwqe51_package_unreadable", PWQE51_SOURCE_DIRECTORY, String(error)));
  }
  return issues.length === 0 ? { ok: true, value: manifest, issues: [] } : { ok: false, issues };
}

function validateStructures(input: {
  readonly questionBank: unknown;
  readonly routingTargets: unknown;
  readonly itemGates: unknown;
  readonly coverageRules: unknown;
}): readonly Pwqe51SourceIssue[] {
  const issues: Pwqe51SourceIssue[] = [];
  const bank = record(input.questionBank) ? input.questionBank : {};
  const targetSource = record(input.routingTargets) ? input.routingTargets : {};
  const gateSource = record(input.itemGates) ? input.itemGates : {};
  const coverageSource = record(input.coverageRules) ? input.coverageRules : {};
  const items = array(bank.items).filter(record);
  const variants = array(bank.variants).filter(record);
  const targets = array(targetSource.targets).filter(record);
  const rules = array(coverageSource.rules).filter(record);
  const gates = record(gateSource.gates) ? gateSource.gates : {};

  if (bank.release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || targetSource.release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || coverageSource.release !== PWQE51_RELEASE_IDENTITY.questionRelease) {
    issues.push(issue("pwqe51_release_identity", FILES.questionBank, "Question, target, and coverage assets must bind the same candidate release."));
  }
  const counts = record(bank.counts) ? bank.counts : {};
  const optionIds = new Set<string>();
  const questionIds = new Set<string>();
  let optionCount = 0;
  let mappingCount = 0;
  let deepeningCount = 0;
  for (const item of items) {
    const id = item.id;
    if (typeof id !== "string" || questionIds.has(id)) issues.push(issue("pwqe51_duplicate_question_id", FILES.questionBank, `Duplicate or missing question identity ${String(id)}.`));
    else questionIds.add(id);
    if (item.stage === "mapping") mappingCount += 1;
    else if (item.stage === "deepening") deepeningCount += 1;
    else issues.push(issue("pwqe51_question_stage", FILES.questionBank, `Question ${String(id)} has an unknown stage.`));
    if (typeof item.prompt !== "string" || typeof item.title !== "string" || typeof item.version !== "string") {
      issues.push(issue("pwqe51_question_text", FILES.questionBank, `Question ${String(id)} is missing authored text or version.`));
    }
    for (const option of array(item.options).filter(record)) {
      optionCount += 1;
      if (typeof option.id !== "string" || optionIds.has(option.id)) issues.push(issue("pwqe51_duplicate_option_id", FILES.questionBank, `Duplicate or missing option identity ${String(option.id)}.`));
      else optionIds.add(option.id);
      if (typeof option.text !== "string" || !option.text.trim()) issues.push(issue("pwqe51_option_text", FILES.questionBank, `Option ${String(option.id)} has no authored text.`));
    }
    if (!Array.isArray(item.options) || !record(item.eligibility) || !Array.isArray(item.eligibility.requires_answered)) {
      issues.push(issue("pwqe51_question_shape", FILES.questionBank, `Question ${String(id)} has an invalid options or eligibility shape.`));
    }
  }
  const actualBankCounts = { items: items.length, mappingCount, deepeningCount, optionCount };
  if (actualBankCounts.items !== 130 || actualBankCounts.mappingCount !== 30 || actualBankCounts.deepeningCount !== 100
    || actualBankCounts.optionCount !== 766 || counts.substantive_item_templates !== 130 || counts.mapping_items !== 30
    || counts.conditional_items !== 100 || counts.substantive_options !== 766 || counts.additional_rendered_variant !== 1) {
    issues.push(issue("pwqe51_authored_counts", FILES.questionBank, `Candidate source counts do not match the imported 130/30/100/766/1 population: ${JSON.stringify(actualBankCounts)}.`));
  }

  for (const variant of variants) {
    if (typeof variant.id !== "string" || optionIds.has(variant.id) || !questionIds.has(String(variant.replaces))) {
      issues.push(issue("pwqe51_variant_identity", FILES.questionBank, `Variant ${String(variant.id)} has a duplicate identity or unknown base question.`));
    }
    for (const option of array(variant.options).filter(record)) {
      if (typeof option.id !== "string" || optionIds.has(option.id)) issues.push(issue("pwqe51_duplicate_variant_option", FILES.questionBank, `Duplicate variant option ${String(option.id)}.`));
      else optionIds.add(option.id);
      if (typeof option.text !== "string" || !option.text.trim()) issues.push(issue("pwqe51_variant_option_text", FILES.questionBank, `Variant option ${String(option.id)} has no authored text.`));
    }
  }
  if (variants.length !== 1 || variants[0]?.id !== "M10.observable" || variants[0]?.replaces !== "M10") {
    issues.push(issue("pwqe51_variant_population", FILES.questionBank, "Candidate release must bind its single M10 observable alternate."));
  }

  const itemMap = new Map(items.map((item) => [String(item.id), item]));
  for (const item of items) {
    for (const parent of array(record(item.eligibility) ? item.eligibility.requires_answered : [])) {
      if (typeof parent !== "string" || !questionIds.has(parent)) issues.push(issue("pwqe51_unknown_parent", FILES.questionBank, `Question ${String(item.id)} references unknown parent ${String(parent)}.`));
    }
  }
  if (targets.length !== 92 || new Set(targets.map((target) => target.id)).size !== 92) {
    issues.push(issue("pwqe51_target_population", FILES.routingTargets, "Candidate release must contain 92 unique target definitions."));
  }
  const targetMap = new Map(targets.map((target) => [String(target.id), target]));
  for (const target of targets) {
    const candidateItems = array(target.candidate_items).map(String);
    for (const candidate of candidateItems) {
      const id = candidate.startsWith("REPLAY:") ? candidate.slice("REPLAY:".length) : candidate;
      if (candidate !== "REPLAY" && !itemMap.has(id)) issues.push(issue("pwqe51_unknown_target_candidate", FILES.routingTargets, `Target ${String(target.id)} references unknown candidate ${candidate}.`));
    }
    for (const origin of array(target.opens_from_items)) {
      if (typeof origin !== "string" || !itemMap.has(origin)) issues.push(issue("pwqe51_unknown_target_origin", FILES.routingTargets, `Target ${String(target.id)} references unknown origin ${String(origin)}.`));
    }
  }
  if (rules.length !== 39 || new Set(rules.map((rule) => rule.id)).size !== 39) {
    issues.push(issue("pwqe51_coverage_rule_population", FILES.coverageRules, "Candidate release must contain 39 unique coverage rules."));
  }
  const coveredItems = new Set<string>();
  const ruleIds = new Set<string>();
  for (const rule of rules) {
    const id = String(rule.id ?? "");
    const itemId = String(rule.item_id ?? "");
    if (ruleIds.has(id) || coveredItems.has(itemId)) issues.push(issue("pwqe51_duplicate_coverage_identity", FILES.coverageRules, `Duplicate coverage rule or covered item ${id}/${itemId}.`));
    ruleIds.add(id);
    coveredItems.add(itemId);
    const target = targetMap.get(id);
    if (!itemMap.has(itemId) || !target || !equalSet(array(target.candidate_items).map(String), [itemId])) {
      issues.push(issue("pwqe51_coverage_target_binding", FILES.coverageRules, `Coverage rule ${id} must target its single authored item ${itemId}.`));
    }
    for (const sourceItem of [...array(rule.opens_from_items), ...array(rule.any_items)].map(String)) {
      if (!itemMap.has(sourceItem)) issues.push(issue("pwqe51_coverage_source_item", FILES.coverageRules, `Coverage rule ${id} references unknown item ${sourceItem}.`));
    }
    for (const field of ["any_options", "all_options", "exclude_options", "alternative_options", "unknown_options"] as const) {
      for (const optionId of array(rule[field])) {
        if (typeof optionId !== "string" || !optionIds.has(optionId)) issues.push(issue("pwqe51_coverage_option", FILES.coverageRules, `Coverage rule ${id} references unknown option ${String(optionId)}.`));
      }
    }
    const alternatives = new Set(array(rule.alternative_options).map(String));
    if (array(rule.unknown_options).some((option) => alternatives.has(String(option)))) {
      issues.push(issue("pwqe51_coverage_closure_overlap", FILES.coverageRules, `Coverage rule ${id} treats the same option as both an alternative and unknown.`));
    }
    if (!Array.isArray(rule.required_flags) || typeof rule.automatic !== "boolean" || typeof rule.root !== "boolean") {
      issues.push(issue("pwqe51_coverage_rule_shape", FILES.coverageRules, `Coverage rule ${id} is missing its gate or routing flags.`));
    }
    const gate = gates[itemId];
    if (/^D(?:6[5-9]|[789]\d|100)$/u.test(itemId) && (!record(gate) || gate.coverage_rule !== id)) {
      issues.push(issue("pwqe51_coverage_item_gate", FILES.itemGates, `Item gate for ${itemId} must bind coverage rule ${id}.`));
    }
  }
  if (!equalSet(coveredItems, REQUIRED_NEW_COVERAGE_ITEMS)) {
    issues.push(issue("pwqe51_coverage_item_set", FILES.coverageRules, "Coverage rules must bind D65–D100 and the three existing D20/D22/D23 items exactly."));
  }
  for (const [itemId, gate] of Object.entries(gates)) {
    if (!itemMap.has(itemId)) issues.push(issue("pwqe51_gate_item", FILES.itemGates, `Gate references unknown item ${itemId}.`));
    if (record(gate)) {
      for (const optionId of [...array(gate.required_parent_options), ...array(gate.exclude_parent_options)].map(String)) {
        if (!optionIds.has(optionId)) issues.push(issue("pwqe51_gate_option", FILES.itemGates, `Gate for ${itemId} references unknown option ${optionId}.`));
      }
    }
  }
  if (!record(input.routingTargets) || !Array.isArray(targetSource.entry_points)) {
    issues.push(issue("pwqe51_routing_target_shape", FILES.routingTargets, "Routing source is missing its entry point list."));
  }
  return issues;
}

async function readJson<T>(workspaceRoot: string, relativePath: string): Promise<T> {
  const absolute = path.join(workspaceRoot, PWQE51_SOURCE_DIRECTORY, ...relativePath.split("/"));
  return JSON.parse(await readFile(absolute, "utf8")) as T;
}

async function loadPackage(workspaceRoot: string): Promise<Pwqe51SourcePackage> {
  const integrity = await verifyPwqe51SourceIntegrity(workspaceRoot);
  if (!integrity.ok) throw new Error(`PWQE 5.1 candidate source integrity failed: ${JSON.stringify(integrity.issues)}`);
  const [questionBank, routingTargets, itemGates, coverageRules, routerPacketSchema] = await Promise.all([
    readJson<Pwqe51QuestionBank>(workspaceRoot, FILES.questionBank),
    readJson<Pwqe51RoutingTargets>(workspaceRoot, FILES.routingTargets),
    readJson<Pwqe51SourcePackage["itemGates"]>(workspaceRoot, FILES.itemGates),
    readJson<Pwqe51SourcePackage["coverageRules"]>(workspaceRoot, FILES.coverageRules),
    readJson<JsonSchema>(workspaceRoot, FILES.routerPacketSchema),
  ]);
  const issues = validateStructures({ questionBank, routingTargets, itemGates, coverageRules });
  if (issues.length > 0) throw new Error(`PWQE 5.1 candidate source validation failed: ${JSON.stringify(issues)}`);
  return {
    manifest: integrity.value,
    sourceManifestSha256: PWQE51_SOURCE_MANIFEST_SHA256,
    questionBank,
    routingTargets,
    itemGates,
    coverageRules,
    schemas: { routerPacket: routerPacketSchema },
  };
}

const packageCache = new Map<string, Promise<Pwqe51SourcePackage>>();

export function validatePwqe51Source(input: {
  readonly questionBank: unknown;
  readonly routingTargets: unknown;
  readonly itemGates: unknown;
  readonly coverageRules: unknown;
}): readonly Pwqe51SourceIssue[] {
  return validateStructures(input);
}

export async function loadPwqe51SourcePackage(workspaceRoot = process.cwd()): Promise<Pwqe51SourcePackage> {
  const root = path.resolve(workspaceRoot);
  let pending = packageCache.get(root);
  if (!pending) {
    pending = loadPackage(root);
    packageCache.set(root, pending);
    pending.catch(() => packageCache.delete(root));
  }
  return pending;
}

export function getPwqe51Question(source: Pwqe51SourcePackage, questionId: string): Pwqe51Question {
  const question = source.questionBank.items.find((item) => item.id === questionId);
  if (!question) throw new Error(`PWQE 5.1 candidate question ${questionId} is not in the pinned source.`);
  return question;
}
