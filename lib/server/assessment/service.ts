import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PATTERNWORK_CONTRACT_ID,
  PATTERNWORK_INTEGRITY_CONTRACT_ID,
  PATTERNWORK_PACKAGE_VERSION,
  PATTERNWORK_PROMPT_RELEASE,
  loadSourceManifest,
  loadStructuredInstrumentManifest,
} from "@/lib/question-engine";
import {
  constantTimeEqual,
  decryptJson,
  decryptString,
  emailLookupHash,
  encryptJson,
  encryptString,
  encryptionKeyringFromEnv,
  normalizeEmail,
  issueScopedAccessToken,
  scopedAccessTokenHash,
  sha256,
  type EncryptionKeyring,
} from "@/lib/server/security";
import { AssessmentError } from "./errors.ts";
import { getResumeLinkDelivery, type ResumeLinkDelivery } from "./link-delivery.ts";
import { canCompletePass, createInitialRoutingState, pauseRoutingState, resumeRoutingState, routeAssessmentResponse, startPassTwo, toAssessmentStateView } from "./routing.ts";
import { abandonedRetentionExpiresAt, completedRetentionExpiresAt, planExpiredAssessmentDeletion } from "./retention.ts";
import type { AssessmentPass, AssessmentResponseInput, AssessmentRoutingState } from "./types.ts";
import { defaultWorkflowEnqueuer, type WorkflowEnqueuer } from "./workflow-adapter.ts";

const ACCESS_TOKEN_SCOPE = "RESUME_ASSESSMENT" as const;

type Database = PrismaClient;

export interface AssessmentServiceDependencies {
  readonly db?: Database;
  readonly keyring?: EncryptionKeyring;
  readonly emailHmacKey?: Uint8Array;
  readonly delivery?: ResumeLinkDelivery;
  readonly enqueueWorkflow?: WorkflowEnqueuer;
  readonly now?: () => Date;
}

function deps(input: AssessmentServiceDependencies = {}) {
  return {
    db: input.db ?? prisma,
    keyring: input.keyring ?? encryptionKeyringFromEnv(),
    emailHmacKey: input.emailHmacKey,
    delivery: input.delivery ?? getResumeLinkDelivery(),
    enqueueWorkflow: input.enqueueWorkflow ?? defaultWorkflowEnqueuer,
    now: input.now ?? (() => new Date()),
  };
}

function asEncrypted(row: { stateCiphertext: Uint8Array; stateNonce: Uint8Array; encryptionKeyVersion: string }) {
  return { ciphertext: Buffer.from(row.stateCiphertext), nonce: Buffer.from(row.stateNonce), keyVersion: row.encryptionKeyVersion };
}

function prismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value);
}

function statePurpose(sessionId: string) { return `patternwork:assessment-state:${sessionId}`; }
function emailPurpose(sessionId: string) { return `patternwork:assessment-email:${sessionId}`; }
function responsePurpose(sessionId: string, interactionInstanceId: string) { return `patternwork:assessment-response:${sessionId}:${interactionInstanceId}`; }
function snapshotPurpose(sessionId: string, completedPass: number) { return `patternwork:assessment-snapshot:${sessionId}:pass-${completedPass}`; }

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

let structuredManifestPromise: ReturnType<typeof loadStructuredInstrumentManifest> | undefined;
async function authoredInteraction(current: AssessmentRoutingState["currentInteraction"]) {
  if (!current) return null;
  structuredManifestPromise ??= loadStructuredInstrumentManifest();
  const manifest = await structuredManifestPromise;
  const definition = manifest.itemById.get(current.bankItemId);
  if (!definition) return current;
  return {
    ...current,
    intensity: Math.min(3, Math.max(0, definition.burden.numericIntensity ?? current.intensity)) as 0 | 1 | 2 | 3,
    authored: {
      prompt: definition.prompt,
      mechanic: definition.mechanic,
      eligibility: definition.eligibility,
      burden: definition.burden,
      optionGroups: definition.optionGroups,
      responseLibraries: definition.responseLibraryIds.flatMap((libraryId) => {
        const library = manifest.responseLibraryById.get(libraryId);
        return library ? [{ libraryId: library.libraryId, title: library.title, options: library.options }] : [];
      }),
      limits: definition.limits,
      recovery: definition.recovery,
    },
  };
}

