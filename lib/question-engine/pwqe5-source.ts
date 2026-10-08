import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  loadPwqe5SourceManifest,
  verifyPwqe5SourceIntegrity,
  type Pwqe5SourceManifest,
} from "./source-integrity.ts";
import type { ValidationIssue } from "./types.ts";

export const PWQE5_SOURCE_DIRECTORY = "specs/patternwork/question-engine-v5" as const;
export const PWQE5_SOURCE_RELEASE = "PWQE-5.0.0-design.1" as const;
export const PWQE5_ROUTER_RELEASE = "PW-ROUTER-1.0.0-candidate.1" as const;
export const PWQE5_PROMPT_RELEASE = "6.0" as const;

export interface Pwqe5Option {
  readonly id: string;
  readonly text: string;
  readonly reported_value: string;
  readonly candidate_signals: readonly string[];
  readonly exclusive?: boolean;
}

export interface Pwqe5Question {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly stage: "mapping" | "deepening";
  readonly prompt: string;
  readonly options: readonly Pwqe5Option[];
  readonly eligibility: {
    readonly requires_answered: readonly string[];
    readonly topic_opt_in: string | null;
    readonly actual_episode_required: boolean;
    readonly specific: Readonly<Record<string, unknown>>;
  };
  readonly response_controls: readonly string[];
  readonly allowed_variants: readonly string[];
  readonly [key: string]: unknown;
}

export interface Pwqe5QuestionBank {
  readonly release: typeof PWQE5_SOURCE_RELEASE;
  readonly status: "authored_design_candidate_not_validated_not_deployed";
  readonly counts: {
    readonly mapping_items: number;
    readonly conditional_items: number;
    readonly substantive_item_templates: number;
    readonly additional_rendered_variant: number;
    readonly substantive_options: number;
  };
  readonly common_response_controls: readonly { readonly id: string; readonly text: string }[];
  readonly items: readonly Pwqe5Question[];
  readonly variants: readonly {
    readonly id: string;
    readonly replaces: string;
    readonly prompt: string;
    readonly options: readonly Pwqe5Option[];
    readonly [key: string]: unknown;
  }[];
  readonly dynamic_slots: unknown;
}

export interface Pwqe5RoutingTargets {
  readonly release: typeof PWQE5_SOURCE_RELEASE;
  readonly status: string;
  readonly targets: readonly {
    readonly id: string;
    readonly opens_from_items: readonly string[];
    readonly candidate_items: readonly string[];
    readonly [key: string]: unknown;
  }[];
  readonly [key: string]: unknown;
}

export interface Pwqe5SourcePackage {
  readonly manifest: Pwqe5SourceManifest;
  readonly questionBank: Pwqe5QuestionBank;
  readonly routingTargets: Pwqe5RoutingTargets;
  readonly itemGates: Readonly<Record<string, unknown>>;
  readonly workedPaths: unknown;
  readonly negativeCases: unknown;
  readonly reportPrompts: Readonly<Record<"shared" | "mapping" | "ifs" | "state" | "attachment" | "synthesis" | "reviewer", string>>;
  readonly schemas: { readonly routerPacket: Readonly<Record<string, unknown>>; readonly reportDraft: Readonly<Record<string, unknown>> };
}

const FILES = {
  questionBank: "assessment/question_bank.json",
  routingTargets: "architecture/routing_targets.json",
  itemGates: "architecture/item_gates.json",
  workedPaths: "examples/worked_paths.json",
  negativeCases: "examples/negative_cases.json",
  reportPrompts: {
    shared: "reports/00_SHARED_REPORT_PROMPT_v6.md",
    mapping: "reports/01_MAPPING_REPORT_PROMPT.md",
    ifs: "reports/02_IFS_REPORT_PROMPT.md",
    state: "reports/03_STATE_REPORT_PROMPT.md",
    attachment: "reports/04_ATTACHMENT_REPORT_PROMPT.md",
    synthesis: "reports/05_SYNTHESIS_REPORT_PROMPT.md",
    reviewer: "reports/06_REVIEWER_PROMPT.md",
  },
  routerPacketSchema: "schemas/router_packet.schema.json",
  reportDraftSchema: "schemas/report_draft.schema.json",
} as const;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return array(value).filter((entry): entry is string => typeof entry === "string");
}

