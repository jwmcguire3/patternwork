# Gate 11 fictional IFS diagnostic — final gate ledger

| Gate | Status | Evidence / limit |
|---|---|---|
| Owner authorization | **Pass for this diagnostic only** | Existing recorded approval covers fictional v5 C01/C02 IFS, $0.115 per-call reservation, $3 aggregate cap. It is not a routing receipt or activation approval. |
| Source and packet pins | **Pass** | Runtime and source hashes matched the reviewed candidate. C01/C02 packet hashes matched `c4b836…e036` and `c14bbc…1055`. |
| Fixture validity | **Pass** | Current response bindings and packet evidence match the reviewed v5 artifacts. C01/C02 retain the CQ01 positive/negative contrast. |
| Diagnostic authorization boundary | **Pass** | CLI-only explicit flag, exact cohort/report/fixture/model/effort and spend caps, pinned source preflight, durable budget journal, exact-body check, one-use dispatch, separate diagnostic result schema. |
| Full routing qualification | **Incomplete** | The normal preflight remains blocked because a current independently reviewed full-routing receipt is absent. No receipt was created or inferred. |
| Provider-specific wire/schema readiness | **C01 schema accepted; report incomplete** | The historical C01 HTTP 400 named `properties.report_release`; the wire projector added explicit primitive types to homogeneous enum/const nodes. The corrected C01 request received HTTP 200 under the OpenAI-only, no-fallback policy. It then exhausted its 20,000 output-token limit with finish reason `length`; no JSON report content was returned. |
| Paid provider generation | **Fail / stopped after C01** | One new C01 IFS request was dispatched and completed with a provider-reported result. It failed `incomplete_generation` (`finishReason: length`, no string JSON content). C02 was not dispatched because C01 did not pass generation, validation, and review. |
| Budget accounting | **Known C01 usage; prior unknown reservations retained** | C01 reported 21,376 input tokens, 20,000 output tokens (all 20,000 counted as reasoning), and $0.012138 provider-reported cost. Three earlier epoch-2 attempts remain unknown with $0.345 reserved. Current $3.000 authorization has $2.642862 remaining. Invoice settlement for the new attempt and earlier unknown attempts is not independently confirmed. |
| Draft validation | **Unavailable** | No draft was returned. |
| Automated reviewer | **Unavailable** | No draft reached the reviewer. |
| CQ01 report-quality review | **Unavailable** | Source-backed packet distinction is present, but there is no generated prose to grade for interpretation, omissions, overreach, negative-control handling, or quality. |
| Independent code/run review | **Pass, scoped** | Read-only reviews covered fixture scope and the network preflight stop. A later read-only diagnosis confirmed no report request was dispatched by the failed DNS preflight. No independent semantic report review was possible because no draft was returned. |
| Tests / typecheck / scoped lint | **Pass** | `npm test` 436/436; focused diagnostic regression 26/26; `npm run typecheck` exit 0; scoped ESLint exit 0. |
| Production build | **Pass** | `npm run build` exit 0. Existing broad-file-pattern and stale browser-mapping warnings were present. |
| Human approval of report quality or release | **Pending** | The owner authorization was for the diagnostic only. No report was produced for approval. |
| Production activation | **Unchanged / not approved** | No diagnostic result can satisfy qualification or activation. |

## Safe stopping point

The schema-correction continuation is stopped after its single new C01 request. The exact previous three unknown attempts remain held and were not replayed. The new C01 response used model `openai/gpt-6-luna`, returned HTTP 200, and reported usage/cost, but finish reason `length` and absent JSON content made it an invalid incomplete generation; validation and automated review did not run. The run correctly withheld C02. Do not reuse the completed C01 attempt ID or treat its incomplete response as a draft. No additional provider request was sent after this invalid response. No report-quality approval, routing qualification, release, or production activation is claimed.

## Verification notes

- The first corrected-preflight generation attempt exited before dispatch because its guard expected the pre-continuation 115,000-micro reservation state. The live run had already advanced to its exact stopped state with two unknown reservations. The generator now pins run SHA `3959ea…` and records both reservations; generation completed as a no-dispatch operation with zero API-key reads and zero provider calls.
- A focused-test rerun initially stopped before its transport factory. A fresh read-only diagnosis confirmed the test helper was seeding from the mutable live run after the continuation had been consumed. It now seeds from the byte-preserved eligible ZDR parent in `history/`; the focused suite passes 21/21. This was a fixture setup defect, not a changed routing or provider behavior. The full suite, typecheck, scoped lint and build also pass.
- A final independent read-only Sol review found two more v2 record details to correct: distinguish the prepared-request fingerprint from the observed live journal fingerprint, and mark C02's provider acceptance as untested because it was never dispatched. The v2 generator and assertions now record those distinctions. The latest no-dispatch generation completed with zero calls and file SHA `87f8ffed…`; final `npm test` 427/427, focused regression, typecheck, scoped lint and production build all pass. The independent read-only recheck passed: request fingerprints, C02's untested status, current run and archived parent digests, and the used preflight pin all match.

## Schema compatibility correction — 2026-10-12

The subsequently captured C01 error-detail response preserved the exact upstream message: OpenAI rejected `properties.report_release` because its `const` schema had no explicit `type`. The same omission existed on 14 other enum/const nodes across the shared draft and reviewer schemas. The draft is shared by MAP, IFS, PV, ATT, and SYNTHESIS.

`projectOpenRouterStrictSchema` now adds `type: string`, `number`, or `boolean` only when all enum/const values share that primitive type. It leaves mixed or non-primitive values unchanged. Local validation continues to use the original complete schemas. The correction does not change the question bank, report prompts, source schema files, report release manifest, fixtures, provider policy, routing qualification, or activation controls.

