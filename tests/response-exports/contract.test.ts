import assert from "node:assert/strict";
import test from "node:test";
import { buildPwre1Content } from "../../lib/server/exports/service.ts";
import { createPwre1Envelope, serializePwre1Envelope } from "../../lib/server/exports/canonical.ts";
import { renderAndVerifyResponseExportPdf, renderResponseExportPdf } from "../../lib/server/exports/pdf.ts";

function fixture() {
  const row = {
    responseId: "response-1", interactionInstanceId: "interaction-1", bankItemId: "MS-101", bankItemVersion: "1.0", administrationSequence: 1,
    completionState: "COMPLETED", responseCiphertext: Buffer.alloc(1), responseNonce: Buffer.alloc(1), encryptionKeyVersion: "v1",
    answeredAt: new Date("2026-09-02T10:00:00.000Z"), skippedAt: null, updatedAt: new Date("2026-09-02T10:01:00.000Z"),
  };
  const snapshot = {
    assessmentSessionId: "session-1", snapshotId: "snapshot-1", snapshotRevision: "1", completedPass: 1, completionMode: "pass1_complete", lastCompletedStage: "S2", safeResumeStage: "S3",
    contractId: "contract", integrityContractId: "integrity", packetVersion: "package", canonicalJsonSha256: "unused", canonicalJsonCiphertext: Buffer.alloc(1), canonicalJsonNonce: Buffer.alloc(1), encryptionKeyVersion: "v1",
    completedAt: new Date("2026-09-02T11:00:00.000Z"), frozenAt: new Date("2026-09-02T11:00:01.000Z"),
    assessmentSession: { assessmentKey: "patternwork-v3.1", status: "PASS1_COMPLETE", retentionExpiresAt: new Date("2026-10-01T00:00:00.000Z"), sourceRelease: { packageVersion: "3.1", promptRelease: "4.1", sourceManifestSha256: "a".repeat(64) }, responses: [row] },
  };
  const definition = {
    bankItemId: "MS-101", version: "1.0", title: "The unanswered message", prompt: "What did you notice first?", authoredContentSha256: "b".repeat(64),
    optionGroups: [{ groupId: "authored", label: "Choices", options: [{ optionId: "OPT-FIRST", label: "A tight chest", authored: "A tight chest" }, { optionId: "OPT-SECOND", label: "Racing thoughts", authored: "Racing thoughts" }] }],
    responseLibraryReferences: [], responseLibraryIds: [],
  };
  const manifest = { itemById: new Map([["MS-101", definition]]), responseLibraries: [] };
  const canonicalSnapshot = { responses: [{ responseId: "response-1", interactionInstanceId: "interaction-1", bankItemId: "MS-101", bankItemVersion: "1.0", administrationSequence: 1, completionState: "COMPLETED", responseOrder: ["OPT-SECOND", "OPT-FIRST"] }] };
  const decryptedResponses = new Map<string, unknown>([["interaction-1", { response: { schemaVersion: "PWRS-1", semantic: { choices: ["OPT-FIRST"], safetyContext: "unsafe", coverageSectionCodes: ["IFS-01"] }, privateNote: "This stayed private.", trustedEvidence: { selectedOptionIds: ["SHOULD-NOT-LEAK"] } }, email: "person@example.com", routing_state: { stage: "S1" } }]]);
  return { snapshot, canonicalSnapshot, manifest, decryptedResponses };
}

test("PWRE-1 includes authored answers and private notes while excluding trusted and internal data", () => {
  const value = fixture();
  const content = buildPwre1Content({ ...value, snapshot: value.snapshot as never, manifest: value.manifest as never });
  const envelope = createPwre1Envelope(content);
  const json = serializePwre1Envelope(envelope).toString("utf8");
  assert.match(json, /What did you notice first\?/u);
  assert.match(json, /A tight chest/u);
  assert.match(json, /Racing thoughts/u);
  assert.match(json, /This stayed private\./u);
  assert.match(json, /Context safety/u);
  assert.match(json, /Threatening, coercive, or unsafe/u);
  assert.doesNotMatch(json, /trustedEvidence|SHOULD-NOT-LEAK|person@example\.com|routing_state|safetyContext|coverageSectionCodes|contractId|integrityContractId|packageVersion|promptRelease|sourceManifestSha256|authoredContentSha256|snapshotId|snapshotRevision|optionId|OPT-FIRST|OPT-SECOND|MS-101/u);
  assert.match(envelope.contentSha256, /^[a-f0-9]{64}$/u);
});

test("JSON and in-memory PDF share the PWRE-1 content digest and useful reader content", async () => {
  const value = fixture();
  const envelope = createPwre1Envelope(buildPwre1Content({ ...value, snapshot: value.snapshot as never, manifest: value.manifest as never }));
  const pdf = await renderResponseExportPdf(envelope);
  assert.equal(pdf.contentSha256, envelope.contentSha256);
  assert.equal(pdf.bytes.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(pdf.sourceText, new RegExp(envelope.contentSha256, "u"));
  assert.match(pdf.sourceText, /What did you notice first\?|A tight chest|This stayed private\./u);
});

test("response PDF passes text and raster verification before download", async () => {
  const value = fixture();
  const envelope = createPwre1Envelope(buildPwre1Content({ ...value, snapshot: value.snapshot as never, manifest: value.manifest as never }));
  const rendered = await renderResponseExportPdf(envelope);
  const verified = await renderAndVerifyResponseExportPdf(envelope, { async verify() { return { extractedText: rendered.sourceText, pageCount: 1, pngPages: [Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG"), Buffer.alloc(128)])] }; } });
  assert.equal(verified.contentSha256, envelope.contentSha256);
});

test("unresolved authored selections and snapshot/row drift fail closed", () => {
  const unresolved = fixture();
  unresolved.decryptedResponses.set("interaction-1", { response: { semantic: { choices: ["OPT-MISSING"] } } });
  assert.throws(() => buildPwre1Content({ ...unresolved, snapshot: unresolved.snapshot as never, manifest: unresolved.manifest as never }), /Authored option/u);
  const drifted = fixture();
  drifted.snapshot.assessmentSession.responses[0].responseId = "changed";
  assert.throws(() => buildPwre1Content({ ...drifted, snapshot: drifted.snapshot as never, manifest: drifted.manifest as never }), /no longer matches/u);
});