function sourceIssue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function validatePwqe5Structures(input: {
  readonly questionBank: unknown;
  readonly routingTargets: unknown;
  readonly itemGates: unknown;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bank = object(input.questionBank);
  const targetsDocument = object(input.routingTargets);
  const gatesDocument = object(input.itemGates);
  if (!bank || !targetsDocument || !gatesDocument) return [sourceIssue("pwqe5_json_shape", "$", "Question bank, routing targets, and item gates must be JSON objects.")];

  if (bank.release !== PWQE5_SOURCE_RELEASE || bank.status !== "authored_design_candidate_not_validated_not_deployed") {
    issues.push(sourceIssue("pwqe5_question_release", FILES.questionBank, "Question bank release/status does not match the supplied PWQE 5 design candidate."));
  }
  if (targetsDocument.release !== PWQE5_SOURCE_RELEASE) issues.push(sourceIssue("pwqe5_targets_release", FILES.routingTargets, "Routing target release does not match the question bank."));

  const items = array(bank.items).map(object).filter((item): item is Record<string, unknown> => Boolean(item));
  const variants = array(bank.variants).map(object).filter((item): item is Record<string, unknown> => Boolean(item));
  const targetRows = array(targetsDocument.targets).map(object).filter((target): target is Record<string, unknown> => Boolean(target));
  const gates = object(gatesDocument.gates);
  if (!gates) issues.push(sourceIssue("pwqe5_gates_shape", FILES.itemGates, "Item gates must be keyed by canonical question ID."));

  const itemIds = items.map((item) => String(item.id ?? ""));
  const itemIdSet = new Set(itemIds);
  if (items.length !== 94 || itemIdSet.size !== items.length) issues.push(sourceIssue("pwqe5_question_population", FILES.questionBank, "Expected 94 distinct canonical question templates."));
  if (items.filter((item) => item.stage === "mapping").length !== 30 || items.filter((item) => item.stage === "deepening").length !== 64) {
    issues.push(sourceIssue("pwqe5_question_stages", FILES.questionBank, "Expected 30 Mapping and 64 conditional Deepening templates."));
  }
  if (items.some((item) => !/^(?:M|D)\d{2}$/u.test(String(item.id ?? "")) || typeof item.prompt !== "string" || !item.prompt.trim() || typeof item.title !== "string" || !Array.isArray(item.options))) {
    issues.push(sourceIssue("pwqe5_question_definition", FILES.questionBank, "Every canonical item must have a current PWQE 5 ID, title, prompt, and authored options."));
  }

  const variantById = new Map(variants.map((variant) => [String(variant.id ?? ""), variant]));
  if (variants.length !== 1 || variantById.size !== variants.length) issues.push(sourceIssue("pwqe5_variant_population", FILES.questionBank, "Expected exactly one distinct authored render variant."));
  const allQuestionIds = new Set([...itemIds, ...variantById.keys()]);
  const optionIds = new Set<string>();
  let duplicateOptions = false;
  for (const item of [...items, ...variants]) {
    for (const option of array(item.options).map(object).filter((value): value is Record<string, unknown> => Boolean(value))) {
      const id = String(option.id ?? "");
      if (!id || typeof option.text !== "string" || !id.startsWith(`${String(item.id ?? item.replaces ?? "")}.`)) {
        issues.push(sourceIssue("pwqe5_option_definition", `${FILES.questionBank}:${String(item.id ?? item.replaces ?? "")}`, "Option IDs and text must be authored under their canonical question ID."));
      }
      if (optionIds.has(id)) duplicateOptions = true;
      optionIds.add(id);
      if (!Array.isArray(option.candidate_signals)) issues.push(sourceIssue("pwqe5_candidate_signals", `${FILES.questionBank}:${id}`, "Every option must carry an authored candidate_signals array."));
    }
  }
  if (duplicateOptions) issues.push(sourceIssue("pwqe5_duplicate_option_id", FILES.questionBank, "Option IDs must be unique across base items and render variants."));

  for (const variant of variants) {
    const id = String(variant.id ?? "");
    const replaces = String(variant.replaces ?? "");
    const parent = items.find((item) => item.id === replaces);
    if (!parent || !id.startsWith(`${replaces}.`)) issues.push(sourceIssue("pwqe5_variant_reference", `${FILES.questionBank}:${id}`, "Render variant must replace an existing canonical item."));
    if (!strings(parent?.allowed_variants).includes(id)) issues.push(sourceIssue("pwqe5_variant_allowlist", `${FILES.questionBank}:${replaces}`, "Parent item must explicitly allow its render variant."));
  }
  for (const item of items) {
    const allowed = strings(item.allowed_variants);
    if (!allowed.includes("base") || allowed.some((value) => value !== "base" && variantById.get(value)?.replaces !== item.id)) {
      issues.push(sourceIssue("pwqe5_variant_allowlist", `${FILES.questionBank}:${String(item.id)}`, "Item variant allowlist contains an unknown authored variant."));
    }
    const eligibility = object(item.eligibility);
    for (const dependency of strings(eligibility?.requires_answered)) {
      if (!itemIdSet.has(dependency)) issues.push(sourceIssue("pwqe5_dependency_reference", `${FILES.questionBank}:${String(item.id)}`, `Unknown prerequisite question ${dependency}.`));
    }
    for (const control of strings(item.response_controls)) {
      if (!array(bank.common_response_controls).some((entry) => object(entry)?.id === control)) issues.push(sourceIssue("pwqe5_response_control_reference", `${FILES.questionBank}:${String(item.id)}`, `Unknown authored response control ${control}.`));
    }
  }

  const targetIds = targetRows.map((target) => String(target.id ?? ""));
  const targetIdSet = new Set(targetIds);
  if (targetRows.length !== 53 || targetIdSet.size !== targetRows.length) issues.push(sourceIssue("pwqe5_target_population", FILES.routingTargets, "Expected 53 distinct authored routing targets."));
  for (const target of targetRows) {
    const id = String(target.id ?? "");
    for (const itemId of strings(target.opens_from_items)) {
      if (!itemIdSet.has(itemId)) issues.push(sourceIssue("pwqe5_target_item_reference", `${FILES.routingTargets}:${id}`, `Unknown opening question ${itemId}.`));
    }
    for (const candidateId of strings(target.candidate_items)) {
      const replay = /^REPLAY(?::((?:M|D)\d{2}))?$/u.exec(candidateId);
      if (!itemIdSet.has(candidateId) && !(replay && (!replay[1] || itemIdSet.has(replay[1])))) {
        issues.push(sourceIssue("pwqe5_target_item_reference", `${FILES.routingTargets}:${id}`, `Unknown candidate question or replay source ${candidateId}.`));
      }
    }
  }
  for (const item of items) {
    for (const targetId of [...strings(item.follow_up_targets), ...strings(item.hypotheses_opened)]) {
      if (!targetIdSet.has(targetId)) issues.push(sourceIssue("pwqe5_question_target_reference", `${FILES.questionBank}:${String(item.id)}`, `Unknown routing target ${targetId}.`));
    }
  }

  if (gates) {
    const gateIds = Object.keys(gates);
    if (gateIds.length !== 29 || gateIds.some((id) => !itemIdSet.has(id))) issues.push(sourceIssue("pwqe5_item_gate_population", FILES.itemGates, "Item gates must reference known canonical questions and match the authored gate count."));
    for (const [itemId, rawGate] of Object.entries(gates)) {
      const gate = object(rawGate);
      if (!gate) {
        issues.push(sourceIssue("pwqe5_item_gate_shape", `${FILES.itemGates}:${itemId}`, "Each item gate must be an object."));
        continue;
      }
      for (const optionId of [...strings(gate.required_parent_options), ...strings(gate.exclude_parent_options)]) {
        if (!optionIds.has(optionId)) issues.push(sourceIssue("pwqe5_gate_option_reference", `${FILES.itemGates}:${itemId}`, `Unknown authored option ${optionId}.`));
      }
    }
  }

  const counts = object(bank.counts);
  if (counts?.substantive_item_templates !== items.length || counts?.mapping_items !== 30 || counts?.conditional_items !== 64 || counts?.substantive_options !== items.reduce((total, item) => total + array(item.options).length, 0)) {
    issues.push(sourceIssue("pwqe5_authored_counts", FILES.questionBank, "Question bank authored counts do not match the loaded canonical population."));
  }
  if (allQuestionIds.size !== items.length + variants.length) issues.push(sourceIssue("pwqe5_question_id_collision", FILES.questionBank, "A render variant ID collides with a base question ID."));
  return issues;
}

async function readJson<T>(workspaceRoot: string, relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(workspaceRoot, PWQE5_SOURCE_DIRECTORY, ...relativePath.split("/")), "utf8")) as T;
}

