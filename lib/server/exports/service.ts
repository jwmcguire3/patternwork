import { prisma } from "@/lib/prisma";
import { loadStructuredInstrumentManifest, verifyPatternworkSourceIntegrity, type StructuredInstrumentManifest } from "@/lib/question-engine";
import { referencedLibraries } from "@/lib/server/assessment/trusted-evidence";
import {
  constantTimeEqual,
  decryptJson,
  decryptString,
  encryptionKeyringFromEnv,
  issueScopedAccessToken,
  scopedAccessTokenHash,
  sha256,
  type EncryptionKeyring,
} from "@/lib/server/security";
import { canonicalizeResponseExport, createPwre1Envelope } from "./canonical.ts";
import { getResponseExportLinkDelivery, type ResponseExportLinkDelivery } from "./delivery.ts";
import type { Pwre1AnswerGroup, Pwre1Content, Pwre1Envelope, ResponseExportGrant } from "./types.ts";

type Database = typeof prisma;

export interface ResponseExportDependencies {
  readonly db?: Database;
  readonly keyring?: EncryptionKeyring;
  readonly delivery?: ResponseExportLinkDelivery;
  readonly now?: () => Date;
}

interface ExportResponseRow {
  readonly responseId: string;
  readonly interactionInstanceId: string;
  readonly bankItemId: string;
  readonly bankItemVersion: string;
  readonly administrationSequence: number;
  readonly completionState: string;
  readonly responseCiphertext: Uint8Array;
  readonly responseNonce: Uint8Array;
  readonly encryptionKeyVersion: string;
  readonly answeredAt: Date | null;
  readonly skippedAt: Date | null;
  readonly updatedAt: Date;
}

interface ExportSnapshotRow {
  readonly assessmentSessionId: string;
  readonly snapshotId: string;
  readonly snapshotRevision: string;
  readonly completedPass: number;
  readonly completionMode: string;
  readonly lastCompletedStage: string;
  readonly safeResumeStage: string | null;
  readonly contractId: string;
  readonly integrityContractId: string;
  readonly packetVersion: string;
  readonly canonicalJsonSha256: string;
  readonly canonicalJsonCiphertext: Uint8Array;
  readonly canonicalJsonNonce: Uint8Array;
  readonly encryptionKeyVersion: string;
  readonly completedAt: Date;
  readonly frozenAt: Date;
  readonly assessmentSession: {
    readonly assessmentKey: string;
    readonly status: string;
    readonly retentionExpiresAt: Date | null;
    readonly sourceRelease: {
      readonly packageVersion: string;
      readonly promptRelease: string;
      readonly sourceManifestSha256: string;
    };
    readonly responses: readonly ExportResponseRow[];
  };
}

interface SnapshotResponseEntry {
  readonly responseId?: unknown;
  readonly interactionInstanceId?: unknown;
  readonly bankItemId?: unknown;
  readonly bankItemVersion?: unknown;
  readonly administrationSequence?: unknown;
  readonly completionState?: unknown;
  readonly responseOrder?: unknown;
}

const ANSWER_FIELDS = new Set([
  "choices", "rank", "zones", "relationship", "selectedOptionIds", "orderedOptionIds",
  "Before", "When it first hit", "What happened next", "Later / aftermath",
  "Person / role 1", "Person / role 2", "Contact frequency", "Emotional disclosure",
  "Asking for help", "Space", "windowOptionId",
]);

const FIELD_LABELS: Readonly<Record<string, string>> = {
  choices: "Choices",
  rank: "Ranked choices",
  zones: "Selected zones",
  relationship: "Relationship selections",
  selectedOptionIds: "Selections",
  orderedOptionIds: "Ordered selections",
  windowOptionId: "Selected time frame",
};

