import type { JsonObject, JsonValue, LayerSectionCode } from "../../question-engine/types.ts";
import { loadStructuredInstrumentManifest, type StructuredInstrumentManifest } from "../../question-engine/renderable-manifest.ts";

const OPTION_TOKEN = /^[A-Za-z][A-Za-z0-9._-]{1,99}$/u;
const OPTION_FIELDS = ["choices", "rank", "zones", "relationship", "selectedOptionIds", "orderedOptionIds", "Before", "When it first hit", "What happened next", "Later / aftermath", "Person / role 1", "Person / role 2", "Contact frequency", "Emotional disclosure", "Asking for help", "Space"] as const;

export type TrustedEvidenceV1 = JsonObject & {
  readonly schemaVersion: "PWTE-1";
  readonly binding: { readonly bankItemId: string; readonly bankItemVersion: string; readonly authoredContentSha256: string };
  readonly family: string;
  readonly selectedOptionIds: readonly string[];
  readonly coverageSectionCodes: readonly LayerSectionCode[];
  readonly evidenceDisposition: "observed" | "missing";
  readonly referentOptionId?: string;
  readonly partFieldOptionIds: readonly string[];
  readonly stateMap?: { readonly optionIds: readonly string[]; readonly bodyRegions: readonly string[]; readonly direction: "activated" | "shutdown" | "mixed" | "uncertain"; readonly multivariate: boolean };
  readonly stateEntryOptionIds: readonly string[];
  readonly stateRecoveryOptionIds: readonly string[];
  readonly attachmentCueIds: readonly string[];
  readonly attachmentMeaningOptionIds: readonly string[];
  readonly attachmentMoveOptionIds: readonly string[];
  readonly identityDisposition: "confirmed" | "rejected" | "underdetermined";
  readonly fitDisposition: "confirmed" | "contradicted" | "underdetermined";
};

type OptionSource = { readonly label: string; readonly libraryId?: string };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function referencedLibraries(manifest: StructuredInstrumentManifest, references: readonly string[], exact: readonly string[]) {
  const prefixes = [...references, ...exact].map((reference) => reference.replace(/\*$/u, ""));
  return manifest.responseLibraries.filter((library) => prefixes.some((prefix) => library.libraryId === prefix || library.libraryId.startsWith(`${prefix}-`) || library.libraryId.startsWith(prefix)));
}

function regionForLibrary(libraryId?: string): string | undefined {
  if (!libraryId?.startsWith("OL-BQ-")) return undefined;
  if (libraryId.includes("THROAT-CHEST")) return "throat_chest";
  if (libraryId.includes("GUT-PELVIS")) return "gut_pelvis";
  if (libraryId.includes("ARMS-HANDS")) return "arms_hands";
  if (libraryId.includes("LEGS-FEET")) return "legs_feet";
  if (libraryId.includes("HEAD")) return "head";
  if (libraryId.includes("MIXED")) return "mixed_regions";
  return undefined;
}

function directionFor(options: readonly { id: string; source: OptionSource }[]): "activated" | "shutdown" | "mixed" | "uncertain" {
  const up = options.some(({ id, source }) => id.startsWith("UP-") || source.libraryId?.includes("-UP-") || /more active/iu.test(source.label));
  const down = options.some(({ id, source }) => id.startsWith("DOWN-") || source.libraryId?.includes("-DOWN-") || /less active|disappeared/iu.test(source.label));
  const mixed = options.some(({ id, source }) => id.startsWith("MIX-") || source.libraryId?.includes("MIXED") || /mixed/iu.test(source.label));
  return mixed || (up && down) ? "mixed" : up ? "activated" : down ? "shutdown" : "uncertain";
}

/**
 * Server-only evidence compiler. It accepts respondent selections, but every emitted
 * promotion field is re-derived from the pinned authored item and option catalog.
 */
