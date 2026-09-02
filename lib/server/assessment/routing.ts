import { DEEPENING_ITEMS, getBankItem, MAPPING_ITEMS } from "@/lib/question-engine/manifest";
import type { AssessmentStage, BankItemManifestEntry, InteractionFamilyCode } from "@/lib/question-engine/types";
import type { ExecutableRoutingContract } from "@/lib/question-engine/renderable-manifest";
import type {
  AssessmentPass,
  AssessmentResponseInput,
  AssessmentRoutingState,
  CompletedInteraction,
  InteractionForm,
  InteractionViewModel,
  UserArousal,
} from "./types.ts";

const HIGH_INTENSITY_FAMILIES = new Set<InteractionFamilyCode>(["BDA", "BTM", "BSP", "PDL", "RRE"]);
const RESOURCE_FAMILIES = new Set<InteractionFamilyCode>(["RSR", "SEF"]);
type StickySafetyState = AssessmentRoutingState & { readonly safetyContext?: "safe" | "mixed" | "unsafe" | "unknown" };
type TypedRoutingResponse = AssessmentResponseInput & { readonly resourceSafetyClear?: boolean };
type ContractCompletedInteraction = CompletedInteraction & { readonly evidenceEligible?: boolean; readonly coverageSectionCodes?: readonly string[]; readonly referentPresent?: boolean; readonly safetyContextRecorded?: boolean };
type RoutingContractInput = TypedRoutingResponse & { readonly authoredRoutingContracts?: Readonly<Record<string, ExecutableRoutingContract>> };
const FORM_BY_FAMILY: Readonly<Record<InteractionFamilyCode, InteractionForm>> = {
  RL: "threshold", MS: "recall", BDA: "recall", BTM: "map", FSR: "sort", VFR: "text",
  RLB: "sort", BSP: "threshold", PIS: "sort", PDL: "sort", RMX: "threshold", PCR: "threshold",
  RRE: "recall", WMA: "sort", RSR: "resource", SEF: "resource", FCF: "text",
};

function intensityFor(item: BankItemManifestEntry): 0 | 1 | 2 | 3 {
  if (item.bankItemId === "RSR-003" || RESOURCE_FAMILIES.has(item.family)) return 0;
  if (item.bankItemId === "BTM-002" || item.bankItemId === "BTM-202") return 1;
  return HIGH_INTENSITY_FAMILIES.has(item.family) ? 2 : 1;
}

function isResourceOrOrdinary(item: BankItemManifestEntry): boolean {
  return RESOURCE_FAMILIES.has(item.family) || item.bankItemId === "BTM-002" || item.bankItemId === "BTM-202";
}

function stageFor(item: BankItemManifestEntry, pass: AssessmentPass): AssessmentStage {
  if (pass === 1) return item.family === "RL" ? "S0" : "S1";
  if (item.family === "FCF" || item.moduleGroup === "adjudication-accessibility-confirmation") return "S5";
  if (item.moduleGroup === "relationship-sequence") return "S4";
  return "S3";
}

function interaction(item: BankItemManifestEntry, pass: AssessmentPass, sequence: number, reason: string): InteractionViewModel {
  return {
    interactionInstanceId: `p${pass}-${String(sequence).padStart(4, "0")}-${item.bankItemId.toLowerCase()}`,
    bankItemId: item.bankItemId,
    bankItemVersion: item.version,
    family: item.family,
    title: item.title,
    stage: stageFor(item, pass),
    pass,
    administrationSequence: sequence,
    form: FORM_BY_FAMILY[item.family],
    intensity: intensityFor(item),
    canSkip: true,
    canPause: true,
    routeReason: reason,
  };
}

function requiredResourceItem(): BankItemManifestEntry {
  const item = getBankItem("RSR-003");
  if (!item) throw new Error("Canonical recovery item RSR-003 is unavailable.");
  return item;
}

function planFor(pass: AssessmentPass): readonly BankItemManifestEntry[] {
  return pass === 1 ? MAPPING_ITEMS : DEEPENING_ITEMS;
}

