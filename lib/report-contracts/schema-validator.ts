import type { JsonObject, ValidationIssue, ValidationResult } from "../question-engine/types.ts";

export type JsonSchema = boolean | { [key: string]: unknown };

export interface SchemaRegistry {
  readonly root: JsonSchema;
  readonly byId?: ReadonlyMap<string, JsonSchema>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => equal(item, right[index]));
  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return equal(leftKeys, rightKeys) && leftKeys.every((key) => equal(left[key], right[key]));
  }
  return false;
}

function pointer(root: JsonSchema, fragment: string): JsonSchema | undefined {
  if (fragment === "" || fragment === "#") return root;
  if (!fragment.startsWith("#/")) return undefined;
  let current: unknown = root;
  for (const raw of fragment.slice(2).split("/")) {
    const part = decodeURIComponent(raw).replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isObject(current) || !(part in current)) return undefined;
    current = current[part];
  }
  return typeof current === "boolean" || isObject(current) ? current as JsonSchema : undefined;
}

function resolveRef(ref: string, registry: SchemaRegistry): { schema?: JsonSchema; root?: JsonSchema } {
  if (ref.startsWith("#")) return { schema: pointer(registry.root, ref), root: registry.root };
  const hashIndex = ref.indexOf("#");
  const id = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
  const fragment = hashIndex >= 0 ? ref.slice(hashIndex) : "#";
  const externalRoot = registry.byId?.get(id);
  return { schema: externalRoot === undefined ? undefined : pointer(externalRoot, fragment), root: externalRoot };
}