function responseSafetySignals(value: unknown): { userArousal: "low" | "unknown" | "elevated" | "high"; unsafeContext: boolean } {
  const strings: string[] = [];
  const visit = (candidate: unknown) => {
    if (typeof candidate === "string") strings.push(candidate.normalize("NFKC").toLowerCase());
    else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (candidate && typeof candidate === "object") Object.values(candidate as Record<string, unknown>).forEach(visit);
  };
  visit(value);
  const high = strings.some((entry) => /(^|[-_ ])(too[-_ ]much|stop|arousal[-_ ]high|overwhelmed)([-_ ]|$)/.test(entry));
  const elevated = strings.some((entry) => /(^|[-_ ])(arousal[-_ ]elevated|distressed|harder)([-_ ]|$)/.test(entry));
  const unsafeContext = strings.some((entry) => /(^|[-_ ])(unsafe|threatening|controlling|coercive)([-_ ]|$)/.test(entry));
  return { userArousal: high ? "high" : elevated ? "elevated" : "unknown", unsafeContext };
}

async function ensureSourceRelease(database: Database) {
  const manifest = await loadSourceManifest();
  const manifestSha = sha256(canonicalize(manifest));
  return database.patternworkV31SourceRelease.upsert({
    where: { sourceManifestSha256: manifestSha },
    update: {},
    create: {
      contractId: PATTERNWORK_CONTRACT_ID,
      integrityContractId: PATTERNWORK_INTEGRITY_CONTRACT_ID,
      packageVersion: PATTERNWORK_PACKAGE_VERSION,
      promptRelease: PATTERNWORK_PROMPT_RELEASE,
      sourceManifestSha256: manifestSha,
      sourceManifestJson: manifest as unknown as Prisma.InputJsonValue,
    },
  });
}

async function createAccessToken(database: Database | Prisma.TransactionClient, assessmentSessionId: string, now: Date, scope: "RESUME_ASSESSMENT" | "VIEW_REPORT" = ACCESS_TOKEN_SCOPE) {
  const issued = issueScopedAccessToken(scope, now);
  await database.patternworkV31AccessToken.create({ data: { assessmentSessionId, tokenHash: issued.tokenHash, purpose: scope, expiresAt: issued.expiresAt } });
  return issued;
}

