import { OPENROUTER_DEFAULT_ENDPOINT } from "../../lib/server/openrouter/wire.ts";
import { GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY } from "../../lib/server/openrouter/qualification-budget.ts";
import { createHash } from "node:crypto";

const CONNECTIVITY_TIMEOUT_MS = 10_000;
const DIAGNOSTIC_MODEL = "openai/gpt-6-luna";

interface OpenRouterEndpointRecord {
  readonly model_id?: unknown;
  readonly provider_name?: unknown;
  readonly name?: unknown;
  readonly tag?: unknown;
}

export interface OpenRouterDiagnosticRouteEvidence {
  readonly schemaVersion: 1;
  readonly endpointUrl: string;
  readonly checkedAt: string;
  readonly catalogSha256: string;
  readonly model: typeof DIAGNOSTIC_MODEL;
  readonly providerAllowlist: readonly string[];
  readonly zeroDataRetentionRequired: boolean;
  readonly privacyMode?: "zdr_required" | "non_zdr_allowed";
  readonly dataCollectionPolicy: "deny";
  readonly modelEndpointCount: number;
  readonly matchingEligibleEndpointCount: number;
  readonly matchingEligibleEndpoints: readonly { readonly provider: string; readonly name: string; readonly tag?: string }[];
}

export class OpenRouterNonZdrRouteIneligibleError extends Error {
  readonly evidence: OpenRouterDiagnosticRouteEvidence;

  constructor(evidence: OpenRouterDiagnosticRouteEvidence) {
    super(`OpenRouter currently lists no OpenAI endpoint for ${evidence.model}; no generation request or budget reservation was made.`);
    this.name = "OpenRouterNonZdrRouteIneligibleError";
    this.evidence = evidence;
  }
}

export class OpenRouterDiagnosticRouteIneligibleError extends Error {
  readonly evidence: OpenRouterDiagnosticRouteEvidence;

  constructor(evidence: OpenRouterDiagnosticRouteEvidence) {
    super(`OpenRouter currently lists ${evidence.modelEndpointCount} ZDR endpoints for ${evidence.model} but none from the pinned provider(s) ${evidence.providerAllowlist.join(", ")}; no generation request or budget reservation was made.`);
    this.name = "OpenRouterDiagnosticRouteIneligibleError";
    this.evidence = evidence;
  }
}

function safeTransportCause(error: unknown): string | undefined {
  const outer = error instanceof Error ? error : undefined;
  const cause = outer?.cause instanceof Error ? outer.cause : outer;
  if (!cause) return undefined;
  const code = (cause as NodeJS.ErrnoException).code;
  if (typeof code === "string" && /^[A-Z0-9_]{1,48}$/u.test(code)) return code;
  return /^[A-Za-z][A-Za-z0-9]{0,48}$/u.test(cause.name) ? cause.name : undefined;
}

/**
 * A public, unauthenticated catalog GET proves the runner can resolve and reach
 * OpenRouter before the first paid report request. It does not validate model
 * compatibility or dispatch a generation.
 */
