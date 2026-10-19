import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

// Historical qualification archives include executable tests that rewrite their
// own receipts. Include active application, library, test and script trees.
const files = [];
for (const root of ["app", "lib", "tests", "scripts"]) {
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && /\.test\.(?:ts|mjs)$/u.test(entry.name)) files.push(path.join(entry.parentPath, entry.name));
  }
}
if (!files.length) throw new Error("No active tests found.");
const child = spawn(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", ...process.argv.slice(2), ...files.sort()], { stdio: "inherit", windowsHide: true });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