function typeMatches(expected: string, value: unknown): boolean {
  switch (expected) {
    case "null": return value === null;
    case "array": return Array.isArray(value);
    case "object": return isObject(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    default: return typeof value === expected;
  }
}

function childPath(base: string, key: string | number): string {
  return typeof key === "number" ? `${base}[${key}]` : `${base}.${key}`;
}

function validateNode(value: unknown, schema: JsonSchema, registry: SchemaRegistry, currentRoot: JsonSchema, path: string, issues: ValidationIssue[]): void {
  if (schema === true) return;
  if (schema === false) {
    issues.push({ code: "schema_false", path, message: "Value is forbidden by schema." });
    return;
  }

  if (typeof schema.$ref === "string") {
    const resolved = schema.$ref.startsWith("#")
      ? { schema: pointer(currentRoot, schema.$ref), root: currentRoot }
      : resolveRef(schema.$ref, registry);
    if (resolved.schema === undefined || resolved.root === undefined) {
      issues.push({ code: "unresolved_schema_ref", path, message: `Could not resolve schema reference ${schema.$ref}.` });
    } else {
      validateNode(value, resolved.schema, registry, resolved.root, path, issues);
    }
  }

  const alternatives = (keyword: "oneOf" | "anyOf") => {
    const branches = schema[keyword];
    if (!Array.isArray(branches)) return;
    let matches = 0;
    for (const branch of branches) {
      const branchIssues: ValidationIssue[] = [];
      if (typeof branch === "boolean" || isObject(branch)) validateNode(value, branch, registry, currentRoot, path, branchIssues);
      if (branchIssues.length === 0) matches += 1;
    }
    if ((keyword === "oneOf" && matches !== 1) || (keyword === "anyOf" && matches === 0)) {
      issues.push({ code: keyword, path, message: keyword === "oneOf" ? `Expected exactly one matching branch; found ${matches}.` : "Expected at least one matching branch." });
    }
  };
  alternatives("oneOf");
  alternatives("anyOf");

  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf) if (typeof branch === "boolean" || isObject(branch)) validateNode(value, branch, registry, currentRoot, path, issues);
  }
  if (typeof schema.not === "boolean" || isObject(schema.not)) {
    const notIssues: ValidationIssue[] = [];
    validateNode(value, schema.not as JsonSchema, registry, currentRoot, path, notIssues);
    if (notIssues.length === 0) issues.push({ code: "not", path, message: "Value matches a forbidden schema." });
  }
  if (typeof schema.if === "boolean" || isObject(schema.if)) {
    const conditionIssues: ValidationIssue[] = [];
    validateNode(value, schema.if as JsonSchema, registry, currentRoot, path, conditionIssues);
    const selected = conditionIssues.length === 0 ? schema.then : schema.else;
    if (typeof selected === "boolean" || isObject(selected)) validateNode(value, selected as JsonSchema, registry, currentRoot, path, issues);
  }

  if ("const" in schema && !equal(value, schema.const)) issues.push({ code: "const", path, message: "Value does not equal the required constant." });
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => equal(value, candidate))) issues.push({ code: "enum", path, message: "Value is not in the allowed set." });

  if (typeof schema.type === "string" && !typeMatches(schema.type, value)) {
    issues.push({ code: "type", path, message: `Expected ${schema.type}.` });
    return;
  }
  if (Array.isArray(schema.type) && !schema.type.some((candidate) => typeof candidate === "string" && typeMatches(candidate, value))) {
    issues.push({ code: "type", path, message: `Expected one of: ${schema.type.join(", ")}.` });
    return;
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) issues.push({ code: "minLength", path, message: `Expected at least ${schema.minLength} characters.` });
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) issues.push({ code: "maxLength", path, message: `Expected no more than ${schema.maxLength} characters.` });
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) issues.push({ code: "pattern", path, message: `Value does not match ${schema.pattern}.` });
    if (schema.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value)))) issues.push({ code: "format", path, message: "Expected an RFC 3339 date-time." });
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) issues.push({ code: "minimum", path, message: `Expected at least ${schema.minimum}.` });
    if (typeof schema.maximum === "number" && value > schema.maximum) issues.push({ code: "maximum", path, message: `Expected no more than ${schema.maximum}.` });
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) issues.push({ code: "minItems", path, message: `Expected at least ${schema.minItems} items.` });
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) issues.push({ code: "maxItems", path, message: `Expected no more than ${schema.maxItems} items.` });
    if (schema.uniqueItems === true) {
      for (let index = 0; index < value.length; index += 1) {
        if (value.slice(0, index).some((candidate) => equal(candidate, value[index]))) {
          issues.push({ code: "uniqueItems", path: childPath(path, index), message: "Duplicate array item." });
        }
      }
    }
    if (Array.isArray(schema.prefixItems)) {
      schema.prefixItems.forEach((itemSchema, index) => {
        if (index < value.length && (typeof itemSchema === "boolean" || isObject(itemSchema))) validateNode(value[index], itemSchema, registry, currentRoot, childPath(path, index), issues);
      });
    }
    if (typeof schema.items === "boolean" || isObject(schema.items)) {
      const start = Array.isArray(schema.prefixItems) ? schema.prefixItems.length : 0;
      for (let index = start; index < value.length; index += 1) validateNode(value[index], schema.items as JsonSchema, registry, currentRoot, childPath(path, index), issues);
    }
  }

  if (isObject(value)) {
    if (typeof schema.minProperties === "number" && Object.keys(value).length < schema.minProperties) issues.push({ code: "minProperties", path, message: `Expected at least ${schema.minProperties} properties.` });
    if (Array.isArray(schema.required)) {
      for (const required of schema.required) if (typeof required === "string" && !(required in value)) issues.push({ code: "required", path: childPath(path, required), message: "Required property is missing." });
    }
    const properties = isObject(schema.properties) ? schema.properties : {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value && (typeof propertySchema === "boolean" || isObject(propertySchema))) validateNode(value[key], propertySchema as JsonSchema, registry, currentRoot, childPath(path, key), issues);
    }
    const extras = Object.keys(value).filter((key) => !(key in properties));
    if (schema.additionalProperties === false) {
      for (const key of extras) issues.push({ code: "additionalProperties", path: childPath(path, key), message: "Unknown property is not allowed." });
    } else if (typeof schema.additionalProperties === "boolean" || isObject(schema.additionalProperties)) {
      for (const key of extras) validateNode(value[key], schema.additionalProperties as JsonSchema, registry, currentRoot, childPath(path, key), issues);
    }
  }
}

export function validateAgainstSchema<T>(value: unknown, registry: SchemaRegistry): ValidationResult<T> {
  const issues: ValidationIssue[] = [];
  validateNode(value, registry.root, registry, registry.root, "$", issues);
  return issues.length === 0 ? { ok: true, value: value as T, issues: [] } : { ok: false, issues };
}

export function schemaRegistry(schemas: readonly JsonSchema[], root: JsonSchema): SchemaRegistry {
  const byId = new Map<string, JsonSchema>();
  for (const schema of schemas) if (typeof schema !== "boolean" && typeof schema.$id === "string") byId.set(schema.$id, schema);
  return { root, byId };
}

export function asJsonObject(value: unknown): JsonObject | undefined {
  return isObject(value) ? value as JsonObject : undefined;
}

