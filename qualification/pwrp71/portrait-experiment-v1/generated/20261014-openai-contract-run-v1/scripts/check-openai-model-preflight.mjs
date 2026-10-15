import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as openaiFetch } from "undici";
import { safeTransportErrorRecord } from "./transport-error-details.mjs";

const runDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(runDir, "C10_PROVIDER_PREFLIGHT.json");
const checkedAt = new Date().toISOString();
let result;

try {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is unavailable; provider preflight was not sent.");
  const agent = new Agent({ connections: 1, allowH2: false, connectTimeout: 30_000, headersTimeout: 30_000, bodyTimeout: 30_000 });
  try {
    const response = await openaiFetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
      dispatcher: agent,
    });
    const body = await response.json();
    const modelVisible = Array.isArray(body.data) && body.data.some((model) => model.id === "gpt-6-luna");
    result = {
      schemaVersion: "PATTERNWORK-OPENAI-MODEL-PREFLIGHT-V1",
      status: response.ok && modelVisible ? "passed" : "failed",
      checkedAt,
      endpoint: "https://api.openai.com/v1/models",
      requestType: "authenticated model catalog GET; not a generation request",
      httpStatus: response.status,
      model: "gpt-6-luna",
      modelVisible,
      generationRequests: 0,
      providerCostMicrodollars: 0,
      automaticRetries: false,
      transport: "undici@7.28.0 Agent-backed fetch",
    };
  } finally {
    await agent.close().catch(() => {});
  }
} catch (error) {
  const safe = safeTransportErrorRecord(error);
  result = {
    schemaVersion: "PATTERNWORK-OPENAI-MODEL-PREFLIGHT-V1",
    status: "failed",
    checkedAt,
    endpoint: "https://api.openai.com/v1/models",
    requestType: "authenticated model catalog GET; not a generation request",
    model: "gpt-6-luna",
    modelVisible: false,
    generationRequests: 0,
    providerCostMicrodollars: 0,
    automaticRetries: false,
    error: safe.summary,
    errorDetails: safe.details,
    transport: "undici@7.28.0 Agent-backed fetch",
  };
}

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (result.status !== "passed") process.exitCode = 1;
