import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(RUN_DIR, "C10-COMPOSITION-ATTEMPT2-PREFLIGHT.json");
const dispatchScript = path.join(RUN_DIR, "scripts", "dispatch-openai-experiment.mjs");
const args = [
  "--operator-authorized", "yes", "--profile", "C10", "--stage", "composition",
  "--authorize-up-to-microdollars", "3000000", "--per-call-reservation-microdollars", "300000",
  "--owner-authorized-continue-with-locked-unknown", "yes",
  "--owner-authorized-c10-curated-graph", "yes",
  "--owner-authorized-c10-composition-no-dispatch-recovery", "yes", "--preflight-only", "yes",
];
const env = { ...process.env };
delete env.OPENAI_API_KEY;
const result = spawnSync(process.execPath, [dispatchScript, ...args], {
  cwd: RUN_DIR,
  env,
  encoding: "utf8",
  timeout: 30_000,
});
let preflight;
try { preflight = JSON.parse(result.stdout); }
catch { throw new Error(`The no-key no-dispatch preflight did not return JSON: ${result.stderr || result.stdout}`); }
if (result.status !== 0 || preflight.status !== "fictional_c10_composition_attempt2_preflight_passed_no_dispatch"
  || preflight.providerDispatches !== 0 || preflight.attemptNumber !== 2
  || preflight.requestBodySha256 !== "7f101eb0a1c5294d65496c912e6c86832d3aaa9cd70148d7f32c054d22370e59"
  || preflight.remainingAuthorizationAfterReservationMicrodollars !== 1_678_323) {
  throw new Error(`The exact C10 no-dispatch preflight did not pass its pins: ${result.stderr || result.stdout}`);
}
const receipt = {
  schemaVersion: "PATTERNWORK-C10-COMPOSITION-ATTEMPT2-PREFLIGHT-V1",
  recordedAt: new Date().toISOString(),
  command: ["node", "scripts/dispatch-openai-experiment.mjs", ...args],
  exitCode: result.status,
  apiKeyAvailableToPreflightProcess: false,
  result: preflight,
  stdoutSha256: (await import("node:crypto")).createHash("sha256").update(result.stdout).digest("hex"),
};
await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ status: "passed_no_dispatch", attemptNumber: preflight.attemptNumber,
  requestBodySha256: preflight.requestBodySha256, remainingAuthorizationAfterReservationMicrodollars: preflight.remainingAuthorizationAfterReservationMicrodollars,
  providerDispatches: 0, output: path.basename(output) }, null, 2));
