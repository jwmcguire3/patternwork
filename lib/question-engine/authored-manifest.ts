import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PATTERNWORK_INSTRUMENT_MANIFEST } from "./manifest.ts";
import type { BankItemManifestEntry, InstrumentBank } from "./types.ts";

export interface AuthoredBankItemDefinition extends BankItemManifestEntry {
  readonly authoredMarkdown: string;
  readonly authoredContentSha256: string;
}

export interface AuthoredInstrumentManifest {
  readonly inventoryItems: readonly AuthoredBankItemDefinition[];
  readonly mappingItems: readonly AuthoredBankItemDefinition[];
  readonly deepeningItems: readonly AuthoredBankItemDefinition[];
  readonly bankItems: readonly AuthoredBankItemDefinition[];
}

export async function loadAuthoredInstrumentManifest(workspaceRoot = process.cwd()): Promise<AuthoredInstrumentManifest> {
  const grouped = new Map<string, BankItemManifestEntry[]>();
  for (const entry of PATTERNWORK_INSTRUMENT_MANIFEST.bankItems) {
    const existing = grouped.get(entry.sourcePath) ?? [];
    existing.push(entry);
    grouped.set(entry.sourcePath, existing);
  }

  const definitions: AuthoredBankItemDefinition[] = [];
  for (const [sourcePath, entries] of grouped) {
    const source = (await readFile(path.join(workspaceRoot, ...sourcePath.split("/")), "utf8")).replaceAll("\r\n", "\n");
    const lines = source.split("\n");
    const ordered = [...entries].sort((left, right) => left.sourceLine - right.sourceLine);
    ordered.forEach((entry, index) => {
      const start = entry.sourceLine - 1;
      const end = index + 1 < ordered.length ? ordered[index + 1].sourceLine - 1 : lines.length;
      const authoredMarkdown = lines.slice(start, end).join("\n").trimEnd();
      if (!authoredMarkdown.startsWith("###") || !authoredMarkdown.includes(entry.bankItemId)) throw new Error(`Source heading drift for ${entry.bankItemId} at ${sourcePath}:${entry.sourceLine}.`);
      definitions.push({ ...entry, authoredMarkdown, authoredContentSha256: createHash("sha256").update(authoredMarkdown, "utf8").digest("hex") });
    });
  }

  const byBank = (bank: InstrumentBank) => definitions.filter((entry) => entry.bank === bank);
  return { inventoryItems: byBank("inventory"), mappingItems: byBank("mapping"), deepeningItems: byBank("deepening"), bankItems: definitions };
}