function deriveCoverage(completed: readonly CompletedInteraction[]) {
  const answered = completed.filter((entry) => entry.completionState === "COMPLETED" && (entry as ContractCompletedInteraction).evidenceEligible !== false);
  const domains = new Set<string>();
  const horizons = new Set<string>();
  let ifsDirect = 0;
  let pvDirect = 0;
  let attachmentDirect = 0;
  for (const entry of answered) {
    if (["RL", "RRE", "RMX", "PCR", "WMA"].includes(entry.family)) domains.add("relationship");
    if (["VFR", "RLB", "BSP", "PIS", "PDL", "FCF"].includes(entry.family)) domains.add("protective-pattern");
    if (["BTM", "FSR"].includes(entry.family)) domains.add("body-state");
    if (["BDA", "MS"].includes(entry.family)) domains.add("episode-sequence");
    if (["RSR", "SEF"].includes(entry.family)) domains.add("resource");
    if (["VFR", "RLB", "BSP", "PIS", "PDL"].includes(entry.family)) ifsDirect += 1;
    if (["BTM", "FSR", "RSR"].includes(entry.family)) pvDirect += 1;
    if (["RL", "RRE", "RMX", "PCR", "WMA"].includes(entry.family)) attachmentDirect += 1;
    if (["VFR", "WMA", "MS"].includes(entry.family)) horizons.add("anticipatory");
    if (["BTM", "FSR", "BDA"].includes(entry.family)) horizons.add("immediate");
    if (["RRE", "RSR", "SEF", "BDA"].includes(entry.family)) horizons.add("aftermath");
  }
  const mappingSatisfied = answered.length >= 6 && domains.size >= 4 && horizons.size >= 3;
  const deepeningSatisfied = ifsDirect >= 2 && pvDirect >= 2 && attachmentDirect >= 2;
  return {
    directSamples: answered.length,
    domains: [...domains].sort(),
    horizons: [...horizons].sort(),
    ifsDirect,
    pvDirect,
    attachmentDirect,
    mappingGate: (mappingSatisfied ? "green" : answered.length >= 4 ? "amber" : "red") as "red" | "amber" | "green",
    deepeningGate: (deepeningSatisfied ? "green" : (ifsDirect + pvDirect + attachmentDirect) >= 3 ? "amber" : "red") as "red" | "amber" | "green",
  };
}

function occurrences(family: InteractionFamilyCode, recent: readonly InteractionFamilyCode[]): number {
  return recent.filter((candidate) => candidate === family).length;
}

export function isAuthoredContractEligible(contract: ExecutableRoutingContract | undefined, state: AssessmentRoutingState, completed: readonly CompletedInteraction[]): boolean {
  if (!contract || contract.eligibilityCompilation !== "compiled") return false;
  const evidence = completed.filter((entry) => entry.completionState === "COMPLETED" && (entry as ContractCompletedInteraction).evidenceEligible === true);
  const completedIds = new Set(evidence.map((entry) => entry.bankItemId));
  const predicates = contract.eligibility;
  if (predicates.allowedStages.length > 0 && !predicates.allowedStages.includes(state.stage)) return false;
  if (predicates.prerequisiteBankItemIds.length > 0) {
    const matches = predicates.prerequisiteBankItemIds.map((id) => completedIds.has(id));
    if (predicates.prerequisiteMode === "all" ? matches.some((match) => !match) : matches.every((match) => !match)) return false;
  }
  if (evidence.length < predicates.minimumEpisodeAnchors) return false;
  if (predicates.requiresReferent && !evidence.some((entry) => (entry as ContractCompletedInteraction).referentPresent)) return false;
  if (predicates.requiresSafetyContext && !completed.some((entry) => (entry as ContractCompletedInteraction).safetyContextRecorded)) return false;
  if (predicates.requiresSafeContext && (state as StickySafetyState).safetyContext !== "safe") return false;
  return predicates.always || predicates.allowedStages.length > 0 || predicates.prerequisiteBankItemIds.length > 0 || predicates.minimumEpisodeAnchors > 0 || predicates.requiresReferent || predicates.requiresSafetyContext || predicates.requiresSafeContext;
}

