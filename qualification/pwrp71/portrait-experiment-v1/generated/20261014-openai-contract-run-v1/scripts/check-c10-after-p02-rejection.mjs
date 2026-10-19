import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RUN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(RUN_DIR, "..", "..", "..", "..", "..");
const DISPATCH = path.join(RUN_DIR, "scripts", "dispatch-openai-experiment.mjs");
const JOURNAL = path.join(RUN_DIR, "BUDGET_JOURNAL.json");
const PREPARED = path.join(RUN_DIR, "prepared", "C10.interpretation.input.json");
const OUTPUT = path.join(RUN_DIR, "C10_AFTER_P02_REJECTION_GUARDS.json");
const BASE = [
  "--operator-authorized", "yes", "--profile", "C10", "--stage", "interpretation",
  "--authorize-up-to-microdollars", "3000000", "--per-call-reservation-microdollars", "300000",
  "--owner-authorized-continue-with-locked-unknown", "yes", "--preflight-only", "yes",
];

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function inventory(directory) { return (await readdir(directory)).sort(); }
function invoke(args) {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  return spawnSync(process.execPath, [DISPATCH, ...args], { cwd: ROOT, env, encoding: "utf8", timeout: 30_000 });
}

async function main() {
  const initialJournal = await readFile(JOURNAL);
  const initialPrepared = await readFile(PREPARED);
  const beforeRequests = await inventory(path.join(RUN_DIR, "requests"));
  const beforeResponses = await inventory(path.join(RUN_DIR, "responses"));
  const beforeOutputs = await inventory(path.join(RUN_DIR, "outputs"));
  const scenarios = [
    ["missing_operator_authorization", BASE.filter((_, index) => index > 1)],
    ["out_of_scope_profile", BASE.map((value) => value === "C10" ? "C03" : value)],
    ["enlarged_aggregate_cap", BASE.map((value) => value === "3000000" ? "3000001" : value)],
    ["enlarged_per_call_reservation", BASE.map((value) => value === "300000" ? "400000" : value)],
    ["provider_override", [...BASE, "--provider", "azure"]],
    ["composition_before_c10_interpretation", BASE.map((value) => value === "interpretation" ? "composition" : value)],
    ["continuation_authorization_missing", BASE.filter((_, index) => index < 10 || index > 11)],
    ["preflight_only_missing", BASE.slice(0, -2)],
  ];
  const rejectedCases = scenarios.map(([id, args]) => {
    const result = invoke(args);
    return { id, exitCode: result.status, rejected: result.status !== 0, providerDispatches: 0,
      stderr: result.stderr.trim().slice(0, 500) };
  });
  const valid = invoke(BASE);
  let preflight = null;
  try { preflight = JSON.parse(valid.stdout); } catch {}
  const afterJournal = await readFile(JOURNAL);
  const afterPrepared = await readFile(PREPARED);
  const sideEffectsAbsent = sha(initialJournal) === sha(afterJournal)
    && sha(initialPrepared) === sha(afterPrepared)
    && JSON.stringify(beforeRequests) === JSON.stringify(await inventory(path.join(RUN_DIR, "requests")))
    && JSON.stringify(beforeResponses) === JSON.stringify(await inventory(path.join(RUN_DIR, "responses")))
    && JSON.stringify(beforeOutputs) === JSON.stringify(await inventory(path.join(RUN_DIR, "outputs")));
  const c10IndependentPreflightPassed = valid.status === 0
    && preflight?.profile === "C10" && preflight?.stage === "interpretation"
    && preflight?.packetSha256 === "109ad81a85793f0f114351e42e7f2f4f62e927a80a76e23b0afee4e112b87cb3"
    && preflight?.sourceObservationIndexSha256 === "d2765bfe4008dd49bc5e6a2c719178f8466adb81af03422506f48a5121289676"
    && preflight?.requestBodySha256 === "a264e2bbd73d44c8f0694755b0f645ef21ef4df9b14696cf6b57592609eb4139"
    && preflight?.matchesApprovedRequest === true
    && preflight?.providerDispatches === 0
    && preflight?.maxOutputTokens === 128000
    && preflight?.existingUnknownReservationMicrodollars === 900000
    && preflight?.additionalReservationMicrodollars === 300000
    && JSON.stringify(preflight?.carriedUnknownCostCallIds) === JSON.stringify([
      "017fbfd7-ec20-47a1-bb09-2f5242debd0b",
      "48899da5-ce4e-45f2-a493-21ed1db01d8b",
      "e6f9fe4c-500c-4a80-a6e2-230d2ed63fb9",
    ])
    && preflight?.remainingAuthorizationAfterReservationMicrodollars === 1732986;
  const ok = rejectedCases.every((row) => row.rejected) && c10IndependentPreflightPassed && sideEffectsAbsent;
  const result = {
    schemaVersion: "PATTERNWORK-C10-INDEPENDENT-AFTER-P02-REJECTION-GUARDS-V1",
    status: ok ? "passed" : "failed",
    executedAt: new Date().toISOString(),
    providerDispatches: 0,
    rejectedCases,
    c10IndependentPreflightPassed,
    preflight,
    sideEffectsAbsent,
    journalSha256: sha(afterJournal),
    preparedC10InputSha256: sha(afterPrepared),
  };
  await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.status, rejected: rejectedCases.length,
    c10IndependentPreflightPassed, providerDispatches: 0, sideEffectsAbsent, output: path.relative(RUN_DIR, OUTPUT) }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
