export type Family = "RL"|"MS"|"BDA"|"BTM"|"FSR"|"VFR"|"RLB"|"BSP"|"PIS"|"PDL"|"RMX"|"PCR"|"RRE"|"WMA"|"RSR"|"SEF"|"FCF";
export type RenderedOption = { id:string; label:string };
export type RenderedInteraction = { instanceId: string; bankItemId: string; family: Family; stage: string; prompt: string; helpText?: string; options?: RenderedOption[] };
export type Pwqe5RenderedInteraction = {
  instanceId: string; questionId: string; bankItemId: string; bankItemVersion: string;
  stage: "mapping"|"deepening"; pass: 1|2; administrationSequence: number;
  title: string; prompt: string; context: string; episodeFamily: string;
  selection: Record<string, unknown>;
  responseControls: { id: string; text: string }[];
  options: { id: string; label: string; exclusive: boolean }[];
};
export type Pwqe51Basis = "actual_recalled" | "reported_typicality";
export type Pwqe51RenderedInteraction = {
  instanceId: string; questionId: string; bankItemId: string; bankItemVersion: string;
  stage: "mapping"|"deepening"; pass: 1|2; administrationSequence: number;
  title: string; prompt: string; context: string; episodeFamily: string;
  stepId?: string; rootBasisRequired: boolean; basisOptions: Pwqe51Basis[]; unavailableBinding?: boolean;
  referentSlotRequired?: boolean; referentSlotPrompt?: string; referentRoleOptions: { id: string; label: string }[];
  selection: Record<string, unknown>;
  responseControls: { id: string; text: string }[];
  options: { id: string; label: string; exclusive: boolean }[];
};
export type Pwqe5ResponseHistoryItem = { responseId:string; questionId:string; title:string; status:string; mode?:string; context?:string; selectedOptions:{id:string;label:string}[]; canCorrect:boolean; prompt?:string; options?:{id:string;label:string;exclusive:boolean}[]; selection?:Record<string,unknown>; responseControls?:{id:string;text:string}[] };
export type AssessmentStatus = "needs_consent"|"ready"|"active"|"paused"|"recovery"|"generating_pass1"|"pass1_ready"|"generating_pass2"|"pass2_ready"|"report_ready"|"report_failed";
export type ReportStatus = "NOT_STARTED"|"QUEUED"|"GENERATING"|"READY"|"FAILED";
export type DeliveryStatus = "NOT_STARTED"|"PENDING"|"SENT"|"DELIVERED"|"FAILED";
export type RetryAudience = "USER"|"OPERATOR"|"NONE";
export type ReportAttempt = { id?: string; attemptNumber?: number; status?: string; startedAt?: string; updatedAt?: string };
export type AssessmentState = { assessmentId?: string; reportReadyUrl?: string; mappingSummaryUrl?: string; reportStatus?: ReportStatus; deliveryStatus?: DeliveryStatus; resumeNotificationStatus?: DeliveryStatus; reportUnavailable?: boolean; failureCategory?: string; retryAudience?: RetryAudience; canRetry?: boolean; currentAttempt?: ReportAttempt; revision?: string|number; status: AssessmentStatus; engine?: "PWQE5"|"PWQE51"; pass?:number; canCompletePass?:boolean; canPause?:boolean; allowedControls?:string[]; responseHistory?:Pwqe5ResponseHistoryItem[]; availableTopics?: {id:string;label:string;description:string}[]; availableFocuses?: {ref:string;label:string}[]; optedInTopics?:string[]; currentResponse?:unknown; pwqe5Interaction?: Pwqe5RenderedInteraction|null; pwqe51Interaction?: Pwqe51RenderedInteraction|null; email?: string; interaction?: RenderedInteraction|null; draft?: Record<string, unknown>; stageLabel?: string; stageProgress?: number; resumeCue?: string; mode?: string };