function chooseNext(
  state: AssessmentRoutingState,
  completed: readonly CompletedInteraction[],
  signal: { userArousal: UserArousal; unsafeContext: boolean },
  contracts: Readonly<Record<string, ExecutableRoutingContract>>,
  selectedOptionIds: readonly string[],
  currentContract?: ExecutableRoutingContract,
): { item: BankItemManifestEntry | null; reason: string } {
  if (state.pendingBtmTransition) return { item: requiredResourceItem(), reason: "mandatory-post-body-map-recovery" };
  if (state.requiresLowIntensityAfterRre) return { item: requiredResourceItem(), reason: "mandatory-post-rupture-low-intensity" };
  if (signal.userArousal === "high" || signal.unsafeContext) return { item: requiredResourceItem(), reason: signal.unsafeContext ? "unsafe-context-resource-only" : "high-arousal-resource-only" };
  if (state.consecutiveHighIntensity >= 2) return { item: requiredResourceItem(), reason: "two-high-item-limit" };

  if (currentContract?.recoveryCompilation === "compiled" && currentContract.recovery.required) {
    const recovery = currentContract.recovery.routeBankItemIds.map((id) => getBankItem(id)).filter((item): item is BankItemManifestEntry => Boolean(item)).find((item) => isAuthoredContractEligible(contracts[item.bankItemId], state, completed));
    if (recovery) return { item: recovery, reason: "authored-required-recovery" };
  }
  const authoredBranchIds = currentContract?.branchCompilation === "compiled" ? currentContract.branches.filter((branch) => selectedOptionIds.includes(branch.optionId)).flatMap((branch) => branch.routeBankItemIds) : [];
  const authoredBranch = authoredBranchIds.map((id) => getBankItem(id)).filter((item): item is BankItemManifestEntry => Boolean(item)).find((item) => isAuthoredContractEligible(contracts[item.bankItemId], state, completed));
  if (authoredBranch) return { item: authoredBranch, reason: "authored-option-branch" };

  if (state.pass === 1 && state.coverage.mappingGate === "green") {
    const last = completed.at(-1);
    if (!last?.resourceOrOrdinary || last.completionState !== "COMPLETED") return { item: requiredResourceItem(), reason: "mapping-coverage-met-resource-ending" };
    return { item: null, reason: "mapping-evidence-gate-satisfied" };
  }
  if (state.pass === 2 && state.coverage.deepeningGate === "green") {
    if (!state.fitCompleted) {
      const fit = getBankItem("FCF-201");
      if (fit && !completed.some((entry) => entry.bankItemId === fit.bankItemId)) return { item: fit, reason: "deepening-fit-confirmation-gate" };
    } else {
      const last = completed.at(-1);
      if (!last?.resourceOrOrdinary || last.completionState !== "COMPLETED") return { item: requiredResourceItem(), reason: "deepening-coverage-met-resource-ending" };
      return { item: null, reason: "deepening-evidence-gate-satisfied" };
    }
  }

  const completedIds = new Set(completed.map((entry) => entry.bankItemId));
  const candidates = planFor(state.pass).filter((item) => {
    if (completedIds.has(item.bankItemId)) return false;
    if ((state.skipCounts[item.family] ?? 0) >= 2) return false;
    if (occurrences(item.family, state.recentFamilies) >= 2) return false;
    if (!isAuthoredContractEligible(contracts[item.bankItemId], state, completed)) return false;
    return true;
  });
  const differentForm = candidates.find((item) => FORM_BY_FAMILY[item.family] !== state.recentForms.at(-1));
  const selected = differentForm ?? candidates[0] ?? null;
  if (selected) return { item: selected, reason: "canonical-plan-highest-eligible" };

  const last = completed.at(-1);
  if (!last?.resourceOrOrdinary || last.completionState !== "COMPLETED") return { item: requiredResourceItem(), reason: "resource-oriented-ending" };
  return { item: null, reason: "pass-completion-gates-satisfied" };
}

