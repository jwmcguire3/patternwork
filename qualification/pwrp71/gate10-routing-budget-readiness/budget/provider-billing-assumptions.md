# Provider billing and budget assumptions

## Local controls

Live qualification requires separate, positive, safe-integer `maxCallCostMicros` and `aggregateCostCapMicros`; there are no live defaults. Each initial, reviewer, repair, and escalation request passes through the qualification journal. After the exact projected request is serialized, the journal fingerprints the endpoint, exact JSON body hash, model/settings, both caps, and billing-basis digest, then reserves the full quote under the run lock before transport dispatch. The OpenRouter client accepts PWRP 7.1 requests only with a one-use authorization created after that reservation. The ordinary report-workflow and debug paths currently provide no such authorization and therefore fail closed before network dispatch. Live qualification also rejects arbitrary injected transports; its supported live transport is the pinned OpenRouter client whose endpoint is included in the request fingerprint.

OpenRouter requests explicitly set `usage: { include: true }` so the response can include token and cost metadata. Reported completed usage replaces the in-flight reservation; `started` and `unknown` attempts retain the full reservation. A completed attempt replays its stored result without dispatch. An uncertain attempt is not retried automatically. The `x-request-id` header is treated as a correlation identifier; remote idempotency is not assumed. Cross-process contention fails closed without deleting another writer's lock; stale/corrupt lock recovery is intentionally manual.

The aggregate ledger is per run ID, not a provider-account or workspace-wide quota. A distinct new run ID starts a distinct aggregate journal. Account credit balance, credit top-up fees, unrelated requests, and concurrently active distinct runs are outside this local aggregate calculation.

## Price basis and computed quote

As checked on 2026-10-09, the OpenRouter GPT-6 Luna model page listed a 1,050,000-token context, up to 128,000 completion tokens, $0.10/M prompt and $0.50/M completion, JSON Schema structured-output support, and `prompt_cache_options.mode: "explicit"` as disabling OpenAI-managed cache breakpoints when no explicit breakpoint is supplied. The pinned request omits tools, web search, images, audio, and files; no cache breakpoint is emitted. The local calculation reserves the entire published context at the request's capped prompt rate plus the requested completion maximum at the capped completion rate.

For the prepared C01 and C02 IFS requests, `maxOutputTokens` is 20,000, producing a current **quoted reservation of 115,000 microdollars ($0.115) per request**: 105,000 microdollars for the full-context prompt envelope plus 10,000 microdollars for the completion envelope. Two initial requests therefore quote $0.230 combined before any reviewer, repair, or escalation calls. The cap-bound no-dispatch proposal supplies $0.115 per call and $1.50 for the two-profile run. The report loop allows at most six generation/review/repair/escalation attempts for one report, so twelve maximum-sized attempts across C01 and C02 consume at most $1.38 of the local quote; the remaining $0.12 is headroom. These command values are a dry-run proposal, not user authorization. Earlier uncapped preflight artifacts remain preserved as historical evidence.

## Guarantee classification

**Aggregate reservation and dispatch ordering: locally enforced for one journal/run.** Atomic journal creation and the writer lock serialize reservations. The OpenRouter dispatch client requires a one-use budget capability, and live qualification rejects non-OpenRouter transports. The tests cover exact-cap and one-micro-over boundaries, competing processes, aggregate exhaustion, unknown outcomes, missing billing metadata, over-reported cost/model, journal corruption, and attempts after a durable-receipt interruption. This does not aggregate separate run IDs or unrelated use of the provider account.

**Per-call monetary ceiling: PROVIDER-DEPENDENT, not a locally guaranteed invoice ceiling.** The request sends OpenRouter `provider.max_price` prompt/completion price ceilings and a model output-token limit. OpenRouter documents `max_price` in USD per million prompt/completion tokens; it is a provider-routing rate filter, not a request-total USD field. The quote assumes the selected route honors those rate ceilings, the context and completion limits bound billable token counts, reasoning tokens are priced within completion usage at the capped output rate, the published price basis remains current, and the response cost field captures all request charges. The local post-response check detects provider cost/model overruns only after the provider may already have charged. A provider-side billing discrepancy, unreported charge, or price/accounting change cannot be prevented by this client.

OpenRouter support says pricing may differ for prompt/completion, images, and reasoning tokens and costs are deducted from credit balance; credit purchase fees are separate. The selected request excludes images and tools/search; `usage: { include: true }` requests the usage object, but no provider call has confirmed that the selected route reports every required cost field or bills reasoning within the stated completion envelope. An HTTP 200 response missing any usage/cost field is rejected and the call stays `unknown` with its full reservation. No account-level API-key or workspace cap was configured or inspected; an external account budget is still needed to contain spending across independent runs and unrelated API use.

## Provider compatibility

The local serializer emits strict `response_format: {type:"json_schema", json_schema:{name,strict:true,schema}}`, `reasoning.effort:"max"`, `provider:{zdr:true,data_collection:"deny",require_parameters:true,max_price:{prompt:0.10,completion:0.50}}`, `prompt_cache_options:{mode:"explicit"}`, and `usage:{include:true}`. Current model documentation advertises JSON Schema output, reasoning, and explicit cache behavior. The OpenRouter structured-output guide recommends `require_parameters:true` for compatible provider routing. These are **documentation checks only**: no authenticated metadata query or request was made, so the exact selected provider's wire acceptance remains untested.

## Authoritative references checked 2026-10-09

- [OpenRouter GPT-6 Luna model/API page](https://openrouter.ai/openai/gpt-6-luna?view=api)
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [OpenRouter max_price guide](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/)
- [OpenRouter billing and support](https://openrouter.ai/support)
- [OpenRouter pricing and credit fees](https://openrouter.ai/pricing/)
- [OpenRouter key spending limits](https://openrouter.ai/docs/api/api-reference/api-keys/create-keys)
- [OpenRouter workspace budgets](https://openrouter.ai/docs/api/api-reference/workspaces/upsert-workspace-budget)

The current remote terms, provider prices, provider set, model parameters, and account fee plan can change; re-check them immediately before any separately authorized call. That future re-check must not silently change the model or reasoning pin.
