import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dispatcher = path.join(runDir, "scripts", "dispatch-openai-experiment.mjs");
const journalPath = path.join(runDir, "BUDGET_JOURNAL.json");
const preparedPath = path.join(runDir, "prepared", "P02.interpretation.input.json");
const outputPath = path.join(runDir, "TRANSPORT_RECOVERY_GUARDS.json");
const preflightPath = path.join(runDir, "ATTEMPT5_PREFLIGHT.json");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const base = [
  "--operator-authorized", "yes",
  "--profile", "P02",
  "--stage", "interpretation",
  "--authorize-up-to-microdollars", "3000000",
  "--per-call-reservation-microdollars", "300000",
  "--owner-authorized-transport-recovery", "yes",
  "--preflight-only", "yes",
];
const noDispatchEnv = { ...process.env, OPENAI_API_KEY: "" };

function run(args) {
  const child = spawnSync(process.execPath, [dispatcher, ...args], {
    cwd: path.resolve(runDir, "..", "..", "..", "..", ".."),
    encoding: "utf8",
    env: noDispatchEnv,
    timeout: 30_000,
    windowsHide: true,
  });
  return { status: child.status, signal: child.signal, stdout: child.stdout, stderr: child.stderr };
}

const journalBefore = await readFile(journalPath);
const preparedBefore = await readFile(preparedPath);
const scenarios = [];
function rejected(name, args) {
  const result = run(args);
  assert.notEqual(result.status, 0, `${name} must be rejected`);
  assert.equal(result.signal, null, `${name} must exit normally`);
  scenarios.push({ name, rejected: true, exitCode: result.status, providerDispatches: 0, error: result.stderr.trim() || result.stdout.trim() });
}

try {
  const accepted = run(base);
  assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
  const preflight = JSON.parse(accepted.stdout);
  await writeFile(preflightPath, `${JSON.stringify(preflight, null, 2)}\n`);
  assert.equal(preflight.status, "fictional_diagnostic_attempt5_preflight_passed_no_dispatch");
  assert.equal(preflight.qualificationStatus, "FICTIONAL_DIAGNOSTIC_ONLY_NOT_ROUTING_QUALIFICATION_OR_PRODUCTION_APPROVAL");
  assert.equal(preflight.profile, "P02");
  assert.equal(preflight.reportType, "IFS");
  assert.equal(preflight.stage, "interpretation");
  assert.equal(preflight.attemptNumber, 5);
  assert.equal(preflight.model, "gpt-6-luna");
  assert.equal(preflight.reasoningEffort, "max");
  assert.equal(preflight.serviceTier, "default");
  assert.equal(preflight.maxOutputTokens, 128_000);
  assert.equal(preflight.requestBodySha256, "f8c36e20ba9043a8bfc4392c7b11c174f6766d60b796ab175c4ee29cdd5b9cb6");
  assert.equal(preflight.existingUnknownReservationMicrodollars, 900_000);
  assert.equal(preflight.additionalReservationMicrodollars, 300_000);
  assert.equal(preflight.remainingAuthorizationAfterReservationMicrodollars, 1_780_350);
  assert.deepEqual(preflight.carriedUnknownCostCallIds.sort(), [
    "017fbfd7-ec20-47a1-bb09-2f5242debd0b",
    "48899da5-ce4e-45f2-a493-21ed1db01d8b",
    "e6f9fe4c-500c-4a80-a6e2-230d2ed63fb9",
  ].sort());
  assert.equal(preflight.providerDispatches, 0);
  scenarios.push({ name: "exact_authorized_attempt5_preflight", accepted: true, providerDispatches: 0, result: preflight });

  rejected("missing_operator_authorization", base.filter((value, index, all) => !(value === "--operator-authorized" || all[index - 1] === "--operator-authorized")));
  rejected("operator_authorization_not_yes", base.map((value, index) => index === 1 ? "no" : value));
  rejected("out_of_scope_profile_c03", base.map((value, index) => index === 3 ? "C03" : value));
  rejected("out_of_scope_report_stage", base.map((value, index) => index === 5 ? "MAP" : value));
  rejected("missing_aggregate_limit", base.filter((value, index, all) => !(value === "--authorize-up-to-microdollars" || all[index - 1] === "--authorize-up-to-microdollars")));
  rejected("enlarged_aggregate_limit", base.map((value, index) => index === 7 ? "3000001" : value));
  rejected("missing_per_call_limit", base.filter((value, index, all) => !(value === "--per-call-reservation-microdollars" || all[index - 1] === "--per-call-reservation-microdollars")));
  rejected("enlarged_per_call_limit", base.map((value, index) => index === 9 ? "300001" : value));
  rejected("invalid_transport_authorization", base.map((value, index) => index === 11 ? "true" : value));
  rejected("conflicting_recovery_authorizations", [...base.slice(0, -2), "--owner-authorized-final-p02-interpretation", "yes", ...base.slice(-2)]);
  rejected("provider_dispatch_without_preflight_or_key", base.slice(0, -2));

  assert.equal(sha256(await readFile(journalPath)), sha256(journalBefore), "preflight/rejections must not mutate the budget journal");
  assert.equal(sha256(await readFile(preparedPath)), sha256(preparedBefore), "preflight/rejections must not mutate the prepared packet");
  const attempt5RequestPath = path.join(runDir, "requests", "P02.interpretation.attempt-5.request.json");
  await assert.rejects(readFile(attempt5RequestPath), (error) => error.code === "ENOENT");

  const result = {
    schemaVersion: "PATTERNWORK-PWRP71-ATTEMPT5-TRANSPORT-RECOVERY-GUARDS-V1",
    status: "passed",
    execution: "CLI no-dispatch checks; no provider credential used and zero provider dispatches",
    providerDispatches: 0,
    scenarios,
    journalSha256: sha256(journalBefore),
    preparedInputSha256: sha256(preparedBefore),
  };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const result = {
    schemaVersion: "PATTERNWORK-PWRP71-ATTEMPT5-TRANSPORT-RECOVERY-GUARDS-V1",
    status: "failed",
    execution: "CLI no-dispatch checks; no provider credential used",
    providerDispatches: 0,
    scenarios,
    error: error instanceof Error ? error.message : String(error),
    journalSha256Before: sha256(journalBefore),
    journalSha256After: sha256(await readFile(journalPath)),
    preparedInputSha256Before: sha256(preparedBefore),
    preparedInputSha256After: sha256(await readFile(preparedPath)),
  };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}
