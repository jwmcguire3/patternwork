# P02 composition transport assessment

**Read-only model assessment:** The P02 composition attempt `c1a9db49-3d79-4f4a-bfd4-f7eb962c5329` has adequate technical evidence for a **failure before provider HTTP dispatch**. This review made no provider request or journal change. It grants no human, routing, or report approval.

## Bound evidence

| Item | SHA-256 |
| --- | --- |
| `BUDGET_JOURNAL.json` snapshot | `5ef5b471e6f0100effc50cf750d8d6dc8125c5b59528fbdd9fb0fafd97e530c5` |
| `scripts/dispatch-openai-experiment.mjs` | `98b0358969b6c626fd21f54b15de1cd3299724c9b836ffcd63a507a2d728b742` |
| `requests/P02.composition.request.json` | `952e7c4588a2b88b8eb740dcc44c192071874c6d6203cea052753d51b103447b` |
| Installed Undici 7.28.0 connector | `67956a204fe3982edbf032dd44ff9c1c391daaa85c05e9750d245bdfb2b87fe0` |

The journal records `TypeError: fetch failed` caused by `getaddrinfo ENOTFOUND api.openai.com`, with no HTTP status, response ID, response artifact, or usage. The failure was recorded 71 ms after reservation. The pinned dispatcher creates a fresh Undici Agent for the direct HTTPS POST; the installed connector resolves the hostname before it can establish a socket and send HTTP bytes. The elapsed time supports this reading but is not the decisive evidence.

This establishes a local **no-provider-HTTP-dispatch** outcome for this attempt. It does not establish an invoice amount, change the billing status of earlier unknown-cost calls, or show that connectivity has recovered.

## Next check and ledger treatment

One authenticated, non-generating `GET /v1/models` is the right next check for DNS/connectivity, authentication, and `gpt-6-luna` visibility. A successful GET is a preflight for any new POST; it does not retroactively establish billing. If the GET fails, stop the retry path.

Keep this call's current `unknown_cost` entry and $0.30 reservation untouched during assessment. With the exact journal, request, dispatcher, cause chain, and absent response artifact rechecked, record an explicit no-dispatch correction that preserves the original state, marks this call `failed_before_provider_dispatch`, releases **only this call's** $0.30 reservation, and recomputes counters from the current journal. In the reviewed snapshot, that would change reserved funds from $1.20 to $0.90 and available authorization from $1.647811 to $1.947811; the settled usage upper bound stays $0.152189. Earlier unknown-cost reservations remain locked.

Any subsequent P02 composition POST needs a fresh call ID and reservation, a successful preflight, the same reviewed graph and request, and the existing $3 aggregate and no-automatic-retry limits. This assessment makes no provider billing or approval claim beyond the observed transport evidence.
