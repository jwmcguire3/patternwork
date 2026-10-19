import type { OpenRouterGenerationRequest, ProviderPrivacyIdentityContext } from "./types.ts";
import {
  assertNoRespondentIdentityFields,
  assertNoRespondentClassification,
  assertNoRespondentFullName,
  assertNoRespondentFullNameInPwrp71ModelInput,
  isRespondentNameFieldKey,
} from "../reports/content-boundary.ts";
import { containsAccountIdentifier } from "../reports/privacy-patterns.ts";

export interface ProviderRequestPrivacyOptions {
  readonly identityContext?: ProviderPrivacyIdentityContext;
  /** Additional outbound metadata, such as HTTP headers and endpoint URLs. */
  readonly outboundStrings?: readonly string[];
}

/** Empty inventory used only after validating a source fixture with no respondent identity. */
export const REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT = Object.freeze({
  identityInventoryReviewed: true,
  respondentNames: Object.freeze([] as string[]),
  accountIds: Object.freeze([] as string[]),
  emails: Object.freeze([] as string[]),
  otherIdentityTokens: Object.freeze([] as string[]),
}) satisfies ProviderPrivacyIdentityContext;

const OPAQUE_PROVIDER_ID_KEYS = new Set([
  "sessionid", "assessmentsessionid", "snapshotid", "snapshotidentifier", "evidencesha256", "packetsha256",
]);
const SESSION_ID = /^(?:SES-[ABC]|SESSION-[a-f0-9]{24}|pwas_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;
const SNAPSHOT_ID = /^(?:SNP-PWQE3-FIXTURE-[ABC]|SN[a-f0-9]{20}|pwsn_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|dev-[a-f0-9]{32}-[12]|qualification-P0[1-9]-(?:mapping|deepening)|pwrp71-(?:P0[1-9]|C(?:0[1-9]|1[0-6]))-[a-f0-9]{16}|fictional-(?:P0[1-9]|C(?:0[1-9]|1[0-6]))-(?:mapping|deepening)|snapshot-(?:[a-z]|[0-9]{1,6})|pwsn_pipeline|local-snapshot)$/iu;
const SHA256_ID = /^[a-f0-9]{64}$/u;
const DIRECT_PII = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:^|\s)\+\d(?:[\s().-]*\d){7,14}(?:\s|$)|\b\d{3}-\d{2}-\d{4}\b|(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}|\b\d{1,6}\s+[\p{L}0-9.'-]+(?:\s+[\p{L}0-9.'-]+){0,5}\s+(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|way|court|ct)\b)/iu;

export class ProviderRequestPrivacyError extends Error {
  constructor() {
    super("Provider request was rejected by the local privacy boundary.");
    this.name = "ProviderRequestPrivacyError";
  }
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/gu, "");
}

function opaqueIdPath(path: string): string | undefined {
  return normalizedKey(path.slice(path.lastIndexOf(".") + 1).replace(/\[[0-9]+\]$/u, ""));
}

function normalizedIdentity(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
}

function compactIdentity(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]/gu, "");
}

function normalizedWords(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function decodedStringVariants(value: string): readonly string[] {
  const variants = [value];
  let current = value;
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const decoded = decodeURIComponent(current.replace(/\+/gu, "%20"));
      if (decoded === current) break;
      variants.push(decoded);
      current = decoded;
    } catch {
      break;
    }
  }
  return variants;
}

export function mergeProviderPrivacyIdentityContexts(
  ...contexts: readonly (ProviderPrivacyIdentityContext | undefined)[]
): ProviderPrivacyIdentityContext | undefined {
  const presentContexts = contexts.filter((context): context is ProviderPrivacyIdentityContext => context !== undefined);
  const identityInventoryReviewed = presentContexts.length > 0
    && presentContexts.every((context) => context.identityInventoryReviewed === true);
  const respondentNames = contexts.flatMap((context) => context?.respondentNames ?? []);
  const accountIds = contexts.flatMap((context) => context?.accountIds ?? []);
  const emails = contexts.flatMap((context) => context?.emails ?? []);
  const otherIdentityTokens = contexts.flatMap((context) => context?.otherIdentityTokens ?? []);
  if (respondentNames.length + accountIds.length + emails.length + otherIdentityTokens.length === 0 && !identityInventoryReviewed) return undefined;
  return {
    ...(identityInventoryReviewed ? { identityInventoryReviewed: true as const } : {}),
    respondentNames,
    accountIds,
    emails,
    otherIdentityTokens,
  };
}

