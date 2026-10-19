# OpenAI-only / zero-retention route blocker

Checked: 2026-10-11 08:19 UTC  
Scope: fictional C01/C02 IFS diagnostic, `openai/gpt-6-luna`, OpenRouter, `openai` only, no fallbacks, ZDR required, `data_collection: deny`.

## Finding

The request policy has an empty provider intersection. The live OpenRouter model catalog listed seven endpoints for this model; the live ZDR endpoint catalog listed three matching endpoints, all Azure. It listed zero OpenAI ZDR endpoints. The exact catalog response hashes and endpoint records are in [openai-zdr-route-eligibility-20261011.json](openai-zdr-route-eligibility-20261011.json).

The model's `openai/` namespace identifies the model; it does not pin the serving provider. This diagnostic pins the serving provider to OpenAI while separately requiring ZDR. OpenRouter therefore rejected the request before selecting an inference endpoint.

## Actual fresh-epoch attempt

- One C01 IFS generation request reached `https://openrouter.ai/api/v1/chat/completions`.
- OpenRouter returned HTTP 404: `No endpoints found matching your data policy (Zero data retention).`
- No upstream provider endpoint was selected; no C02 request was sent.
- No generated draft, token usage, reviewer result, or semantic evaluation was produced.
- The provider returned no usage/cost receipt. The journal reports $0 cost, retains the $0.115 reservation as unknown, and shows $2.885 remaining in this fresh $3 authorization. Invoice status remains unconfirmed; no retry was attempted.
- The pinned source and packet hashes matched the approved candidate before dispatch.

The durable run record is `../live/gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011-fresh-budget-epoch-2/`.

## Why the previous request got no response

The prior continuation is recorded as `no_http_response`. A no-key GET to OpenRouter's public model catalog reproduced `ENOTFOUND` / `getaddrinfo` in the restricted runner, while the same GET from a network-enabled runner returned HTTP 200. This proves that attempt failed before OpenRouter received an HTTP request. The paired probe is retained in [openrouter-network-diagnostic-20261011.json](openrouter-network-diagnostic-20261011.json).

The failures are separate: the earlier default-provider attempt received an Azure `400 invalid_json_schema`; the OpenAI-only continuation received no HTTP response because of restricted DNS/network access; the fresh network-enabled attempt received OpenRouter's `404` because no endpoint satisfied the pinned provider and ZDR filters.

## Code correction

The CLI now checks OpenRouter's public ZDR endpoint catalog before reading the API key or creating a generation attempt. An empty intersection stops with zero generation dispatches and no budget reservation; a later invocation can safely recheck the public metadata. This prevents another paid-endpoint request from being used to discover the same incompatibility.

## What is needed to run the report test

Keep the current pins and make the OpenAI endpoint eligible under the OpenRouter account/guardrail privacy policy, or change the provider/retention policy and explicitly review that changed scope. The current policy cannot route to OpenAI while also requiring ZDR because OpenRouter does not list an OpenAI ZDR endpoint for this model. This implementation leaves both policies unchanged and does not select Azure as a fallback.

OpenRouter documents that ZDR endpoint eligibility is endpoint-specific, that `provider.zdr: true` restricts routing to ZDR endpoints, and that request ZDR cannot loosen an account or guardrail requirement ([ZDR routing guidance](https://openrouter.ai/blog/insights/zero-data-retention/)). Its current provider directory labels OpenAI as retaining prompts ([provider directory](https://openrouter.ai/providers/)). The exact model and current ZDR endpoint catalogs are linked in the accompanying JSON evidence.
