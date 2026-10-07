import test from "node:test";
import assert from "node:assert/strict";
import { Pwrp71ActivationError, assertPwrp71ReportActivationReady } from "../../lib/server/reports/pwrp71-readiness.ts";

test("PWQE 5.1 / PWRP 7.1 remains closed without externally reviewed provider and semantic evidence", async () => {
  await assert.rejects(
    assertPwrp71ReportActivationReady({ manifestJson: "", manifestSha256: "0".repeat(64) }),
    (error: unknown) => error instanceof Pwrp71ActivationError && /independently reviewed provider qualification/u.test(error.message),
  );
});

test("PWRP 7.1 activation rejects a manifest whose deployment digest is not pinned", async () => {
  const manifest = JSON.stringify({ manifestVersion: "pwrp71-qualification-1", status: "reviewed" });
  await assert.rejects(
    assertPwrp71ReportActivationReady({ manifestJson: manifest, manifestSha256: "0".repeat(64) }),
    (error: unknown) => error instanceof Pwrp71ActivationError && /deployment-pinned digest/u.test(error.message),
  );
});
