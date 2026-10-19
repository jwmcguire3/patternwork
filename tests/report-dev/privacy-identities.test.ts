import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadPrivacyIdentityContext } from "../../scripts/report-dev/privacy-identities.ts";

test("identity sidecar accepts only bounded local comparison lists", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "patternwork-identities-"));
  try {
    const file = path.join(directory, "identities.json");
    await writeFile(file, JSON.stringify({ identityInventoryReviewed: true, respondentNames: ["Mara Jones"], accountIds: ["acct-78421"], emails: ["mara@example.test"], otherIdentityTokens: [] }));
    const context = await loadPrivacyIdentityContext(file);
    assert.deepEqual(context, { identityInventoryReviewed: true, respondentNames: ["Mara Jones"], accountIds: ["acct-78421"], emails: ["mara@example.test"], otherIdentityTokens: [] });
    await writeFile(file, JSON.stringify({ identityInventoryReviewed: true, respondentNames: [], accountIds: [], emails: [], otherIdentityTokens: [] }));
    assert.deepEqual(await loadPrivacyIdentityContext(file), { identityInventoryReviewed: true, respondentNames: [], accountIds: [], emails: [], otherIdentityTokens: [] });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("identity sidecar requires a reviewed complete inventory and rejects arbitrary fields", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "patternwork-identities-"));
  try {
    const file = path.join(directory, "identities.json");
    await writeFile(file, JSON.stringify({ identityInventoryReviewed: true, respondentNames: ["Mara Jones"], assessment: "must not be accepted" }));
    await assert.rejects(loadPrivacyIdentityContext(file), /unsupported field/u);
    await writeFile(file, JSON.stringify({ respondentNames: [], accountIds: [], emails: [], otherIdentityTokens: [] }));
    await assert.rejects(loadPrivacyIdentityContext(file), /reviewed identity inventory/u);
    await writeFile(file, JSON.stringify({ identityInventoryReviewed: true, respondentNames: [] }));
    await assert.rejects(loadPrivacyIdentityContext(file), /reviewed identity inventory/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
