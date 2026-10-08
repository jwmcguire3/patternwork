import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyCliInput } from "../../scripts/report-cli/input.ts";
import { parseReportCliArguments } from "../../scripts/report-cli/index.ts";
import { codexCompatibleOutputSchema, codexExecArguments, safeCodexDiagnostic } from "../../scripts/report-cli/process.ts";

test("CLI constructs an ephemeral read-only codex exec command", () => {
  assert.deepEqual(codexExecArguments({ schemaPath: "schema.json", outputPath: "last.json" }), ["exec", "--ephemeral", "--sandbox", "read-only", "--output-schema", "schema.json", "--output-last-message", "last.json", "-"]);
});

test("CLI removes unsupported Codex schema hints while preserving canonical structure", () => {
  const schema: Parameters<typeof codexCompatibleOutputSchema>[0] = {
    type: "object",
    allOf: [{ if: { properties: { kind: { const: "x" } } }, then: { required: ["extra"] } }],
    additionalProperties: false,
    properties: {
      source_ids: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", pattern: "^EP-" } },
      section: { oneOf: [{ const: "a" }, { enum: ["b", "c"] }] },
      optional_note: { type: "string" },
      digest: { $ref: "#/$defs/Sha256", description: "canonical-only guidance" },
    },
    required: ["source_ids", "section"],
  };
  assert.deepEqual(codexCompatibleOutputSchema(schema), {
    type: "object",
    additionalProperties: false,
    properties: { source_ids: { type: "array", items: { type: "string" } }, section: { anyOf: [{ const: "a", type: "string" }, { enum: ["b", "c"], type: "string" }] }, optional_note: { type: "string" }, digest: { $ref: "#/$defs/Sha256" } },
    required: ["source_ids", "section", "optional_note", "digest"],
  });
  assert.equal(JSON.stringify(schema).includes('"uniqueItems":true'), true, "canonical input schema remains immutable");
});

test("CLI diagnostics expose schema errors without echoing report input", () => {
  const stderr = `sensitive packet text\nERROR: {"error":{"code":"invalid_json_schema","message":"Echoed sensitive packet text."}}`;
  const diagnostic = safeCodexDiagnostic(stderr);
  assert.equal(diagnostic, "invalid_json_schema: Codex rejected the structured-output request.");
  assert.equal(diagnostic?.includes("sensitive packet text"), false);
  assert.equal(safeCodexDiagnostic("sensitive packet text only"), undefined);
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
