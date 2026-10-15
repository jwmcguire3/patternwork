import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const journalPath = path.join(runDir, "BUDGET_JOURNAL.json");
const correctionPath = path.join(runDir, "outputs", "C10-JOURNAL-METADATA-CORRECTION.json");
const c10CallId = "379e8908-4d6e-4288-a1ea-9e3a20b274dc";
const missingUnknownCostCallId = "017fbfd7-ec20-47a1-bb09-2f5242debd0b";
const priorUnknownCostCallIds = [
  "48899da5-ce4e-45f2-a493-21ed1db01d8b",
  "e6f9fe4c-500c-4a80-a6e2-230d2ed63fb9",
  missingUnknownCostCallId,
].sort();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  let journalBytes = await readFile(journalPath);
  const journal = JSON.parse(journalBytes.toString("utf8"));
  const call = journal.calls.find((row) => row.callId === c10CallId);
  if (!call || call.profile !== "C10" || call.stage !== "interpretation"
    || !["48899da5-ce4e-45f2-a493-21ed1db01d8b", "e6f9fe4c-500c-4a80-a6e2-230d2ed63fb9"].every((id) => call.carriedUnknownCostCallIds?.includes(id))) {
    throw new Error("The exact C10 interpretation journal record is not in the known pre-correction state.");
  }
  if (call.carriedUnknownCostCallIds.includes(missingUnknownCostCallId)) {
    console.log(JSON.stringify({ status: "already_corrected", callId: c10CallId }, null, 2));
    return;
  }
  const beforeCounters = {
    reservedMicrodollars: journal.reservedMicrodollars,
    settledUpperBoundMicrodollars: journal.settledUpperBoundMicrodollars,
    remainingAuthorizationMicrodollars: journal.remainingAuthorizationMicrodollars,
  };
  const correction = {
    correctionId: randomUUID(),
    correctedAt: new Date().toISOString(),
    artifactType: "append_only_journal_metadata_correction",
    callId: c10CallId,
    field: "carriedUnknownCostCallIds",
    previousValue: [...call.carriedUnknownCostCallIds].sort(),
    correctedValue: priorUnknownCostCallIds,
    omittedCallId: missingUnknownCostCallId,
    journalFileBeforeSha256: sha256(journalBytes),
    reason: "The C10 interpretation journal entry omitted the fourth, transport-timeout P02 call from its carried unknown-cost metadata. All three $0.30 unknown-cost reservations were present in aggregate budget counters; this corrects only the provenance list.",
    monetaryCountersChanged: false,
    monetaryCounters: beforeCounters,
  };
  call.carriedUnknownCostCallIds = priorUnknownCostCallIds;
  journal.journalCorrections ??= [];
  journal.journalCorrections.push(correction);
  await writeFile(correctionPath, `${JSON.stringify(correction, null, 2)}\n`, { flag: "wx" });
  await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  journalBytes = await readFile(journalPath);
  const saved = JSON.parse(journalBytes.toString("utf8"));
  if (saved.reservedMicrodollars !== beforeCounters.reservedMicrodollars
    || saved.settledUpperBoundMicrodollars !== beforeCounters.settledUpperBoundMicrodollars
    || saved.remainingAuthorizationMicrodollars !== beforeCounters.remainingAuthorizationMicrodollars
    || saved.calls.find((row) => row.callId === c10CallId)?.carriedUnknownCostCallIds?.join(",") !== priorUnknownCostCallIds.join(",")) {
    throw new Error("The metadata correction changed budget amounts or did not persist the exact carried-call set.");
  }
  const updated = { ...correction, journalFileAfterSha256: sha256(journalBytes) };
  await writeFile(correctionPath, `${JSON.stringify(updated, null, 2)}\n`, { flag: "w" });
  console.log(JSON.stringify({ status: "metadata_corrected", callId: c10CallId,
    carriedUnknownCostCallIds: priorUnknownCostCallIds, monetaryCountersChanged: false,
    reservedMicrodollars: saved.reservedMicrodollars, settledUpperBoundMicrodollars: saved.settledUpperBoundMicrodollars,
    remainingAuthorizationMicrodollars: saved.remainingAuthorizationMicrodollars,
    correctionFile: "outputs/C10-JOURNAL-METADATA-CORRECTION.json" }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
