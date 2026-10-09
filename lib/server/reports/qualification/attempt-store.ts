import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical } from "../../../report-contracts/delivery-validator.ts";
import { QUALIFICATION_MODEL_ORDER } from "../../openrouter/policy.ts";
import { OpenRouterTransportError, type OpenRouterGenerationRequest, type OpenRouterGenerationResult, type OpenRouterTransport, type OpenRouterUsage } from "../../openrouter/types.ts";
import { projectOpenRouterStrictSchemaObject } from "../../openrouter/schema-projection.ts";
import { GPT6_LUNA_BILLING_BASIS_SHA256, GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY, maximumQuotedCallCostMicros, validatePositiveMicros } from "../../openrouter/qualification-budget.ts";
import { buildOpenRouterWirePayload, OPENROUTER_DEFAULT_ENDPOINT } from "../../openrouter/wire.ts";
import type { Pwrp71GenerationEvent } from "../generator.ts";

export type QualificationAttemptStatus = "started" | "completed" | "unknown";

export interface QualificationAttemptRecord {
  readonly attemptId: string;
  readonly requestFingerprint: string;
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
    readonly providerMetadataKeys?: readonly string[];
    readonly providerHints?: readonly string[];
    readonly retryable?: boolean;
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

/** A single-writer, repository-local, atomic JSON attempt ledger. */
export class FileQualificationAttemptStore {
  private static readonly inProcessLocks = new Set<string>();
  readonly attemptsPath: string;

  constructor(readonly runDirectory: string) {
    this.attemptsPath = path.join(runDirectory, "attempts.json");
  }

  async list(): Promise<readonly QualificationAttemptRecord[]> {
    return (await this.readFile()).attempts;
  }

  async get(attemptId: string): Promise<QualificationAttemptRecord | undefined> {
    return (await this.readFile()).attempts.find((attempt) => attempt.attemptId === attemptId);
  }

  async begin(input: {
    readonly request: OpenRouterGenerationRequest;
    readonly wireRequest: OpenRouterGenerationRequest;
    readonly maxCallCostMicros?: number;
    readonly aggregateCostCapMicros?: number;
    /** Legacy alias retained for archived tests/runs; new live callers pass both explicit limits. */
    readonly costCapMicros?: number;
    readonly usageStatus?: "reported" | "mock";
    readonly endpoint?: string;
    readonly startedAt: Date;
  }): Promise<{ readonly record: QualificationAttemptRecord; readonly reused: boolean }> {
    const maxCallCostMicros = input.maxCallCostMicros ?? input.costCapMicros;
    const aggregateCostCapMicros = input.aggregateCostCapMicros ?? input.costCapMicros;
    validatePositiveMicros(maxCallCostMicros, "maxCallCostMicros");
    validatePositiveMicros(aggregateCostCapMicros, "aggregateCostCapMicros");
    return this.mutate<{ readonly record: QualificationAttemptRecord; readonly reused: boolean }>((attempts) => {
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
      });
      const prior = attempts.find((attempt) => attempt.attemptId === input.request.idempotencyKey);
      if (prior) {
        if (prior.requestFingerprint !== fingerprint) {
          throw new QualificationAttemptError("resume_conflict", `Provider attempt ${prior.attemptId} no longer matches its source/input/model/schema request pins.`);
        }
        if (prior.status === "completed" && prior.providerResult) return { next: attempts, value: { record: prior, reused: true } };
        throw new QualificationAttemptError("attempt_uncertain", `Provider attempt ${prior.attemptId} is ${prior.status}; its result is not safe to repeat automatically.`);
      }

      const allowedTier = QUALIFICATION_MODEL_ORDER.find((tier) => tier.model === input.request.model && tier.reasoningEffort === input.request.reasoningEffort);
      if (!allowedTier) throw new QualificationAttemptError("resume_conflict", "Requested model/reasoning pair is outside the pinned qualification candidate policy.");
      const quotedCeilingMicros = usageStatus === "mock" ? 0 : maximumQuotedCallCostMicros(input.wireRequest);
      if (quotedCeilingMicros > maxCallCostMicros) {
        throw new QualificationAttemptError("budget_blocked", `Per-call ceiling blocked before dispatch: quoted ${quotedCeilingMicros} > maxCallCostMicros ${maxCallCostMicros}.`);
      }
      const reservedCostMicros = quotedCeilingMicros;
      const reserved = attempts.reduce((sum, attempt) => sum + accountedCostMicros(attempt), 0);
      if (reserved + reservedCostMicros > aggregateCostCapMicros) {
        throw new QualificationAttemptError("budget_blocked", `PWRP 7.1 aggregate budget blocked before dispatch: ${reserved} spent/reserved + ${reservedCostMicros} reserved > ${aggregateCostCapMicros} micros.`);
      }
      const record: QualificationAttemptRecord = {
        attemptId: input.request.idempotencyKey,
        requestFingerprint: fingerprint,
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
        billingBasisSha256: GPT6_LUNA_BILLING_BASIS_SHA256,
        wirePayloadSha256,
        usageStatus: "unknown",
      };
      return { next: [...attempts, record], value: { record, reused: false } };
    });
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
        ...(error.providerMetadataKeys === undefined ? {} : { providerMetadataKeys: error.providerMetadataKeys }),
        ...(error.providerHints === undefined ? {} : { providerHints: error.providerHints }),
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

