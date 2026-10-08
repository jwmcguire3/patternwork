import { sha256 } from "@/lib/server/security";
import type { Pwre1Content, Pwre1Envelope } from "./types.ts";

export function canonicalizeResponseExport(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeResponseExport).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeResponseExport(record[key])}`).join(",")}}`;
}

export function createPwre1Envelope(content: Pwre1Content): Pwre1Envelope {
  return { schemaVersion: "PWRE-1", contentSha256: sha256(canonicalizeResponseExport(content)), content };
}

export function serializePwre1Envelope(envelope: Pwre1Envelope): Buffer {
  const expected = sha256(canonicalizeResponseExport(envelope.content));
  if (expected !== envelope.contentSha256) throw new Error("Response export content digest mismatch.");
  return Buffer.from(canonicalizeResponseExport(envelope), "utf8");
}