export async function deriveTrustedEvidenceForAuthoredResponse(
  bankItemId: string,
  bankItemVersion: string,
  normalizedResponse: unknown,
  trustedReferentOptionId?: string,
): Promise<TrustedEvidenceV1 | undefined> {
  const manifest = await loadStructuredInstrumentManifest();
  const definition = manifest.itemById.get(bankItemId);
  if (!definition || definition.version !== bankItemVersion) return undefined;
  const semantic = record(record(normalizedResponse)?.semantic) ?? {};
  const allowed = new Map<string, OptionSource>();
  for (const group of definition.optionGroups) for (const option of group.options) allowed.set(option.optionId, { label: option.label });
  for (const library of referencedLibraries(manifest, definition.responseLibraryReferences, definition.responseLibraryIds)) {
    for (const option of library.options) allowed.set(option.optionId, { label: option.label, libraryId: library.libraryId });
  }
  const authoredReferentOptionIds = new Set(manifest.items.filter((item) => item.family === "RL").flatMap((item) => item.optionGroups.flatMap((group) => group.options.map((option) => option.optionId))));
  const selected: string[] = [];
  for (const field of OPTION_FIELDS) {
    const candidates = Array.isArray(semantic[field]) ? semantic[field] as unknown[] : [semantic[field]];
    for (const candidate of candidates) if (typeof candidate === "string" && OPTION_TOKEN.test(candidate) && allowed.has(candidate) && !selected.includes(candidate)) selected.push(candidate);
  }
  const selectedWithSources = selected.map((id) => ({ id, source: allowed.get(id)! }));
  const missing = selected.length === 0 || selectedWithSources.every(({ source }) => /skip|not sure|cannot tell|do not remember|no memory|not enough access|none of these fit/iu.test(source.label));
  const substantive = missing ? [] : selected;
  const referentOptionId = definition.family === "RL"
    ? substantive.find((optionId) => authoredReferentOptionIds.has(optionId))
    : trustedReferentOptionId && authoredReferentOptionIds.has(trustedReferentOptionId) ? trustedReferentOptionId : undefined;
  const partFieldOptionIds = ["MS", "BDA", "VFR", "RLB", "BSP", "PIS", "PDL"].includes(definition.family) ? substantive : [];
  const bodyOptions = definition.family === "BTM" ? selectedWithSources.filter(({ source }) => source.libraryId?.startsWith("OL-BQ-") || /more active|less active|mixed/iu.test(source.label)) : [];
  const bodyRegions = [...new Set(bodyOptions.map(({ source }) => regionForLibrary(source.libraryId)).filter((value): value is string => Boolean(value)))];
  const stateMap = definition.family === "BTM" && bodyOptions.length > 0 ? {
    optionIds: bodyOptions.map(({ id }) => id), bodyRegions, direction: directionFor(bodyOptions), multivariate: bodyRegions.length >= 2,
  } as const : undefined;
  const stateEntryOptionIds = definition.family === "FSR" ? substantive : [];
  const positiveResource = definition.family === "RSR" || definition.family === "SEF"
    ? selectedWithSources.filter(({ source }) => !/none|hard to tell|not available|does not fit|no clear/iu.test(source.label)).map(({ id }) => id)
    : [];
  const attachmentCueIds = ["MS", "WMA", "BDA", "RRE", "PCR", "RMX"].includes(definition.family) && substantive.length > 0 ? [definition.bankItemId] : [];
  const attachmentMeaningOptionIds = definition.family === "WMA" ? substantive : [];
  const attachmentMoveOptionIds = ["MS", "BDA", "RRE"].includes(definition.family) ? substantive : [];
  const identityLabels = selectedWithSources.map(({ source }) => source.label);
  const identityDisposition = definition.family === "PIS" && identityLabels.some((label) => /same internal presence\/pattern/iu.test(label)) ? "confirmed"
    : definition.family === "PIS" && identityLabels.some((label) => /genuinely different|one card does not match/iu.test(label)) ? "rejected" : "underdetermined";
  const fitDisposition = definition.family === "FCF" && identityLabels.some((label) => /^matches$/iu.test(label)) ? "confirmed"
    : definition.family === "FCF" && identityLabels.some((label) => /does not match|do not include/iu.test(label)) ? "contradicted" : "underdetermined";
  return {
    schemaVersion: "PWTE-1",
    binding: { bankItemId: definition.bankItemId, bankItemVersion: definition.version, authoredContentSha256: definition.authoredContentSha256 },
    family: definition.family,
    selectedOptionIds: selected,
    coverageSectionCodes: missing ? [] : [...definition.supportedReportSections],
    evidenceDisposition: missing ? "missing" : "observed",
    ...(referentOptionId ? { referentOptionId } : {}),
    partFieldOptionIds,
    ...(stateMap ? { stateMap } : {}),
    stateEntryOptionIds,
    stateRecoveryOptionIds: positiveResource,
    attachmentCueIds,
    attachmentMeaningOptionIds,
    attachmentMoveOptionIds,
    identityDisposition,
    fitDisposition,
  };
}

export function trustedEvidenceJson(value: TrustedEvidenceV1): JsonValue {
  return value as unknown as JsonValue;
}
