import assert from "node:assert/strict";
import test from "node:test";
import { runPwqe51ReplayContractQualification } from "../../scripts/pwqe51-parity/replay-contract-qualification.ts";

test("original C07 independently qualifies the controlled replay session contract", async () => {
  const qualification = await runPwqe51ReplayContractQualification();
  assert.equal(qualification.status, "passed");
  assert.equal(qualification.sourceManifestSha256, "144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc");
  assert.equal(qualification.fixtureSha256.length, 64);
  assert.equal(qualification.cases.length, 5);
  assert.ok(qualification.cases.every((qualificationCase) => qualificationCase.passed), JSON.stringify(qualification.cases));
});
