import assert from "node:assert/strict";
import test from "node:test";
import { runPwqe51ControlContractQualification } from "../../scripts/pwqe51-parity/control-contract-qualification.ts";
import { PWQE51_SOURCE_MANIFEST_SHA256 } from "../../lib/question-engine/pwqe51-source.ts";

test("control semantics have source-pinned contract qualification across all required surfaces", async () => {
  const qualification = await runPwqe51ControlContractQualification();
  assert.equal(qualification.sourceManifestSha256, PWQE51_SOURCE_MANIFEST_SHA256);
  assert.equal(qualification.status, "passed", JSON.stringify(qualification.cases.filter((item) => !item.passed)));
  assert.equal(qualification.caseCount, 5);
  assert.equal(qualification.passedCaseCount, 5);
  assert.deepEqual(qualification.cases.map((item) => item.id), [
    "bind-outcomes-preserve-distinct-closure-meaning",
    "mapping-ready-requires-completed-pass-and-allows-deepening",
    "stopping-budgets-cover-56-72-and-separate-texture-allowance",
    "dependency-correction-invalidates-only-withdrawn-support",
    "candidate-rejection-reasons-preserve-permission-and-basis",
  ]);
});
