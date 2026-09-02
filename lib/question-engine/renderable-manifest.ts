import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadAuthoredInstrumentManifest, type AuthoredBankItemDefinition } from "./authored-manifest.ts";
import { LAYER_SECTION_CODES } from "./manifest.ts";
import type { BankItemId, LayerSectionCode } from "./types.ts";

const RESPONSE_LIBRARY_SOURCE = "specs/patternwork/question-engine-v3.1/05_response_option_libraries.md";

export interface RenderableOption {
  readonly optionId: string;
  readonly label: string;
  readonly authored: string;
}

export interface RenderableOptionGroup {
  readonly groupId: string;
  readonly label: string;
  readonly options: readonly RenderableOption[];
}

export interface ResponseLibraryOption {
  readonly optionId: string;
  readonly label: string;
}

export interface ResponseLibraryDefinition {
  readonly libraryId: string;
  readonly title: string;
  readonly group: string;
  readonly status?: string;
  readonly usage: string;
  readonly options: readonly ResponseLibraryOption[];
  readonly sourcePath: typeof RESPONSE_LIBRARY_SOURCE;
  readonly sourceLine: number;
  readonly authoredMarkdown: string;
  readonly authoredContentSha256: string;
}

export interface AuthoredContractField {
  readonly authored: string;
  readonly normalizedTokens: readonly string[];
}

export interface RenderableInteractionDefinition extends AuthoredBankItemDefinition {
  readonly eligibility: string;
  readonly burden: {
    readonly authored: string;
    readonly label?: string;
    readonly numericIntensity?: number;
  };
  readonly mechanic: string;
  readonly prompt: string;
  readonly optionGroups: readonly RenderableOptionGroup[];
  readonly responseLibraryIds: readonly string[];
  readonly responseLibraryReferences: readonly string[];
  readonly rawEvidenceFields: AuthoredContractField;
  readonly supportedReportSections: readonly LayerSectionCode[];
  readonly signalClassification: string;
  readonly limits: string;
  readonly branchRules: string;
  readonly confidenceReplication: string;
  readonly recovery: string;
  readonly deterministicRouting: {
    readonly routeBankItemIds: readonly BankItemId[];
    readonly safetyGates: readonly string[];
    readonly canonicalPostBodyRecoveryRequired: boolean;
    readonly executable: ExecutableRoutingContract;
  };
}

export interface ExecutableRoutingContract {
  readonly bankItemId: BankItemId;
  readonly compilation: "compiled" | "partial" | "unsupported";
  readonly eligibilityCompilation: "compiled" | "partial" | "unsupported";
  readonly branchCompilation: "compiled" | "partial" | "unsupported";
  readonly recoveryCompilation: "compiled" | "partial" | "unsupported";
  readonly uncompiledFragments: readonly string[];
  readonly provenance: { readonly sourcePath: string; readonly sourceLine: number };
  readonly eligibility: {
    readonly always: boolean;
    readonly allowedStages: readonly string[];
    readonly prerequisiteBankItemIds: readonly BankItemId[];
    readonly prerequisiteMode: "any" | "all";
    readonly minimumEpisodeAnchors: number;
    readonly requiresReferent: boolean;
    readonly requiresSafetyContext: boolean;
    readonly requiresSafeContext: boolean;
  };
  readonly branches: readonly { readonly optionId: string; readonly routeBankItemIds: readonly BankItemId[] }[];
  readonly recovery: { readonly required: boolean; readonly routeBankItemIds: readonly BankItemId[] };
}

export interface StructuredInstrumentManifest {
  readonly items: readonly RenderableInteractionDefinition[];
  readonly responseLibraries: readonly ResponseLibraryDefinition[];
  readonly itemById: ReadonlyMap<string, RenderableInteractionDefinition>;
  readonly responseLibraryById: ReadonlyMap<string, ResponseLibraryDefinition>;
}

interface Marker { readonly label: string; readonly start: number; readonly contentStart: number; }

function markers(markdown: string): Marker[] {
  const result: Marker[] = [];
  const pattern = /\*\*([^*\n]+?[.:])\*\*/gu;
  for (const match of markdown.matchAll(pattern)) {
    result.push({ label: match[1].slice(0, -1).trim().toLowerCase(), start: match.index, contentStart: match.index + match[0].length });
  }
  return result;
}