export async function assertOpenRouterReachable(fetchImpl: typeof fetch = globalThis.fetch): Promise<void> {
  const endpoint = `${new URL(OPENROUTER_DEFAULT_ENDPOINT).origin}/api/v1/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint, { method: "GET", signal: controller.signal });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) {
      throw new Error(`OpenRouter connectivity preflight returned HTTP ${response.status}; no report request was dispatched.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("no report request was dispatched")) throw error;
    const detail = safeTransportCause(error);
    throw new Error(`OpenRouter connectivity preflight failed${detail ? ` (${detail})` : ""}; no report request was dispatched.`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fail closed before the report journal reserves money when the pinned provider
 * set and the current public ZDR endpoint set have no intersection. The check
 * is an unauthenticated catalog GET; it never sends prompt content or a model
 * generation request.
 */
export async function assertOpenRouterDiagnosticRouteEligible(
  fetchImpl: typeof fetch = globalThis.fetch,
  checkedAt: () => Date = () => new Date(),
): Promise<OpenRouterDiagnosticRouteEvidence> {
  const endpointUrl = `${new URL(OPENROUTER_DEFAULT_ENDPOINT).origin}/api/v1/endpoints/zdr`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpointUrl, { method: "GET", signal: controller.signal });
    const body = await response.text();
    if (!response.ok) throw new Error(`OpenRouter ZDR endpoint preflight returned HTTP ${response.status}; no generation request was dispatched.`);
    let parsed: unknown;
    try { parsed = JSON.parse(body); }
    catch { throw new Error("OpenRouter ZDR endpoint preflight returned invalid JSON; no generation request was dispatched."); }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { data?: unknown }).data)) {
      throw new Error("OpenRouter ZDR endpoint preflight returned an invalid endpoint catalog; no generation request was dispatched.");
    }
    const endpoints = (parsed as { data: OpenRouterEndpointRecord[] }).data;
    const modelEndpoints = endpoints.filter((item) => item.model_id === DIAGNOSTIC_MODEL);
    const providerAllowlist = [...(GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY.only ?? [])];
    const allowed = new Set(providerAllowlist.map((item) => item.toLocaleLowerCase("en-US")));
    const eligible = modelEndpoints.filter((item) => typeof item.provider_name === "string"
      && allowed.has(item.provider_name.toLocaleLowerCase("en-US")));
    const evidence: OpenRouterDiagnosticRouteEvidence = {
      schemaVersion: 1,
      endpointUrl,
      checkedAt: checkedAt().toISOString(),
      catalogSha256: createHash("sha256").update(body, "utf8").digest("hex"),
      model: DIAGNOSTIC_MODEL,
      providerAllowlist,
      zeroDataRetentionRequired: true,
      dataCollectionPolicy: "deny",
      modelEndpointCount: modelEndpoints.length,
      matchingEligibleEndpointCount: eligible.length,
      matchingEligibleEndpoints: eligible.map((item) => ({
        provider: String(item.provider_name),
        name: typeof item.name === "string" ? item.name : "",
        ...(typeof item.tag === "string" ? { tag: item.tag } : {}),
      })),
    };
    if (eligible.length === 0) throw new OpenRouterDiagnosticRouteIneligibleError(evidence);
    return evidence;
  } catch (error) {
    if (error instanceof OpenRouterDiagnosticRouteIneligibleError) throw error;
    if (error instanceof Error && error.message.includes("no generation request was dispatched")) throw error;
    const detail = safeTransportCause(error);
    throw new Error(`OpenRouter ZDR endpoint preflight failed${detail ? ` (${detail})` : ""}; no generation request was dispatched.`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Owner-authorized non-ZDR path. It verifies that the pinned model has a public
 * OpenAI endpoint while keeping the diagnostic's provider pin and no-fallback
 * rule. This metadata check does not send a prompt or generation request.
 */
export async function assertOpenRouterNonZdrDiagnosticRouteEligible(
  fetchImpl: typeof fetch = globalThis.fetch,
  checkedAt: () => Date = () => new Date(),
): Promise<OpenRouterDiagnosticRouteEvidence> {
  const endpointUrl = `${new URL(OPENROUTER_DEFAULT_ENDPOINT).origin}/api/v1/models/openai/gpt-6-luna/endpoints`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpointUrl, { method: "GET", signal: controller.signal });
    const body = await response.text();
    if (!response.ok) throw new Error(`OpenRouter model endpoint preflight returned HTTP ${response.status}; no generation request was dispatched.`);
    let parsed: unknown;
    try { parsed = JSON.parse(body); }
    catch { throw new Error("OpenRouter model endpoint preflight returned invalid JSON; no generation request was dispatched."); }
    const data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { data?: unknown }).data : undefined;
    const endpoints = data && typeof data === "object" && !Array.isArray(data) ? (data as { endpoints?: unknown }).endpoints : undefined;
    if (!Array.isArray(endpoints)) throw new Error("OpenRouter model endpoint preflight returned an invalid endpoint catalog; no generation request was dispatched.");
    const rows = endpoints as OpenRouterEndpointRecord[];
    const providerAllowlist = ["openai"];
    const eligible = rows.filter((item) => typeof item.provider_name === "string"
      && item.provider_name.toLocaleLowerCase("en-US") === "openai");
    const evidence: OpenRouterDiagnosticRouteEvidence = {
      schemaVersion: 1,
      endpointUrl,
      checkedAt: checkedAt().toISOString(),
      catalogSha256: createHash("sha256").update(body, "utf8").digest("hex"),
      model: DIAGNOSTIC_MODEL,
      providerAllowlist,
      zeroDataRetentionRequired: false,
      privacyMode: "non_zdr_allowed",
      dataCollectionPolicy: "deny",
      modelEndpointCount: rows.length,
      matchingEligibleEndpointCount: eligible.length,
      matchingEligibleEndpoints: eligible.map((item) => ({
        provider: String(item.provider_name),
        name: typeof item.name === "string" ? item.name : "",
        ...(typeof item.tag === "string" ? { tag: item.tag } : {}),
      })),
    };
    if (eligible.length === 0) throw new OpenRouterNonZdrRouteIneligibleError(evidence);
    return evidence;
  } catch (error) {
    if (error instanceof OpenRouterNonZdrRouteIneligibleError) throw error;
    if (error instanceof Error && error.message.includes("no generation request was dispatched")) throw error;
    const detail = safeTransportCause(error);
    throw new Error(`OpenRouter OpenAI endpoint preflight failed${detail ? ` (${detail})` : ""}; no generation request was dispatched.`);
  } finally {
    clearTimeout(timeout);
  }
}
