import { readFile } from "node:fs/promises";
import path from "node:path";
import { schemaRegistry, type JsonSchema, type SchemaRegistry } from "./schema-validator.ts";

export const PACKET_SCHEMA_PATH = "specs/patternwork/question-engine-v3.1/08_data_schemas.schema.json";
export const REPORT_ARTIFACT_SCHEMA_PATH = "specs/patternwork/question-engine-v3.1/13_report_artifact.schema.json";
export const SYNTHESIS_SCHEMA_PATH = "specs/patternwork/question-engine-v3.1/14_synthesis_bundle.schema.json";

async function loadJsonSchema(workspaceRoot: string, relativePath: string): Promise<JsonSchema> {
  return JSON.parse(await readFile(path.join(workspaceRoot, relativePath), "utf8")) as JsonSchema;
}

export interface PatternworkSchemaSet {
  readonly packet: JsonSchema;
  readonly reportArtifact: JsonSchema;
  readonly synthesis: JsonSchema;
  registryFor(root: JsonSchema): SchemaRegistry;
}

export async function loadPatternworkSchemas(workspaceRoot = process.cwd()): Promise<PatternworkSchemaSet> {
  const [packet, reportArtifact, synthesis] = await Promise.all([
    loadJsonSchema(workspaceRoot, PACKET_SCHEMA_PATH),
    loadJsonSchema(workspaceRoot, REPORT_ARTIFACT_SCHEMA_PATH),
    loadJsonSchema(workspaceRoot, SYNTHESIS_SCHEMA_PATH),
  ]);
  const schemas = [packet, reportArtifact, synthesis];
  return { packet, reportArtifact, synthesis, registryFor: (root) => schemaRegistry(schemas, root) };
}

