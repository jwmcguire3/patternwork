import type { JsonObject } from "../../question-engine/types.ts";

/** JSON Schema metadata and keywords rejected by the current OpenRouter strict-output path. */
export const OPENROUTER_UNSUPPORTED_STRICT_SCHEMA_KEYS = new Set([
  "$schema", "$id", "title", "description", "allOf", "if", "then", "else", "uniqueItems",
]);

/**
 * Project a full local schema onto the currently supported OpenRouter strict-output subset.
 * This is only a wire-format transform. Callers must retain and validate against the original
 * schema locally; allOf/conditional and uniqueItems guarantees are not enforced here.
 */
export function projectOpenRouterStrictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(projectOpenRouterStrictSchema);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const projected = Object.fromEntries(Object.entries(record)
    .filter(([key]) => !OPENROUTER_UNSUPPORTED_STRICT_SCHEMA_KEYS.has(key))
    .map(([key, child]) => [key,
      key === "properties" || key === "$defs" || key === "definitions"
        ? projectSchemaMap(child)
        : key === "items" || key === "additionalProperties" || key === "not" || key === "contains"
          ? projectOpenRouterStrictSchema(child)
          : key === "anyOf" || key === "oneOf" || key === "prefixItems"
            ? Array.isArray(child) ? child.map(projectOpenRouterStrictSchema) : child
            : child,
    ]));
  if (!("type" in projected)) {
    const inferredType = inferPrimitiveEnumType(projected);
    if (inferredType) return { type: inferredType, ...projected };
  }
  return projected;
}

/** OpenAI strict Structured Outputs requires a declared type alongside enum/const. */
function inferPrimitiveEnumType(schema: Record<string, unknown>): "string" | "number" | "boolean" | undefined {
  const values = Array.isArray(schema.enum)
    ? schema.enum
    : Object.hasOwn(schema, "const") ? [schema.const] : undefined;
  if (!values?.length) return undefined;
  const primitiveTypes = new Set(values.map((value) => {
    if (typeof value === "string") return "string";
    if (typeof value === "number" && Number.isFinite(value)) return "number";
    if (typeof value === "boolean") return "boolean";
    return "unsupported";
  }));
  if (primitiveTypes.size !== 1) return undefined;
  const [type] = primitiveTypes;
  return type === "string" || type === "number" || type === "boolean" ? type : undefined;
}

function projectSchemaMap(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, schema]) => [key, projectOpenRouterStrictSchema(schema)]));
}

export function projectOpenRouterStrictSchemaObject(value: JsonObject): JsonObject {
  return projectOpenRouterStrictSchema(value) as JsonObject;
}
