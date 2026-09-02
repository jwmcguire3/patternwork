export type Family = "RL"|"MS"|"BDA"|"BTM"|"FSR"|"VFR"|"RLB"|"BSP"|"PIS"|"PDL"|"RMX"|"PCR"|"RRE"|"WMA"|"RSR"|"SEF"|"FCF";
export type RenderedOption = { id:string; label:string };
export type RenderedInteraction = { instanceId: string; bankItemId: string; family: Family; stage: string; prompt: string; helpText?: string; options?: RenderedOption[] };
export type AssessmentStatus = "needs_consent"|"ready"|"active"|"paused"|"recovery"|"generating_pass1"|"pass1_ready"|"generating_pass2"|"pass2_ready"|"report_ready";
export type AssessmentState = { assessmentId?: string; reportReadyUrl?: string; mappingSummaryUrl?: string; reportStatus?: string; revision?: string|number; status: AssessmentStatus; pass?:number; canCompletePass?:boolean; email?: string; interaction?: RenderedInteraction|null; draft?: Record<string, unknown>; stageLabel?: string; stageProgress?: number; resumeCue?: string; mode?: string };

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
  if (saved.schemaVersion !== "PWRS-1") return saved;
  const semantic = record(saved.semantic) ?? {};
  return { ...semantic, ...(typeof saved.privateNote === "string" ? { note: saved.privateNote } : {}) };
}

export function normaliseAssessmentState(input: unknown): AssessmentState {
  const raw = record(input) ?? {};
  const candidate = record(raw.state) ?? raw;
  const rawStatus = String(candidate.status ?? candidate.phase ?? "needs_consent");
  const reportStatus = String(candidate.reportStatus ?? raw.reportStatus ?? "");
  const statusMap: Record<string,AssessmentStatus> = { awaiting_consent:"needs_consent", IN_PROGRESS:"active", PASS1_COMPLETE:"pass1_ready", PASS2_IN_PROGRESS:"active", COMPLETE:"report_ready", PAUSED:"paused" };
  const r = record(candidate.interaction ?? candidate.currentInteraction ?? candidate.current_item);
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
  const status = reportStatus === "GENERATING"
    ? (candidate.pass === 1 ? "generating_pass1" : "generating_pass2")
    : reportStatus === "READY" && rawStatus === "COMPLETE" ? "report_ready" : mapped;
  const stage = String(candidate.stage ?? interaction?.stage ?? "S0");
  const stageNumber = /^S([0-5])$/u.exec(stage)?.[1];
  const derivedStageProgress = stageNumber === undefined ? undefined : Math.round((Number(stageNumber)+1)/6*100);
  const currentResponse = record(candidate.currentResponse);
  return {
    assessmentId: (raw.assessmentId ?? raw.assessment_id ?? candidate.assessmentId ?? candidate.assessment_id) as string|undefined,
    reportReadyUrl: (raw.reportReadyUrl ?? raw.report_ready_url ?? candidate.reportReadyUrl ?? candidate.report_ready_url) as string|undefined,
    mappingSummaryUrl: (raw.mappingSummaryUrl ?? raw.mapping_summary_url ?? candidate.mappingSummaryUrl ?? candidate.mapping_summary_url) as string|undefined,
    reportStatus,
    revision: candidate.revision as string|number|undefined,
    status,
    pass: candidate.pass as number|undefined,
    canCompletePass: Boolean(candidate.canCompletePass),
    email: candidate.email as string|undefined,
    interaction,
    draft: draftFromSaved(currentResponse?.response ?? candidate.draft ?? candidate.response),
    stageLabel: candidate.stageLabel as string|undefined,
    stageProgress: typeof candidate.stageProgress === "number" ? candidate.stageProgress : derivedStageProgress,
    resumeCue: candidate.resumeCue as string|undefined,
    mode: candidate.mode as string|undefined,
  };
}
