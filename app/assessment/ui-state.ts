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
export type Pwqe5ResponseHistoryItem = { responseId:string; questionId:string; title:string; status:string; mode?:string; context?:string; selectedOptions:{id:string;label:string}[]; canCorrect:boolean; prompt?:string; options?:{id:string;label:string;exclusive:boolean}[]; selection?:Record<string,unknown>; responseControls?:{id:string;text:string}[] };
export type AssessmentStatus = "needs_consent"|"ready"|"active"|"paused"|"recovery"|"generating_pass1"|"pass1_ready"|"generating_pass2"|"pass2_ready"|"report_ready"|"report_failed";
export type ReportStatus = "NOT_STARTED"|"QUEUED"|"GENERATING"|"READY"|"FAILED";
export type DeliveryStatus = "NOT_STARTED"|"PENDING"|"SENT"|"DELIVERED"|"FAILED";
export type RetryAudience = "USER"|"OPERATOR"|"NONE";
export type ReportAttempt = { id?: string; attemptNumber?: number; status?: string; startedAt?: string; updatedAt?: string };
export type AssessmentState = { assessmentId?: string; reportReadyUrl?: string; mappingSummaryUrl?: string; reportStatus?: ReportStatus; deliveryStatus?: DeliveryStatus; resumeNotificationStatus?: DeliveryStatus; reportUnavailable?: boolean; failureCategory?: string; retryAudience?: RetryAudience; canRetry?: boolean; currentAttempt?: ReportAttempt; revision?: string|number; status: AssessmentStatus; engine?: "PWQE5"; pass?:number; canCompletePass?:boolean; canPause?:boolean; allowedControls?:string[]; responseHistory?:Pwqe5ResponseHistoryItem[]; availableTopics?: {id:string;label:string;description:string}[]; optedInTopics?:string[]; currentResponse?:unknown; pwqe5Interaction?: Pwqe5RenderedInteraction|null; email?: string; interaction?: RenderedInteraction|null; draft?: Record<string, unknown>; stageLabel?: string; stageProgress?: number; resumeCue?: string; mode?: string };

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
    engine: pwqe5 ? "PWQE5" : undefined,
    pass: candidate.pass as number|undefined,
    canCompletePass: Boolean(candidate.canCompletePass),
    canPause: candidate.canPause === true,
    availableTopics: Array.isArray(candidate.availableTopics) ? candidate.availableTopics.flatMap((entry) => { const topic=record(entry); return topic&&typeof topic.id==="string" ? [{id:topic.id,label:String(topic.label??topic.id),description:String(topic.description??"")}] : []; }) : undefined,
    allowedControls: Array.isArray(candidate.allowedControls) ? candidate.allowedControls.filter((entry): entry is string => typeof entry === "string") : [],
    responseHistory: normalizePwqe5ResponseHistory(candidate.responseHistory),
    optedInTopics: Array.isArray(candidate.optedInTopics) ? candidate.optedInTopics.filter((entry): entry is string => typeof entry === "string") : [],
    currentResponse: candidate.currentResponse,
    pwqe5Interaction,
    email: candidate.email as string|undefined,
    interaction,
    draft: draftFromSaved(currentResponse?.response ?? candidate.draft ?? candidate.response),
    stageLabel: candidate.stageLabel as string|undefined,
    stageProgress: typeof candidate.stageProgress === "number" ? candidate.stageProgress : derivedStageProgress,
    resumeCue: candidate.resumeCue as string|undefined,
    mode: candidate.mode as string|undefined,
  };
}
