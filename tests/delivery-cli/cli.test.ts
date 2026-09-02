import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyCliInput } from "../../scripts/report-cli/input.ts";
import { parseReportCliArguments } from "../../scripts/report-cli/index.ts";
import { codexExecArguments } from "../../scripts/report-cli/process.ts";

test("CLI constructs an ephemeral read-only codex exec command", () => {
  assert.deepEqual(codexExecArguments({ schemaPath: "schema.json", outputPath: "last.json" }), ["exec", "--ephemeral", "--sandbox", "read-only", "--output-schema", "schema.json", "--output-last-message", "last.json", "-"]);
});

test("CLI requires input/output and does not persist by default", () => {
  assert.deepEqual(parseReportCliArguments(["--input", "results.json", "--output", "reports"]), { input: "results.json", output: "reports" });
  assert.deepEqual(parseReportCliArguments(["--input", "results.json", "--output", "reports", "--persist-assessment", "session-1"]), { input: "results.json", output: "reports", persistAssessmentId: "session-1" });
  assert.throws(() => parseReportCliArguments([]), /Usage/u);
});

test("CLI recognizes validated packet input mode", async () => {
  const packet = JSON.parse(await readFile("specs/patternwork/question-engine-v3.1/12a_respondent_a_packet.json", "utf8"));
  const input = await classifyCliInput([packet]);
  assert.equal(input.mode, "packets");
  if (input.mode === "packets") assert.equal(input.prepared.packets[0].packet_id, packet.packet_id);
});
