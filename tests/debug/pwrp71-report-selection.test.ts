import assert from "node:assert/strict";
import test from "node:test";
import { assertDebugProfileEligible, DEBUG_PROFILE_IDS, DEBUG_REPORT_MODES, selectDebugReports } from "../../lib/server/debug/report-runner.ts";

test("PWRP 7.1 debug modes select the requested report sets", () => {
  assert.deepEqual(DEBUG_REPORT_MODES, ["mapping", "ifs", "pv", "att", "deepening", "all"]);
  assert.deepEqual(selectDebugReports("mapping"), ["MAP"]);
  assert.deepEqual(selectDebugReports("ifs"), ["IFS"]);
  assert.deepEqual(selectDebugReports("pv"), ["PV"]);
  assert.deepEqual(selectDebugReports("att"), ["ATT"]);
  assert.deepEqual(selectDebugReports("deepening"), ["IFS", "PV", "ATT"]);
  assert.deepEqual(selectDebugReports("all"), ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"]);
});

test("PWRP 7.1 debug exposes only authored P01–P09 and indexed C01–C16 identities", () => {
  assert.deepEqual(DEBUG_PROFILE_IDS, [
    "P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09",
    "C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08",
    "C09", "C10", "C11", "C12", "C13", "C14", "C15", "C16",
  ]);
});

test("PWRP 7.1 debug refuses a profile before provider execution without final router evidence", async () => {
  const prior = process.env.PWQE51_ROUTING_QUALIFICATION_EVIDENCE_JSON;
  delete process.env.PWQE51_ROUTING_QUALIFICATION_EVIDENCE_JSON;
  try {
    await assert.rejects(
      assertDebugProfileEligible("P01"),
      /debug_router_qualification_pending:P01:Set PWQE51_ROUTING_QUALIFICATION_EVIDENCE_JSON/u,
    );
  } finally {
    if (prior === undefined) delete process.env.PWQE51_ROUTING_QUALIFICATION_EVIDENCE_JSON;
    else process.env.PWQE51_ROUTING_QUALIFICATION_EVIDENCE_JSON = prior;
  }
});
