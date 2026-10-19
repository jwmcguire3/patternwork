import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(runDir, "..", "..", "..", "..", "..");
const fixtureRoot = path.join(runDir, "qualification", "pwrp71", "route_replays_v5");
const preparedRoot = path.join(runDir, "prepared");
const outputRoot = path.join(runDir, "outputs");
const expectedQuestionSource = "a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832";
const expectedQuestionManifest = "144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc";
const sha = (value) => createHash("sha256").update(value).digest("hex");

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  const bankPath = path.join(repoRoot, "specs", "patternwork", "question-engine-v5.1", "assessment_runtime", "assessment", "question_bank.json");
  const sourceManifestPath = path.join(repoRoot, "specs", "patternwork", "question-engine-v5.1", "assessment_runtime", "SOURCE_MANIFEST.json");
  const manifest = await json(sourceManifestPath);
  const bankRaw = await readFile(bankPath);
  if (manifest.source_binding.source_sha256 !== expectedQuestionSource
    || sha(await readFile(sourceManifestPath)) !== expectedQuestionManifest
    || sha(bankRaw) !== manifest.files["assessment/question_bank.json"]) {
    throw new Error("The PWQE question source manifest or question bank changed.");
  }
  const bank = JSON.parse(bankRaw.toString("utf8"));

  for (const profileId of ["P02", "C10"]) {
    const fixturePath = path.join(fixtureRoot, profileId + ".json");
    const fixture = await json(fixturePath);
    const prepared = await json(path.join(preparedRoot, profileId + ".interpretation.input.json"));
    const packet = prepared.evidencePacket;
    const sourceAnswers = fixture.replay.submittedSourceToRuntimeResponses.filter((answer) =>
      answer.provenance === "original_authored_fictional_response");
    const byRuntimeId = new Map(sourceAnswers.map((answer) => [answer.runtimeResponseId, answer]));
    const indexed = [];
    for (const observation of packet.observations) {
      if (!observation.selection_reason?.includes("original_authored_fictional_response")) continue;
      const answer = byRuntimeId.get(observation.response_id);
      const item = bank.items.find((candidate) => candidate.id === observation.item_id);
      const option = item?.options.find((candidate) => candidate.id === observation.option_id);
      if (!answer || !item || !option) throw new Error(profileId + " observation " + observation.id + " cannot be bound to its source response and option.");
      const matchingStep = answer.stepId === observation.step_id
        || (answer.mode === "ordered" && observation.step_id === answer.stepId + "/" + observation.option_id);
      if (answer.questionId !== observation.item_id || !answer.selectedOptionIds.includes(observation.option_id)
        || answer.occurrenceId !== observation.occurrence_id || !matchingStep
        || option.text !== observation.text || option.reported_value !== observation.reported_value) {
        throw new Error(profileId + " observation " + observation.id + " conflicts with the original response or current authored option.");
      }
      if (packet.superseded_response_ids.includes(observation.response_id)
        || packet.invalidated_response_ids.includes(observation.response_id)) {
        throw new Error(profileId + " observation " + observation.id + " is not current.");
      }
      indexed.push({
        observation_id: observation.id,
        source_response_id: answer.sourceResponseId,
        current_response_id: answer.runtimeResponseId,
        phase: answer.phase,
        item_id: observation.item_id,
        option_id: observation.option_id,
        selected_text: option.text,
        occurrence_id: observation.occurrence_id,
        step_id: observation.step_id,
        source_response_step_id: answer.stepId,
        basis: observation.basis,
        capture: observation.capture,
        target_ids: answer.targetIds,
        dependence_group: observation.dependence_group,
      });
    }
    const output = {
      schemaVersion: "PATTERNWORK-PWRP71-SOURCE-OBSERVATION-INDEX-V1",
      status: "source_cross_checked_fictional_evidence",
      profileId,
      fixtureSet: "route-replays-v5",
      packetSha256: prepared.packetSha256,
      fixtureSha256: sha(await readFile(fixturePath)),
      questionSourceSha256: manifest.source_binding.source_sha256,
      questionSourceManifestSha256: expectedQuestionManifest,
      questionBankSha256: sha(bankRaw),
      originalAuthoredObservationCount: indexed.length,
      syntheticObservationsExcludedFromIndex: packet.observations.length - indexed.length,
      occurrenceIds: [...new Set(indexed.map((observation) => observation.occurrence_id))],
      sequenceEdges: packet.sequence_edges,
      observations: indexed,
    };
    const outputPath = path.join(outputRoot, profileId + ".source-observation-index-v3.json");
    await writeFile(outputPath, JSON.stringify(output, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ profileId, observationCount: indexed.length, occurrenceIds: output.occurrenceIds, outputPath: path.relative(runDir, outputPath) }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