export function createInitialRoutingState(pass: AssessmentPass = 1): AssessmentRoutingState {
  const first = planFor(pass)[0];
  if (!first) throw new Error("Canonical assessment plan is empty.");
  const currentInteraction = interaction(first, pass, 1, "canonical-plan-start");
  return {
    schemaVersion: "PWAS-1",
    pass,
    stage: currentInteraction.stage,
    administrationSequence: 1,
    currentInteraction,
    completedInteractions: [],
    recentFamilies: [],
    recentForms: [],
    consecutiveHighIntensity: 0,
    pendingBtmTransition: false,
    requiresLowIntensityAfterRre: false,
    skipCounts: {},
    userArousal: "unknown",
    safeResumeStage: currentInteraction.stage,
    mappingCompleted: false,
    deepeningCompleted: false,
    fitCompleted: false,
    coverage: deriveCoverage([]),
    endingSatisfied: false,
    paused: false,
    routeTrace: [{ selectedBankItemId: first.bankItemId, reason: "canonical-plan-start" }],
  };
}

export function routeAssessmentResponse(state: AssessmentRoutingState, response: AssessmentResponseInput): AssessmentRoutingState {
  const current = state.currentInteraction;
  if (!current || current.interactionInstanceId !== response.interactionInstanceId || current.bankItemId !== response.bankItemId) {
    throw new Error("Response does not match the current interaction.");
  }
  const item = getBankItem(current.bankItemId);
  if (!item) throw new Error(`Unknown bank item ${current.bankItemId}.`);

  const semantic = response.response && typeof response.response === "object" && !Array.isArray(response.response)
    ? (response.response as Record<string, unknown>).semantic
    : undefined;
  const semanticFields = semantic && typeof semantic === "object" && !Array.isArray(semantic) ? semantic as Record<string, unknown> : {};
  const substantiveKeys = new Set(["choices", "rank", "zones", "relationship", "selectedOptionIds", "orderedOptionIds", "Before", "When it first hit", "What happened next", "Later / aftermath", "Person / role 1", "Person / role 2", "Contact frequency", "Emotional disclosure", "Asking for help", "Space", "objectEvidence"]);
  const evidenceEligible = semanticFields.eligible !== false && semanticFields.evidenceDisposition !== "missing" && Object.entries(semanticFields).some(([key, value]) => substantiveKeys.has(key) && (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ""));
  const completedEntry: ContractCompletedInteraction = {
    interactionInstanceId: current.interactionInstanceId,
    bankItemId: current.bankItemId,
    family: current.family,
    stage: current.stage,
    form: current.form,
    intensity: current.intensity,
    completionState: response.completionState === "COMPLETED" ? "COMPLETED" : "SKIPPED",
    resourceOrOrdinary: isResourceOrOrdinary(item),
    evidenceEligible,
    coverageSectionCodes: Array.isArray(semanticFields.coverageSectionCodes) ? semanticFields.coverageSectionCodes.filter((value): value is string => typeof value === "string") : [],
    referentPresent: typeof semanticFields.referentOptionId === "string",
    safetyContextRecorded: ["safe", "mixed", "unsafe"].includes(String(semanticFields.safetyContext)),
  };
  const completedInteractions = [...state.completedInteractions, completedEntry];
  if (response.completionState === "PARTIAL") throw new Error("Partial responses do not advance routing.");
  const answered = response.completionState === "COMPLETED" && evidenceEligible;
  const resourceCompleted = answered && completedEntry.resourceOrOrdinary;
  const typedResponse = response as TypedRoutingResponse;
  const resourceSafetyClear = resourceCompleted && typedResponse.resourceSafetyClear === true;
  const priorUnsafe = (state as StickySafetyState).safetyContext === "unsafe";
  const unsafeContext = resourceSafetyClear ? false : priorUnsafe || response.unsafeContext === true;
  const pendingBtmTransition = answered && current.family === "BTM" ? true : state.pendingBtmTransition && !resourceCompleted;
  const requiresLowIntensityAfterRre = answered && current.family === "RRE" ? true : state.requiresLowIntensityAfterRre && !resourceCompleted;
  const recentFamilies = [...state.recentFamilies, current.family].slice(-5);
  const recentForms = [...state.recentForms, current.form].slice(-5);
  const skipCounts = { ...state.skipCounts };
  if (response.completionState === "SKIPPED") skipCounts[current.family] = (skipCounts[current.family] ?? 0) + 1;
  const userArousal = response.userArousal ?? state.userArousal;
  const nextBase = {
    ...state,
    completedInteractions,
    recentFamilies,
    recentForms,
    consecutiveHighIntensity: answered && current.intensity >= 2 ? state.consecutiveHighIntensity + 1 : 0,
    pendingBtmTransition,
    requiresLowIntensityAfterRre,
    skipCounts,
    userArousal,
    safetyContext: unsafeContext ? "unsafe" : resourceSafetyClear ? "safe" : (state as StickySafetyState).safetyContext ?? "unknown",
    safeResumeStage: current.stage,
    endingSatisfied: resourceCompleted,
    paused: false,
    coverage: deriveCoverage(completedInteractions),
  } as StickySafetyState;
  const contractInput = response as RoutingContractInput;
  const contracts = contractInput.authoredRoutingContracts ?? {};
  const selectedOptionIds = Object.values(semanticFields).flatMap((value) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : typeof value === "string" ? [value] : []);
  const choice = chooseNext(nextBase, completedInteractions, { userArousal, unsafeContext }, contracts, selectedOptionIds, contracts[current.bankItemId]);
  const sequence = state.administrationSequence + 1;
  const currentInteraction = choice.item ? interaction(choice.item, state.pass, sequence, choice.reason) : null;
  const coverage = deriveCoverage(completedInteractions);
  const passPlanComplete = state.pass === 1 ? coverage.mappingGate === "green" : coverage.deepeningGate === "green" && (state.fitCompleted || (answered && current.family === "FCF"));
  return {
    ...nextBase,
    stage: currentInteraction?.stage ?? (state.pass === 1 ? "S2" : "S5"),
    administrationSequence: currentInteraction ? sequence : state.administrationSequence,
    currentInteraction,
    mappingCompleted: state.mappingCompleted || (state.pass === 1 && passPlanComplete),
    deepeningCompleted: state.deepeningCompleted || (state.pass === 2 && passPlanComplete),
    fitCompleted: state.fitCompleted || (answered && current.family === "FCF"),
    coverage,
    endingSatisfied: !currentInteraction && resourceCompleted,
    routeTrace: choice.item ? [...state.routeTrace, { selectedBankItemId: choice.item.bankItemId, reason: choice.reason }] : state.routeTrace,
  };
}

