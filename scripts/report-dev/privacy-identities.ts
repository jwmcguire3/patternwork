import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ProviderPrivacyIdentityContext } from "../../lib/server/openrouter/types.ts";

const REQUIRED_LIST_KEYS = ["respondentNames", "accountIds", "emails", "otherIdentityTokens"] as const;
const ALLOWED_KEYS = new Set(["identityInventoryReviewed", ...REQUIRED_LIST_KEYS]);
const MAX_FILE_BYTES = 64 * 1024;
const MAX_VALUES_PER_KEY = 64;
const MAX_VALUE_LENGTH = 320;

/** Read local comparison values without returning them to logs or run artifacts. */
export async function loadPrivacyIdentityContext(filePath: string): Promise<ProviderPrivacyIdentityContext> {
  const absolutePath = path.resolve(filePath);
  const metadata = await stat(absolutePath);
  if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) {
    throw new Error("Identity sidecar must be a regular JSON file no larger than 64 KiB.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolutePath, "utf8")) as unknown;
  } catch {
    throw new Error("Identity sidecar must contain valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Identity sidecar must be an object containing only local identity lists.");
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_KEYS.has(key))) {
    throw new Error("Identity sidecar contains an unsupported field.");
  }
  if (record.identityInventoryReviewed !== true || REQUIRED_LIST_KEYS.some((key) => !Object.hasOwn(record, key))) {
    throw new Error("Identity sidecar must confirm a reviewed identity inventory and include every local identity list.");
  }
  const context: Record<string, readonly string[]> = {};
  for (const key of REQUIRED_LIST_KEYS) {
    const value = record[key];
    if (!Array.isArray(value) || value.length > MAX_VALUES_PER_KEY
      || value.some((item) => typeof item !== "string" || item.trim().length === 0 || item.length > MAX_VALUE_LENGTH)) {
      throw new Error(`Identity sidecar field ${key} must be a list of at most 64 short, nonempty strings.`);
    }
    const normalized = value.map((item) => (item as string).trim());
    context[key] = normalized;
  }
  return { identityInventoryReviewed: true, ...context } as ProviderPrivacyIdentityContext;
}
