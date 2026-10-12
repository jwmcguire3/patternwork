# Gate 11 fictional IFS diagnostic — final gate ledger

> **Current status:** this table reflects the completed 128,000-output-token C01/C02 run recorded below. Earlier sections remain as chronological records of prior attempts and no-dispatch stops.

| Gate | Status | Evidence / limit |
|---|---|---|
| Owner authorization | **Pass for this diagnostic only** | Existing recorded approval covers fictional v5 C01/C02 IFS and $3 aggregate cap; the owner later explicitly raised the per-call ceiling to $0.20 and requested the 128,000-token run. Not a routing receipt or activation approval. |
| Source and packet pins | **Pass** | Runtime and source hashes matched the reviewed candidate. C01/C02 packet hashes matched `c4b836…e036` and `c14bbc…1055`. |
| Fixture validity | **Pass** | Current response bindings and packet evidence match the reviewed v5 artifacts. C01/C02 retain the CQ01 positive/negative contrast. |
| Diagnostic authorization boundary | **Pass** | CLI-only explicit flag; C01/C02 IFS, v5 fixtures, pinned model and source; $0.20 per-call and $3 aggregate caps; 128,000 output ceiling; pinned preflight; durable budget journal; one-use dispatch; separate diagnostic result schema. |
| Full routing qualification | **Incomplete** | The normal preflight remains blocked because a current independently reviewed full-routing receipt is absent. No receipt was created or inferred. |
| Provider-specific wire/schema readiness | **Pass for these two requests** | Both final drafts passed PWRP validation and both review calls returned HTTP 200. The initial drafts had validation defects; the recorded production repair/escalation flow corrected them. Requests used the pinned OpenAI-only, no-fallback policy through OpenRouter. The returned model was `openai/gpt-6-luna`; retained responses do not separately identify the actual upstream provider name. |
| Paid provider generation | **Pass for the authorized diagnostic** | C01 and C02 IFS each produced an accepted report. Seven new calls total: C01 initial/repair/review; C02 initial/repair/escalation/review. No other profile or report type was dispatched. |
| Budget accounting | **Within authorization; prior unknown reservations retained** | New calls reported $0.094428. Including the inherited $0.012138 completed attempt, reported cost is $0.106566. Three earlier attempts retain $0.345 reserved with invoice status unknown. Remaining authorized amount is $2.548434 of $3.000000; settlement is not independently confirmed. |
| Draft validation | **Pass for final C01/C02 drafts** | C01 passed after one repair. C02's first draft and repair failed; the single production escalation passed. All attempt results and issues remain in the journal. |
| Automated reviewer | **Pass, model-generated** | Both final reviewer receipts say `accept`, bind the final draft and evidence digests, and have no listed issues. These receipts are not independent semantic or human approval. |
| CQ01 report-quality review | **Partial, central distinction demonstrated** | Independent source-linked Sol-subagent review: C01 is a qualified pass with a medium Markdown omission of `D66.compelled` (the JSON retains it); C02 passes CQ01 and preserves the negative control. C02 has a low-severity possible sequence implication in unrelated claim C8. See `live/gate11-c01-c02-ifs-128k-output-20261012/semantic-evaluation.md`. |
| Independent code/run review | **Pass, scoped** | Independent read-only routing/packet review and live receipt/accounting review found no packet, lineage, budget, or journal mismatch. A separate read-only Sol review examined both actual reports. None establishes full routing qualification or human approval. |
| Tests / typecheck / scoped lint | **Pass** | Focused diagnostic tests 29/29; `npm test` 439/439; typecheck and scoped ESLint exit 0. Logs and exit-code receipts are under `verification/`. |
| Production build | **Pass after permitted elevated retry** | The ordinary Windows build failed on OneDrive/SWC path access (`exit 1`); the same build with broader filesystem access passed (`exit 0`). Existing broad-file-pattern and stale browser-mapping warnings were present. |
| Human approval of report quality or release | **Pending** | Owner approval authorized this bounded fictional diagnostic; it did not approve the generated prose or release. |
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

## Owner request for a 128,000-token output limit — no-dispatch budget check — 2026-10-12