const USER_VISIBLE_SCALARS: Readonly<Record<string, { readonly fieldLabel: string; readonly labels: Readonly<Record<string, string>> }>> = {
  safetyContext: { fieldLabel: "Context safety", labels: { safe: "Generally safe", mixed: "Mixed or unstable", unsafe: "Threatening, coercive, or unsafe", unknown: "Prefer not to say or unknown" } },
  userArousal: { fieldLabel: "Activation", labels: { low: "Low", elevated: "Elevated", high: "High or too much", unknown: "Not sure" } },
  resourceSafetyClear: { fieldLabel: "Safety or resource step", labels: { true: "Ready to leave this step", false: "Not marked ready to leave this step" } },
  quotePermission: { fieldLabel: "Quote permission", labels: { true: "Permission granted", false: "Permission not granted" } },
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function responsePurpose(sessionId: string, interactionInstanceId: string): string {
  return `patternwork:assessment-response:${sessionId}:${interactionInstanceId}`;
}

function snapshotPurpose(sessionId: string, completedPass: number): string {
  return `patternwork:assessment-snapshot:${sessionId}:pass-${completedPass}`;
}

function selectedIds(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function resolveOptions(ids: readonly string[], catalog: ReadonlyMap<string, string>, context: string): string[] {
  return ids.map((optionId) => {
    const label = catalog.get(optionId);
    if (!label) throw new Error(`Authored option ${optionId} is unavailable for ${context}.`);
    return label;
  });
}

function userResponseFromEnvelope(value: unknown): { readonly response: Record<string, unknown>; readonly order?: readonly string[] } {
  const envelope = record(value);
  if (!envelope) throw new Error("Stored response envelope is malformed.");
  const v2 = record(envelope.userResponse);
  if (v2) return { response: v2, order: selectedIds(envelope.userResponseOrder) };
  const legacy = record(envelope.response);
  if (legacy) return { response: legacy };
  throw new Error("Stored response envelope contains no user response.");
}

export function buildPwre1Content(input: {
  readonly snapshot: ExportSnapshotRow;
  readonly canonicalSnapshot: unknown;
  readonly manifest: StructuredInstrumentManifest;
  readonly decryptedResponses: ReadonlyMap<string, unknown>;
}): Pwre1Content {
  const canonical = record(input.canonicalSnapshot);
  const snapshotEntries = canonical?.responses;
  if (!Array.isArray(snapshotEntries)) throw new Error("Frozen snapshot response membership is malformed.");
  if (input.snapshot.completedPass !== 1 && input.snapshot.completedPass !== 2) throw new Error("Unsupported completed pass for response export.");

  const rows = new Map(input.snapshot.assessmentSession.responses.map((row) => [row.interactionInstanceId, row]));
  const responses = snapshotEntries.map((rawEntry) => {
    const entry = rawEntry as SnapshotResponseEntry;
    if (typeof entry.interactionInstanceId !== "string" || typeof entry.responseId !== "string") throw new Error("Frozen snapshot response identity is malformed.");
    const row = rows.get(entry.interactionInstanceId);
    if (!row || row.responseId !== entry.responseId || row.bankItemId !== entry.bankItemId || row.bankItemVersion !== entry.bankItemVersion || row.administrationSequence !== entry.administrationSequence || row.completionState !== entry.completionState) {
      throw new Error("Encrypted response row no longer matches the frozen snapshot.");
    }
    if (row.completionState !== "PARTIAL" && row.completionState !== "COMPLETED" && row.completionState !== "SKIPPED") throw new Error("Stored response completion state is invalid.");
    const definition = input.manifest.itemById.get(row.bankItemId);
    if (!definition || definition.version !== row.bankItemVersion) throw new Error(`Authored response definition is unavailable for ${row.bankItemId}@${row.bankItemVersion}.`);

    const optionCatalog = new Map<string, string>();
    for (const option of definition.optionGroups.flatMap((group) => group.options)) optionCatalog.set(option.optionId, option.label);
    for (const library of referencedLibraries(input.manifest, definition.responseLibraryReferences, definition.responseLibraryIds)) {
      for (const option of library.options) optionCatalog.set(option.optionId, option.label);
    }

    const stored = userResponseFromEnvelope(input.decryptedResponses.get(row.interactionInstanceId));
    const semantic = record(stored.response.semantic) ?? {};
    const answerGroups: Pwre1AnswerGroup[] = [];
    for (const [field, value] of Object.entries(semantic)) {
      if (!ANSWER_FIELDS.has(field)) continue;
      const ids = selectedIds(value);
      if (ids.length === 0) continue;
      answerGroups.push({ fieldLabel: FIELD_LABELS[field] ?? field, selections: resolveOptions(ids, optionCatalog, `${row.bankItemId}.${field}`) });
    }
    for (const [field, descriptor] of Object.entries(USER_VISIBLE_SCALARS)) {
      if (!(field in semantic)) continue;
      const label = descriptor.labels[String(semantic[field])];
      if (label) answerGroups.push({ fieldLabel: descriptor.fieldLabel, selections: [label] });
    }
    const fallbackOrder = Array.isArray(entry.responseOrder) ? entry.responseOrder.filter((value): value is string => typeof value === "string") : [];
    const semanticOrder = selectedIds(semantic.orderedOptionIds).length > 0 ? selectedIds(semantic.orderedOptionIds) : selectedIds(semantic.rank);
    const order = stored.order && stored.order.length > 0 ? stored.order : semanticOrder.length > 0 ? semanticOrder : fallbackOrder;
    const completionState: "PARTIAL" | "COMPLETED" | "SKIPPED" = row.completionState;
    return {
      administrationSequence: row.administrationSequence,
      bankItem: { title: definition.title, prompt: definition.prompt },
      completion: { state: completionState, answeredAt: iso(row.answeredAt), skippedAt: iso(row.skippedAt), lastSavedAt: row.updatedAt.toISOString() },
      answerGroups,
      responseOrder: resolveOptions(order, optionCatalog, `${row.bankItemId}.responseOrder`),
      privateNote: typeof stored.response.privateNote === "string" ? stored.response.privateNote : null,
    };
  }).sort((left, right) => left.administrationSequence - right.administrationSequence);

  return {
    snapshot: {
      completedPass: input.snapshot.completedPass,
      completionMode: input.snapshot.completionMode,
      completedAt: input.snapshot.completedAt.toISOString(),
      frozenAt: input.snapshot.frozenAt.toISOString(),
    },
    responses,
  };
}

function dependencies(input: ResponseExportDependencies = {}) {
  return {
    db: input.db ?? prisma,
    keyring: input.keyring ?? encryptionKeyringFromEnv(),
    delivery: input.delivery ?? getResponseExportLinkDelivery(),
    now: input.now ?? (() => new Date()),
  };
}

export async function requestResponseExportLinkForSession(input: { readonly sessionId: string; readonly baseUrl: string }, provided: ResponseExportDependencies = {}): Promise<void> {
  const { db, keyring, delivery, now } = dependencies(provided);
  const timestamp = now();
  const session = await db.patternworkV31AssessmentSession.findFirst({
    where: { id: input.sessionId, status: { not: "ABANDONED" }, retentionExpiresAt: { gt: timestamp }, snapshots: { some: {} } },
  });
  if (!session || !session.contactEmailCiphertext || !session.contactEmailNonce) throw new Error("response_export_unavailable");
  const email = decryptString({ ciphertext: Buffer.from(session.contactEmailCiphertext), nonce: Buffer.from(session.contactEmailNonce), keyVersion: session.encryptionKeyVersion }, `patternwork:assessment-email:${session.id}`, keyring);
  const issued = issueScopedAccessToken("EXPORT_RESPONSES", timestamp);
  await db.patternworkV31AccessToken.create({ data: { assessmentSessionId: session.id, tokenHash: issued.tokenHash, purpose: "EXPORT_RESPONSES" as never, expiresAt: issued.expiresAt } });
  const url = new URL("/response-exports/consume", input.baseUrl);
  url.searchParams.set("token", issued.token);
  await delivery.deliver({ assessmentSessionId: session.id, idempotencySubject: issued.tokenHash, email, exportUrl: url.toString(), expiresAt: issued.expiresAt });
}

export async function consumeResponseExportToken(token: string, now = new Date(), database: Pick<Database, "$transaction"> = prisma): Promise<ResponseExportGrant> {
  const digest = scopedAccessTokenHash(token, "EXPORT_RESPONSES");
  return database.$transaction(async (tx) => {
    const record = await tx.patternworkV31AccessToken.findUnique({
      where: { tokenHash: digest },
      include: { assessmentSession: { include: { snapshots: { orderBy: [{ completedPass: "desc" }, { frozenAt: "desc" }], take: 1 } } } },
    });
    const session = record?.assessmentSession;
    const snapshot = session?.snapshots[0];
    if (!record || !session || !snapshot || !constantTimeEqual(record.tokenHash, digest) || record.purpose !== "EXPORT_RESPONSES" || record.usedAt || record.revokedAt || record.expiresAt <= now || session.status === "ABANDONED" || (session.retentionExpiresAt && session.retentionExpiresAt <= now)) throw new Error("invalid_response_export_access");
    const consumed = await tx.patternworkV31AccessToken.updateMany({ where: { id: record.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (consumed.count !== 1) throw new Error("invalid_response_export_access");
    return { sessionId: record.assessmentSessionId, snapshotId: snapshot.snapshotId, snapshotRevision: snapshot.snapshotRevision, expiresAt: record.expiresAt };
  }, { isolationLevel: "Serializable" });
}

export async function loadPinnedResponseExport(grant: ResponseExportGrant, provided: Pick<ResponseExportDependencies, "db" | "keyring" | "now"> = {}): Promise<Pwre1Envelope | null> {
  const db = provided.db ?? prisma;
  const keyring = provided.keyring ?? encryptionKeyringFromEnv();
  const now = provided.now ?? (() => new Date());
  const snapshot = await db.patternworkV31AssessmentSnapshot.findFirst({
    where: { assessmentSessionId: grant.sessionId, snapshotId: grant.snapshotId, snapshotRevision: grant.snapshotRevision },
    include: { assessmentSession: { include: { sourceRelease: true, responses: { orderBy: { administrationSequence: "asc" } } } } },
  }) as unknown as ExportSnapshotRow | null;
  if (!snapshot || snapshot.assessmentSession.status === "ABANDONED" || (snapshot.assessmentSession.retentionExpiresAt && snapshot.assessmentSession.retentionExpiresAt <= now())) return null;
  const canonicalSnapshot = decryptJson<unknown>({ ciphertext: Buffer.from(snapshot.canonicalJsonCiphertext), nonce: Buffer.from(snapshot.canonicalJsonNonce), keyVersion: snapshot.encryptionKeyVersion }, snapshotPurpose(snapshot.assessmentSessionId, snapshot.completedPass), keyring);
  if (sha256(canonicalizeResponseExport(canonicalSnapshot)) !== snapshot.canonicalJsonSha256) throw new Error("Frozen assessment snapshot digest mismatch.");

  const integrity = await verifyPatternworkSourceIntegrity();
  if (!integrity.ok || sha256(canonicalizeResponseExport(integrity.value)) !== snapshot.assessmentSession.sourceRelease.sourceManifestSha256) throw new Error("Authored source release does not match the frozen assessment.");
  const manifest = await loadStructuredInstrumentManifest();
  const decryptedResponses = new Map<string, unknown>();
  for (const response of snapshot.assessmentSession.responses) {
    decryptedResponses.set(response.interactionInstanceId, decryptJson<unknown>({ ciphertext: Buffer.from(response.responseCiphertext), nonce: Buffer.from(response.responseNonce), keyVersion: response.encryptionKeyVersion }, responsePurpose(grant.sessionId, response.interactionInstanceId), keyring));
  }
  return createPwre1Envelope(buildPwre1Content({ snapshot, canonicalSnapshot, manifest, decryptedResponses }));
}

export async function responseExportGrantIsCurrent(grant: ResponseExportGrant, now = new Date(), database: Database = prisma): Promise<boolean> {
  if (grant.expiresAt <= now) return false;
  const snapshot = await database.patternworkV31AssessmentSnapshot.findFirst({
    where: { assessmentSessionId: grant.sessionId, snapshotId: grant.snapshotId, snapshotRevision: grant.snapshotRevision, assessmentSession: { status: { not: "ABANDONED" }, retentionExpiresAt: { gt: now } } },
    select: { id: true },
  });
  return Boolean(snapshot);
}
