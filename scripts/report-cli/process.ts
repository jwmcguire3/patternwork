import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { JsonObject } from "../../lib/question-engine/types.ts";

export interface CodexExecRequest {
  readonly prompt: string;
  readonly schemaPath: string;
  readonly outputPath: string;
  readonly cwd: string;
}

export interface CodexProcessBoundary { execute(request: CodexExecRequest): Promise<void> }

// Codex structured outputs intentionally support only a strict JSON Schema
// subset. The canonical validator still receives and enforces the unmodified
// Patternwork schema after generation, so dropping unsupported writer hints
// here cannot weaken artifact acceptance.
const UNSUPPORTED_CODEX_SCHEMA_KEYWORDS = new Set([
  "allOf", "contains", "else", "format", "if", "maxContains", "maxItems", "maxLength", "maxProperties",
  "maximum", "minContains", "minItems", "minLength", "minProperties", "minimum",
  "multipleOf", "not", "pattern", "patternProperties", "propertyNames", "then", "uniqueItems",
  "unevaluatedProperties",
]);

export function codexCompatibleOutputSchema(schema: JsonObject): JsonObject {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const source = value as Record<string, unknown>;
    const result = Object.fromEntries(Object.entries(source)
      .filter(([key]) => !UNSUPPORTED_CODEX_SCHEMA_KEYWORDS.has(key))
      .map(([key, child]) => [key === "oneOf" ? "anyOf" : key, visit(child)]));
    if (typeof result.$ref === "string" && !("$defs" in result)) return { $ref: result.$ref };
    if (!("type" in result) && !("$ref" in result) && !("anyOf" in result)) {
      if ("const" in result && ["string", "number", "boolean"].includes(typeof result.const)) result.type = typeof result.const;
      else if (Array.isArray(result.enum) && result.enum.length > 0) {
        const types = new Set(result.enum.map((item: unknown) => typeof item));
        if (types.size === 1 && ["string", "number", "boolean"].includes([...types][0])) result.type = [...types][0];
      }
      else if ("properties" in result) result.type = "object";
      else if ("items" in result) result.type = "array";
    }
    if (result.type === "object" && result.properties && typeof result.properties === "object" && !Array.isArray(result.properties)) {
      const properties = result.properties as Record<string, unknown>;
      result.required = Object.keys(properties);
      // A trace_id is canonical only for substantive blocks. Navigation blocks
      // are optional, so omit that branch from the stricter writer schema.
      const kind = properties.kind as Record<string, unknown> | undefined;
      if ("trace_id" in properties && Array.isArray(kind?.enum) && kind.enum.includes("substantive")) kind.enum = ["substantive"];
    }
    return result;
  };
  return visit(schema) as JsonObject;
}

export function codexExecArguments(request: Pick<CodexExecRequest, "schemaPath" | "outputPath">): readonly string[] {
  return ["exec", "--ephemeral", "--sandbox", "read-only", "--output-schema", request.schemaPath, "--output-last-message", request.outputPath, "-"];
}

function codexCommand(): { readonly command: string; readonly prefix: readonly string[]; readonly shell: boolean } {
  const configured = process.env.CODEX_CLI_PATH?.trim();
  if (configured) return { command: configured, prefix: [], shell: false };
  if (process.platform === "win32" && process.env.APPDATA) {
    const cli = path.join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
    if (existsSync(cli)) return { command: process.execPath, prefix: [cli], shell: false };
  }
  return { command: "codex", prefix: [], shell: process.platform === "win32" };
}

export function safeCodexDiagnostic(stderr: string): string | undefined {
  const code = /"code"\s*:\s*"([A-Za-z0-9_-]{1,80})"/u.exec(stderr)?.[1];
  if (!code || !["invalid_json_schema", "invalid_request_error"].includes(code)) return undefined;
  return `${code}: Codex rejected the structured-output request.`;
}

export class LocalCodexProcessBoundary implements CodexProcessBoundary {
  execute(request: CodexExecRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      const executable = codexCommand();
      let stderr = "";
      const child = spawn(executable.command, [...executable.prefix, ...codexExecArguments(request)], {
        cwd: request.cwd,
        shell: executable.shell,
        // Codex echoes the prompt to its terminal UI. Keep provider-safe packet
        // contents out of routine operator logs; the canonical response is read
        // only from outputPath.
        stdio: ["pipe", "ignore", "pipe"],
        windowsHide: true,
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString("utf8")}`.slice(-131_072);
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`codex exec exited with status ${code ?? "unknown"}${safeCodexDiagnostic(stderr) ? ` (${safeCodexDiagnostic(stderr)})` : ""}.`));
      });
      child.stdin.end(request.prompt, "utf8");
    });
  }
}