export const PWQE51_DETAIL_PERMISSIONS = [
  { id: "state", label: "Explore what state I was in" },
  { id: "body", label: "Include body sensations" },
  { id: "urge", label: "Look at what I felt pulled to do" },
  { id: "feeling", label: "Explore feelings" },
  { id: "texture", label: "Add more detail about what the moment was like" },
  { id: "recurrence", label: "Look at whether this has happened before" },
  { id: "contrast", label: "Compare this with another occasion" },
] as const;
export type Pwqe51DetailPermission = typeof PWQE51_DETAIL_PERMISSIONS[number]["id"];
export type Pwqe51ComparisonRelation = "different"|"same"|"cannot_tell";

/** Build the pass-1 continuation fields from explicit choices; opaque refs never become copy. */
export function buildPwqe51DeepeningPreferences(input: {
  readonly focuses: readonly { ref: string; label: string }[];
  readonly focusOccurrenceRefs: readonly string[];
  readonly detailPermissions: readonly string[];
  readonly comparisonFirstRef?: string;
  readonly comparisonSecondRef?: string;
  readonly comparisonRelation?: Pwqe51ComparisonRelation;
}) {
  const available = new Set(input.focuses.map((focus) => focus.ref));
  const focusOccurrenceRefs = [...new Set(input.focusOccurrenceRefs)].filter((ref) => available.has(ref));
  const detailPermissionIds = new Set<string>(PWQE51_DETAIL_PERMISSIONS.map((permission) => permission.id));
  const detailPermissions = [...new Set(input.detailPermissions)].filter((permission): permission is Pwqe51DetailPermission => detailPermissionIds.has(permission));
  const first = input.comparisonFirstRef;
  const second = input.comparisonSecondRef;
  const hasComparison = input.comparisonRelation && first && second && first !== second && available.has(first) && available.has(second);
  return {
    focusOccurrenceRefs,
    detailPermissions,
    comparisonDecisions: hasComparison ? [{ firstRef: first, secondRef: second, relation: input.comparisonRelation! }] : [],
  };
}

const PWQE51_BASES = new Set<Pwqe51Basis>(["actual_recalled", "reported_typicality"]);
const PWQE51_STATUSES = new Set(["answered", "none_fit", "not_sure", "no_event", "not_applicable", "skip"]);
const PWQE51_MODES = new Set(["single", "simultaneous", "order_unknown", "ordered"]);

/** Construct only the authored PWQE 5.1 answer contract; episode and routing IDs stay server-owned. */
export function buildPwqe51Response(value: Record<string, unknown>, item: Pwqe51RenderedInteraction, requestedStatus = "answered") {
  let status = PWQE51_STATUSES.has(requestedStatus) ? requestedStatus : "answered";
  if (item.unavailableBinding && status !== "skip") status = "skip";
  const referentRole = typeof value.referentRole === "string" && item.referentRoleOptions.some((role) => role.id === value.referentRole)
    ? value.referentRole : undefined;
  const noOtherPerson = referentRole !== undefined && isPwqe51NoOtherPersonRole(item.referentRoleOptions.find((role) => role.id === referentRole)!);
  if (item.referentSlotRequired && !referentRole && status === "answered") status = "not_applicable";
  if (noOtherPerson && !["not_applicable", "skip"].includes(status)) status = "not_applicable";
  const selected = Array.isArray(value.selectedOptionIds) ? value.selectedOptionIds.filter((id): id is string => typeof id === "string") : [];
  const mode = typeof value.mode === "string" && PWQE51_MODES.has(value.mode) ? value.mode : "single";
  return {
    schemaVersion: "PWQE51-RS-1",
    status,
    mode: status === "answered" ? mode : "single",
    selectedOptionIds: status === "answered" ? selected : [],
    ...(status === "answered" && item.rootBasisRequired && PWQE51_BASES.has(value.basis as Pwqe51Basis) ? { basis: value.basis as Pwqe51Basis } : {}),
    ...(referentRole ? { referentRole } : {}),
  };
}

export function isPwqe51NoOtherPersonRole(role: { id: string; label: string } | undefined): boolean {
  return Boolean(role && /\bno other person\b/iu.test(role.label));
}

