import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { test } from "node:test";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { constrainPwrp71ReferenceSchema } from "../../lib/server/reports/pwrp71-reference-schema.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";

const OBS_A = "O12345678901234567890";
const OBS_B = "O22345678901234567890";
const OCC_A = "pwep_11111111-2222-4333-8444-555555555555";
const PERSON_A = "pwep_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function packet(options: { observations?: string[]; episodes?: string[]; people?: string[] } = {}): JsonObject {
  return {
    observations: (options.observations ?? [OBS_A, OBS_B]).map((id) => ({ id })),
    episodes: (options.episodes ?? [OCC_A]).map((id) => ({ id })),
    referent_scopes: (options.people ?? [PERSON_A]).map((person_id) => ({ person_id })),
  } as JsonObject;
}

function sourceDraft(release: string, evidenceId = OBS_A, occurrenceId = OCC_A, personId?: string): JsonObject {
  return {
    report_release: release, release_id: "release", snapshot_id: "snapshot", evidence_sha256: "hash", report_type: "MAP", title: "A report",
    title_claim_ids: [], content_status: "complete", sections: [],
    claims: [{
      id: "claim-1", text: "A reportable observation.", kind: "reported", constructs: [], scope: { level: "occurrence", occurrence_ids: [occurrenceId], person_ids: personId ? [personId] : [], description: "A bounded scope." },
      evidence_ids: [evidenceId], counterevidence_ids: [OBS_B], sequence_edge_ids: [], depends_on_claim_ids: [], support_basis: ["direct_report"], rationale: "A direct observation.", remaining_uncertainty: [],
    }],
    name_registry: [], relationships: [], reflection_questions: [],
  } as JsonObject;
}

function schemaPath(root: Record<string, unknown>, path: string[]): Record<string, unknown> {
  let current: unknown = root;
  for (const part of path) current = (current as Record<string, unknown>)[part];
  return current as Record<string, unknown>;
}

const sourcePromise = loadPwrp71SourcePackage();

test("clones deterministically and constrains all typed reference enums", async () => {
  const source = await sourcePromise;
  const base = source.schemas.reportDraft as JsonObject;
  const currentPacket = packet();
  const original = structuredClone(base);
  const first = constrainPwrp71ReferenceSchema(base, currentPacket);
  const second = constrainPwrp71ReferenceSchema(base, currentPacket);
  assert.deepEqual(base, original);
  assert.deepEqual(first, second);
  const result = first as Record<string, unknown>;
  assert.deepEqual(schemaPath(result, ["properties", "claims", "items", "properties", "evidence_ids", "items"]).enum, [OBS_A, OBS_B]);
  assert.deepEqual(schemaPath(result, ["properties", "claims", "items", "properties", "counterevidence_ids", "items"]).enum, [OBS_A, OBS_B]);
  assert.deepEqual(schemaPath(result, ["properties", "claims", "items", "properties", "scope", "properties", "occurrence_ids", "items"]).enum, [OCC_A]);
  assert.deepEqual(schemaPath(result, ["properties", "claims", "items", "properties", "scope", "properties", "person_ids", "items"]).enum, [PERSON_A]);
});

test("AJV accepts current references, rejects typos, and retains original constraints", async () => {
  const source = await sourcePromise;
  const base = structuredClone(source.schemas.reportDraft as JsonObject) as Record<string, unknown>;
  const constrained = constrainPwrp71ReferenceSchema(base as JsonObject, packet()) as Record<string, unknown>;
  const validator = new Ajv2020({ allErrors: true, strict: false }).compile(constrained);
  const draft = sourceDraft(source.policy.release);
  assert.equal(validator(draft), true);
  const typo = structuredClone(draft) as Record<string, unknown>;
  (((typo.claims as Record<string, unknown>[])[0].evidence_ids as string[])[0]) = "O1234567890123456789a";
  assert.equal(validator(typo), false);
  const scopeTypo = structuredClone(draft) as Record<string, unknown>;
  (((((scopeTypo.claims as Record<string, unknown>[])[0].scope as Record<string, unknown>).occurrence_ids as string[])[0])) = "pwep_11111111-2222-4333-8444-55555555555a";
  assert.equal(validator(scopeTypo), false);
  const itemBase = schemaPath(base, ["properties", "claims", "items", "properties", "evidence_ids", "items"]);
  const itemConstrained = schemaPath(constrained, ["properties", "claims", "items", "properties", "evidence_ids", "items"]);
  assert.equal(itemConstrained.minLength, itemBase.minLength);
  assert.equal(itemConstrained.type, itemBase.type);
  assert.equal(schemaPath(constrained, ["properties", "claims", "items", "properties", "scope", "properties", "occurrence_ids"]).uniqueItems,
    schemaPath(base, ["properties", "claims", "items", "properties", "scope", "properties", "occurrence_ids"]).uniqueItems);
});

test("intersects existing enums and rejects empty intersections", async () => {
  const source = await sourcePromise;
  const base = structuredClone(source.schemas.reportDraft as JsonObject) as Record<string, unknown>;
  schemaPath(base, ["properties", "claims", "items", "properties", "evidence_ids", "items"]).enum = [OBS_A, "not-current"];
  const result = constrainPwrp71ReferenceSchema(base as JsonObject, packet()) as Record<string, unknown>;
  assert.deepEqual(schemaPath(result, ["properties", "claims", "items", "properties", "evidence_ids", "items"]).enum, [OBS_A]);
  schemaPath(base, ["properties", "claims", "items", "properties", "counterevidence_ids", "items"]).enum = ["not-current"];
  assert.throws(() => constrainPwrp71ReferenceSchema(base as JsonObject, packet()));
});

test("empty person inventory uses maxItems zero without an empty enum", async () => {
  const source = await sourcePromise;
  const base = structuredClone(source.schemas.reportDraft as JsonObject) as Record<string, unknown>;
  const result = constrainPwrp71ReferenceSchema(base as JsonObject, packet({ people: [] })) as Record<string, unknown>;
  const personSchema = schemaPath(result, ["properties", "claims", "items", "properties", "scope", "properties", "person_ids"]);
  assert.equal(personSchema.maxItems, 0);
  assert.equal(Object.hasOwn(personSchema.items as object, "enum"), false);
  const validator = new Ajv2020({ allErrors: true, strict: false }).compile(result);
  assert.equal(validator(sourceDraft(source.policy.release, OBS_A, OCC_A, undefined)), true);
  schemaPath(base, ["properties", "claims", "items", "properties", "scope", "properties", "person_ids"]).minItems = 1;
  assert.throws(() => constrainPwrp71ReferenceSchema(base as JsonObject, packet({ people: [] })));
});

test("rejects malformed inventories, duplicate IDs, and incorrect schema paths", async () => {
  const source = await sourcePromise;
  const base = structuredClone(source.schemas.reportDraft as JsonObject) as Record<string, unknown>;
  for (const badPacket of [packet({ observations: [] }), packet({ episodes: [] }), packet({ observations: [OBS_A, OBS_A] }), packet({ episodes: [OCC_A, OCC_A] }), packet({ people: [PERSON_A, PERSON_A] }), { ...packet(), observations: [{ id: 7 }] } as JsonObject]) {
    assert.throws(() => constrainPwrp71ReferenceSchema(base as JsonObject, badPacket));
  }
  const badSchema = structuredClone(base) as Record<string, unknown>;
  schemaPath(badSchema, ["properties", "claims", "items", "properties"]).scope = null;
  assert.throws(() => constrainPwrp71ReferenceSchema(badSchema as JsonObject, packet()));
});