function resumeUrl(baseUrl: string, token: string): string {
  const url = new URL("/api/assessment/resume", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function startAssessment(
  input: { email: string; consentVersion: string; baseUrl: string },
  dependencies: AssessmentServiceDependencies = {},
) {
  const { db, keyring, emailHmacKey, delivery, now } = deps(dependencies);
  const timestamp = now();
  const email = normalizeEmail(input.email);
  const sourceRelease = await ensureSourceRelease(db);
  const sessionId = `pwas_${randomUUID()}`;
  const state = createInitialRoutingState(1);
  const encryptedState = encryptJson(state, statePurpose(sessionId), keyring);
  const encryptedEmail = encryptString(email, emailPurpose(sessionId), keyring);
  const session = await db.patternworkV31AssessmentSession.create({
    data: {
      id: sessionId,
      contactEmailHash: emailLookupHash(email, emailHmacKey),
      contactEmailCiphertext: prismaBytes(encryptedEmail.ciphertext),
      contactEmailNonce: prismaBytes(encryptedEmail.nonce),
      sourceReleaseId: sourceRelease.id,
      consentVersion: input.consentVersion,
      consentedAt: timestamp,
      status: "IN_PROGRESS",
      currentPass: 1,
      currentStage: state.stage,
      safeResumeStage: state.safeResumeStage,
      stateCiphertext: prismaBytes(encryptedState.ciphertext),
      stateNonce: prismaBytes(encryptedState.nonce),
      encryptionKeyVersion: encryptedState.keyVersion,
      expiresAt: abandonedRetentionExpiresAt(timestamp),
      retentionExpiresAt: abandonedRetentionExpiresAt(timestamp),
    },
  });
  const access = await createAccessToken(db, session.id, timestamp);
  await delivery.deliver({ email, resumeUrl: resumeUrl(input.baseUrl, access.token), expiresAt: access.expiresAt });
  return { sessionId: session.id, state: await hydrateStateView(db, session, state, keyring) };
}

export async function requestAssessmentResumeLink(
  input: { email: string; baseUrl: string },
  dependencies: AssessmentServiceDependencies = {},
): Promise<void> {
  const { db, emailHmacKey, delivery, keyring, now } = deps(dependencies);
  const email = normalizeEmail(input.email);
  const emailHash = emailLookupHash(email, emailHmacKey);
  const session = await db.patternworkV31AssessmentSession.findFirst({
    where: { contactEmailHash: emailHash, status: { in: ["IN_PROGRESS", "PASS1_COMPLETE", "PASS2_IN_PROGRESS", "PAUSED"] }, retentionExpiresAt: { gt: now() } },
    orderBy: { updatedAt: "desc" },
  });
  if (!session || !constantTimeEqual(emailHash, session.contactEmailHash ?? "")) return;
  // Decryption verifies that the lookup record is bound to the same normalized address.
  if (!session.contactEmailCiphertext || !session.contactEmailNonce) return;
  const storedEmail = decryptString({ ciphertext: Buffer.from(session.contactEmailCiphertext), nonce: Buffer.from(session.contactEmailNonce), keyVersion: session.encryptionKeyVersion }, emailPurpose(session.id), keyring);
  if (!constantTimeEqual(storedEmail, email)) return;
  const access = await createAccessToken(db, session.id, now());
  await delivery.deliver({ email, resumeUrl: resumeUrl(input.baseUrl, access.token), expiresAt: access.expiresAt });
}

export async function requestReportAccessLink(
  input: { email: string; baseUrl: string },
  dependencies: AssessmentServiceDependencies = {},
): Promise<void> {
  const { db, emailHmacKey, delivery, keyring, now } = deps(dependencies);
  const email = normalizeEmail(input.email);
  const emailHash = emailLookupHash(email, emailHmacKey);
  const session = await db.patternworkV31AssessmentSession.findFirst({
    where: { contactEmailHash: emailHash, status: { in: ["PASS1_COMPLETE", "PASS2_IN_PROGRESS", "COMPLETE"] }, retentionExpiresAt: { gt: now() } },
    orderBy: { updatedAt: "desc" },
  });
  if (!session || !constantTimeEqual(emailHash, session.contactEmailHash ?? "") || !session.contactEmailCiphertext || !session.contactEmailNonce) return;
  const storedEmail = decryptString({ ciphertext: Buffer.from(session.contactEmailCiphertext), nonce: Buffer.from(session.contactEmailNonce), keyVersion: session.encryptionKeyVersion }, emailPurpose(session.id), keyring);
  if (!constantTimeEqual(storedEmail, email)) return;
  const access = await createAccessToken(db, session.id, now(), "VIEW_REPORT");
  const url = new URL("/reports", input.baseUrl);
  url.searchParams.set("token", access.token);
  await delivery.deliver({ email, resumeUrl: url.toString(), expiresAt: access.expiresAt });
}

export async function consumeAssessmentAccessToken(token: string, dependencies: AssessmentServiceDependencies = {}) {
  const { db, now } = deps(dependencies);
  const digest = scopedAccessTokenHash(token, ACCESS_TOKEN_SCOPE);
  return db.$transaction(async (tx) => {
    const record = await tx.patternworkV31AccessToken.findUnique({ where: { tokenHash: digest }, include: { assessmentSession: true } });
    if (!record || !constantTimeEqual(record.tokenHash, digest) || record.purpose !== ACCESS_TOKEN_SCOPE) throw new AssessmentError("not_found", "Access link is invalid.");
    const timestamp = now();
    if (record.revokedAt || record.usedAt) throw new AssessmentError("replayed", "Access link has already been used.");
    if (record.expiresAt <= timestamp || (record.assessmentSession.retentionExpiresAt && record.assessmentSession.retentionExpiresAt <= timestamp)) throw new AssessmentError("expired", "Access link has expired.");
    const consumed = await tx.patternworkV31AccessToken.updateMany({ where: { id: record.id, usedAt: null, revokedAt: null, expiresAt: { gt: timestamp } }, data: { usedAt: timestamp } });
    if (consumed.count !== 1) throw new AssessmentError("replayed", "Access link has already been used.");
    return { sessionId: record.assessmentSessionId };
  }, { isolationLevel: "Serializable" });
}

export async function getAssessmentState(sessionId: string, dependencies: AssessmentServiceDependencies = {}) {
  const { db, keyring, now } = deps(dependencies);
  const session = await db.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === "ABANDONED" || (session.retentionExpiresAt && session.retentionExpiresAt <= now())) throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
  const state = decryptJson<AssessmentRoutingState>(asEncrypted(session), statePurpose(session.id), keyring);
  const hydrated = await hydrateStateView(db, session, state, keyring);
  return { session, routingState: state, state: hydrated };
}

async function hydrateStateView(
  client: Database | Prisma.TransactionClient,
  session: Awaited<ReturnType<Database["patternworkV31AssessmentSession"]["findUniqueOrThrow"]>>,
  routingState: AssessmentRoutingState,
  keyring: EncryptionKeyring,
) {
  const base = toAssessmentStateView(session.id, session.status as "IN_PROGRESS" | "PASS1_COMPLETE" | "PASS2_IN_PROGRESS" | "COMPLETE" | "PAUSED", session.optimisticRevision, routingState);
  const currentResponse = routingState.currentInteraction ? await client.patternworkV31AssessmentResponse.findUnique({ where: { pw31_session_interaction: { assessmentSessionId: session.id, interactionInstanceId: routingState.currentInteraction.interactionInstanceId } } }) : null;
  const saved = currentResponse ? decryptJson<{ response: Prisma.JsonValue }>({ ciphertext: Buffer.from(currentResponse.responseCiphertext), nonce: Buffer.from(currentResponse.responseNonce), keyVersion: currentResponse.encryptionKeyVersion }, responsePurpose(session.id, currentResponse.interactionInstanceId), keyring) : null;
  const snapshots = await client.patternworkV31AssessmentSnapshot.findMany({ where: { assessmentSessionId: session.id }, include: { reportRuns: { include: { artifact: true } } } });
  const runs = snapshots.flatMap((snapshot) => snapshot.reportRuns);
  const reportStatus = runs.some((run) => run.artifact?.artifactStatus === "ACTIVE") ? "READY" : runs.some((run) => run.status === "FAILED" || run.artifact?.artifactStatus === "FAILED") ? "FAILED" : snapshots.length > 0 ? "GENERATING" : "NOT_STARTED";
  const ready = runs.find((run) => run.artifact?.artifactStatus === "ACTIVE")?.artifact;
  return {
    ...base,
    currentInteraction: await authoredInteraction(routingState.currentInteraction),
    currentResponse: currentResponse && saved ? { completionState: currentResponse.completionState as "PARTIAL" | "COMPLETED" | "SKIPPED", response: saved.response, responseOrder: Array.isArray(currentResponse.responseOrderJson) ? currentResponse.responseOrderJson.filter((entry): entry is string => typeof entry === "string") : [] } : null,
    reportStatus,
    reportReadyUrl: ready ? `/reports/${ready.reportId}` : null,
  } as const;
}

export async function saveAssessmentResponse(
  sessionId: string,
  input: AssessmentResponseInput & { expectedRevision: number; idempotencyKey: string },
  dependencies: AssessmentServiceDependencies = {},
) {
  const { db, keyring, now } = deps(dependencies);
  const responseId = `pwr_${sha256(`${sessionId}:${input.idempotencyKey}`).slice(0, 40)}`;
  const requestSha256 = sha256(canonicalize({ interactionInstanceId: input.interactionInstanceId, completionState: input.completionState, response: input.response ?? null, responseOrder: input.responseOrder ?? [] }));
  return db.$transaction(async (tx) => {
    const session = await tx.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
    if (!session || !["IN_PROGRESS", "PASS2_IN_PROGRESS", "PAUSED"].includes(session.status)) throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
    const replay = await tx.patternworkV31AssessmentResponse.findUnique({ where: { pw31_session_response: { assessmentSessionId: sessionId, responseId } } });
    if (replay) {
      if (!constantTimeEqual(replay.requestSha256, requestSha256)) throw new AssessmentError("conflict", "Idempotency-Key was already used for a different response.");
      const current = await getAssessmentStateWithClient(tx, sessionId, keyring);
      return current;
    }
    if (session.optimisticRevision !== input.expectedRevision) throw new AssessmentError("conflict", "Assessment state has changed.");
    const state = decryptJson<AssessmentRoutingState>(asEncrypted(session), statePurpose(session.id), keyring);
    const current = state.currentInteraction;
    if (!current || current.interactionInstanceId !== input.interactionInstanceId || (input.bankItemId && current.bankItemId !== input.bankItemId)) throw new AssessmentError("invalid", "Response does not match the current interaction.");
    const timestamp = now();
    const encryptedResponse = encryptJson({ response: input.response ?? null }, responsePurpose(sessionId, input.interactionInstanceId), keyring);
    const safety = responseSafetySignals(input.response);
    const routedInput = { ...input, bankItemId: current.bankItemId, userArousal: safety.userArousal, unsafeContext: safety.unsafeContext };
    const nextState = input.completionState === "PARTIAL" ? state : routeAssessmentResponse(state, routedInput);
    const encryptedState = encryptJson(nextState, statePurpose(sessionId), keyring);
    await tx.patternworkV31AssessmentResponse.upsert({
      where: { pw31_session_interaction: { assessmentSessionId: sessionId, interactionInstanceId: input.interactionInstanceId } },
      create: {
        assessmentSessionId: sessionId,
        responseId,
        interactionInstanceId: input.interactionInstanceId,
        bankItemId: current.bankItemId,
        bankItemVersion: current.bankItemVersion,
        administrationSequence: current.administrationSequence,
        stage: current.stage,
        completionState: input.completionState,
        requestSha256,
        responseOrderJson: [...(input.responseOrder ?? [])],
        responseCiphertext: prismaBytes(encryptedResponse.ciphertext),
        responseNonce: prismaBytes(encryptedResponse.nonce),
        encryptionKeyVersion: encryptedResponse.keyVersion,
        answeredAt: input.completionState === "COMPLETED" ? timestamp : null,
        skippedAt: input.completionState === "SKIPPED" ? timestamp : null,
      },
      update: {
        responseId,
        completionState: input.completionState,
        requestSha256,
        responseOrderJson: [...(input.responseOrder ?? [])],
        responseCiphertext: prismaBytes(encryptedResponse.ciphertext),
        responseNonce: prismaBytes(encryptedResponse.nonce),
        encryptionKeyVersion: encryptedResponse.keyVersion,
        answeredAt: input.completionState === "COMPLETED" ? timestamp : null,
        skippedAt: input.completionState === "SKIPPED" ? timestamp : null,
      },
    });
    const updated = await tx.patternworkV31AssessmentSession.updateMany({
      where: { id: sessionId, optimisticRevision: input.expectedRevision },
      data: {
        status: session.status === "PAUSED" ? (nextState.pass === 1 ? "IN_PROGRESS" : "PASS2_IN_PROGRESS") : session.status,
        currentStage: nextState.stage,
        safeResumeStage: nextState.safeResumeStage,
        stateCiphertext: prismaBytes(encryptedState.ciphertext),
        stateNonce: prismaBytes(encryptedState.nonce),
        encryptionKeyVersion: encryptedState.keyVersion,
        optimisticRevision: { increment: 1 },
        expiresAt: abandonedRetentionExpiresAt(timestamp),
        retentionExpiresAt: abandonedRetentionExpiresAt(timestamp),
      },
    });
    if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
    return getAssessmentStateWithClient(tx, sessionId, keyring);
  }, { isolationLevel: "Serializable" });
}

async function getAssessmentStateWithClient(tx: Prisma.TransactionClient, sessionId: string, keyring: EncryptionKeyring) {
  const session = await tx.patternworkV31AssessmentSession.findUniqueOrThrow({ where: { id: sessionId } });
  const routingState = decryptJson<AssessmentRoutingState>(asEncrypted(session), statePurpose(session.id), keyring);
  return { state: await hydrateStateView(tx, session, routingState, keyring) };
}

export async function setAssessmentPause(
  sessionId: string,
  input: { expectedRevision: number; action: "pause" | "resume" },
  dependencies: AssessmentServiceDependencies = {},
) {
  const { db, keyring, now } = deps(dependencies);
  return db.$transaction(async (tx) => {
    const session = await tx.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
    if (session.optimisticRevision !== input.expectedRevision) throw new AssessmentError("conflict", "Assessment state has changed.");
    const state = decryptJson<AssessmentRoutingState>(asEncrypted(session), statePurpose(session.id), keyring);
    const next = input.action === "pause" ? pauseRoutingState(state) : resumeRoutingState(state);
    const encrypted = encryptJson(next, statePurpose(sessionId), keyring);
    const timestamp = now();
    const status = input.action === "pause" ? "PAUSED" : next.pass === 1 ? "IN_PROGRESS" : "PASS2_IN_PROGRESS";
    const updated = await tx.patternworkV31AssessmentSession.updateMany({ where: { id: sessionId, optimisticRevision: input.expectedRevision }, data: { status, stateCiphertext: prismaBytes(encrypted.ciphertext), stateNonce: prismaBytes(encrypted.nonce), encryptionKeyVersion: encrypted.keyVersion, safeResumeStage: next.safeResumeStage, optimisticRevision: { increment: 1 }, expiresAt: abandonedRetentionExpiresAt(timestamp), retentionExpiresAt: abandonedRetentionExpiresAt(timestamp) } });
    if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
    return getAssessmentStateWithClient(tx, sessionId, keyring);
  }, { isolationLevel: "Serializable" });
}

export async function completeAssessmentPass(
  sessionId: string,
  input: { expectedRevision: number; completedPass: AssessmentPass; action?: "finish" | "continue" },
  dependencies: AssessmentServiceDependencies = {},
) {
  const { db, keyring, enqueueWorkflow, now } = deps(dependencies);
  const frozen = await db.$transaction(async (tx) => {
    const session = await tx.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AssessmentError("invalid", "Pass does not match current assessment state.");
    const existing = await tx.patternworkV31AssessmentSnapshot.findFirst({ where: { assessmentSessionId: sessionId, completedPass: input.completedPass } });
    if (existing) {
      if (input.completedPass === 1 && input.action === "continue" && session.currentPass === 1) {
        const state = decryptJson<AssessmentRoutingState>(asEncrypted(session), statePurpose(session.id), keyring);
        const nextState = startPassTwo(state);
        const encryptedNext = encryptJson(nextState, statePurpose(sessionId), keyring);
        await tx.patternworkV31AssessmentSession.update({ where: { id: sessionId }, data: { status: "PASS2_IN_PROGRESS", currentPass: 2, currentStage: nextState.stage, safeResumeStage: nextState.safeResumeStage, stateCiphertext: prismaBytes(encryptedNext.ciphertext), stateNonce: prismaBytes(encryptedNext.nonce), encryptionKeyVersion: encryptedNext.keyVersion, optimisticRevision: { increment: 1 } } });
      }
      const current = await getAssessmentStateWithClient(tx, sessionId, keyring);
      return { ...current, snapshotId: existing.id };
    }
    if (session.currentPass !== input.completedPass) throw new AssessmentError("invalid", "Pass does not match current assessment state.");
    if (session.optimisticRevision !== input.expectedRevision) throw new AssessmentError("conflict", "Assessment state has changed.");
    const state = decryptJson<AssessmentRoutingState>(asEncrypted(session), statePurpose(session.id), keyring);
    if (!canCompletePass(state)) throw new AssessmentError("completion_blocked", "Required completion and resource-ending gates are not satisfied.");
    const responses = await tx.patternworkV31AssessmentResponse.findMany({ where: { assessmentSessionId: sessionId }, orderBy: { administrationSequence: "asc" } });
    const canonicalResponses = responses.map((response) => ({
      responseId: response.responseId,
      interactionInstanceId: response.interactionInstanceId,
      bankItemId: response.bankItemId,
      bankItemVersion: response.bankItemVersion,
      administrationSequence: response.administrationSequence,
      stage: response.stage,
      completionState: response.completionState,
      responseOrder: response.responseOrderJson,
      content: decryptJson<Prisma.JsonValue>({ ciphertext: Buffer.from(response.responseCiphertext), nonce: Buffer.from(response.responseNonce), keyVersion: response.encryptionKeyVersion }, responsePurpose(sessionId, response.interactionInstanceId), keyring),
    }));
    const timestamp = now();
    const snapshotId = `pwsn_${randomUUID()}`;
    const canonical = {
      snapshot_id: snapshotId,
      snapshot_revision: "1",
      contract_id: PATTERNWORK_CONTRACT_ID,
      integrity_contract_id: PATTERNWORK_INTEGRITY_CONTRACT_ID,
      packet_version: PATTERNWORK_PACKAGE_VERSION,
      assessment_completion: { completion_mode: `pass${input.completedPass}_complete`, last_completed_stage: state.safeResumeStage, safe_resume_stage: state.safeResumeStage, completed_at: timestamp.toISOString() },
      routing_state: state,
      responses: canonicalResponses,
    };
    const canonicalString = canonicalize(canonical);
    const encrypted = encryptJson(canonical, snapshotPurpose(sessionId, input.completedPass), keyring);
    const snapshot = await tx.patternworkV31AssessmentSnapshot.create({
      data: {
        id: snapshotId,
        assessmentSessionId: sessionId,
        snapshotId,
        snapshotRevision: "1",
        completedPass: input.completedPass,
        completionMode: `pass${input.completedPass}_complete`,
        lastCompletedStage: state.safeResumeStage,
        safeResumeStage: state.safeResumeStage,
        contractId: PATTERNWORK_CONTRACT_ID,
        integrityContractId: PATTERNWORK_INTEGRITY_CONTRACT_ID,
        packetVersion: PATTERNWORK_PACKAGE_VERSION,
        evidenceSha256: sha256(canonicalize(canonicalResponses)),
        scopeSha256: sha256(canonicalize({ sessionId, completedPass: input.completedPass, lastCompletedStage: state.safeResumeStage })),
        canonicalJsonSha256: sha256(canonicalString),
        canonicalJsonCiphertext: prismaBytes(encrypted.ciphertext),
        canonicalJsonNonce: prismaBytes(encrypted.nonce),
        encryptionKeyVersion: encrypted.keyVersion,
        completedAt: timestamp,
      },
    });
    const shouldContinue = input.completedPass === 1 && input.action === "continue";
    const nextState = shouldContinue ? startPassTwo(state) : state;
    const encryptedNextState = encryptJson(nextState, statePurpose(sessionId), keyring);
    const nextStatus = input.completedPass === 2 ? "COMPLETE" : shouldContinue ? "PASS2_IN_PROGRESS" : "PASS1_COMPLETE";
    const updated = await tx.patternworkV31AssessmentSession.updateMany({
      where: { id: sessionId, optimisticRevision: input.expectedRevision },
      data: {
        status: nextStatus,
        currentPass: shouldContinue ? 2 : input.completedPass,
        currentStage: nextState.stage,
        safeResumeStage: nextState.safeResumeStage,
        stateCiphertext: prismaBytes(encryptedNextState.ciphertext),
        stateNonce: prismaBytes(encryptedNextState.nonce),
        encryptionKeyVersion: encryptedNextState.keyVersion,
        optimisticRevision: { increment: 1 },
        completedAt: input.completedPass === 2 ? timestamp : null,
        expiresAt: input.completedPass === 2 ? null : abandonedRetentionExpiresAt(timestamp),
        retentionExpiresAt: input.completedPass === 2 ? completedRetentionExpiresAt(timestamp) : abandonedRetentionExpiresAt(timestamp),
      },
    });
    if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
    const current = await getAssessmentStateWithClient(tx, sessionId, keyring);
    return { ...current, snapshotId: snapshot.id };
  }, { isolationLevel: "Serializable" });
  // The workflow boundary is idempotent by immutable snapshot ID. It is invoked only
  // after commit so a worker can never observe a snapshot that later rolls back.
  const workflow = await enqueueWorkflow({ assessmentSessionId: sessionId, snapshotId: frozen.snapshotId, completedPass: input.completedPass });
  return { ...frozen, workflowRunId: workflow.workflowRunId };
}

export async function purgeAssessmentSession(sessionId: string, dependencies: AssessmentServiceDependencies = {}): Promise<void> {
  const { db } = deps(dependencies);
  await db.$transaction(async (tx) => {
    const snapshots = await tx.patternworkV31AssessmentSnapshot.findMany({ where: { assessmentSessionId: sessionId }, select: { id: true } });
    const snapshotIds = snapshots.map(({ id }) => id);
    const runs = await tx.patternworkV31ReportRun.findMany({ where: { assessmentSnapshotId: { in: snapshotIds } }, select: { id: true } });
    const runIds = runs.map(({ id }) => id);
    const artifacts = await tx.patternworkV31ReportArtifact.findMany({ where: { reportRunId: { in: runIds } }, select: { id: true } });
    const artifactIds = artifacts.map(({ id }) => id);
    await tx.patternworkV31ReportDelivery.deleteMany({ where: { reportArtifactId: { in: artifactIds } } });
    await tx.patternworkV31ReportArtifact.deleteMany({ where: { id: { in: artifactIds } } });
    await tx.patternworkV31ReportRun.deleteMany({ where: { id: { in: runIds } } });
    await tx.patternworkV31EvidencePacket.deleteMany({ where: { assessmentSnapshotId: { in: snapshotIds } } });
    await tx.patternworkV31AssessmentSnapshot.deleteMany({ where: { id: { in: snapshotIds } } });
    await tx.patternworkV31AssessmentResponse.deleteMany({ where: { assessmentSessionId: sessionId } });
    await tx.patternworkV31AccessToken.deleteMany({ where: { assessmentSessionId: sessionId } });
    await tx.patternworkV31AssessmentSession.delete({ where: { id: sessionId } });
  });
}

export async function purgeExpiredAssessmentSessions(dependencies: AssessmentServiceDependencies = {}) {
  const { db, now } = deps(dependencies);
  const candidates = await db.patternworkV31AssessmentSession.findMany({ select: { id: true, status: true, updatedAt: true, completedAt: true } });
  const plan = planExpiredAssessmentDeletion(candidates, now());
  for (const sessionId of [...plan.abandonedSessionIds, ...plan.completedSessionIds]) await purgeAssessmentSession(sessionId, dependencies);
  return plan;
}
