import type { Pwqe51CanonicalResponse, Pwqe51RouterResult } from "../assessment/pwqe51-router.ts";

/**
 * Canonical response and currentness evidence from the same immutable snapshot
 * as a router packet. This stays server-side and is never projected to a model.
 */
export interface Pwrp71CanonicalResponseEvidence {
  readonly responses: readonly Pwqe51CanonicalResponse[];
  readonly supersededResponseIds: readonly string[];
  readonly invalidatedResponseIds: readonly string[];
}

export function pwrp71CanonicalResponseEvidenceFromRoute(
  responses: readonly Pwqe51CanonicalResponse[],
  route: Pick<Pwqe51RouterResult, "supersededResponseIds" | "invalidatedResponses">,
): Pwrp71CanonicalResponseEvidence {
  return {
    responses,
    supersededResponseIds: route.supersededResponseIds,
    invalidatedResponseIds: route.invalidatedResponses.map((entry) => entry.responseId),
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Reads response/currentness evidence from a decrypted canonical PWQE 5.1 snapshot. */
export function pwrp71CanonicalResponseEvidenceFromSnapshot(value: unknown): Pwrp71CanonicalResponseEvidence | undefined {
  const snapshot = record(value);
  const route = record(snapshot?.routing_state);
  const responses = snapshot?.responses;
  const supersededResponseIds = route?.supersededResponseIds;
  const invalidatedResponses = route?.invalidatedResponses;
  if (!Array.isArray(responses) || !Array.isArray(supersededResponseIds) || !Array.isArray(invalidatedResponses)) return undefined;
  const invalidatedResponseIds = invalidatedResponses.map((entry) => record(entry)?.responseId);
  if (supersededResponseIds.some((id) => typeof id !== "string") || invalidatedResponseIds.some((id) => typeof id !== "string")) return undefined;
  return {
    responses: responses as Pwqe51CanonicalResponse[],
    supersededResponseIds: supersededResponseIds as string[],
    invalidatedResponseIds: invalidatedResponseIds as string[],
  };
}

/** Reads response/currentness evidence from a retained full-session replay state. */
export function pwrp71CanonicalResponseEvidenceFromSessionState(value: unknown): Pwrp71CanonicalResponseEvidence | undefined {
  const state = record(value);
  if (!Array.isArray(state?.responses)) return undefined;
  return pwrp71CanonicalResponseEvidenceFromSnapshot({ responses: state.responses, routing_state: state.routerResult });
}
