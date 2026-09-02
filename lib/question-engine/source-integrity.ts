import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SourceManifest, ValidationIssue, ValidationResult } from "./types.ts";

export const SOURCE_MANIFEST_PATH = "specs/patternwork/source-manifest.v3.1.json";
const CANONICAL_DIRECTORIES = [
  "specs/patternwork/question-engine-v3.1",
  "specs/patternwork/report-prompts-v4.1",
] as const;

function normalizeRelative(value: string): string {
  return value.replaceAll("\\", "/");
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function loadSourceManifest(workspaceRoot = process.cwd()): Promise<SourceManifest> {
  const raw = await readFile(path.join(workspaceRoot, SOURCE_MANIFEST_PATH), "utf8");
  return JSON.parse(raw) as SourceManifest;
}

export async function verifyPatternworkSourceIntegrity(workspaceRoot = process.cwd()): Promise<ValidationResult<SourceManifest>> {
  const issues: ValidationIssue[] = [];
  let manifest: SourceManifest;
  try {
    manifest = await loadSourceManifest(workspaceRoot);
  } catch (error) {
    return { ok: false, issues: [{ code: "source_manifest_unreadable", path: SOURCE_MANIFEST_PATH, message: String(error) }] };
  }

  if (manifest.files.length !== 26) {
    issues.push({ code: "source_population_count", path: "$.files", message: `Expected 26 canonical source files; manifest has ${manifest.files.length}.` });
  }

  const expected = new Set(manifest.files.map((entry) => normalizeRelative(entry.path)));
  const observed = new Set<string>();
  for (const directory of CANONICAL_DIRECTORIES) {
    try {
      for (const entry of await readdir(path.join(workspaceRoot, directory), { withFileTypes: true })) {
        if (entry.isFile()) observed.add(`${directory}/${entry.name}`);
      }
    } catch (error) {
      issues.push({ code: "source_directory_unreadable", path: directory, message: String(error) });
    }
  }

  for (const unexpected of observed.difference(expected)) {
    issues.push({ code: "unexpected_source_file", path: unexpected, message: "Canonical source population contains an unreviewed file." });
  }
  for (const missing of expected.difference(observed)) {
    issues.push({ code: "missing_source_file", path: missing, message: "Canonical source file is missing." });
  }

  await Promise.all(manifest.files.map(async (entry) => {
    const relative = normalizeRelative(entry.path);
    const absolute = path.join(workspaceRoot, ...relative.split("/"));
    try {
      const metadata = await stat(absolute);
      if (metadata.size !== entry.bytes) {
        issues.push({ code: "source_size_drift", path: relative, message: `Expected ${entry.bytes} bytes; found ${metadata.size}.` });
      }
      const actualHash = await sha256File(absolute);
      if (actualHash !== entry.sha256) {
        issues.push({ code: "source_hash_drift", path: relative, message: `Expected ${entry.sha256}; found ${actualHash}.` });
      }
    } catch (error) {
      if (!issues.some((issue) => issue.code === "missing_source_file" && issue.path === relative)) {
        issues.push({ code: "source_unreadable", path: relative, message: String(error) });
      }
    }
  }));

  return issues.length === 0 ? { ok: true, value: manifest, issues: [] } : { ok: false, issues };
}

