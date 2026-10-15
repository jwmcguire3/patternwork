import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RUN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(RUN_DIR, "..", "..", "..", "..", "..");
const DISPATCH = path.join(RUN_DIR, "scripts", "dispatch-openai-experiment.mjs");
const JOURNAL = path.join(RUN_DIR, "BUDGET_JOURNAL.json");
const ATTEMPT2_REQUEST = path.join(RUN_DIR, "requests", "C10.composition.attempt-2.request.json");
const ATTEMPT2_RESPONSE = path.join(RUN_DIR, "responses", "C10.composition.attempt-2.response.json");
const PREFLIGHT_OUTPUT = path.join(RUN_DIR, "C10-COMPOSITION-ATTEMPT3-PREFLIGHT.json");
const OUTPUT = path.join(RUN_DIR, "C10-COMPOSITION-OUTPUT-RECOVERY-GUARDS.json");
const OUTPUT_POST_DISPATCH = path.join(RUN_DIR, "C10-COMPOSITION-OUTPUT-RECOVERY-POST-DISPATCH-GUARD.json");
const EXPECTED_REQUEST_SHA256 = "7f101eb0a1c5294d65496c912e6c86832d3aaa9cd70148d7f32c054d22370e59";
const BASE = [
  "--operator-authorized", "yes", "--profile", "C10", "--stage", "composition",
  "--authorize-up-to-microdollars", "3000000", "--per-call-reservation-microdollars", "300000",
  "--owner-authorized-continue-with-locked-unknown", "yes",
  "--owner-authorized-c10-curated-graph", "yes",
  "--owner-authorized-c10-composition-output-recovery", "yes",
  "--preflight-only", "yes",
];

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function inventory(directory) { return (await readdir(directory)).sort(); }
function invoke(args) {
  const environment = { ...process.env };
  delete environment.OPENAI_API_KEY;
  return spawnSync(process.execPath, [DISPATCH, ...args], { cwd: ROOT, env: environment, encoding: "utf8", timeout: 30_000 });
}
async function withMutation(file, mutate, run) {
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
async function withBytes(file, changedBytes, run) {
  const original = await readFile(file);
  try {
    await writeFile(file, changedBytes);
    return run();
  } finally {
    await writeFile(file, original);
  }
}

async function main() {
  const originalJournal = await readFile(JOURNAL);
  const originalRequest = await readFile(ATTEMPT2_REQUEST);
  const originalResponse = await readFile(ATTEMPT2_RESPONSE);
  const journal = JSON.parse(originalJournal.toString("utf8"));
  const attempt2 = journal.calls.find((call) => call.callId === "59ed2153-c048-46fa-8310-a86fa6b3a3c6");
  if (!attempt2) throw new Error("The C10 attempt-2 predecessor record is unavailable.");
  const existingAttempt3 = journal.calls.find((call) => call.profile === "C10" && call.stage === "composition" && call.attemptNumber === 3);
  if (existingAttempt3) {
    const beforeJournal = sha(originalJournal);
    const beforeFiles = {
      requests: await inventory(path.join(RUN_DIR, "requests")),
      responses: await inventory(path.join(RUN_DIR, "responses")),
      outputs: await inventory(path.join(RUN_DIR, "outputs")),
    };
    const replay = invoke(BASE);
    const afterJournal = await readFile(JOURNAL);
    const afterFiles = {
      requests: await inventory(path.join(RUN_DIR, "requests")),
      responses: await inventory(path.join(RUN_DIR, "responses")),
      outputs: await inventory(path.join(RUN_DIR, "outputs")),
    };
    const sideEffectsAbsent = beforeJournal === sha(afterJournal) && JSON.stringify(beforeFiles) === JSON.stringify(afterFiles);
    const rejected = replay.status !== 0;
    const result = {
      schemaVersion: "PATTERNWORK-C10-COMPOSITION-OUTPUT-RECOVERY-POST-DISPATCH-GUARD-V1",
      status: rejected && sideEffectsAbsent ? "passed" : "failed",
      executedAt: new Date().toISOString(),
      existingAttempt3CallId: existingAttempt3.callId,
      existingAttempt3Status: existingAttempt3.status,
      replayExitCode: replay.status,
      replayRejected: rejected,
      replayError: replay.stderr.trim().slice(0, 500),
      providerDispatches: 0,
      sideEffectsAbsent,
      note: "The one-use recovery CLI was invoked after attempt 3 was journaled; it rejected the replay without changing the journal or request/response/output inventories.",
    };
    await writeFile(OUTPUT_POST_DISPATCH, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ status: result.status, replayRejected: rejected, providerDispatches: 0,
      sideEffectsAbsent, output: path.relative(RUN_DIR, OUTPUT_POST_DISPATCH).replaceAll("\\", "/") }, null, 2));
    if (result.status !== "passed") process.exitCode = 1;
    return;
  }
  const before = {
    journal: sha(originalJournal), request: sha(originalRequest), response: sha(originalResponse),
    requests: await inventory(path.join(RUN_DIR, "requests")),
    responses: await inventory(path.join(RUN_DIR, "responses")),
    outputs: await inventory(path.join(RUN_DIR, "outputs")),
  };
  const scenarios = [];
  const recordReject = (id, result) => scenarios.push({ id, exitCode: result.status, rejected: result.status !== 0,
    stderr: result.stderr.trim().slice(0, 350) });
  const run = (id, args = BASE) => recordReject(id, invoke(args));
  const removePair = (args, option) => {
    const copy = [...args]; const index = copy.indexOf(option);
    if (index >= 0) copy.splice(index, 2);
    return copy;
  };
  const replace = (args, from, to) => args.map((value) => value === from ? to : value);

  try {
    run("missing_explicit_operator_authorization", removePair(BASE, "--operator-authorized"));
    run("missing_recovery_authorization", removePair(BASE, "--owner-authorized-c10-composition-output-recovery"));
    run("missing_curated_graph_authorization", removePair(BASE, "--owner-authorized-c10-curated-graph"));
    run("missing_locked-unknown_continuation_authorization", removePair(BASE, "--owner-authorized-continue-with-locked-unknown"));
    run("out_of_scope_profile_c03", replace(BASE, "C10", "C03"));
    run("wrong_stage", replace(BASE, "composition", "interpretation"));
    run("enlarged_aggregate_limit", replace(BASE, "3000000", "3000001"));
    run("changed_per_call_reservation", replace(BASE, "300000", "400000"));
    run("provider_override", [...BASE, "--provider", "azure"]);
    run("model_override", [...BASE, "--model", "other-model"]);
    run("output_cap_override", [...BASE, "--max-output-tokens", "16000"]);
    run("mix_no_dispatch_and_incomplete_recovery", [...BASE, "--owner-authorized-c10-composition-no-dispatch-recovery", "yes"]);

    await withMutation(JOURNAL, (current) => {
      current.calls.find((call) => call.callId === attempt2.callId).responseId = "resp-tampered";
    }, () => run("changed_attempt2_response_identity"));
    await withMutation(JOURNAL, (current) => {
      current.calls.find((call) => call.callId === attempt2.callId).packetSha256 = "0".repeat(64);
    }, () => run("changed_attempt2_packet_pin"));
    await withMutation(JOURNAL, (current) => {
      const unknown = current.calls.find((call) => call.status === "unknown_cost");
      unknown.reservationMicrodollars = 0;
      current.reservedMicrodollars -= 300_000;
      current.remainingAuthorizationMicrodollars += 300_000;
    }, () => run("released_prior_unknown_cost_reserve"));
    await withBytes(ATTEMPT2_REQUEST, Buffer.from(`${originalRequest.toString("utf8")} `),
      () => run("changed_prior_serialized_request"));
    await withBytes(ATTEMPT2_RESPONSE, Buffer.from(`${originalResponse.toString("utf8")} `),
      () => run("changed_prior_provider_response"));

    const fakeAttempt3 = await withMutation(JOURNAL, (current) => {
      current.calls.push({ callId: "synthetic-attempt3-replay-control", profile: "C10", stage: "composition",
        reportType: "IFS", status: "reserved", reservationMicrodollars: 300_000 });
      current.reservedMicrodollars += 300_000;
      current.remainingAuthorizationMicrodollars -= 300_000;
    }, () => invoke(BASE));
    recordReject("one_time_attempt_replay", fakeAttempt3);

    const exact = invoke(BASE);
    let preflight;
    try { preflight = JSON.parse(exact.stdout); } catch {}
    scenarios.push({ id: "exact_attempt3_preflight_no_dispatch", exitCode: exact.status,
      status: preflight?.status, attemptNumber: preflight?.attemptNumber,
      maxOutputTokens: preflight?.maxOutputTokens, requestBodySha256: preflight?.requestBodySha256,
      expectedRequestSha256: preflight?.expectedRequestSha256,
      quotedReservationUpperBoundMicrodollars: preflight?.quotedReservationUpperBoundMicrodollars,
      retainedUnknownReservationMicrodollars: preflight?.existingUnknownReservationMicrodollars,
      additionalReservationMicrodollars: preflight?.additionalReservationMicrodollars,
      remainingAfterReservationMicrodollars: preflight?.remainingAuthorizationAfterReservationMicrodollars,
      providerDispatches: preflight?.providerDispatches });

    const afterJournal = await readFile(JOURNAL);
    const afterRequest = await readFile(ATTEMPT2_REQUEST);
    const afterResponse = await readFile(ATTEMPT2_RESPONSE);
    const after = {
      journal: sha(afterJournal), request: sha(afterRequest), response: sha(afterResponse),
      requests: await inventory(path.join(RUN_DIR, "requests")),
      responses: await inventory(path.join(RUN_DIR, "responses")),
      outputs: await inventory(path.join(RUN_DIR, "outputs")),
    };
    const sideEffectsAbsent = JSON.stringify(before) === JSON.stringify(after);
    const invalidRequestsRejected = scenarios.slice(0, -1).every((row) => row.rejected === true);
    const exactPreflightPassed = exact.status === 0
      && preflight?.status === "fictional_c10_composition_attempt3_preflight_passed_no_dispatch"
      && preflight?.qualificationStatus === "FICTIONAL_DIAGNOSTIC_ONLY_NOT_ROUTING_QUALIFICATION_OR_PRODUCTION_APPROVAL"
      && preflight?.profile === "C10" && preflight?.reportType === "IFS" && preflight?.stage === "composition"
      && preflight?.attemptNumber === 3 && preflight?.maxOutputTokens === 128_000
      && preflight?.requestBodySha256 !== EXPECTED_REQUEST_SHA256
      && preflight?.requestBodySha256 === preflight?.expectedRequestSha256
      && preflight?.matchesApprovedRequest === true
      && preflight?.quotedReservationUpperBoundMicrodollars === 106_034
      && preflight?.existingUnknownReservationMicrodollars === 900_000
      && preflight?.additionalReservationMicrodollars === 300_000
      && preflight?.remainingAuthorizationAfterReservationMicrodollars === 1_666_752
      && preflight?.providerDispatches === 0;
    const ok = invalidRequestsRejected && exactPreflightPassed && sideEffectsAbsent;
    const result = {
      schemaVersion: "PATTERNWORK-C10-COMPOSITION-OUTPUT-RECOVERY-GUARDS-V1",
      status: ok ? "passed" : "failed",
      executedAt: new Date().toISOString(),
      profile: "C10", stage: "composition", reportType: "IFS", attemptNumber: 3,
      diagnosticOnly: true, providerDispatches: 0,
      sourceRequestSha256: EXPECTED_REQUEST_SHA256,
      requestedMaxOutputTokens: 128_000,
      scenarios,
      invalidRequestsRejected,
      exactPreflightPassed,
      sideEffectsAbsent,
      note: "Mutated predecessor records and bytes were restored in finally blocks. All invocations were no-dispatch preflights with OPENAI_API_KEY removed.",
    };
    if (preflight) await writeFile(PREFLIGHT_OUTPUT, `${JSON.stringify(preflight, null, 2)}\n`);
    await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ status: result.status, scenarioCount: scenarios.length,
      rejectedCases: scenarios.filter((row) => row.rejected === true).length,
      providerDispatches: 0, exactPreflightPassed, sideEffectsAbsent,
      preflight: path.relative(RUN_DIR, PREFLIGHT_OUTPUT).replaceAll("\\", "/"),
      guards: path.relative(RUN_DIR, OUTPUT).replaceAll("\\", "/") }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    if (sha(await readFile(JOURNAL)) !== before.journal) await writeFile(JOURNAL, originalJournal);
    if (sha(await readFile(ATTEMPT2_REQUEST)) !== before.request) await writeFile(ATTEMPT2_REQUEST, originalRequest);
    if (sha(await readFile(ATTEMPT2_RESPONSE)) !== before.response) await writeFile(ATTEMPT2_RESPONSE, originalResponse);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