export function pauseRoutingState(state: AssessmentRoutingState): AssessmentRoutingState {
  return { ...state, paused: true, safeResumeStage: state.stage };
}

export function resumeRoutingState(state: AssessmentRoutingState): AssessmentRoutingState {
  return { ...state, paused: false };
}

export function canCompletePass(state: AssessmentRoutingState): boolean {
  const planComplete = state.pass === 1 ? state.mappingCompleted : state.deepeningCompleted && state.fitCompleted;
  return planComplete && state.endingSatisfied && !state.pendingBtmTransition && !state.requiresLowIntensityAfterRre && (state as StickySafetyState).safetyContext !== "unsafe" && state.currentInteraction === null;
}

export function startPassTwo(state: AssessmentRoutingState): AssessmentRoutingState {
  if (state.pass !== 1 || !canCompletePass(state)) throw new Error("Pass 1 is not complete.");
  return createInitialRoutingState(2);
}

export function toAssessmentStateView(
  sessionId: string,
  status: "IN_PROGRESS" | "PASS1_COMPLETE" | "PASS2_IN_PROGRESS" | "COMPLETE" | "PAUSED",
  revision: number,
  state: AssessmentRoutingState,
) {
  return {
    sessionId,
    status,
    revision,
    pass: state.pass,
    stage: state.stage,
    safeResumeStage: state.safeResumeStage,
    currentInteraction: state.currentInteraction,
    canCompletePass: canCompletePass(state),
    canPause: !state.paused,
    completedCount: state.completedInteractions.length,
  } as const;
}