The owner requested C01 and C02 with a 128,000-token output limit. The model supports that completion limit, and the published rates are $0.10 per million input tokens and $0.50 per million output tokens ([OpenAI model page](https://developers.openai.com/api/docs/models/gpt-6-luna); [OpenRouter model/provider page](https://openrouter.ai/openai/gpt-6-luna/providers)). The existing diagnostic budget function conservatively quotes the full 1,050,000-token context as billable input plus the full output allowance: $0.105 input + $0.064 output = $0.169 (169,000 microdollars) per call.

The existing owner-authorized ceiling remains 115,000 microdollars per call. The 128,000-token request therefore exceeds that ceiling by 54,000 microdollars per call. The $3,000,000 aggregate authorization is otherwise sufficient, but it does not supersede the separate per-call ceiling. No implementation pin was changed, no new run or attempt ID was created, and no provider request or API-key read occurred. The previous completed C01 attempt, its `finish_reason: length`, and all historical budget receipts remain unchanged. C02 remains undispatched. To run at the full 128,000 output limit under the current conservative quote, the per-call ceiling must be explicitly raised to at least 169,000 microdollars; otherwise this run remains blocked.

## Owner-authorized $0.20 per-call C01/C02 run — 128,000 output tokens — 2026-10-12

The owner then directed: “raise per call reservation to .2 and run.” The authorized limits were applied as a $0.20 (200,000-microdollar) per-call ceiling and $3.00 aggregate cap. The conservative reservation remained $0.169 per call, based on published pricing and the full model context plus 128,000 output tokens. No model, reasoning effort, schema, prompt, fixture evidence, or provider policy was changed to obtain acceptance.

The run was `gate11-c01-c02-ifs-128k-output-20261012`, with C01/C02, IFS only, `route-replays-v5`, `openai/gpt-6-luna`, max reasoning, OpenAI-only routing with fallbacks disabled, and non-ZDR allowed under the prior owner direction. It finished with CLI exit code 0 and status `diagnostic_complete_with_prior_unknown_cost`. Exact output is retained in `live/gate11-c01-c02-ifs-128k-output-20261012/` and the CLI stdout/exit code in `verification/128k-live-diagnostic-cli.log` and `verification/128k-live-diagnostic-cli.exit-code.txt`.

Before dispatch, all reviewed identities matched: router runtime `d08a7da2…06d7d`; C01 IFS packet `c4b83634…4e036`; C02 IFS packet `c14bbcbd…61055`; question source `a1ec5e1a…f832`; report source manifest `026c6fd1…3a5`; semantic case set `fec1752b…569d`; v5 fixture manifest `17b1c8cd…b19f`; and no-dispatch preflight canonical digest `c3e9315f…e501`. The exact values and per-profile request fingerprints are preserved in `run.json`, `provider-preflight`, and `execution-summary.json`.

Seven new calls were made, all with a 128,000 output ceiling and a 169,000-microdollar reservation under the 200,000-microdollar ceiling. Each received HTTP 200, reported `openai/gpt-6-luna` usage, and ended with `stop`:

| Profile | Call flow | Input / output / reasoning tokens | Reported cost | Final result |
|---|---|---|---:|---|
| C01 | Initial → repair → automated review | 75,853 / 76,951 / 64,052 | $0.046061 | Draft passed validation after one repair; reviewer accepted. |
| C02 | Initial → repair → escalation → automated review | 94,342 / 77,864 / 62,493 | $0.048367 | Initial and repair drafts failed validation; escalation passed; reviewer accepted. |
| **New calls total** | **7 calls** | **170,195 / 154,815 / 126,545** | **$0.094428** | **Both requested reports accepted.** |

The 11 durable dispatch entries comprise four inherited history entries and these seven new calls. Three inherited attempts remain unknown and reserve $0.345. The inherited completed C01 output-limited attempt reported $0.012138. Aggregate reported cost is $0.106566; remaining authorization is $2.548434, counting the $0.345 unknown reservation against the $3 cap. No current-run attempt has unknown usage, no request was repeated, and C03 or any report other than C01/C02 IFS was dispatched. Cost is provider-reported through OpenRouter; invoice settlement is not verified.

All returned model identities match `openai/gpt-6-luna`, and the request policy was OpenAI-only with fallbacks disabled. OpenRouter was the gateway. The retained response records do not contain a separate actual-upstream-provider name, so the run does not claim independently observed direct OpenAI infrastructure routing.

Both generated reports and their receipts are preserved: C01 artifact `b41a0ee4…8314`, C02 artifact `bf0cb2eb…7d22`; both automated reviewer receipts are `accept` and bind the final draft and evidence hashes. Independent read-only source-linked semantic review found that the pair distinguishes the intended CQ01 case: C01 is a qualified pass with a medium omission in Markdown (`D66.compelled` survives in JSON); C02 passes CQ01 without manufacturing an Exile from its smaller outward request, with a low-severity sequence implication in unrelated claim C8. See `live/gate11-c01-c02-ifs-128k-output-20261012/semantic-evaluation.md`. The model-generated `accept` receipts are not independent semantic or human approval.

Verification receipts: focused diagnostic tests 29/29; `npm test` 439/439; typecheck and scoped ESLint exit 0. The ordinary production build failed with a Windows OneDrive/SWC path access error (exit 1); the same build with broader filesystem access passed (exit 0). No source question, report prompt/schema, provider policy, activation control, or fixture corpus was changed by this run. Full routing qualification remains incomplete; owner approval of report quality and production activation remain pending/unchanged.