function field(markdown: string, aliases: readonly string[]): string {
  const all = markers(markdown);
  const wanted = new Set(aliases.map((alias) => alias.toLowerCase()));
  const index = all.findIndex((marker) => wanted.has(marker.label));
  if (index < 0) return "";
  const current = all[index];
  const end = index + 1 < all.length ? all[index + 1].start : markdown.length;
  return markdown.slice(current.contentStart, end).replace(/^\s*[-–—]?\s*/u, "").replace(/\n\s*-\s*$/u, "").trim();
}

function firstAuthoredQuote(value: string): { prompt: string; remainder: string } {
  const smart = value.match(/“([\s\S]*?)”/u);
  const plain = value.match(/"([^"\n]+)"/u);
  const match = smart ?? plain;
  if (!match || match.index === undefined) {
    const [first = "", ...rest] = value.split(/\n\s*\n/u);
    return { prompt: first.trim(), remainder: rest.join("\n\n").trim() };
  }
  return {
    prompt: match[1].trim(),
    remainder: `${value.slice(0, match.index)}${value.slice(match.index + match[0].length)}`.trim(),
  };
}

function cleanLabel(value: string): string {
  return value.trim().replace(/^[-–—]\s*/u, "").replace(/^[“”"'`]+|[“”"'`.,;]+$/gu, "").replace(/\s+/gu, " ").trim();
}

function semanticOptionId(bankItemId: BankItemId, label: string, authored: string): string {
  const semanticDigest = createHash("sha256")
    .update(`${bankItemId}\u0000${cleanLabel(label).normalize("NFKC").toLowerCase()}\u0000${authored.trim().normalize("NFKC")}`, "utf8")
    .digest("hex")
    .slice(0, 16);
  return `OPT-${bankItemId}-${semanticDigest}`;
}

function parseOptions(source: string, bankItemId: BankItemId): RenderableOptionGroup[] {
  const options: RenderableOption[] = [];
  const add = (labelValue: string, authored: string, optionId?: string) => {
    const label = cleanLabel(labelValue);
    if (!label || label.includes(":") || label.length > 240 || options.some((option) => option.label === label && option.optionId === optionId)) return;
    options.push({ optionId: optionId?.startsWith("OL-") ? optionId : semanticOptionId(bankItemId, label, authored), label, authored: authored.trim() });
  };

  for (const match of source.matchAll(/-\s+`([^`]+)`\s*:\s*“([^”]+)”/gu)) add(match[2], match[0], match[1]);
  for (const match of source.matchAll(/“([^”]+)”/gu)) add(match[1], match[0]);
  for (const match of source.matchAll(/`([^`]+)`/gu)) {
    if (!match[1].includes("_") && !/^(?:OL|IFS|PV|ATT|REF|RR|RI|EP|PT|ST|AP|CX)-/u.test(match[1]) && !options.some((option) => option.optionId === match[1])) add(match[1], match[0]);
  }
  const withoutQuotedChoices = source.replace(/“[^”]+”/gu, "");
  for (const match of withoutQuotedChoices.matchAll(/(?:^|[.\n]\s*)([A-Z][^:.\n]{0,45}):\s*([^.\n]+)/gu)) {
    if (match[2].includes("`")) continue;
    const group = cleanLabel(match[1]);
    for (const piece of match[2].split(/,|;/u)) {
      const label = cleanLabel(piece);
      if (label && !/[.!?]\s+\p{Lu}/u.test(label)) add(label, `${group}: ${piece}`);
    }
  }
  return options.length === 0 ? [] : [{ groupId: "authored-options", label: "Authored options", options }];
}

function expandSections(value: string): LayerSectionCode[] {
  const found: LayerSectionCode[] = [];
  const allowed = new Set<string>(LAYER_SECTION_CODES);
  const pattern = /(IFS|PV|ATT)-(\d{2})(?:\s*[–—-]\s*(?:(IFS|PV|ATT)-)?(\d{2}))?/gu;
  for (const match of value.replaceAll("`", "").matchAll(pattern)) {
    const start = Number(match[2]);
    const end = match[4] ? Number(match[4]) : start;
    const endPrefix = match[3] ?? match[1];
    if (endPrefix !== match[1]) continue;
    for (let number = start; number <= end; number += 1) {
      const code = `${match[1]}-${String(number).padStart(2, "0")}`;
      if (allowed.has(code) && !found.includes(code as LayerSectionCode)) found.push(code as LayerSectionCode);
    }
  }
  return found;
}

function normalizedFieldTokens(value: string): string[] {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/`([^`]+)`/gu)) {
    if (!/^(IFS|PV|ATT|OL)-/u.test(match[1])) tokens.add(match[1]);
  }
  return [...tokens];
}

function sentencesContaining(value: string, terms: RegExp): string[] {
  return value.split(/(?<=[.!?;])\s+/u).map((sentence) => sentence.trim()).filter((sentence) => terms.test(sentence));
}

function parseBurden(value: string): RenderableInteractionDefinition["burden"] {
  const authored = value.trim();
  if (!authored) return { authored };
  const [labelPart] = authored.split("/");
  const numeric = authored.match(/\/\s*(\d)(?:\s+of\s+5)?/u);
  const label = cleanLabel(labelPart).replace(/[.]+$/u, "");
  return { authored, ...(label ? { label } : {}), ...(numeric ? { numericIntensity: Number(numeric[1]) } : {}) };
}

function compileRoutingContract(
  bankItemId: BankItemId,
  eligibility: string,
  branches: string,
  recovery: string,
  optionGroups: readonly RenderableOptionGroup[],
  provenance: { readonly sourcePath: string; readonly sourceLine: number },
): ExecutableRoutingContract {
  const clean = (value: string) => value.replaceAll("`", "").replace(/[.]+$/u, "").trim();
  const eligibilityClauses = eligibility.split(";").map(clean).filter(Boolean);
  let always = false;
  const allowedStages = new Set<string>();
  const prerequisiteBankItemIds = new Set<BankItemId>();
  let prerequisiteMode: "any" | "all" = "any";
  let prerequisiteDisjunction = false;
  let minimumEpisodeAnchors = 0;
  let requiresReferent = false;
  let requiresSafetyContext = false;
  let requiresSafeContext = false;
  const uncompiledEligibility: string[] = [];
  for (const clause of eligibilityClauses) {
    if (/^always(?: first| optional)?$|^no psychological eligibility required$/iu.test(clause)) { always = true; continue; }
    if (/^(?:S[0-5](?:\/S[0-5])?)(?: complete)?$/u.test(clause)) { for (const stage of clause.match(/S[0-5]/gu) ?? []) allowedStages.add(stage); continue; }
    const prerequisite = clause.match(/^((?:(?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3})(?:\s*(?:\+|and|or)\s*(?:(?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3}))*)\s+(?:complete|completed|reviewed)$/u);
    if (prerequisite) {
      for (const id of prerequisite[1].match(/(?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3}/gu) ?? []) prerequisiteBankItemIds.add(id as BankItemId);
      if (/\bor\b/u.test(prerequisite[1])) prerequisiteDisjunction = true;
      continue;
    }
    if (/^(?:one selected REF-\*|REF-\* of type [a-z_-]+|(?:named|selected|chosen|active|applicable) (?:relational )?REF-\*)$/iu.test(clause)) { requiresReferent = true; continue; }
    const episode = clause.match(/^(?:at least )?(two|2\+?|one|1) (?:independent )?(?:manageable |concrete |representative )?((?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3} )?(?:conflict )?episode(?: anchors?)?(?: exists| anchored| reported)?$/iu);
    if (episode) { minimumEpisodeAnchors = /two|2/iu.test(episode[1]) ? 2 : 1; if (episode[2]) prerequisiteBankItemIds.add(episode[2].trim() as BankItemId); continue; }
    if (/^safety(?:\/reliability)? (?:context|screen) (?:complete|recorded)$/iu.test(clause)) { requiresSafetyContext = true; continue; }
    if (/^(?:safety gate (?:required|passed)|safe enough to recall|no current danger)$/iu.test(clause)) { requiresSafeContext = true; continue; }
    uncompiledEligibility.push(clause);
  }
  const authoredOptions = optionGroups.flatMap((group) => group.options);
  const uncompiledBranches: string[] = [];
  const branchesByOption: { optionId: string; routeBankItemIds: BankItemId[] }[] = [];
  for (const clauseValue of branches.split(";")) {
    const clause = clean(clauseValue);
    if (!clause || /^none needed$/iu.test(clause)) continue;
    const routeBankItemIds = [...new Set([...clause.matchAll(/\b((?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3})\b/gu)].map((match) => match[1] as BankItemId))];
    const option = authoredOptions.find((candidate) => {
      const authoredId = candidate.authored.match(/`([^`]+)`/u)?.[1];
      return Boolean(authoredId && new RegExp(`(?:^|[^A-Za-z0-9_])${authoredId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:[^A-Za-z0-9_]|$)`, "iu").test(clause));
    });
    if (option && routeBankItemIds.length > 0 && /^(?:a selected )?[A-Za-z0-9_ -]+\s+(?:routes? to|unlocks?|→)\s+(?:(?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3})(?:\s*(?:,|or)\s*(?:(?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3}))*$/iu.test(clause)) branchesByOption.push({ optionId: option.optionId, routeBankItemIds });
    else uncompiledBranches.push(clause);
  }
  const recoveryText = clean(recovery);
  const recoveryRouteIds = [...new Set([...recoveryText.matchAll(/\b((?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3})\b/gu)].map((match) => match[1] as BankItemId))];
  const recoveryNone = !recoveryText || /^(?:none|none needed|low intensity by design|resource item by design)$/iu.test(recoveryText);
  const recoveryExact = /^(?:mandatory |follow with )?(?:(?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3})(?:\s*(?:,|or)\s*(?:(?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3}))*$/iu.test(recoveryText);
  const uncompiledRecovery = recoveryNone || recoveryExact ? [] : recoveryText ? [recoveryText] : [];
  const eligibilityCompilation = eligibilityClauses.length === 0 ? "unsupported" : uncompiledEligibility.length === 0 ? "compiled" : uncompiledEligibility.length === eligibilityClauses.length ? "unsupported" : "partial";
  prerequisiteMode = prerequisiteBankItemIds.size > 1 && !prerequisiteDisjunction ? "all" : "any";
  const branchClauses = branches.split(";").map(clean).filter((clause) => clause && !/^none needed$/iu.test(clause));
  const branchCompilation = branchClauses.length === 0 ? "compiled" : uncompiledBranches.length === 0 ? "compiled" : uncompiledBranches.length === branchClauses.length ? "unsupported" : "partial";
  const recoveryCompilation = uncompiledRecovery.length === 0 ? "compiled" : "unsupported";
  const uncompiledFragments = [...uncompiledEligibility, ...uncompiledBranches, ...uncompiledRecovery];
  const compilation = uncompiledFragments.length === 0 ? "compiled" : uncompiledFragments.length < eligibilityClauses.length + branchClauses.length + (recoveryText ? 1 : 0) ? "partial" : "unsupported";
  return {
    bankItemId,
    compilation,
    eligibilityCompilation,
    branchCompilation,
    recoveryCompilation,
    uncompiledFragments,
    provenance,
    eligibility: {
      always,
      allowedStages: [...allowedStages],
      prerequisiteBankItemIds: [...prerequisiteBankItemIds],
      prerequisiteMode,
      minimumEpisodeAnchors,
      requiresReferent,
      requiresSafetyContext,
      requiresSafeContext,
    },
    branches: branchesByOption,
    recovery: { required: recoveryExact && /^(?:mandatory|follow with)/iu.test(recoveryText), routeBankItemIds: recoveryRouteIds },
  };
}

function parseItem(item: AuthoredBankItemDefinition): RenderableInteractionDefinition {
  const markdown = item.authoredMarkdown;
  const promptField = field(markdown, ["prompt"]);
  const { prompt, remainder } = firstAuthoredQuote(promptField);
  const eligibility = field(markdown, ["eligibility/referent", "trigger / eligibility", "prerequisites/branches"]);
  const burdenField = field(markdown, ["intensity/burden", "intensity"]);
  const mechanics = field(markdown, ["mechanic", "mechanics / complete options", "options/mechanics"]);
  const choices = field(markdown, ["choices"]);
  const renderableChoices = choices.split(/\n\s*\n/u)[0];
  const rawEvidence = field(markdown, ["raw/evidence fields", "targets / sections", "target fields / sections / class"]);
  const signal = field(markdown, ["signal classification", "signal class"]);
  const limits = field(markdown, ["limits/prohibited inference", "limits / prohibitions", "limits", "no inference"]);
  const branches = field(markdown, ["branch rules", "branches", "prerequisites/branches"]);
  const confidence = field(markdown, ["confidence/replication", "confidence / dependencies", "confidence/dependencies"]);
  const recovery = field(markdown, ["recovery", "recovery routing"]);
  const optionSource = [remainder, renderableChoices, mechanics].filter(Boolean).join("\n");
  const responseLibraryReferences = [...new Set([...markdown.matchAll(/`(OL-[A-Z0-9*-]+)`/gu)].map((match) => match[1]))];
  const responseLibraryIds = responseLibraryReferences.filter((reference) => !reference.includes("*"));
  const routeBankItemIds = [...new Set([...`${branches} ${recovery}`.matchAll(/`?((?:RL|MS|BDA|BTM|FSR|VFR|RLB|BSP|PIS|PDL|RMX|PCR|RRE|WMA|RSR|SEF|FCF)-\d{3})`?/gu)].map((match) => match[1] as BankItemId))];
  const safetyText = [eligibility, branches, limits, recovery].join(" ");
  const optionGroups = parseOptions(optionSource, item.bankItemId);
  return {
    ...item,
    eligibility,
    burden: parseBurden(burdenField),
    mechanic: mechanics || item.title,
    prompt,
    optionGroups,
    responseLibraryIds,
    responseLibraryReferences,
    rawEvidenceFields: { authored: rawEvidence, normalizedTokens: normalizedFieldTokens(rawEvidence) },
    supportedReportSections: expandSections(rawEvidence),
    signalClassification: signal || rawEvidence.match(/;\s*([DIC](?:\/[DIC])*)\.?\s*$/u)?.[1] || rawEvidence.split(";").at(-1)?.trim() || "",
    limits,
    branchRules: branches,
    confidenceReplication: confidence,
    recovery,
    deterministicRouting: {
      routeBankItemIds,
      safetyGates: sentencesContaining(safetyText, /safe|unsafe|danger|coerc|threat|distress|arousal|pause/iu),
      canonicalPostBodyRecoveryRequired: item.bankItemId === "BTM-109" || /canonical transition gate/iu.test(branches),
      executable: compileRoutingContract(item.bankItemId, eligibility, branches, recovery, optionGroups, { sourcePath: item.sourcePath, sourceLine: item.sourceLine }),
    },
  };
}

async function loadResponseLibraries(workspaceRoot: string): Promise<ResponseLibraryDefinition[]> {
  const source = (await readFile(path.join(workspaceRoot, ...RESPONSE_LIBRARY_SOURCE.split("/")), "utf8")).replaceAll("\r\n", "\n");
  const lines = source.split("\n");
  const headings: { id: string; title: string; line: number; group: string }[] = [];
  let group = "Ungrouped";
  lines.forEach((line, index) => {
    const groupMatch = line.match(/^##\s+(?:\d+\.\s*)?(.+)$/u);
    if (groupMatch) group = groupMatch[1].trim();
    const heading = line.match(/^###\s+`(OL-[^`]+)`\s+—\s+(.+)$/u);
    if (heading) headings.push({ id: heading[1], title: heading[2].trim(), line: index + 1, group });
  });
  return headings.map((heading, index) => {
    const end = index + 1 < headings.length ? headings[index + 1].line - 1 : lines.length;
    const authoredMarkdown = lines.slice(heading.line - 1, end).join("\n").trimEnd();
    const options = [...authoredMarkdown.matchAll(/^-\s+`([^`]+)`\s+—\s+(.+)$/gmu)].map((match) => ({ optionId: match[1], label: cleanLabel(match[2]) }));
    const status = authoredMarkdown.match(/`status:\s*([^`]+)`/iu)?.[1]?.trim();
    const firstOption = authoredMarkdown.search(/^-\s+`[^`]+`\s+—/mu);
    const usage = authoredMarkdown.slice(authoredMarkdown.indexOf("\n") + 1, firstOption >= 0 ? firstOption : authoredMarkdown.length).trim();
    return {
      libraryId: heading.id,
      title: heading.title,
      group: heading.group,
      ...(status ? { status } : {}),
      usage,
      options,
      sourcePath: RESPONSE_LIBRARY_SOURCE,
      sourceLine: heading.line,
      authoredMarkdown,
      authoredContentSha256: createHash("sha256").update(authoredMarkdown, "utf8").digest("hex"),
    };
  });
}

export async function loadStructuredInstrumentManifest(workspaceRoot = process.cwd()): Promise<StructuredInstrumentManifest> {
  const [authored, responseLibraries] = await Promise.all([loadAuthoredInstrumentManifest(workspaceRoot), loadResponseLibraries(workspaceRoot)]);
  const items = authored.bankItems.map(parseItem);
  return {
    items,
    responseLibraries,
    itemById: new Map(items.map((item) => [item.bankItemId, item])),
    responseLibraryById: new Map(responseLibraries.map((library) => [library.libraryId, library])),
  };
}

export async function loadRenderableInteraction(bankItemId: string, workspaceRoot = process.cwd()): Promise<RenderableInteractionDefinition | undefined> {
  return (await loadStructuredInstrumentManifest(workspaceRoot)).itemById.get(bankItemId);
}
