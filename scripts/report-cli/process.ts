import { spawn } from "node:child_process";

export interface CodexExecRequest {
  readonly prompt: string;
  readonly schemaPath: string;
  readonly outputPath: string;
  readonly cwd: string;
}

export interface CodexProcessBoundary { execute(request: CodexExecRequest): Promise<void> }

export function codexExecArguments(request: Pick<CodexExecRequest, "schemaPath" | "outputPath">): readonly string[] {
  return ["exec", "--ephemeral", "--sandbox", "read-only", "--output-schema", request.schemaPath, "--output-last-message", request.outputPath, "-"];
}

export class LocalCodexProcessBoundary implements CodexProcessBoundary {
  execute(request: CodexExecRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("codex", codexExecArguments(request), { cwd: request.cwd, shell: process.platform === "win32", stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`codex exec exited with status ${code ?? "unknown"}.`)));
      child.stdin.end(request.prompt, "utf8");
    });
  }
}