export function pwqe51ReferentGate(item: Pwqe51RenderedInteraction, value: Record<string, unknown>): "not_required"|"choose_role"|"selected_role"|"no_other_person" {
  if (!item.referentSlotRequired) return "not_required";
  const role = typeof value.referentRole === "string" ? item.referentRoleOptions.find((candidate) => candidate.id === value.referentRole) : undefined;
  if (!role) return "choose_role";
  return isPwqe51NoOtherPersonRole(role) ? "no_other_person" : "selected_role";
}

export function pwqe51QuestionPresentation(item: Pwqe51RenderedInteraction, value: Record<string, unknown>): "question"|"choose_role"|"no_other_person"|"unavailable_explanation" {
  if (item.unavailableBinding) return "unavailable_explanation";
  const gate = pwqe51ReferentGate(item,value);
  return gate === "choose_role" ? "choose_role" : gate === "no_other_person" ? "no_other_person" : "question";
}

export function pwqe51AvailableStatuses(item: Pwqe51RenderedInteraction, value: Record<string, unknown>): readonly string[] {
  if (item.unavailableBinding) return ["skip"];
  const gate = pwqe51ReferentGate(item, value);
  if (gate === "no_other_person") return ["not_applicable", "skip"];
  if (gate === "choose_role") return ["skip"];
  return ["none_fit", "not_sure", "no_event", "not_applicable", "skip"];
}

export function isPwqe51AnswerValid(value: Record<string, unknown>, item: Pwqe51RenderedInteraction): boolean {
  if (item.unavailableBinding) return false;
  const ids = Array.isArray(value.selectedOptionIds) ? value.selectedOptionIds.filter((id): id is string => typeof id === "string") : [];
  if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) => !item.options.some((option) => option.id === id))) return false;
  const selectedRole = typeof value.referentRole === "string" ? item.referentRoleOptions.find((role) => role.id === value.referentRole) : undefined;
  if (item.referentSlotRequired && !selectedRole) return false;
  if (isPwqe51NoOtherPersonRole(selectedRole)) return false;
  if (item.rootBasisRequired && !PWQE51_BASES.has(value.basis as Pwqe51Basis)) return false;
  const selectionMode = item.selection.mode;
  const maxSelect = typeof item.selection.max_select === "number" && Number.isSafeInteger(item.selection.max_select)
    ? Math.max(1, item.selection.max_select) : 1;
  const partialOrder = selectionMode === "partial_order";
  const allowPair = item.selection.allow_simultaneous_pair === true;
  if ((!partialOrder && (!allowPair || maxSelect === 1) && ids.length !== 1) || ids.length > maxSelect) return false;
  const exclusive = item.options.filter((option) => option.exclusive).map((option) => option.id);
  if (ids.some((id) => exclusive.includes(id)) && ids.length !== 1) return false;
  if (!partialOrder && ids.length > 1 && value.mode !== "simultaneous") return false;
  if (partialOrder && ids.length > 1 && !["ordered", "order_unknown"].includes(String(value.mode))) return false;
  return true;
}

export function togglePwqe51Option(value: Record<string, unknown>, item: Pwqe51RenderedInteraction, id: string): Record<string, unknown> {
  const option = item.options.find((candidate) => candidate.id === id);
  if (!option) return value;
  const current = Array.isArray(value.selectedOptionIds) ? value.selectedOptionIds.filter((entry): entry is string => typeof entry === "string") : [];
  if (current.includes(id)) {
    const selectedOptionIds = current.filter((entry) => entry !== id);
    return { ...value, selectedOptionIds, mode: selectedOptionIds.length < 2 ? "single" : value.mode };
  }
  const selectionMode = item.selection.mode;
  const maxSelect = typeof item.selection.max_select === "number" && Number.isSafeInteger(item.selection.max_select)
    ? Math.max(1, item.selection.max_select) : 1;
  const multi = selectionMode === "partial_order" || (item.selection.allow_simultaneous_pair === true && maxSelect > 1);
  const retained = option.exclusive ? [] : current.filter((selectedId) => !item.options.find((candidate) => candidate.id === selectedId)?.exclusive);
  const selectedOptionIds = !multi ? [id] : [...retained, id].slice(-maxSelect);
  const mode = selectionMode === "partial_order" ? (selectedOptionIds.length < 2 ? "single" : ["ordered", "order_unknown"].includes(String(value.mode)) ? value.mode : "") : selectedOptionIds.length > 1 ? "simultaneous" : "single";
  return { ...value, selectedOptionIds, mode, status: "answered" };
}

