import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical } from "../../../report-contracts/delivery-validator.ts";
import { QUALIFICATION_MODEL_ORDER, REPORT_OUTPUT_TOKEN_LIMIT, reportDevCandidate, type ReportDevCandidateAdmission } from "../../openrouter/policy.ts";
import { OpenRouterTransportError, type OpenRouterGenerationRequest, type OpenRouterGenerationResult, type OpenRouterRequestProviderPolicy, type OpenRouterTransport, type OpenRouterUsage, type ProviderPrivacyIdentityContext } from "../../openrouter/types.ts";
import { projectOpenRouterStrictSchemaObject } from "../../openrouter/schema-projection.ts";
import { GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY, reportBillingBasisSha256, reportDevProviderPolicy, maximumQuotedCallCostMicros, validatePositiveMicros } from "../../openrouter/qualification-budget.ts";
import { buildOpenRouterWirePayload, OPENROUTER_DEFAULT_ENDPOINT } from "../../openrouter/wire.ts";
import { sanitizeProviderErrorDetail } from "../../openrouter/provider-error-details.ts";
import { assertProviderRequestPrivacy, mergeProviderPrivacyIdentityContexts } from "../../openrouter/privacy-boundary.ts";
import type { Pwrp71GenerationEvent } from "../generator.ts";
import { renameFileWithTransientRetry } from "./atomic-file.ts";
import { authorizePwrp71BudgetedRequest, revokePwrp71BudgetAuthorization } from "./budget-authorization.ts";

export type QualificationAttemptStatus = "started" | "completed" | "unknown";

export interface QualificationAttemptRecord {
  readonly attemptId: string;
  readonly requestFingerprint: string;
  readonly endpoint?: string;
  readonly status: QualificationAttemptStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly elapsedMs?: number;
  readonly request: {
    readonly requestedModel: string;
    readonly requestedReasoningEffort: string;
    readonly schemaName: string;
    readonly maxOutputTokens: number;
    readonly idempotencyKey: string;
    readonly systemSha256: string;
    readonly promptSha256: string;
    readonly localSchemaSha256: string;
    readonly wireSchemaSha256: string;
  };
  readonly locallyEstimatedCostMicros: number;
  /** Conservative live reservation; old ledger rows fall back to locallyEstimatedCostMicros. */
  readonly reservedCostMicros?: number;
  readonly maximumCallCostMicros?: number;
  readonly aggregateCostCapMicros?: number;
  readonly billingBasisSha256?: string;
  /** Present only for the fixed, unqualified report-dev candidate. */
  readonly candidateAdmission?: ReportDevCandidateAdmission;
  readonly wirePayloadSha256?: string;
  readonly usageStatus: "reported" | "mock" | "unknown";
  readonly usage?: OpenRouterUsage;
  readonly finishReason?: string;
  readonly providerResult?: OpenRouterGenerationResult;
  readonly diagnostic?: {
    readonly kind: string;
    readonly message: string;
    readonly statusCode?: number;
    readonly providerCode?: string;
    readonly providerParam?: string;
    readonly providerName?: string;
    readonly providerUpstreamCode?: string;
    /** Captured only when the explicit CLI diagnostic option is enabled. */
    readonly providerErrorRaw?: string;
    readonly providerMetadataKeys?: readonly string[];
    readonly providerHints?: readonly string[];
    readonly retryable?: boolean;
    /** Sanitized local transport cause only; raw exception messages and request data are never persisted. */
    readonly causeName?: string;
    readonly causeCode?: string;
    readonly causeSyscall?: string;
  };
  readonly validation?: { readonly ok: boolean; readonly issues: readonly { readonly code: string; readonly path: string; readonly message: string }[]; readonly draftSha256?: string };
  readonly reviewReceipt?: Record<string, unknown>;
  readonly repairDecisions?: readonly { readonly reason: "draft_validation" | "review_revise"; readonly issueCount: number }[];
}

interface AttemptFile {
  readonly schemaVersion: 1;
  readonly attempts: readonly QualificationAttemptRecord[];
}

