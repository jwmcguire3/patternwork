import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RUN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(RUN_DIR, "..", "..", "..", "..", "..");
const DISPATCH = path.join(RUN_DIR, "scripts", "dispatch-openai-experiment.mjs");
const JOURNAL = path.join(RUN_DIR, "BUDGET_JOURNAL.json");
const PREPARED = path.join(RUN_DIR, "prepared", "P02.interpretation.input.json");
const OUTPUT = path.join(RUN_DIR, "FINAL_ATTEMPT_GUARDS.json");
const ATTEMPT3 = "e6f9fe4c-500c-4a80-a6e2-230d2ed63fb9";
const EXPECTED_REQUEST = "f8c36e20ba9043a8bfc4392c7b11c174f6766d60b796ab175c4ee29cdd5b9cb6";
const EXPECTED_OUTPUT_LIMIT = 128_000;
const BASE = [
  "--operator-authorized", "yes", "--profile", "P02", "--stage", "interpretation",
  "--authorize-up-to-microdollars", "3000000", "--per-call-reservation-microdollars", "300000",
  "--owner-authorized-final-p02-interpretation", "yes", "--preflight-only", "yes",
];
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function inventory(directory) { return (await readdir(directory)).sort(); }
function invoke(args) {
  const environment = { ...process.env };
  delete environment.OPENAI_API_KEY;
  return spawnSync(process.execPath, [DISPATCH, ...args], { cwd: ROOT, env: environment, encoding: "utf8", timeout: 30_000 });
}
function rejected(row) { return row.exitCode !== 0; }
async function withTemporaryMutation(file, mutate, run) {
  const original = await readFile(file);
  try {
    const parsed = JSON.parse(original.toString("utf8"));
    mutate(parsed);
    await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`);
    return run();
  } finally {
    await writeFile(file, original);
  }
}
async function main() {
  const initialJournal = await readFile(JOURNAL);
  const initialPrepared = await readFile(PREPARED);
  const journalCalls = JSON.parse(initialJournal.toString("utf8")).calls;
  const alreadyConsumed = journalCalls.some((call) => call.attemptNumber === 4);
  const beforeRequests = await inventory(path.join(RUN_DIR, "requests"));
  const beforeResponses = await inventory(path.join(RUN_DIR, "responses"));
  const beforeOutputs = await inventory(path.join(RUN_DIR, "outputs"));
  const beforeJournalSha256 = sha(initialJournal);
  const scenarios = [];
  const runScenario = (id, args) => {
    const result = invoke(args);
    scenarios.push({ id, exitCode: result.status, rejected: result.status !== 0, stdout: result.stdout.trim().slice(0, 600), stderr: result.stderr.trim().slice(0, 600) });
    return result;
  };
  const withoutPair = (args, first, second) => {
    const copy = [...args];
    const index = copy.indexOf(first);
    if (index >= 0) copy.splice(index, 2);
    return copy;
  };
  try {
    if (alreadyConsumed) {
      runScenario("attempt4_replay_rejected", BASE);
    } else {
      runScenario("missing_explicit_operator_authorization", withoutPair(BASE, "--operator-authorized", "yes"));
      runScenario("missing_attempt4_owner_authorization", withoutPair(BASE, "--owner-authorized-final-p02-interpretation", "yes"));
      runScenario("enlarged_aggregate_cap", BASE.map((value) => value === "3000000" ? "3000001" : value));
      runScenario("changed_per_call_reservation", BASE.map((value) => value === "300000" ? "400000" : value));
      runScenario("out_of_scope_profile", BASE.map((value) => value === "P02" ? "C03" : value));
      runScenario("wrong_stage", BASE.map((value) => value === "interpretation" ? "composition" : value));
      runScenario("invalid_output_limit_override", [...BASE, "--max-output-tokens", "16000"]);
      runScenario("provider_override_rejected", [...BASE, "--provider", "azure"]);
      runScenario("recovery_flags_cannot_be_combined", [...BASE, "--owner-authorized-incomplete-output-recovery", "yes"]);
      runScenario("continuation_before_attempt4_interpretation", [
        "--operator-authorized", "yes", "--profile", "C10", "--stage", "interpretation",
        "--authorize-up-to-microdollars", "3000000", "--per-call-reservation-microdollars", "300000",
        "--owner-authorized-continue-with-locked-unknown", "yes", "--preflight-only", "yes",
      ]);
      runScenario("dispatch_requires_provider_key", BASE.slice(0, -2));

      const changedAttempt3 = await withTemporaryMutation(JOURNAL, (journal) => {
        const call = journal.calls.find((item) => item.callId === ATTEMPT3);
        call.requestBodySha256 = "0".repeat(64);
      }, () => runScenario("changed_predecessor_request_hash", BASE));
      void changedAttempt3;
      await withTemporaryMutation(JOURNAL, (journal) => {
        const call = journal.calls.find((item) => item.callId === ATTEMPT3);
        call.reservationMicrodollars = 0;
        journal.reservedMicrodollars -= 300_000;
        journal.remainingAuthorizationMicrodollars += 300_000;
      }, () => runScenario("released_attempt3_unknown_reserve", BASE));
      await withTemporaryMutation(JOURNAL, (journal) => {
        journal.calls.push({ callId: "adversarial-extra-unknown", status: "unknown_cost", reservationMicrodollars: 300_000 });
        journal.reservedMicrodollars += 300_000;
        journal.remainingAuthorizationMicrodollars -= 300_000;
      }, () => runScenario("extra_unknown_cost_reservation", BASE));
      await withTemporaryMutation(PREPARED, (prepared) => { prepared.packetSha256 = "0".repeat(64); },
        () => runScenario("changed_pinned_packet", BASE));
    }

    let preflight = null;
    if (!alreadyConsumed) {
      const result = invoke(BASE);
      try { preflight = JSON.parse(result.stdout); } catch {}
      scenarios.push({ id: "exact_attempt4_preflight", exitCode: result.status, rejected: result.status !== 0,
        status: preflight?.status, qualificationStatus: preflight?.qualificationStatus,
        requestBodySha256: preflight?.requestBodySha256, expectedRequestSha256: preflight?.expectedRequestSha256,
        maxOutputTokens: preflight?.maxOutputTokens, retainedUnknownMicrodollars: preflight?.existingUnknownReservationMicrodollars,
        nextReservationMicrodollars: preflight?.additionalReservationMicrodollars,
        remainingAfterReservationMicrodollars: preflight?.remainingAuthorizationAfterReservationMicrodollars,
        providerDispatches: preflight?.providerDispatches });
    }

    const afterJournal = await readFile(JOURNAL);
    const afterPrepared = await readFile(PREPARED);
    const afterRequests = await inventory(path.join(RUN_DIR, "requests"));
    const afterResponses = await inventory(path.join(RUN_DIR, "responses"));
    const afterOutputs = await inventory(path.join(RUN_DIR, "outputs"));
    const sideEffectsAbsent = sha(initialJournal) === sha(afterJournal) && sha(initialPrepared) === sha(afterPrepared)
      && JSON.stringify(beforeRequests) === JSON.stringify(afterRequests)
      && JSON.stringify(beforeResponses) === JSON.stringify(afterResponses)
      && JSON.stringify(beforeOutputs) === JSON.stringify(afterOutputs);
    const exactPreflightPassed = alreadyConsumed
      ? scenarios.some((row) => row.id === "attempt4_replay_rejected" && rejected(row))
      : preflight?.status === "fictional_diagnostic_attempt4_preflight_passed_no_dispatch"
        && preflight?.qualificationStatus === "FICTIONAL_DIAGNOSTIC_ONLY_NOT_ROUTING_QUALIFICATION_OR_PRODUCTION_APPROVAL"
        && preflight?.attemptNumber === 4 && preflight?.requestBodySha256 === EXPECTED_REQUEST
        && preflight?.expectedRequestSha256 === EXPECTED_REQUEST && preflight?.matchesApprovedRequest === true
        && preflight?.maxOutputTokens === EXPECTED_OUTPUT_LIMIT
        && preflight?.existingUnknownReservationMicrodollars === 600_000
        && preflight?.additionalReservationMicrodollars === 300_000
        && preflight?.remainingAuthorizationAfterReservationMicrodollars === 2_080_350
        && preflight?.providerDispatches === 0 && scenarios.at(-1)?.exitCode === 0;
    if (!alreadyConsumed && preflight) {
      await writeFile(path.join(RUN_DIR, "FINAL_ATTEMPT_PREFLIGHT.json"), `${JSON.stringify(preflight, null, 2)}\n`);
    }
    const invalidRejected = alreadyConsumed
      ? scenarios.every((row) => rejected(row))
      : scenarios.slice(0, -1).every((row) => rejected(row));
    const result = {
      schemaVersion: "PATTERNWORK-PWRP71-FICTIONAL-DIAGNOSTIC-ATTEMPT4-GUARDS-V1",
      status: invalidRejected && exactPreflightPassed && sideEffectsAbsent ? "passed" : "failed",
      executedAt: new Date().toISOString(),
      attempt4AlreadyConsumed: alreadyConsumed,
      sourceRequestSha256: EXPECTED_REQUEST,
      requiredMaxOutputTokens: EXPECTED_OUTPUT_LIMIT,
      providerDispatches: 0,
      initialJournalSha256: beforeJournalSha256,
      finalJournalSha256: sha(afterJournal),
      sideEffectsAbsent,
      scenarios,
      exactPreflightPassed,
      invalidRequestsRejected: invalidRejected,
    };
    await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ status: result.status, scenarioCount: scenarios.length, providerDispatches: 0, sideEffectsAbsent,
      exactPreflightPassed, output: path.relative(RUN_DIR, OUTPUT).replaceAll("\\", "/") }, null, 2));
    if (result.status !== "passed") process.exitCode = 1;
  } finally {
    if (sha(await readFile(JOURNAL)) !== beforeJournalSha256) await writeFile(JOURNAL, initialJournal);
    if (sha(await readFile(PREPARED)) !== sha(initialPrepared)) await writeFile(PREPARED, initialPrepared);
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
