import type { OpenRouterGenerationRequest } from "../../openrouter/types.ts";

const authorizedRequests = new WeakSet<object>();

/** Grant the OpenRouter client a one-use authorization only after the durable reservation succeeds. */
export function authorizePwrp71BudgetedRequest(request: OpenRouterGenerationRequest): void {
  if (authorizedRequests.has(request)) throw new Error("PWRP 7.1 request already has an active budget authorization.");
  authorizedRequests.add(request);
}

/** Consume the one-use capability at the actual OpenRouter dispatch boundary. */
export function consumePwrp71BudgetAuthorization(request: OpenRouterGenerationRequest): boolean {
  const authorized = authorizedRequests.has(request);
  if (authorized) authorizedRequests.delete(request);
  return authorized;
}

/** Remove an unused capability when a wrapped transport returns without consuming it. */
export function revokePwrp71BudgetAuthorization(request: OpenRouterGenerationRequest): void {
  authorizedRequests.delete(request);
}
