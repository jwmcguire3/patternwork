# C10 composition no-dispatch assessment

Date: 2026-10-15

Reviewer: read-only independent Sol subagent `audit_final_attempt`

## Evidence examined

- `BUDGET_JOURNAL.json`: C10 composition call `b901a349-96e4-4751-8a91-cf995647dc9a`, status `unknown_cost`, $0.30 reserve, 16 ms from reservation to failure, no HTTP status, response ID, usage or response artifact.
- The call's transport cause chain: `TypeError: fetch failed` → `getaddrinfo ENOTFOUND api.openai.com`, with no resolved address or port.
- The recorded dispatcher hash matched the dispatcher source used for the failed attempt; that path performs one direct OpenAI POST with no retry wrapper.
- A successful post-failure authenticated model catalog GET, HTTP 200, confirmed model availability with zero generation requests and zero provider cost.
- Installed Undici connection handling returns on DNS/TLS connection errors before creating the HTTP request context.

## Independent conclusion

The exact C10 POST failed before reaching OpenAI. This supports reconciling the attempt as `failed_before_provider_dispatch` and releasing only its $0.30 reservation. This is technical evidence that no generation request was sent, not an invoice receipt. The three unrelated P02 unknown-cost reserves remain locked.

The review recommended a single separately identified C10 composition attempt only after a durable, hash-bound reconciliation, a fresh zero-cost connectivity preflight, unchanged request/source pins, explicit CLI recovery authorization, and a new reservation. No automatic retry is permitted. A model-list GET does not itself qualify or approve the report.

This assessment is not human approval, routing qualification, report approval, or production activation.
