# P02 IFS interpretation attempt 5 — transport-corrected bounded recovery

Status: **dispatched once; provider response completed; source validation and independent review rejected composition**.

## Scope and unchanged request

- Profile/report/stage: P02 / IFS / interpretation.
- Fixture: `route-replays-v5`; fictional data only.
- Provider/model: OpenAI direct Responses API / `gpt-6-luna`.
- Reasoning: `max`; service tier: `default`.
- `max_output_tokens`: **128000**.
- Request-body SHA-256: `f8c36e20ba9043a8bfc4392c7b11c174f6766d60b796ab175c4ee29cdd5b9cb6`.
- Per-request reserve: 300000 microdollars ($0.30).
- Aggregate authorization: 3000000 microdollars ($3.00).
- No provider retry is automatic. Attempt 5 has one fresh identity and stops if its billing outcome is unknown, response is incomplete, or response/source review fails.

The provider request body, model, reasoning effort, output cap, packet, prompt, schema, and source identity are byte-for-byte pinned to the prior 128k P02 interpretation requests. Only the HTTP transport is changed: Undici 7.28.0 `fetch` receives a dedicated `Agent` with connection, response-header, response-body, and overall-abort deadlines of 1,800,000 ms.

## Transport evidence

Attempt 4 used a 30-minute application abort but failed after 304.759 seconds with `UND_ERR_HEADERS_TIMEOUT`. The first local smoke check was invalid: its 75 ms timeout and 250 ms delay were both below Undici's coarse response-header timer tick. A fresh read-only Sol diagnosis traced Undici 7.28.0 to 1,000 ms resolution and 499 ms ticks.

The corrected loopback-only control sends a partial HTTP response header, then completes it after 3,000 ms. The 1,000 ms Agent rejects with `UND_ERR_HEADERS_TIMEOUT` after 1,523 ms; the 8,000 ms Agent receives HTTP 200 and body `ok` after 3,017 ms. The machine-readable record is `UNDICI_TIMEOUT_SMOKE.json`. This establishes the configured dispatcher's behavior at scaled timeouts; it does not guarantee provider completion or billing.

## Budget before dispatch

Three earlier calls remain `unknown_cost`, with $0.90 total locked. Attempt 2 is settled at a conservative usage-based upper bound of $0.01965. The current journal has $2.08035 available. Attempt 5 reserves a new $0.30 before POST, leaving $1.78035 available for the already-authorized P02/C10 continuation. A later unknown-cost result remains locked; no reservation is released or replayed.

The $0.30 per-call amount is a reservation based on conservative pricing and token bounds, not a guaranteed invoice maximum. The current official OpenAI model page lists `max` reasoning and a 128,000 output-token maximum. Current long-context standard rates are $0.20/M input, $0.25/M cache writes and $0.75/M output. The no-dispatch receipt records the calculated request upper bound of $0.120826.

## Preconditions and gates

- Exact attempt-5 preflight: `ATTEMPT5_PREFLIGHT.json`.
- Scope and authorization guard cases: `TRANSPORT_RECOVERY_GUARDS.json`.
- Corrected local transport control: `UNDICI_TIMEOUT_SMOKE.json`.
- Three unresolved-cost call IDs and the new reservation are verified against `BUDGET_JOURNAL.json` before reservation.
- A current authenticated OpenAI model-list GET must show `gpt-6-luna`; it is not a generation request.
- A successful, complete, parseable P02 interpretation must pass source-reference validation and separate Sol review before composition.
- If that path succeeds, continue with P02 composition, C10 interpretation, and C10 composition only as each exact prior validator and review receipt permits, using the same journal and caps.
- No output from this fictional experiment is routing qualification, human approval, or production activation.

## Attempt 5 result

Attempt 5 returned HTTP 200 and a completed response from `gpt-6-luna` with the exact 128,000 output-token cap. It used 30,597 input tokens and 52,952 output tokens (40,323 reasoning); the conservative usage-derived estimate is $0.047364, not an invoice. The response, raw text, and parsed graph are retained.

The first validator incorrectly applied the finished PWRP report claim schema to the intermediate interpretation graph, producing 110 inapplicable schema findings. The corrected stage-specific recheck removed that probe and added graph-wide checks for strengths, counterexamples, and open questions. P02 still fails: 31 synthetic citations in claims, 69 synthetic/stale graph-record citations, 11 occurrence-scope mismatches, and two sequence-lineage findings. The independent Sol review rejected composition. The original provider output and first receipt remain unchanged.

C10 proceeds as its own pinned profile, after eight no-dispatch adversarial cases and a fresh authenticated OpenAI model-list GET passed. It does not inherit P02 claims. C10's full packet remains unchanged; the request supplies the separately source-cross-checked authored-evidence index alongside the packet. See `C10_INTERPRETATION_PREFLIGHT.json` and `C10_PROVIDER_PREFLIGHT.json`.
