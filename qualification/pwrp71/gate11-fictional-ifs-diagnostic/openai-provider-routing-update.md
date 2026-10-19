# Gate 11 addendum — OpenAI-only provider routing

**Date:** 2026-10-11
**Scope:** C01/C02 fictional IFS diagnostic only
**Live dispatches made by this update:** 0

## Change

The diagnostic now sends an explicit OpenRouter provider restriction of `only: ["openai"]` and `allow_fallbacks: false`. The existing privacy and price limits remain attached. The restriction is set by the diagnostic's journaled transport and checked again against the final HTTP payload immediately before dispatch, so initial, repair, escalation, and review calls share the same provider pin.

The ordinary qualification provider policy remains unchanged. The OpenRouter endpoint, model, reasoning effort, question/report sources, schema, prompts, fixture packets, and budget limits remain unchanged.

## No-dispatch preflight

The new versioned artifact is `provider-preflight/c01-c02-ifs-openai-only-no-dispatch-20261011.json` (file SHA-256 `3d445f2808d0871edf55567cc7fe550b80b75ce909d1c142040e06bb1b392e2f`). It prepared exactly two requests with zero provider calls and did not read the API key. Both wire payloads contain the OpenAI-only restriction. The IFS wire schema digest remains `624462e600a1ca626d444427f0dfb84022f6900410c3eb89d6d0f747a39e8342`.

The preflight remains `BLOCKED` for the separate full-routing workflow because no independently reviewed routing receipt exists; this update does not change that status.

## Existing live attempt

The earlier C01 request remains recorded as one Azure-routed HTTP 400 with upstream code `invalid_json_schema` and unknown billing status. This update did not modify that receipt, retry the request, or dispatch C02. Its original reservation remains held. The changed provider restriction applies to a future request only; no second paid call was made here.

## Verification

| Check | Result |
|---|---|
| TypeScript typecheck | Pass, exit 0 |
| Focused PWRP/diagnostic/provider tests | Pass, 50/50, exit 0 |
| Full test suite | Pass, 415/415, exit 0 |
| Scoped ESLint on changed TypeScript files | Pass, exit 0 |
| Production build | Pass, exit 0; existing broad dynamic-file matching warnings remain |
| OpenAI-only preflight | 2 requests prepared, 0 dispatches; full-routing status remains blocked |

