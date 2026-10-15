import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RUN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(RUN_DIR, "..", "..", "..", "..", "..");
const DISPATCH = path.join(RUN_DIR, "scripts", "dispatch-openai-experiment.mjs");
const JOURNAL = path.join(RUN_DIR, "BUDGET_JOURNAL.json");
const RECEIPT = path.join(RUN_DIR, "outputs", "P02-COMPOSITION-PREFLIGHT.json");
const REQUEST_SHA256 = "952e7c4588a2b88b8eb740dcc44c192071874c6d6203cea052753d51b103447b";
const BASE = [
  "--operator-authorized", "yes", "--profile", "P02", "--stage", "composition",
  "--authorize-up-to-microdollars", "3000000", "--per-call-reservation-microdollars", "300000",
  "--owner-authorized-continue-with-locked-unknown", "yes",
  "--owner-authorized-p02-curated-evidence-correction", "yes", "--preflight-only", "yes",
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function inventory(relative) { return (await readdir(path.join(RUN_DIR, relative))).sort(); }
function invoke(args) {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  return spawnSync(process.execPath, [DISPATCH, ...args], { cwd: ROOT, env, encoding: "utf8", timeout: 45_000 });
}

async function main() {
  const beforeJournal = await readFile(JOURNAL);
  const before = {
    journal: sha(beforeJournal),
    requests: await inventory("requests"),
    responses: await inventory("responses"),
    outputs: await inventory("outputs"),
  };
  const without = (flag) => BASE.filter((value, index, values) => values[index - 1] !== flag && value !== flag);
  const scenarios = [
    { id: "missing_operator_authorization", args: without("--operator-authorized") },
    { id: "missing_aggregate_cap", args: without("--authorize-up-to-microdollars") },
    { id: "enlarged_aggregate_cap", args: BASE.map((value) => value === "3000000" ? "3000001" : value) },
    { id: "enlarged_per_call_reservation", args: BASE.map((value) => value === "300000" ? "300001" : value) },
    { id: "out_of_scope_profile", args: BASE.map((value) => value === "P02" ? "C03" : value) },
    { id: "invalid_report_type", args: [...BASE, "--report-type", "PV"] },
    { id: "missing_derivative_authorization", args: without("--owner-authorized-p02-curated-evidence-correction") },
    { id: "wrong_derivative_scope", args: BASE.map((value) => value === "composition" ? "interpretation" : value) },
    { id: "provider_override", args: [...BASE, "--provider", "azure"] },
  ];
  const rows = scenarios.map(({ id, args }) => {
    const result = invoke(args);
    return { scenario: id, exitCode: result.status, rejected: result.status !== 0,
      stderr: String(result.stderr).trim().slice(0, 400) };
  });
  const valid = invoke(BASE);
  let preflight;
  try { preflight = JSON.parse(valid.stdout); } catch { preflight = null; }
  rows.push({ scenario: "exact_p02_composition_preflight_no_dispatch", exitCode: valid.status,
    rejected: false, status: preflight?.status, requestBodySha256: preflight?.requestBodySha256,
    maxOutputTokens: preflight?.maxOutputTokens, quotedReservationUpperBoundMicrodollars: preflight?.quotedReservationUpperBoundMicrodollars,
    providerDispatches: preflight?.providerDispatches });
  const afterJournal = await readFile(JOURNAL);
  const after = {
    journal: sha(afterJournal),
    requests: await inventory("requests"),
    responses: await inventory("responses"),
    outputs: await inventory("outputs"),
  };
  const sideEffectsAbsent = JSON.stringify(before) === JSON.stringify(after);
  const exactPreflightPassed = valid.status === 0 && preflight?.providerDispatches === 0
    && preflight?.profile === "P02" && preflight?.reportType === "IFS" && preflight?.stage === "composition"
    && preflight?.packetSha256 === "a28c19101cb596fca4e395806793944cc5135fc1b619a450161e3e9dcac8d497"
    && preflight?.requestBodySha256 === REQUEST_SHA256 && preflight?.maxOutputTokens === 128_000
    && preflight?.quotedReservationUpperBoundMicrodollars === 102_223
    && preflight?.existingUnknownReservationMicrodollars === 900_000
    && preflight?.additionalReservationMicrodollars === 300_000
    && preflight?.remainingAuthorizationAfterReservationMicrodollars === 1_647_811;
  const ok = rows.slice(0, scenarios.length).every((row) => row.rejected) && exactPreflightPassed && sideEffectsAbsent;
  const receipt = {
    schemaVersion: "PATTERNWORK-PWRP71-P02-CURATED-COMPOSITION-PREFLIGHT-V1",
    status: ok ? "passed_no_dispatch" : "failed",
    recordedAt: new Date().toISOString(),
    command: ["node", "scripts/dispatch-openai-experiment.mjs", ...BASE],
    apiKeyAvailableToPreflightProcess: false,
    adversarialScenarioCount: scenarios.length,
    scenarios: rows,
    before,
    after,
    sideEffectsAbsent,
    exactPreflightPassed,
    result: preflight,
    stdoutSha256: valid.stdout ? sha(Buffer.from(valid.stdout)) : null,
    providerDispatches: 0,
    boundary: "This is a bounded fictional P02 IFS composition diagnostic only; it does not establish routing qualification, human approval, or production release readiness.",
  };
  await writeFile(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: receipt.status, adversarialScenarioCount: scenarios.length,
    rejectedCases: rows.slice(0, scenarios.length).filter((row) => row.rejected).length,
    requestBodySha256: preflight?.requestBodySha256, maxOutputTokens: preflight?.maxOutputTokens,
    reservedUnknownMicrodollars: preflight?.existingUnknownReservationMicrodollars,
    remainingAfterNewReservationMicrodollars: preflight?.remainingAuthorizationAfterReservationMicrodollars,
    providerDispatches: 0, sideEffectsAbsent, receipt: "outputs/P02-COMPOSITION-PREFLIGHT.json" }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