  private async mutate<T>(fn: (attempts: readonly QualificationAttemptRecord[]) => { readonly next: readonly QualificationAttemptRecord[]; readonly value: T }): Promise<T> {
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
      const { next, value } = fn(current.attempts);
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
    await rename(temporary, this.attemptsPath);
  }
}

export function qualificationAttemptFingerprint(input: {
  readonly request: OpenRouterGenerationRequest;
  readonly wireRequest: OpenRouterGenerationRequest;
  readonly endpoint?: string;
  readonly maxCallCostMicros: number;
  readonly aggregateCostCapMicros: number;
  readonly billingBasisSha256?: string;
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
    billingBasisSha256: input.billingBasisSha256 ?? GPT6_LUNA_BILLING_BASIS_SHA256,
  });
}

/** Journals exact request pins and replays only durably completed provider results. */
export class JournaledPwrp71Transport implements OpenRouterTransport {
  constructor(input: {
    readonly store: FileQualificationAttemptStore;
    readonly transport: OpenRouterTransport;
    readonly maxCallCostMicros?: number;
    readonly aggregateCostCapMicros?: number;
    /** Legacy alias retained for existing offline/test callers. */
    readonly costCapMicros?: number;
    readonly usageStatus?: "reported" | "mock";
    readonly now?: () => Date;
    readonly onResult?: (request: OpenRouterGenerationRequest, result: OpenRouterGenerationResult) => void | Promise<void>;
  }) {
    this.store = input.store;
    this.transport = input.transport;
    this.maxCallCostMicros = input.maxCallCostMicros ?? input.costCapMicros ?? 0;
    this.aggregateCostCapMicros = input.aggregateCostCapMicros ?? input.costCapMicros ?? 0;
    this.usageStatus = input.usageStatus ?? "reported";
    this.now = input.now ?? (() => new Date());
    this.onResult = input.onResult;
  }

  private readonly store: FileQualificationAttemptStore;
  private readonly transport: OpenRouterTransport;
  private readonly maxCallCostMicros: number;
  private readonly aggregateCostCapMicros: number;
  private readonly usageStatus: "reported" | "mock";
  private readonly now: () => Date;
  private readonly onResult?: (request: OpenRouterGenerationRequest, result: OpenRouterGenerationResult) => void | Promise<void>;

  async generate(request: OpenRouterGenerationRequest): Promise<OpenRouterGenerationResult> {
    try {
      validatePositiveMicros(this.maxCallCostMicros, "maxCallCostMicros");
      validatePositiveMicros(this.aggregateCostCapMicros, "aggregateCostCapMicros");
    } catch (error) {
      throw new QualificationAttemptError("budget_blocked", error instanceof Error ? error.message : "Invalid provider spending limits.");
    }
    const wireRequest: OpenRouterGenerationRequest = {
      ...request,
      schema: projectOpenRouterStrictSchemaObject(request.schema),
      providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
      promptCacheOptions: { mode: "explicit" },
    };
    const startedAt = this.now();
    const begun = await this.store.begin({
      request,
      wireRequest,
      maxCallCostMicros: this.maxCallCostMicros,
      aggregateCostCapMicros: this.aggregateCostCapMicros,
      usageStatus: this.usageStatus,
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
    try {
      result = await this.transport.generate(wireRequest);
      await this.store.complete(request.idempotencyKey, result, Date.now() - startedMs, this.now(), this.usageStatus);
    } catch (error) {
      await this.store.markUnknown(request.idempotencyKey, error, Date.now() - startedMs, this.now());
      throw error instanceof OpenRouterTransportError ? error : new OpenRouterTransportError("network", "Qualification provider call ended without a durable response.", { retryable: false, cause: error });
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