Four corrected no-dispatch preflights are preserved separately from their historical predecessors:

| Record | SHA-256 | C01/C02 corrected wire-schema SHA-256 |
|---|---|---|
| `provider-preflight/c01-c02-ifs-openai-only-schema-correction-no-dispatch-20261012.json` | `d3aa56b9ae679dac8402b564e54f77390b64b118747578443aaca265a773fc58` | `3f5b497e3897fdedc0d84281b36bf3584dca8b45b84e63d8032283924d47452d` |
| `provider-preflight/c01-c02-ifs-openai-only-continuation-schema-correction-no-dispatch-20261012.json` | `a4442c71c6b99f4300c34b0097be76c587a11d01b0daa9cf70592ca78d91688e` | same |
| `provider-preflight/c01-c02-ifs-openai-only-fresh-budget-epoch-2-schema-correction-no-dispatch-20261012.json` | `11b1d26f64f6f0bcc5896f0170b9a148c87262c99703c71be597f95a46ba7306` | same |
| `provider-preflight/c01-c02-ifs-openai-only-non-zdr-continuation-schema-correction-no-dispatch-20261012.json` | `c6549500d454b6415791ac034c770593e01faa050d2af6422f91745fc8ffdfd7` | same |

All four records mark dispatch, provider calls, and API-key reads as zero. Their C01/C02 packet pins are unchanged. The prior provider response and its old request body remain intact; when these preflights were generated, corrected-schema provider acceptance was still untested. Existing unknown-cost reservations were not released or retried. The later live result is recorded below.

Verification after this correction: `npm test` passed 434/434; the focused diagnostic file passed 24/24; schema-projection tests passed 3/3; typecheck and scoped ESLint exited 0; production build exited 0. The build reported the same broad dynamic-file-pattern and stale browser-mapping warnings noted above. A later live attempt is recorded below.

## Schema-correction connectivity stop and retry guard — 2026-10-12

The first invocation of the pinned schema-correction continuation stopped during the unauthenticated OpenRouter reachability preflight with `ENOTFOUND`. It created no new attempt or dispatch. The run journal contains only the three inherited C01 attempts and their dispatch receipts: all remain `unknown` for billing, `$0.345` remains reserved, `$2.655` remains under the epoch-2 authorization, and C02 was not sent. The persisted receipt is `live/gate11-c01-c02-ifs-schema-correction-20261012/run.json` (`diagnostic_stopped`; no generated results).

A fresh read-only diagnosis found the failure had not reached a report request and distinguished DNS/environment access from provider or schema behavior. A single keyless Node DNS lookup plus unauthenticated `GET https://openrouter.ai/api/v1/models`, run with network permission, resolved IPv4 and returned HTTP 200. No API key or report prompt was read or sent by that probe. The ordinary restricted shell's DNS request had returned `Access is denied`.

The continuation runner now permits a no-dispatch retry only when the stopped manifest has the exact schema-correction scope, zero results, the exact connectivity-preflight blocker, and exactly the three hash-pinned inherited unknown attempt/dispatch records. It preserves the stopped manifest under a SHA-addressed history path before clearing that blocker. Any additional attempt, dispatch, result, changed prefix, or different blocker prevents re-entry. The regression test proves one fresh C01 dispatch can follow that pre-dispatch stop, while C02 remains gated and the new unknown-cost attempt cannot be replayed.

Verification for this guard: focused diagnostic tests passed 26/26; the full suite passed 436/436; `npm run typecheck`, scoped ESLint, and `npm run build` exited 0. The later live continuation archived the no-dispatch stop before dispatching one fresh C01 attempt.

## Live schema-correction diagnostic — 2026-10-12

The keyless network probe ran with network permission and returned DNS resolution plus HTTP 200 from the public OpenRouter models catalog. The exact authorized CLI was then invoked once with C01/C02, IFS only, v5 fixtures, `openai/gpt-6-luna`, `max`, $0.115 per-call reservation and $3 aggregate cap. The continuation archived the no-dispatch `ENOTFOUND` stop under `history/pre-dispatch-stop-run-2fc732acf76beb8e31dd7f8607951742175cbf3b9efc5a0ddf1fd806bc7eb590.json` before entering transport.

The single new report dispatch was C01, idempotency key `pwrp71-fictional-diagnostic:gate11-c01-c02-ifs-schema-correction-20261012:C01:openai-schema-correction-continuation-1:IFS:initial:openai-gpt-6-luna-max:attempt-1`. It received HTTP 200; the completed attempt took 158,503 ms. The provider-reported model was `openai/gpt-6-luna`; usage was 21,376 input, 20,000 output, 20,000 reasoning, 41,376 total tokens, and 12,138 microdollars. Its request was capped at 20,000 output tokens. The provider returned finish reason `length`; no string JSON message content was available, so the diagnostic recorded `invalid_json` / `incomplete_generation`. No report artifact, draft-validation result, automated reviewer receipt, or CQ01 prose was produced. No final report prose was returned.

C02 was not dispatched: C01 did not complete generation and therefore did not pass validation or automated review. Total dispatch count 4 includes the three carried historical C01 dispatch receipts and exactly one new C01 request. Current budget accounting is 12,138 microdollars provider-reported, 345,000 microdollars still reserved as historical unknown cost, and 2,642,862 microdollars remaining from the current $3,000,000 epoch. Historical invoice amounts remain unknown. The full durable request/attempt/dispatch/run receipts and CLI stdout/exit code are in `live/gate11-c01-c02-ifs-schema-correction-20261012/`; `semantic-evaluation.md` records why neither profile can receive a report-quality verdict.