function containsKnownIdentity(value: string, context: ProviderPrivacyIdentityContext | undefined): boolean {
  if (!context) return false;
  const text = normalizedIdentity(value);
  const words = ` ${normalizedWords(value)} `;
  const compactText = compactIdentity(value);
  const names = context.respondentNames ?? [];
  const identifiers = [...(context.accountIds ?? []), ...(context.emails ?? []), ...(context.otherIdentityTokens ?? [])];
  for (const identity of identifiers) {
    const normalized = normalizedIdentity(identity);
    const compact = compactIdentity(identity);
    if ((normalized.length > 0 && text.includes(normalized)) || (compact.length >= 6 && compactText.includes(compact))) return true;
  }
  for (const name of names) {
    const normalized = normalizedWords(name);
    if (normalized.length === 0) continue;
    if (words.includes(` ${normalized} `)) return true;
    // A known full name can leak one component even when the other component
    // is omitted, so compare each name word as a whole word as well.
    if (normalized.split(" ").some((component) => component.length > 0 && words.includes(` ${component} `))) return true;
  }
  return false;
}

function assertSafeString(value: string, path: string, identityContext?: ProviderPrivacyIdentityContext): void {
  if (decodedStringVariants(value).some((candidate) => DIRECT_PII.test(candidate)
    || containsAccountIdentifier(candidate)
    || containsKnownIdentity(candidate, identityContext))) {
    throw new ProviderRequestPrivacyError();
  }
  const key = opaqueIdPath(path);
  if (!key || !OPAQUE_PROVIDER_ID_KEYS.has(key)) return;
  const safe = key === "sessionid" || key === "assessmentsessionid"
    ? SESSION_ID.test(value)
    : key === "snapshotid" || key === "snapshotidentifier"
      ? SNAPSHOT_ID.test(value)
      : SHA256_ID.test(value);
  if (!safe) throw new ProviderRequestPrivacyError();
}

function scanStringValues(value: unknown, path: string, identityContext?: ProviderPrivacyIdentityContext): void {
  if (typeof value === "string") {
    assertSafeString(value, path, identityContext);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanStringValues(item, `${path}[${index}]`, identityContext));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    scanStringValues(child, `${path}.${key}`, identityContext);
  }
}

function assertSafeProviderSchemaFieldNames(schema: unknown): void {
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (path.endsWith(".properties")) {
        const generatedEntityName = key === "name" && path.endsWith(".properties.name_registry.items.properties");
        if (isRespondentNameFieldKey(key) && !generatedEntityName) {
          throw new ProviderRequestPrivacyError();
        }
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(schema, "$.schema");
}

/** Check structured model input before it is serialized into a prompt. */
export function assertProviderPayloadPrivacy(
  input: unknown,
  contractVersion: "legacy" | "v7.1" = "legacy",
  path = "$",
  identityContext?: ProviderPrivacyIdentityContext,
): void {
  try {
    assertNoRespondentClassification(input);
    assertNoRespondentIdentityFields(input);
    if (contractVersion === "v7.1") assertNoRespondentFullNameInPwrp71ModelInput(input);
    else assertNoRespondentFullName(input);
    scanStringValues(input, path, identityContext);
  } catch {
    throw new ProviderRequestPrivacyError();
  }
}

function jsonValues(text: string): unknown[] {
  const values: unknown[] = [];
  const stack: string[] = [];
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      if (stack.length === 0) start = index;
      stack.push(character === "{" ? "}" : "]");
      continue;
    }
    if ((character === "}" || character === "]") && stack.length > 0) {
      if (stack.pop() !== character) {
        stack.length = 0;
        start = -1;
        continue;
      }
      if (stack.length === 0 && start >= 0) {
        try { values.push(JSON.parse(text.slice(start, index + 1)) as unknown); }
        catch { /* Prompt prose can contain braces that are not JSON. */ }
        start = -1;
      }
    }
  }
  return values;
}

/** Final exact-request guard used before durable journaling and immediately before HTTP dispatch. */
export function assertProviderRequestPrivacy(
  request: Pick<OpenRouterGenerationRequest, "model" | "system" | "prompt" | "schema" | "schemaName" | "idempotencyKey" | "providerPolicy" | "promptCacheOptions">,
  options: ProviderRequestPrivacyOptions = {},
): void {
  try {
    const context = options.identityContext;
    if (context?.identityInventoryReviewed !== true) throw new ProviderRequestPrivacyError();
    for (const [path, value] of [
      ["$.model", request.model],
      ["$.system", request.system],
      ["$.prompt", request.prompt],
      ["$.schemaName", request.schemaName],
      ["$.idempotencyKey", request.idempotencyKey],
    ] as const) assertSafeString(value, path, context);
    assertNoRespondentIdentityFields(request.schema);
    assertSafeProviderSchemaFieldNames(request.schema);
    scanStringValues(request.schema, "$.schema", context);
    scanStringValues(request.providerPolicy, "$.providerPolicy", context);
    scanStringValues(request.promptCacheOptions, "$.promptCacheOptions", context);
    for (const value of jsonValues(request.system)) assertProviderPayloadPrivacy(value, "v7.1", "$", context);
    for (const value of jsonValues(request.prompt)) assertProviderPayloadPrivacy(value, "v7.1", "$", context);
    for (const value of options.outboundStrings ?? []) assertSafeString(value, "$.outboundMetadata", context);
  } catch {
    throw new ProviderRequestPrivacyError();
  }
}
