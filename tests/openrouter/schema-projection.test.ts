import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import test from "node:test";
import { projectOpenRouterStrictSchemaObject } from "../../lib/server/openrouter/schema-projection.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";

function assertOpenAiStrictSchema(value: unknown, path = "$", root = true): void {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${path} must be a schema object`);
  const schema = value as Record<string, unknown>;
  if (root) assert.equal(schema.type, "object", "the strict response schema root must be an object");
  assert.ok(schema.type || schema.$ref || schema.anyOf, `${path} must declare a type or supported composition`);
  if (schema.enum !== undefined || Object.hasOwn(schema, "const")) {
    assert.ok(["string", "number", "boolean"].includes(String(schema.type)), `${path} enum/const must declare its primitive type`);
    const values = Array.isArray(schema.enum) ? schema.enum : [schema.const];
    for (const entry of values) assert.equal(typeof entry, schema.type, `${path} type must match its enum/const values`);
  }
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false, `${path} must close additional properties`);
    assert.ok(schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties), `${path}.properties must be an object`);
    const properties = schema.properties as Record<string, unknown>;
    assert.deepEqual(new Set(schema.required as string[]), new Set(Object.keys(properties)), `${path} must require every property`);
    for (const [name, child] of Object.entries(properties)) assertOpenAiStrictSchema(child, `${path}.properties.${name}`, false);
  }
  if (schema.type === "array") assertOpenAiStrictSchema(schema.items, `${path}.items`, false);
  if (schema.$defs && typeof schema.$defs === "object" && !Array.isArray(schema.$defs)) {
    for (const [name, child] of Object.entries(schema.$defs as Record<string, unknown>)) assertOpenAiStrictSchema(child, `${path}.$defs.${name}`, false);
  }
  for (const key of ["anyOf", "oneOf", "prefixItems"] as const) {
    const branches = schema[key];
    if (Array.isArray(branches)) branches.forEach((child, index) => assertOpenAiStrictSchema(child, `${path}.${key}[${index}]`, false));
  }
}

function countEnumAndConstNodes(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, child) => total + countEnumAndConstNodes(child), 0);
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  const ownNode = record.enum !== undefined || Object.hasOwn(record, "const") ? 1 : 0;
  return ownNode + Object.values(record).reduce<number>((total, child) => total + countEnumAndConstNodes(child), 0);
}

test("OpenRouter projection strips unsupported schema keywords while preserving closed nested contracts", () => {
  const fullSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Wire projection fixture",
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1 },
      nested: {
        type: "object",
        additionalProperties: false,
        properties: { requiredValue: { type: "string" } },
        required: ["requiredValue"],
        if: { properties: { requiredValue: { const: "special" } } },
        then: { required: ["conditional"] },
        else: { required: ["fallback"] },
      },
      tags: { type: "array", items: { type: "string" }, uniqueItems: true },
    },
    required: ["title", "nested", "tags"],
    allOf: [{ properties: { nested: { required: ["requiredValue"] } } }],
  };
  const wire = projectOpenRouterStrictSchemaObject(fullSchema);
  const nested = (wire.properties as Record<string, Record<string, unknown>>).nested;
  assert.equal(wire.title, undefined);
  assert.equal(wire.allOf, undefined);
  assert.deepEqual(wire.required, ["title", "nested", "tags"]);
  assert.equal(wire.additionalProperties, false);
  assert.ok((wire.properties as Record<string, unknown>).title, "a data field named title is retained");
  assert.deepEqual(nested.required, ["requiredValue"]);
  assert.equal(nested.additionalProperties, false);
  assert.equal(nested.if, undefined);
  assert.equal(nested.then, undefined);
  assert.equal(nested.else, undefined);
  assert.equal(((wire.properties as Record<string, Record<string, unknown>>).tags).uniqueItems, undefined);

  const localValidate = new Ajv2020({ allErrors: true, strict: false }).compile(fullSchema);
  assert.equal(localValidate({ title: "ok", nested: {}, tags: ["same", "same"] }), false,
    "the full local schema remains authoritative for rules absent from the projected wire schema");
  const wireValidate = new Ajv2020({ allErrors: true, strict: false }).compile(wire);
  const projectionOnlyCase = { title: "ok", nested: { requiredValue: "special" }, tags: ["same", "same"] };
  assert.equal(localValidate(projectionOnlyCase), false, "local conditional and uniqueItems rules reject this case");
  assert.equal(wireValidate(projectionOnlyCase), true, "the provider projection may omit these rules, so local validation must run after generation");
  assert.equal(wireValidate({ title: "ok", nested: {}, tags: [] }), false, "nested required fields remain enforced by both schemas");
});

test("OpenAI strict projection declares types for primitive enum and const fields", () => {
  const wire = projectOpenRouterStrictSchemaObject({
    type: "object",
    additionalProperties: false,
    properties: { choice: { enum: ["yes", "no"] }, release: { const: "candidate.1" } },
    required: ["choice", "release"],
  });
  const properties = wire.properties as Record<string, Record<string, unknown>>;
  assert.equal(properties.choice.type, "string");
  assert.equal(properties.release.type, "string");
  assertOpenAiStrictSchema(wire);
});

test("all PWRP 7.1 draft report types and reviewer schema project to OpenAI strict-compatible shapes", async () => {
  const source = await loadPwrp71SourcePackage();
  const draft = projectOpenRouterStrictSchemaObject(source.schemas.reportDraft as JsonObject);
  const review = projectOpenRouterStrictSchemaObject(source.schemas.reportReview as JsonObject);

  // PWRP 7.1 uses this same draft schema for every report layer.
  for (const reportType of ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"]) {
    assertOpenAiStrictSchema(draft, `$.${reportType}`);
  }
  assertOpenAiStrictSchema(review, "$.review");
  assert.equal(countEnumAndConstNodes(draft) + countEnumAndConstNodes(review),
    26,
    "all 26 retained enum/const nodes, including explanatory judgments, are checked; conditional constraints remain locally validated");
});