export class QualificationAttemptError extends Error {
  constructor(readonly code: "resume_conflict" | "attempt_uncertain" | "budget_blocked" | "run_locked", message: string) {
    super(message);
    this.name = "QualificationAttemptError";
  }
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function scrub(value: string): string {
  return value.replace(/Bearer\s+[^\s"']+/giu, "Bearer [redacted]")
    .replace(/sk-or-v1-[a-zA-Z0-9_-]{8,}/gu, "[redacted]")
    .slice(0, 1200);
}

function safeTransportCause(error: OpenRouterTransportError): {
  readonly causeName?: string;
  readonly causeCode?: string;
  readonly causeSyscall?: string;
} {
  const safeToken = (value: unknown): string | undefined =>
    typeof value === "string" && /^[A-Za-z0-9_.-]{1,48}$/u.test(value) ? value : undefined;
  let current: unknown = error.cause;
  let name: string | undefined;
  let code: string | undefined;
  let syscall: string | undefined;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const errno = current as NodeJS.ErrnoException;
    name ??= safeToken(current.name);
    code ??= safeToken(errno.code);
    syscall ??= safeToken(errno.syscall);
    current = current.cause;
  }
  return {
    ...(name ? { causeName: name } : {}),
    ...(code ? { causeCode: code } : {}),
    ...(syscall ? { causeSyscall: syscall } : {}),
  };
}

function isReportDevCandidateAdmission(
  request: OpenRouterGenerationRequest,
  wireRequest: OpenRouterGenerationRequest,
  admission: ReportDevCandidateAdmission | undefined,
): admission is ReportDevCandidateAdmission {
  const candidate = admission ? reportDevCandidate(admission.candidateId) : undefined;
  if (!admission
    || !candidate
    || admission.scope !== "report-dev-experimental-v1"
    || admission.candidateSha256 !== sha256Canonical(candidate)
    || !/^[a-f0-9]{64}$/u.test(admission.runBindingSha256)) return false;
  const prefix = `dev:${admission.runBindingSha256}:IFS:`;
  if (!request.idempotencyKey.startsWith(prefix)) return false;
  const scopedKey = request.idempotencyKey.slice(prefix.length);
  const [phase, candidateId, ordinal, ...extra] = scopedKey.split(":");
  if (!["initial", "repair", "escalation", "review", "review_after_repair", "review_retry"].includes(phase)
    || candidateId !== candidate.id || !/^attempt-[1-9][0-9]*$/u.test(ordinal ?? "") || extra.length !== 0) return false;
  const reviewPhase = /^(?:review|review_after_repair|review_retry):/u.test(scopedKey);
  const expectedSchemaName = reviewPhase
    ? "patternwork_ifs_pwrp71_review_candidate_3"
    : "patternwork_ifs_pwrp71_candidate_1";
  return request.model === candidate.model
    && request.reasoningEffort === candidate.reasoningEffort
    && request.maxOutputTokens === candidate.maxOutputTokens
    && wireRequest.includeUsage === true
    && wireRequest.promptCacheOptions?.mode === "explicit"
    && sha256Canonical(wireRequest.providerPolicy) === sha256Canonical(reportDevProviderPolicy(candidate.model))
    && request.schemaName === expectedSchemaName
    && wireRequest.schemaName === expectedSchemaName;
}

export type AttemptJournalMutation<T> = (attempts: readonly QualificationAttemptRecord[], openingCostMicros: number) => {
  readonly next: readonly QualificationAttemptRecord[]; readonly value: T;
};
/** Shared admission, accounting and receipt transitions for durable journal backends. */
export abstract class QualificationAttemptStoreBase {
  protected abstract readAttempts(): Promise<readonly QualificationAttemptRecord[]>;
  protected abstract mutate<T>(fn: AttemptJournalMutation<T>, options?: { readonly admission?: boolean }): Promise<T>;

  async list(): Promise<readonly QualificationAttemptRecord[]> {
    return await this.readAttempts();
  }

  async get(attemptId: string): Promise<QualificationAttemptRecord | undefined> {
    return (await this.readAttempts()).find((attempt) => attempt.attemptId === attemptId);
  }

  async begin(input: {
    readonly request: OpenRouterGenerationRequest;
    readonly wireRequest: OpenRouterGenerationRequest;
    readonly maxCallCostMicros?: number;
    readonly aggregateCostCapMicros?: number;
    /** Legacy alias retained for archived tests/runs; new live callers pass both explicit limits. */
    readonly costCapMicros?: number;
    readonly usageStatus?: "reported" | "mock";
    /** Local-only comparison values; checked before the attempt record is written. */
    readonly privacyIdentityContext?: ProviderPrivacyIdentityContext;
    readonly candidateAdmission?: ReportDevCandidateAdmission;
    readonly endpoint?: string;
    readonly startedAt: Date;
  }): Promise<{ readonly record: QualificationAttemptRecord; readonly reused: boolean }> {
    const maxCallCostMicros = input.maxCallCostMicros ?? input.costCapMicros;
    const aggregateCostCapMicros = input.aggregateCostCapMicros ?? input.costCapMicros;
    validatePositiveMicros(maxCallCostMicros, "maxCallCostMicros");
    validatePositiveMicros(aggregateCostCapMicros, "aggregateCostCapMicros");
    return this.mutate<{ readonly record: QualificationAttemptRecord; readonly reused: boolean }>((attempts, openingCostMicros) => {
      const endpoint = input.endpoint ?? OPENROUTER_DEFAULT_ENDPOINT;
      const wirePayload = buildOpenRouterWirePayload(input.wireRequest);
      const wireBody = JSON.stringify(wirePayload);
      const wirePayloadSha256 = sha256Text(wireBody);
      const usageStatus = input.usageStatus ?? "reported";
      const fingerprint = qualificationAttemptFingerprint({
        request: input.request,
        wireRequest: input.wireRequest,
        endpoint,
        maxCallCostMicros,
        aggregateCostCapMicros,
        ...(input.candidateAdmission ? { candidateAdmission: input.candidateAdmission } : {}),
      });
      const prior = attempts.find((attempt) => attempt.attemptId === input.request.idempotencyKey);
      if (prior) {
        if (prior.requestFingerprint !== fingerprint) {
          throw new QualificationAttemptError("resume_conflict", `Provider attempt ${prior.attemptId} no longer matches its source/input/model/schema request pins.`);
        }
        if (prior.status === "completed" && prior.providerResult) return { next: attempts, value: { record: prior, reused: true } };
        throw new QualificationAttemptError("attempt_uncertain", `Provider attempt ${prior.attemptId} is ${prior.status}; its result is not safe to repeat automatically.`);
      }

      if (input.request.maxOutputTokens !== REPORT_OUTPUT_TOKEN_LIMIT || input.wireRequest.maxOutputTokens !== REPORT_OUTPUT_TOKEN_LIMIT) {
        throw new QualificationAttemptError("resume_conflict", "New report requests must use the authorized 128,000-token output limit; historical results are read-only.");
      }
      const allowedTier = QUALIFICATION_MODEL_ORDER.find((tier) => tier.model === input.request.model && tier.reasoningEffort === input.request.reasoningEffort);
      const allowedReportDevCandidate = isReportDevCandidateAdmission(input.request, input.wireRequest, input.candidateAdmission);
      if ((input.candidateAdmission && !allowedReportDevCandidate) || (!allowedTier && !allowedReportDevCandidate)) {
        throw new QualificationAttemptError("resume_conflict", "Requested model/reasoning pair is outside the pinned qualification or explicit report-dev candidate policy.");
      }
      const quotedCeilingMicros = usageStatus === "mock" ? 0 : maximumQuotedCallCostMicros(input.wireRequest);
      if (quotedCeilingMicros > maxCallCostMicros) {
        throw new QualificationAttemptError("budget_blocked", `Per-call ceiling blocked before dispatch: quoted ${quotedCeilingMicros} > maxCallCostMicros ${maxCallCostMicros}.`);
      }
      const reservedCostMicros = quotedCeilingMicros;
      const reserved = attempts.reduce((sum, attempt) => sum + accountedCostMicros(attempt), openingCostMicros);
      if (reserved + reservedCostMicros > aggregateCostCapMicros) {
        throw new QualificationAttemptError("budget_blocked", `PWRP 7.1 aggregate budget blocked before dispatch: ${reserved} spent/reserved + ${reservedCostMicros} reserved > ${aggregateCostCapMicros} micros.`);
      }
      const record: QualificationAttemptRecord = {
        attemptId: input.request.idempotencyKey,
        requestFingerprint: fingerprint,
        endpoint,
        status: "started",
        startedAt: input.startedAt.toISOString(),
        request: {
          requestedModel: input.request.model,
          requestedReasoningEffort: input.request.reasoningEffort,
          schemaName: input.request.schemaName,
          maxOutputTokens: input.request.maxOutputTokens,
          idempotencyKey: input.request.idempotencyKey,
          systemSha256: sha256Text(input.request.system),
          promptSha256: sha256Text(input.request.prompt),
          localSchemaSha256: sha256Canonical(input.request.schema),
          wireSchemaSha256: sha256Canonical(input.wireRequest.schema),
        },
        locallyEstimatedCostMicros: reservedCostMicros,
        reservedCostMicros,
        maximumCallCostMicros: maxCallCostMicros,
        aggregateCostCapMicros,
        billingBasisSha256: reportBillingBasisSha256(input.wireRequest.model),
        ...(input.candidateAdmission ? { candidateAdmission: input.candidateAdmission } : {}),
        wirePayloadSha256,
        usageStatus: "unknown",
      };
      return { next: [...attempts, record], value: { record, reused: false } };
    }, { admission: true });
  }

  async complete(attemptId: string, result: OpenRouterGenerationResult, elapsedMs: number, completedAt: Date, usageStatus: "reported" | "mock" = "reported"): Promise<QualificationAttemptRecord> {
    return this.mutate((attempts) => {
      const record = attempts.find((attempt) => attempt.attemptId === attemptId);
      if (!record || record.status !== "started") throw new QualificationAttemptError("resume_conflict", `Provider attempt ${attemptId} was not started in this run.`);
      const completed: QualificationAttemptRecord = {
        ...record,
        status: "completed",
        usageStatus,
        usage: structuredClone(result.usage),
        ...(result.finishReason === undefined ? {} : { finishReason: result.finishReason }),
        providerResult: structuredClone(result),
        completedAt: completedAt.toISOString(),
        elapsedMs: Math.max(0, Math.round(elapsedMs)),
      };
      return { next: attempts.map((attempt) => attempt.attemptId === attemptId ? completed : attempt), value: completed };
    });
  }

  async markUnknown(attemptId: string, error: unknown, elapsedMs: number, completedAt: Date): Promise<void> {
    await this.mutate((attempts) => {
      const record = attempts.find((attempt) => attempt.attemptId === attemptId);
      if (!record || record.status !== "started") return { next: attempts, value: undefined };
      const diagnostic = error instanceof OpenRouterTransportError ? {
        kind: error.kind,
        message: scrub(error.message),
        ...(error.statusCode === undefined ? {} : { statusCode: error.statusCode }),
        ...(error.providerCode === undefined ? {} : { providerCode: error.providerCode }),
        ...(error.providerParam === undefined ? {} : { providerParam: error.providerParam }),
        ...(error.providerName === undefined ? {} : { providerName: error.providerName }),
        ...(error.providerUpstreamCode === undefined ? {} : { providerUpstreamCode: error.providerUpstreamCode }),
        ...(error.providerErrorRaw === undefined ? {} : { providerErrorRaw: sanitizeProviderErrorDetail(error.providerErrorRaw) }),
        ...(error.providerMetadataKeys === undefined ? {} : { providerMetadataKeys: error.providerMetadataKeys }),
        ...(error.providerHints === undefined ? {} : { providerHints: error.providerHints }),
        ...safeTransportCause(error),
        retryable: error.retryable,
      } : { kind: "unknown", message: scrub(error instanceof Error ? error.message : String(error)) };
      const unknown: QualificationAttemptRecord = {
        ...record,
        status: "unknown",
        diagnostic,
        completedAt: completedAt.toISOString(),
        elapsedMs: Math.max(0, Math.round(elapsedMs)),
        usageStatus: "unknown",
      };
      return { next: attempts.map((attempt) => attempt.attemptId === attemptId ? unknown : attempt), value: undefined };
    });
  }

  async recordGenerationEvent(event: Pwrp71GenerationEvent): Promise<void> {
    const attemptId = event.type === "repair_decision" ? event.triggerAttemptId : event.attemptId;
    await this.mutate((attempts) => {
      const record = attempts.find((attempt) => attempt.attemptId === attemptId);
      if (!record) throw new QualificationAttemptError("resume_conflict", `Generation evidence references missing provider attempt ${attemptId}.`);
      const nextRecord: QualificationAttemptRecord = event.type === "draft_validation"
        ? { ...record, validation: { ok: event.ok, issues: event.issues.slice(0, 50), ...(event.draftSha256 ? { draftSha256: event.draftSha256 } : {}) } }
        : event.type === "review_receipt"
          ? { ...record, reviewReceipt: structuredClone(event.receipt) as Record<string, unknown> }
          : event.type === "review_validation"
            ? { ...record, validation: { ok: false, issues: event.issues.slice(0, 50) } }
            : { ...record, repairDecisions: [...(record.repairDecisions ?? []), { reason: event.reason, issueCount: event.issueCount }] };
      return { next: attempts.map((attempt) => attempt.attemptId === attemptId ? nextRecord : attempt), value: undefined };
    });
  }

}

export type ProviderAttemptStore = Pick<QualificationAttemptStoreBase, "list" | "get" | "begin" | "complete" | "markUnknown" | "recordGenerationEvent">;

/** A single-writer, repository-local, atomic JSON attempt ledger. */
export class FileQualificationAttemptStore extends QualificationAttemptStoreBase {
  private static readonly inProcessLocks = new Set<string>();
  readonly attemptsPath: string;

  constructor(
    readonly runDirectory: string,
    private readonly replaceAtomicFile: typeof renameFileWithTransientRetry = renameFileWithTransientRetry,
  ) {
    super();
    this.attemptsPath = path.join(runDirectory, "attempts.json");
  }

  protected async readAttempts(): Promise<readonly QualificationAttemptRecord[]> { return (await this.readFile()).attempts; }

  private async readFile(): Promise<AttemptFile> {
    try {
      const parsed = JSON.parse(await readFile(this.attemptsPath, "utf8")) as AttemptFile;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.attempts)) throw new Error("Attempt ledger shape is invalid.");
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, attempts: [] };
      throw error;
    }
  }

  protected async mutate<T>(fn: AttemptJournalMutation<T>): Promise<T> {
    await mkdir(this.runDirectory, { recursive: true });
    const lockPath = `${this.attemptsPath}.lock`;
    const lockKey = path.resolve(lockPath);
    if (FileQualificationAttemptStore.inProcessLocks.has(lockKey)) throw new QualificationAttemptError("run_locked", "This qualification run already has an active writer.");
    FileQualificationAttemptStore.inProcessLocks.add(lockKey);
    let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      try {
        lockHandle = await open(lockPath, "wx");
        await lockHandle.writeFile(`${process.pid}\t${Date.now()}\n`, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new QualificationAttemptError("run_locked", "Qualification run has an existing writer lock; automatic stale-lock removal is disabled.");
        }
        throw error;
      }
      const current = await this.readFile();
      const { next, value } = fn(current.attempts, 0);
      await this.atomicWrite({ schemaVersion: 1, attempts: next });
      return value;
    } finally {
      await lockHandle?.close();
      if (lockHandle) await rm(lockPath, { force: true });
      FileQualificationAttemptStore.inProcessLocks.delete(lockKey);
    }
  }

  private async atomicWrite(value: AttemptFile): Promise<void> {
    const temporary = `${this.attemptsPath}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    try {
      await this.replaceAtomicFile(temporary, this.attemptsPath);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

export function qualificationAttemptFingerprint(input: {
  readonly request: OpenRouterGenerationRequest;
  readonly wireRequest: OpenRouterGenerationRequest;
  readonly endpoint?: string;
  readonly maxCallCostMicros: number;
  readonly aggregateCostCapMicros: number;
  readonly billingBasisSha256?: string;
  readonly candidateAdmission?: ReportDevCandidateAdmission;
}): string {
  const endpoint = input.endpoint ?? OPENROUTER_DEFAULT_ENDPOINT;
  const wireBody = JSON.stringify(buildOpenRouterWirePayload(input.wireRequest));
  return sha256Canonical({
    request: input.request,
    endpoint,
    idempotencyHeader: input.request.idempotencyKey,
    exactWireBodySha256: sha256Text(wireBody),
    maximumCallCostMicros: input.maxCallCostMicros,
    aggregateCostCapMicros: input.aggregateCostCapMicros,
    billingBasisSha256: input.billingBasisSha256 ?? reportBillingBasisSha256(input.wireRequest.model),
    ...(input.candidateAdmission ? { candidateAdmission: input.candidateAdmission } : {}),
  });
}

/** Journals exact request pins and replays only durably completed provider results. */
export class JournaledPwrp71Transport implements OpenRouterTransport {
  constructor(input: {
    readonly store: ProviderAttemptStore;
    readonly transport: OpenRouterTransport;
    readonly endpoint?: string;
    /** Optional workflow-specific provider restriction; ordinary qualification keeps the default policy. */
    readonly providerPolicy?: OpenRouterRequestProviderPolicy;
    /** Admission exception for one fixed, unqualified report-dev candidate. */
    readonly candidateAdmission?: ReportDevCandidateAdmission;
    readonly maxCallCostMicros?: number;
    readonly aggregateCostCapMicros?: number;
    /** Legacy alias retained for existing offline/test callers. */
    readonly costCapMicros?: number;
    readonly usageStatus?: "reported" | "mock";
    /** Local-only comparison values; never included in the durable attempt record. */
    readonly privacyIdentityContext?: ProviderPrivacyIdentityContext;
    /** Local-only HTTP metadata checked before reservation; never persisted. */
    readonly outboundMetadataStrings?: readonly string[];
    readonly now?: () => Date;
    /** Optional local development evidence sink, invoked only after both privacy checks. */
    readonly onRequest?: (request: OpenRouterGenerationRequest, wireRequest: OpenRouterGenerationRequest) => void | Promise<void>;
    readonly onResult?: (request: OpenRouterGenerationRequest, result: OpenRouterGenerationResult) => void | Promise<void>;
  }) {
    this.store = input.store;
    this.transport = input.transport;
    this.endpoint = input.endpoint ?? OPENROUTER_DEFAULT_ENDPOINT;
    this.providerPolicy = input.providerPolicy ?? GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY;
    if (this.providerPolicy.data_collection !== "deny" || this.providerPolicy.require_parameters !== true) {
      throw new QualificationAttemptError("budget_blocked", "PWRP 7.1 test and qualification requests require provider data collection to be denied and strict request parameters.");
    }
    this.candidateAdmission = input.candidateAdmission;
    this.maxCallCostMicros = input.maxCallCostMicros ?? input.costCapMicros ?? 0;
    this.aggregateCostCapMicros = input.aggregateCostCapMicros ?? input.costCapMicros ?? 0;
    this.usageStatus = input.usageStatus ?? "reported";
    this.privacyIdentityContext = input.privacyIdentityContext;
    this.outboundMetadataStrings = input.outboundMetadataStrings ?? [];
    this.now = input.now ?? (() => new Date());
    this.onRequest = input.onRequest;
    this.onResult = input.onResult;
  }

  private readonly store: ProviderAttemptStore;
  private readonly transport: OpenRouterTransport;
  private readonly providerPolicy: OpenRouterRequestProviderPolicy;
  private readonly candidateAdmission?: ReportDevCandidateAdmission;
  readonly endpoint: string;
  private readonly maxCallCostMicros: number;
  private readonly aggregateCostCapMicros: number;
  private readonly usageStatus: "reported" | "mock";
  private readonly privacyIdentityContext?: ProviderPrivacyIdentityContext;
  private readonly outboundMetadataStrings: readonly string[];
  private readonly now: () => Date;
  private readonly onRequest?: (request: OpenRouterGenerationRequest, wireRequest: OpenRouterGenerationRequest) => void | Promise<void>;
  private readonly onResult?: (request: OpenRouterGenerationRequest, result: OpenRouterGenerationResult) => void | Promise<void>;

  async generate(request: OpenRouterGenerationRequest, localIdentityContext?: ProviderPrivacyIdentityContext): Promise<OpenRouterGenerationResult> {
    const identityContext = mergeProviderPrivacyIdentityContexts(this.privacyIdentityContext, localIdentityContext);
    try {
      assertProviderRequestPrivacy(request, { identityContext, outboundStrings: [this.endpoint, ...this.outboundMetadataStrings] });
    } catch {
      throw new QualificationAttemptError("budget_blocked", "Provider request was rejected by the local privacy boundary.");
    }
    try {
      validatePositiveMicros(this.maxCallCostMicros, "maxCallCostMicros");
      validatePositiveMicros(this.aggregateCostCapMicros, "aggregateCostCapMicros");
    } catch (error) {
      throw new QualificationAttemptError("budget_blocked", error instanceof Error ? error.message : "Invalid provider spending limits.");
    }
    const wireRequest: OpenRouterGenerationRequest = {
      ...request,
      schema: projectOpenRouterStrictSchemaObject(request.schema),
      providerPolicy: this.providerPolicy,
      promptCacheOptions: { mode: "explicit" },
      includeUsage: true,
    };
    try {
      // The durable journal stores both forms. Recheck the exact pinned wire
      // request, including injected provider policy, before persisting either.
      assertProviderRequestPrivacy(wireRequest, { identityContext, outboundStrings: [this.endpoint, ...this.outboundMetadataStrings] });
    } catch {
      throw new QualificationAttemptError("budget_blocked", "Provider request was rejected by the local privacy boundary.");
    }
    await this.onRequest?.(request, wireRequest);
    const startedAt = this.now();
    const begun = await this.store.begin({
      request,
      wireRequest,
      maxCallCostMicros: this.maxCallCostMicros,
      aggregateCostCapMicros: this.aggregateCostCapMicros,
      usageStatus: this.usageStatus,
      ...(this.candidateAdmission ? { candidateAdmission: this.candidateAdmission } : {}),
      endpoint: this.endpoint,
      startedAt,
    });
    if (begun.reused) {
      const result = structuredClone(begun.record.providerResult!);
      validateProviderResult(request, result, begun.record);
      await this.onResult?.(request, result);
      return result;
    }
    const startedMs = Date.now();
    let result: OpenRouterGenerationResult;
    authorizePwrp71BudgetedRequest(wireRequest);
    try {
      result = await this.transport.generate(wireRequest, identityContext);
      await this.store.complete(request.idempotencyKey, result, Date.now() - startedMs, this.now(), this.usageStatus);
    } catch (error) {
      await this.store.markUnknown(request.idempotencyKey, error, Date.now() - startedMs, this.now());
      throw error instanceof OpenRouterTransportError ? error : new OpenRouterTransportError("network", "Qualification provider call ended without a durable response.", { retryable: false, cause: error });
    } finally {
      revokePwrp71BudgetAuthorization(wireRequest);
    }
    validateProviderResult(request, result, begun.record);
    await this.onResult?.(request, result);
    return result;
  }
}

function accountedCostMicros(attempt: QualificationAttemptRecord): number {
  if (attempt.status === "completed") {
    if (attempt.usageStatus === "mock") return 0;
    return attempt.usage?.costMicros ?? attempt.reservedCostMicros ?? attempt.locallyEstimatedCostMicros;
  }
  return attempt.reservedCostMicros ?? attempt.locallyEstimatedCostMicros;
}

function validateProviderResult(request: OpenRouterGenerationRequest, result: OpenRouterGenerationResult, record: QualificationAttemptRecord): void {
  const usage = result.usage;
  if (usage.currency !== "USD" || !Number.isSafeInteger(usage.costMicros) || usage.costMicros < 0) {
    throw new OpenRouterTransportError("protocol", "Provider usage did not report a valid nonnegative USD cost.", { retryable: false });
  }
  if (usage.model !== "offline/mock" && usage.model !== request.model) {
    throw new OpenRouterTransportError("protocol", `OpenRouter returned model ${usage.model}, but the qualification request pinned ${request.model}.`, { retryable: false });
  }
  const maximumCallCostMicros = record.maximumCallCostMicros;
  const reservedCostMicros = record.reservedCostMicros;
  if (record.usageStatus !== "mock" && maximumCallCostMicros !== undefined
    && (usage.costMicros > maximumCallCostMicros || (reservedCostMicros !== undefined && usage.costMicros > reservedCostMicros))) {
    throw new OpenRouterTransportError("protocol", `Provider-reported charge ${usage.costMicros} micros exceeded the pre-dispatch reservation ${reservedCostMicros ?? "unknown"} or per-call limit ${maximumCallCostMicros}.`, { retryable: false });
  }
}

export function providerResultDigest(result: OpenRouterGenerationResult): string {
  return sha256Canonical(result);
}

export function providerResultReportedUsage(result: OpenRouterGenerationResult): OpenRouterUsage {
  return result.usage;
}
