import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import test from "node:test";
import { projectOpenRouterStrictSchemaObject } from "../../lib/server/openrouter/schema-projection.ts";

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