const families: Record<Family,string> = { RL:"Relationship context",MS:"A specific moment",BDA:"Before, during, after",BTM:"Body map",FSR:"What arrived first",VFR:"Words or felt rule",RLB:"A repeating loop",BSP:"What the strategy protects",PIS:"Working-pattern sort",PDL:"Two competing pulls",RMX:"Relationship comparison",PCR:"Pace and space",RRE:"Rupture and repair",WMA:"What a cue seems to mean",RSR:"What helps you recover",SEF:"An exception",FCF:"Check the fit" };
export function familyLabel(family: Family) { return families[family] ?? "Reflection"; }
export function stateForHttpStatus(status:number): AssessmentState|undefined { return status===401||status===403 ? {status:"needs_consent"} : undefined; }

/** Stable, content-derived ID for UI-owned options. Reordering a list cannot change this value. */
export function semanticOptionId(scope: string, label: string): string {
  const normalized = `${scope}:${label}`.normalize("NFKC").trim().toLowerCase();
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const slug = label.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 32) || "value";
  return `OPT-${scope.replace(/[^A-Za-z0-9-]/gu, "-")}-${slug}-${hash.toString(16).padStart(8, "0")}`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function responseOrderForDraft(draft: Record<string, unknown>, allowedOptionIds: readonly string[] = []): string[] {
  const authoredOptionId = /^(?:(?:OPT-|OL-)[A-Za-z0-9._-]+|(?:AG|AT|AU|BASE|BL|CF|CI|CR|CRG|DOWN|FO|IR|MIX|OM|RG|RI|RP|UN|UP)-[A-Z0-9._-]+)$/iu;
  const allowed = new Set(allowedOptionIds);
  const answerFields = ["choices", "rank", "zones", "relationship", "selectedOptionIds", "orderedOptionIds", "Before", "When it first hit", "What happened next", "Later / aftermath", "Person / role 1", "Person / role 2", "Contact frequency", "Emotional disclosure", "Asking for help", "Space"] as const;
  const found: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string" && authoredOptionId.test(value) && (allowed.size === 0 || allowed.has(value)) && !found.includes(value)) found.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  for (const field of answerFields) visit(draft[field]);
  return found;
}

/** Separate structured semantic values from optional encrypted notes before persistence. */
export function buildTypedAssessmentResponse(item: RenderedInteraction, draft: Record<string, unknown>): Record<string, unknown> {
  const { note, ...semantic } = draft;
  return {
    schemaVersion: "PWRS-1",
    bankItemId: item.bankItemId,
    semantic,
    ...(typeof note === "string" && note.trim() ? { privateNote: note } : {}),
  };
}

function draftFromSaved(value: unknown): Record<string, unknown> | undefined {
  const saved = record(value);
  if (!saved) return undefined;
  if (saved.schemaVersion === "PWQE5-RS-1") return {
    selectedOptionIds: Array.isArray(saved.selectedOptionIds) ? saved.selectedOptionIds.filter((entry): entry is string => typeof entry === "string") : [],
    status: typeof saved.status === "string" ? saved.status : "answered",
    mode: typeof saved.mode === "string" ? saved.mode : "single",
    ...(typeof saved.privateNote === "string" ? { note: saved.privateNote } : {}),
  };
  if (saved.schemaVersion === "PWQE51-RS-1") return {
    selectedOptionIds: Array.isArray(saved.selectedOptionIds) ? saved.selectedOptionIds.filter((entry): entry is string => typeof entry === "string") : [],
    status: typeof saved.status === "string" ? saved.status : "answered",
    mode: typeof saved.mode === "string" ? saved.mode : "single",
    ...(PWQE51_BASES.has(saved.basis as Pwqe51Basis) ? { basis: saved.basis as Pwqe51Basis } : {}),
    ...(typeof saved.referentRole === "string" ? { referentRole: saved.referentRole } : {}),
  };
  if (saved.schemaVersion !== "PWRS-1") return saved;
  const semantic = record(saved.semantic) ?? {};
  return { ...semantic, ...(typeof saved.privateNote === "string" ? { note: saved.privateNote } : {}) };
}

