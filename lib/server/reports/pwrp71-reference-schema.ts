import type { JsonObject } from "../../question-engine/types.ts";

export const PWRP71_REFERENCE_SCHEMA_VERSION = "pwrp71-current-reference-enums-v1" as const;

const schemaError = "PWRP 7.1 reference schema cannot be constrained for this source.";

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function inventoryIds(value: unknown, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new Error(schemaError);
  const ids = value.map((row) => object(row)?.id);
  if (ids.some((id) => typeof id !== "string" || id.length === 0) || new Set(ids).size !== ids.length) throw new Error(schemaError);
  return ids as string[];
}

function constrainItem(itemValue: unknown, ids: readonly string[]): Record<string, unknown> {
  const item = object(itemValue);
  if (!item) throw new Error(schemaError);
  const result = structuredClone(item);
  if (Object.hasOwn(result, "enum")) {
    if (!Array.isArray(result.enum)) throw new Error(schemaError);
    const intersection = ids.filter((id) => (result.enum as unknown[]).includes(id));
    if (intersection.length === 0) throw new Error(schemaError);
    result.enum = intersection;
  } else {
    result.enum = [...ids];
  }
  return result;
}

function atPath(root: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
  let current: unknown = root;
  for (const part of path) {
    const record = object(current);
    if (!record) throw new Error(schemaError);
    current = record[part];
  }
  const found = object(current);
  if (!found) throw new Error(schemaError);
  return found;
}

export function constrainPwrp71ReferenceSchema(schema: JsonObject, packet: JsonObject): JsonObject {
  const sourceSchema = object(schema);
  const packetObject = object(packet);
  if (!sourceSchema || !packetObject) throw new Error(schemaError);

  const observationIds = inventoryIds(packetObject.observations, false);
  const occurrenceIds = inventoryIds(packetObject.episodes, false);
  if (!Array.isArray(packetObject.referent_scopes)) throw new Error(schemaError);
  const personIds = packetObject.referent_scopes.map((row) => object(row)?.person_id);
  if (personIds.some((id) => typeof id !== "string" || id.length === 0) || new Set(personIds).size !== personIds.length) throw new Error(schemaError);

  const output = structuredClone(schema) as JsonObject;
  const claimItems = atPath(object(output)!, ["properties", "claims", "items"]);
  const claimProperties = object(claimItems.properties);
  if (!claimProperties) throw new Error(schemaError);
  const scopeProperties = object(object(claimProperties.scope)?.properties);
  if (!scopeProperties) throw new Error(schemaError);

  for (const field of ["evidence_ids", "counterevidence_ids"] as const) {
    const fieldSchema = object(claimProperties[field]);
    const itemSchema = object(fieldSchema?.items);
    if (!fieldSchema || !itemSchema) throw new Error(schemaError);
    fieldSchema.items = constrainItem(itemSchema, observationIds);
  }

  const occurrenceSchema = object(scopeProperties.occurrence_ids);
  const occurrenceItem = object(occurrenceSchema?.items);
  if (!occurrenceSchema || !occurrenceItem) throw new Error(schemaError);
  occurrenceSchema.items = constrainItem(occurrenceItem, occurrenceIds);

  const personSchema = object(scopeProperties.person_ids);
  const personItem = object(personSchema?.items);
  if (!personSchema || !personItem) throw new Error(schemaError);
  if (personIds.length > 0) {
    personSchema.items = constrainItem(personItem, personIds as string[]);
  } else {
    if (typeof personSchema.minItems === "number" && personSchema.minItems > 0) throw new Error(schemaError);
    if (personSchema.minItems !== undefined && (typeof personSchema.minItems !== "number" || !Number.isInteger(personSchema.minItems))) throw new Error(schemaError);
    if (personSchema.maxItems !== undefined && (typeof personSchema.maxItems !== "number" || !Number.isInteger(personSchema.maxItems) || personSchema.maxItems < 0)) throw new Error(schemaError);
    personSchema.maxItems = 0;
  }
  return output;
}

/** Historical runs used the exact base schema; new runs must name the tightening recipe. */
export function pwrp71WriterSchemaForVersion(schema: JsonObject, packet: JsonObject, version: unknown): JsonObject {
  if (version === undefined) return schema;
  if (version !== PWRP71_REFERENCE_SCHEMA_VERSION) throw new Error(schemaError);
  return constrainPwrp71ReferenceSchema(schema, packet);
}