async function loadPackage(workspaceRoot: string): Promise<Pwqe5SourcePackage> {
  const integrity = await verifyPwqe5SourceIntegrity(workspaceRoot);
  if (!integrity.ok) throw new Error(`PWQE 5 source integrity failed: ${JSON.stringify(integrity.issues)}`);
  const [manifest, questionBank, routingTargets, itemGates, workedPaths, negativeCases] = await Promise.all([
    loadPwqe5SourceManifest(workspaceRoot),
    readJson<Pwqe5QuestionBank>(workspaceRoot, FILES.questionBank),
    readJson<Pwqe5RoutingTargets>(workspaceRoot, FILES.routingTargets),
    readJson<Readonly<Record<string, unknown>>>(workspaceRoot, FILES.itemGates),
    readJson<unknown>(workspaceRoot, FILES.workedPaths),
    readJson<unknown>(workspaceRoot, FILES.negativeCases),
  ]);
  const [promptValues, routerPacketSchema, reportDraftSchema] = await Promise.all([
    Promise.all(Object.values(FILES.reportPrompts).map((relativePath) => readFile(path.join(workspaceRoot, PWQE5_SOURCE_DIRECTORY, ...relativePath.split("/")), "utf8"))),
    readJson<Readonly<Record<string, unknown>>>(workspaceRoot, FILES.routerPacketSchema),
    readJson<Readonly<Record<string, unknown>>>(workspaceRoot, FILES.reportDraftSchema),
  ]);
  const issues = validatePwqe5Structures({ questionBank, routingTargets, itemGates });
  if (issues.length > 0) throw new Error(`PWQE 5 authored source validation failed: ${JSON.stringify(issues)}`);
  if (object(routerPacketSchema)?.$id !== "urn:patternwork:router-evidence:1") throw new Error("PWQE 5 router evidence schema revision does not match the source manifest.");
  return {
    manifest,
    questionBank,
    routingTargets,
    itemGates,
    workedPaths,
    negativeCases,
    reportPrompts: Object.fromEntries(Object.keys(FILES.reportPrompts).map((key, index) => [key, promptValues[index]])) as Pwqe5SourcePackage["reportPrompts"],
    schemas: { routerPacket: routerPacketSchema, reportDraft: reportDraftSchema },
  };
}

const packageCache = new Map<string, Promise<Pwqe5SourcePackage>>();

export function validatePwqe5Source(input: { readonly questionBank: unknown; readonly routingTargets: unknown; readonly itemGates: unknown }): readonly ValidationIssue[] {
  return validatePwqe5Structures(input);
}

export async function loadPwqe5SourcePackage(workspaceRoot = process.cwd()): Promise<Pwqe5SourcePackage> {
  const root = path.resolve(workspaceRoot);
  let pending = packageCache.get(root);
  if (!pending) {
    pending = loadPackage(root);
    packageCache.set(root, pending);
    pending.catch(() => packageCache.delete(root));
  }
  return pending;
}