function normalizePwqe5ResponseHistory(value: unknown): Pwqe5ResponseHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const response = record(entry);
    if (!response || typeof response.responseId !== "string" || typeof response.questionId !== "string") return [];
    const selectedOptions = Array.isArray(response.selectedOptions)
      ? response.selectedOptions.flatMap((option) => {
          const item = record(option);
          return item && typeof item.id === "string" ? [{ id: item.id, label: String(item.label ?? item.id) }] : [];
        })
      : [];
    const options = Array.isArray(response.options)
      ? response.options.flatMap((option) => {
          const item = record(option);
          return item && typeof item.id === "string" ? [{ id: item.id, label: String(item.label ?? item.id), exclusive: item.exclusive === true }] : [];
        })
      : undefined;
    const responseControls = Array.isArray(response.responseControls)
      ? response.responseControls.flatMap((control) => {
          const item = record(control);
          return item && typeof item.id === "string" ? [{ id: item.id, text: String(item.text ?? item.id) }] : [];
        })
      : undefined;
    return [{
      responseId: response.responseId,
      questionId: response.questionId,
      title: String(response.title ?? response.questionId),
      status: String(response.status ?? "answered"),
      ...(typeof response.mode === "string" ? { mode: response.mode } : {}),
      ...(typeof response.context === "string" ? { context: response.context } : {}),
      selectedOptions,
      canCorrect: response.canCorrect === true,
      ...(typeof response.prompt === "string" ? { prompt: response.prompt } : {}),
      ...(options ? { options } : {}),
      ...(record(response.selection) ? { selection: record(response.selection) } : {}),
      ...(responseControls ? { responseControls } : {}),
    }];
  });
}

