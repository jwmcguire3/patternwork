import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RUN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(RUN_DIR, "..", "..", "..", "..", "..");
const DISPATCH = path.join(RUN_DIR, "scripts", "dispatch-openai-experiment.mjs");
const JOURNAL = path.join(RUN_DIR, "BUDGET_JOURNAL.json");
const OUTPUT_ATTEMPT3 = path.join(RUN_DIR, "RECOVERY_GUARD_TESTS_ATTEMPT3.json");
const OUTPUT_POST_DISPATCH = path.join(RUN_DIR, "RECOVERY_GUARD_TESTS_POST_DISPATCH.json");
const BASE = [
  "--operator-authorized", "yes", "--profile", "P02", "--stage", "interpretation",
  "--authorize-up-to-microdollars", "3000000", "--per-call-reservation-microdollars", "300000",
  "--owner-authorized-incomplete-output-recovery", "yes", "--preflight-only", "yes",
];
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function inventory(directory) {
  return (await readdir(directory)).sort();
}
function invoke(args) {
  const environment = { ...process.env };
  delete environment.OPENAI_API_KEY;
  return spawnSync(process.execPath, [DISPATCH, ...args], { cwd: ROOT, env: environment, encoding: "utf8", timeout: 30_000 });
}
async function main() {
  const beforeJournal = await readFile(JOURNAL);
  const journalBefore = JSON.parse(beforeJournal.toString("utf8"));
  const attempt3AlreadyConsumed = journalBefore.calls.some((call) => call.callId === "e6f9fe4c-500c-4a80-a6e2-230d2ed63fb9"
    || (call.profile === "P02" && call.stage === "interpretation" && call.attemptNumber === 3));
  const beforeRequests = await inventory(path.join(RUN_DIR, "requests"));
  const beforeResponses = await inventory(path.join(RUN_DIR, "responses"));
  const beforeOutputs = await inventory(path.join(RUN_DIR, "outputs"));
  const scenarios = [
    { id: "missing_explicit_operator_authorization", args: BASE.filter((_, index) => index !== 0 && index !== 1), mustReject: true },
    { id: "enlarged_aggregate_limit", args: BASE.map((value) => value === "3000000" ? "3000001" : value), mustReject: true },
    { id: "changed_per_call_reservation", args: BASE.map((value) => value === "300000" ? "400000" : value), mustReject: true },
    { id: "out_of_scope_c03", args: ["--operator-authorized", "yes", "--profile", "C03", "--stage", "interpretation", "--authorize-up-to-microdollars", "3000000", "--per-call-reservation-microdollars", "300000", "--owner-authorized-incomplete-output-recovery", "yes", "--preflight-only", "yes"], mustReject: true },
    { id: "recovery_on_wrong_profile", args: BASE.map((value) => value === "P02" ? "C10" : value), mustReject: true },
    { id: "recovery_on_wrong_stage", args: BASE.map((value) => value === "interpretation" ? "composition" : value), mustReject: true },
    { id: "continuation_out_of_order_before_p02_composition", args: ["--operator-authorized", "yes", "--profile", "C10", "--stage", "interpretation", "--authorize-up-to-microdollars", "3000000", "--per-call-reservation-microdollars", "300000", "--owner-authorized-continue-with-locked-unknown", "yes", "--preflight-only", "yes"], mustReject: true },
    { id: "continuation_wrong_stage", args: ["--operator-authorized", "yes", "--profile", "P02", "--stage", "interpretation", "--authorize-up-to-microdollars", "3000000", "--per-call-reservation-microdollars", "300000", "--owner-authorized-continue-with-locked-unknown", "yes", "--preflight-only", "yes"], mustReject: true },
    { id: "provider_or_model_override_rejected", args: [...BASE, "--provider", "azure"], mustReject: true },
    { id: "dispatch_requires_provider_key", args: BASE.slice(0, -2), mustReject: true },
  ];
  if (attempt3AlreadyConsumed) scenarios.push({ id: "attempt3_replay_rejected_after_consumption", args: BASE, mustReject: true });
  const rows = [];
  for (const scenario of scenarios) {
    const result = invoke(scenario.args);
    rows.push({ scenario: scenario.id, exitCode: result.status, rejected: result.status !== 0, stderr: result.stderr.trim().slice(0, 500) });
  }
  let authorizedPreflight = null;
  let preflightBody = null;
  if (!attempt3AlreadyConsumed) {
    authorizedPreflight = invoke(BASE);
    try { preflightBody = JSON.parse(authorizedPreflight.stdout); } catch {}
    rows.push({ scenario: "exact_attempt3_preflight_no_dispatch", exitCode: authorizedPreflight.status, rejected: false, status: preflightBody?.status, providerDispatches: preflightBody?.providerDispatches, requestBodySha256: preflightBody?.requestBodySha256 });
  }
  const afterJournal = await readFile(JOURNAL);
  const afterRequests = await inventory(path.join(RUN_DIR, "requests"));
  const afterResponses = await inventory(path.join(RUN_DIR, "responses"));
  const afterOutputs = await inventory(path.join(RUN_DIR, "outputs"));
  const sideEffectsAbsent = sha(beforeJournal) === sha(afterJournal)
    && JSON.stringify(beforeRequests) === JSON.stringify(afterRequests)
    && JSON.stringify(beforeResponses) === JSON.stringify(afterResponses)
    && JSON.stringify(beforeOutputs) === JSON.stringify(afterOutputs);
  const recoveryGateOk = attempt3AlreadyConsumed
    ? rows.some((row) => row.scenario === "attempt3_replay_rejected_after_consumption" && row.rejected)
    : authorizedPreflight?.status === 0 && preflightBody?.providerDispatches === 0 && preflightBody?.matchesApprovedRequest === true;
  const ok = rows.slice(0, scenarios.length).every((row) => row.rejected) && recoveryGateOk && sideEffectsAbsent;
  const outputPath = attempt3AlreadyConsumed ? OUTPUT_POST_DISPATCH : OUTPUT_ATTEMPT3;
  const result = {
    schemaVersion: "PATTERNWORK-PWRP71-DISPATCH-GUARD-TESTS-V1",
    status: ok ? "passed" : "failed",
    executedAt: new Date().toISOString(),
    attempt3AlreadyConsumed,
    providerDispatches: 0,
    journalSha256Before: sha(beforeJournal),
    journalSha256After: sha(afterJournal),
    sideEffectsAbsent,
    scenarioCount: rows.length,
    scenarios: rows,
    note: attempt3AlreadyConsumed
      ? "Attempt 3 is already recorded. All cases rejected invalid or duplicate recovery and did not retry generation."
      : "All cases used no-dispatch preflight or rejected CLI input with OPENAI_API_KEY removed; no request was sent.",
  };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.status, scenarioCount: rows.length, rejectedCases: rows.slice(0, scenarios.length).filter((row) => row.rejected).length, providerDispatches: 0, sideEffectsAbsent, output: path.relative(RUN_DIR, outputPath).replaceAll("\\", "/") }, null, 2));
  if (!ok) process.exitCode = 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
