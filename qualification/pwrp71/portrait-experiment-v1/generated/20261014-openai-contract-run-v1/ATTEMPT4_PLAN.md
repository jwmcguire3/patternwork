# P02 interpretation attempt 4 — bounded recovery plan

Status: **attempt 4 dispatched; no HTTP response; billing outcome unknown; no report output**.

## Exact request

- Profile/report/stage: P02 / IFS / interpretation.
- Fixture: `route-replays-v5`.
- Provider/model: OpenAI direct Responses API / `gpt-6-luna`.
- Reasoning: `max`; service tier: `default`.
- `max_output_tokens`: **128000**.
- Request-body SHA-256: `f8c36e20ba9043a8bfc4392c7b11c174f6766d60b796ab175c4ee29cdd5b9cb6`.
- Per-request reserve: 300000 microdollars ($0.30).
- Aggregate authorization: 3000000 microdollars ($3.00).
- Client timeout: 1,800,000 ms (30 minutes); automatic retries disabled.

The request exactly repeats attempt 3's pinned payload. Attempt 3 used 128,000 output tokens; its recorded failure was `fetch failed`, without an HTTP response. Attempt 2 had a 16,000 output-token cap and returned incomplete because all output tokens were reasoning. The attempt-4 request does not use a 16,000 cap.

## Budget state

Attempt 1 and attempt 3 remain `unknown_cost`, each with its full $0.30 reservation locked. Attempt 2 is settled at a conservative usage-derived upper bound of $0.01965. Before this request, $2.38035 remained. Reserving attempt 4 reduces available authorization to $2.08035. Any further requests use the same journal, retain both unknown reserves, and must reserve $0.30 before each dispatch. A new unknown or incomplete result stops the run without retries.

The latest official OpenAI GPT-6 Luna documentation checked on 2026-10-15 lists 128,000 maximum output tokens, supports `max` reasoning, and documents long-context input/output/cache-write rates of $0.20/$0.75/$0.25 per million tokens at default standard processing. The runner prices conservatively using $0.25 for each UTF-8 input byte as a token upper bound plus the full output cap at $0.75/M. This is a bounded reservation estimate, not an invoice guarantee.

## Preconditions and no-dispatch evidence

`FINAL_ATTEMPT_GUARDS.json` records 16 adversarial/no-dispatch scenarios. The exact attempt-4 preflight passed with the pinned request hash, 128,000 output cap, $0.60 in retained unknown-cost reservations, a new $0.30 reserve, $2.08035 remaining after reservation, and zero provider dispatches. Temporary journal/packet mutations were restored byte-for-byte; the journal and prepared packet hashes remained unchanged after the guard run. See `FINAL_ATTEMPT_PREFLIGHT.json` for the separately retained final pre-dispatch result.

## Stop and continuation rules

Dispatch this attempt once, using the existing journal and a fresh attempt-4 call ID. Do not create a new run ID. If the request fails before a response, keep its reserve locked and stop. If the response is incomplete, mismatched, invalid or lacks a usable draft, keep the settled/reserved record and stop. Do not retry attempt 4.

Only a completed response with the expected model and service tier, parseable interpretation, current source-reference checks, and separate Sol review marked `accepted_for_composition` permits P02 composition. After P02's unchanged production draft validation and separate Sol review, continue to C10 interpretation and composition, one call at a time, using the same journal and budget cap. Any failed prerequisite stops continuation. Every output is fictional diagnostic evidence, not routing qualification, human approval, or production activation.


## Actual attempt-4 result — 2026-10-15

Attempt 4 was dispatched once under the exact preflighted request hash and 128,000 output-token cap. The direct OpenAI request produced no HTTP status or response ID. It ended with `fetch failed`; the retained cause chain is `TypeError: fetch failed` -> `HeadersTimeoutError`, code `UND_ERR_HEADERS_TIMEOUT`, approximately 305 seconds after the durable reservation was created. The configured `AbortSignal` limit was 1,800,000 ms, but the HTTP client's response-header timeout ended the request first. There is no provider response body, usage, finish reason, draft, validation receipt, or reviewer receipt. The $0.30 reservation remains `unknown_cost` and locked.

This is a transport-layer failure, not evidence that the 128k output cap was rejected. A zero-cost authenticated GET immediately before dispatch returned HTTP 200 and confirmed the model was visible; it does not determine whether the POST was accepted or billed. Attempt 1, attempt 3 and attempt 4 each retain their $0.30 unknown-cost reserves; attempt 2 remains settled at $0.01965. The journal therefore shows $0.90 reserved and $2.08035 still available under the $3 authorization. No additional call has been sent.

The current runner's global Node `fetch` uses Undici. Undici documents a 300-second default for the response-header timer; the captured code and elapsed time are consistent with that default overriding the intended 30-minute application abort. This root cause is strongly indicated, but provider acceptance/billing remains unknown. Do not reuse attempt 4 or infer a successful report from it.