export function normaliseAssessmentState(input: unknown): AssessmentState {
  const raw = record(input) ?? {};
  const candidate = record(raw.state) ?? raw;
  const rawStatus = String(candidate.status ?? candidate.phase ?? "needs_consent");
  const rawReportStatus = String(candidate.reportStatus ?? raw.reportStatus ?? "");
  const reportStatus = (["NOT_STARTED", "QUEUED", "GENERATING", "READY", "FAILED"] as const).includes(rawReportStatus as ReportStatus)
    ? rawReportStatus as ReportStatus
    : undefined;
  const statusMap: Record<string,AssessmentStatus> = { awaiting_consent:"needs_consent", IN_PROGRESS:"active", PASS1_COMPLETE:"pass1_ready", PASS2_IN_PROGRESS:"active", COMPLETE:"report_ready", PAUSED:"paused" };
  const r = record(candidate.interaction ?? candidate.currentInteraction ?? candidate.current_item);
  const pwqe5 = candidate.engine === "PWQE5";
  const pwqe51 = candidate.engine === "PWQE51";
  const authored = record(r?.authored) ?? {};
  const sourceOptions = [
    ...(Array.isArray(authored.optionGroups) ? authored.optionGroups : []),
    ...(Array.isArray(authored.responseLibraries) ? authored.responseLibraries : []),
  ].flatMap((group) => Array.isArray(record(group)?.options) ? record(group)!.options as unknown[] : []);
  const bankItemId = String(r?.bankItemId ?? r?.bank_item_id ?? "");
  const interaction = r ? {
    instanceId: String(r.interactionInstanceId ?? r.instanceId ?? r.instance_id ?? r.id ?? "current"),
    bankItemId,
    family: String(r.family ?? bankItemId.split("-")[0] ?? "RL") as Family,
    stage: String(r.stage ?? candidate.stage ?? "S0"),
    prompt: String(authored.prompt ?? r.prompt ?? r.question ?? r.title ?? ""),
    helpText: [authored.mechanic, authored.eligibility, record(authored.burden)?.authored, authored.limits, authored.recovery].filter((value) => typeof value === "string").join(" ") || undefined,
    options: sourceOptions.map((option) => {
      const value = record(option) ?? {};
      const label = String(value.label ?? value.optionId ?? "");
      return { id: String(value.optionId ?? semanticOptionId(bankItemId || "unknown", label)), label };
    }).filter((option, index, all) => option.id && all.findIndex((candidate) => candidate.id === option.id) === index),
  } : null;
  const mapped = statusMap[rawStatus] ?? rawStatus as AssessmentStatus;
  const status = reportStatus === "FAILED"
    ? "report_failed"
    : reportStatus === "QUEUED" || reportStatus === "GENERATING"
    ? (candidate.pass === 1 ? "generating_pass1" : "generating_pass2")
    : reportStatus === "READY" && rawStatus === "COMPLETE" ? "report_ready" : mapped;
  const stage = String(candidate.stage ?? interaction?.stage ?? "S0");
  const stageNumber = /^S([0-5])$/u.exec(stage)?.[1];
  const derivedStageProgress = stageNumber === undefined ? undefined : Math.round((Number(stageNumber)+1)/6*100);
  const currentResponse = record(candidate.currentResponse);
  const pwqe5Interaction = pwqe5 && r ? {
    instanceId: String(r.interactionInstanceId ?? ""),
    questionId: String(r.questionId ?? r.bankItemId ?? ""),
    bankItemId: String(r.bankItemId ?? r.questionId ?? ""),
    bankItemVersion: String(r.bankItemVersion ?? ""),
    stage: String(r.stage ?? candidate.stage ?? "mapping") as "mapping"|"deepening",
    pass: Number(r.pass ?? candidate.pass ?? 1) as 1|2,
    administrationSequence: Number(r.administrationSequence ?? candidate.completedCount ?? 0) + (r.administrationSequence === undefined ? 1 : 0),
    title: String(r.title ?? ""),
    prompt: String(r.prompt ?? ""),
    context: String(r.context ?? ""),
    episodeFamily: String(r.episodeFamily ?? ""),
    selection: record(r.selection) ?? {},
    responseControls: (Array.isArray(r.responseControls) ? r.responseControls : []).flatMap((entry) => {
      const control = record(entry); return control && typeof control.id === "string" ? [{id:control.id,text:String(control.text ?? control.id)}] : [];
    }),
    options: (Array.isArray(r.options) ? r.options : []).flatMap((entry) => {
      const option = record(entry); return option && typeof option.id === "string" ? [{id:option.id,label:String(option.label ?? option.text ?? option.id),exclusive:option.exclusive===true}] : [];
    }),
  } satisfies Pwqe5RenderedInteraction : null;
  const pwqe51Interaction = pwqe51 && r ? {
    instanceId: String(r.interactionInstanceId ?? ""),
    questionId: String(r.questionId ?? r.bankItemId ?? ""),
    bankItemId: String(r.bankItemId ?? r.questionId ?? ""),
    bankItemVersion: String(r.bankItemVersion ?? ""),
    stage: String(r.stage ?? candidate.stage ?? "mapping") as "mapping"|"deepening",
    pass: Number(r.pass ?? candidate.pass ?? 1) as 1|2,
    administrationSequence: Number(r.administrationSequence ?? candidate.completedCount ?? 0) + (r.administrationSequence === undefined ? 1 : 0),
    title: String(r.title ?? ""),
    prompt: String(r.prompt ?? ""),
    context: String(r.context ?? ""),
    episodeFamily: String(r.episodeFamily ?? ""),
    ...(typeof r.stepId === "string" ? { stepId: r.stepId } : {}),
    rootBasisRequired: r.rootBasisRequired === true,
    basisOptions: Array.isArray(r.basisOptions) ? r.basisOptions.filter((basis): basis is Pwqe51Basis => PWQE51_BASES.has(basis as Pwqe51Basis)) : [],
    unavailableBinding: r.unavailableBinding === true,
    referentSlotRequired: r.referentSlotRequired === true,
    ...(typeof r.referentSlotPrompt === "string" ? { referentSlotPrompt: r.referentSlotPrompt } : {}),
    referentRoleOptions: Array.isArray(r.referentRoleOptions) ? r.referentRoleOptions.flatMap((entry) => {
      const role = record(entry);
      return role && typeof role.id === "string" && typeof role.label === "string" ? [{id:role.id,label:role.label}] : [];
    }) : [],
    selection: record(r.selection) ?? {},
    responseControls: (Array.isArray(r.responseControls) ? r.responseControls : []).flatMap((entry) => {
      const control = record(entry); return control && typeof control.id === "string" ? [{id:control.id,text:String(control.text ?? control.id)}] : [];
    }),
    options: (Array.isArray(r.options) ? r.options : []).flatMap((entry) => {
      const option = record(entry); return option && typeof option.id === "string" ? [{id:option.id,label:String(option.label ?? option.text ?? option.id),exclusive:option.exclusive===true}] : [];
    }),
  } satisfies Pwqe51RenderedInteraction : null;
  return {
    assessmentId: (raw.assessmentId ?? raw.assessment_id ?? candidate.assessmentId ?? candidate.assessment_id) as string|undefined,
    reportReadyUrl: (raw.reportReadyUrl ?? raw.report_ready_url ?? candidate.reportReadyUrl ?? candidate.report_ready_url) as string|undefined,
    mappingSummaryUrl: (raw.mappingSummaryUrl ?? raw.mapping_summary_url ?? candidate.mappingSummaryUrl ?? candidate.mapping_summary_url) as string|undefined,
    reportStatus,
    deliveryStatus: String(candidate.deliveryStatus ?? raw.deliveryStatus ?? "") as DeliveryStatus || undefined,
    resumeNotificationStatus: String(candidate.resumeNotificationStatus ?? raw.notificationStatus ?? raw.resumeNotificationStatus ?? "") as DeliveryStatus || undefined,
    failureCategory: typeof (candidate.failureCategory ?? raw.failureCategory) === "string" ? String(candidate.failureCategory ?? raw.failureCategory) : undefined,
    retryAudience: String(candidate.retryAudience ?? raw.retryAudience ?? "") as RetryAudience || undefined,
    canRetry: Boolean(candidate.canRetry ?? raw.canRetry),
    currentAttempt: record(candidate.currentAttempt ?? raw.currentAttempt) as ReportAttempt | undefined,
    revision: candidate.revision as string|number|undefined,
    status,
    engine: pwqe5 ? "PWQE5" : pwqe51 ? "PWQE51" : undefined,
    pass: candidate.pass as number|undefined,
    canCompletePass: Boolean(candidate.canCompletePass),
    canPause: candidate.canPause === true,
    availableTopics: Array.isArray(candidate.availableTopics) ? candidate.availableTopics.flatMap((entry) => { const topic=record(entry); return topic&&typeof topic.id==="string" ? [{id:topic.id,label:String(topic.label??topic.id),description:String(topic.description??"")}] : []; }) : undefined,
    availableFocuses: Array.isArray(candidate.availableFocuses) ? candidate.availableFocuses.flatMap((entry) => { const focus=record(entry); return focus&&typeof focus.ref==="string"&&typeof focus.label==="string" ? [{ref:focus.ref,label:focus.label}] : []; }) : undefined,
    allowedControls: Array.isArray(candidate.allowedControls) ? candidate.allowedControls.filter((entry): entry is string => typeof entry === "string") : [],
    responseHistory: normalizePwqe5ResponseHistory(candidate.responseHistory),
    optedInTopics: Array.isArray(candidate.optedInTopics) ? candidate.optedInTopics.filter((entry): entry is string => typeof entry === "string") : [],
    currentResponse: candidate.currentResponse,
    pwqe5Interaction,
    pwqe51Interaction,
    email: candidate.email as string|undefined,
    interaction,
    draft: draftFromSaved(currentResponse?.response ?? candidate.draft ?? candidate.response),
    stageLabel: candidate.stageLabel as string|undefined,
    stageProgress: typeof candidate.stageProgress === "number" ? candidate.stageProgress : derivedStageProgress,
    resumeCue: candidate.resumeCue as string|undefined,
    mode: candidate.mode as string|undefined,
  };
}
