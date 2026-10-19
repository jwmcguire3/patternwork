# Resend verification receipt

## Request

- Authorized scope: fictional C01, IFS, `route-replays-v5`, `openai/gpt-6-luna`, reasoning `max`.
- Non-ZDR owner instruction was explicit; the request retained `data_collection: deny`, an OpenAI-only allowlist, and no provider fallback.
- C01 packet SHA-256: `c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036`.
- Router runtime SHA-256: `d08a7da2c6e3119c75e3e60917da42a60bbe6615024f901ac5b11ed26fa06d7d`.
- Response schema SHA-256: `8f0f6f91d4037a2c929253bc21e35c96bc3f86c4c28193cafefe22640fb5b451`.
- Serialized provider body SHA-256: `4db2ad54d5fcb3de6d1753c0d3f90dfd169983beb668e8cf15e0a5bad93e735c`; exact match to the previous OpenAI non-ZDR request.
- Request ID: `pwrp71-fictional-diagnostic:gate11-c01-error-detail-resend-20261012:C01:openai-error-detail-resend-1:IFS:initial:openai-gpt-6-luna-max:attempt-1`.
- Live provider endpoint catalog had 7 model endpoints and 3 OpenAI matches at `2026-10-12T18:08:36Z`; its catalog digest is recorded in `preflight.json`.

## Dispatch and cost

- One generation dispatch in this resend; OpenAI returned HTTP 400, upstream `invalid_json_schema`.
- No token usage or cost was returned. The invoice remains unknown.
- This epoch had two earlier unresolved $0.115 reservations. It now holds $0.345 total and has $2.655 remaining by reservation accounting under the $3 cap. The $0.115 reserve is provider-dependent and is not a guaranteed invoice ceiling.
- No retries, repair, C02 request, draft validation, reviewer call, or semantic approval occurred.

## Command results

| Command/action | Result |
|---|---|
| First CLI attempt in the restricted shell | Exit 1: `ENOTFOUND` at connectivity preflight; no generation request dispatched. |
| Authorized network-enabled resend | One dispatch and HTTP 400 response. The process then exited 1 because an optional provider request ID was absent while writing the final manifest; the attempt journal retained the response detail. |
| `npx tsx scripts/pwrp71-fictional-ifs-diagnostic/resend-error-detail.ts --finalize-only` | Exit 0; finalized from local ledgers without network or provider access. |
| Focused OpenRouter, budget, and diagnostic tests | Exit 0; 59/59 passed. |
| `npm test` | Exit 0; 432/432 passed. |
| `npm run typecheck -- --pretty false` | Exit 0. |
| Scoped ESLint for the diagnostic and its tests | Exit 0; no warnings after cleanup. |
| `npm run build` | Exit 0. Build emitted existing dynamic-file-pattern warnings and stale `baseline-browser-mapping` data notices. |

## Boundary

The failed provider response does not demonstrate report quality. The source schema was not modified. Routing qualification remains `not_claimed`, human approval remains pending, and production activation remains unchanged.
