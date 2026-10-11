# Gate 11 fictional IFS diagnostic — final gate ledger

| Gate | Status | Evidence / limit |
|---|---|---|
| Owner authorization | **Pass for this diagnostic only** | Existing recorded approval covers fictional v5 C01/C02 IFS, $0.115 per-call reservation, $3 aggregate cap. It is not a routing receipt or activation approval. |
| Source and packet pins | **Pass** | Runtime and source hashes matched the reviewed candidate. C01/C02 packet hashes matched `c4b836…e036` and `c14bbc…1055`. |
| Fixture validity | **Pass** | Current response bindings and packet evidence match the reviewed v5 artifacts. C01/C02 retain the CQ01 positive/negative contrast. |
| Diagnostic authorization boundary | **Pass** | CLI-only explicit flag, exact cohort/report/fixture/model/effort and spend caps, pinned source preflight, durable budget journal, exact-body check, one-use dispatch, separate diagnostic result schema. |
| Full routing qualification | **Incomplete** | The normal preflight remains blocked because a current independently reviewed full-routing receipt is absent. No receipt was created or inferred. |
| Provider-specific wire/schema readiness | **Rejected for this schema; exact cause unresolved** | The first epoch-2 C01 request returned HTTP 404 because no endpoint matched the requested Zero Data Retention policy. The explicitly authorized continuation omitted `zdr`, retained `data_collection: "deny"`, selected OpenAI only with fallbacks disabled, and received HTTP 400 attributed to OpenAI with upstream code `invalid_json_schema`. The sanitized receipt did not retain `error.raw`, so the exact rejected schema path or feature is unknown. Prompt, schema, model and reasoning effort were unchanged. |
| Paid provider generation | **Fail / stopped** | Two durable C01 requests total: one ZDR route-selection rejection and one OpenAI non-ZDR schema rejection. Neither returned a generation envelope, token usage, finish reason, report prose, validation result or reviewer receipt. C02 was not sent. |
| Budget accounting | **Unknown cost; reservations retained** | Neither error response supplied usage or cost. Both $0.115 reservations remain held ($0.230 total); $2.770 of the $3.000 authorization remains unreserved. Actual invoice cost is not confirmed, and neither attempt may be repeated automatically. |
| Draft validation | **Unavailable** | No draft was returned. |
| Automated reviewer | **Unavailable** | No draft reached the reviewer. |
| CQ01 report-quality review | **Unavailable** | Source-backed packet distinction is present, but there is no generated prose to grade for interpretation, omissions, overreach, negative-control handling, or quality. |
| Independent code/run review | **Pass, scoped** | Read-only Sol review approved the continuation boundary before execution. A separate read-only Sol review recomputed the stopped run/dispatch digests, confirmed the no-response attempt, retained reservations, zero C02 calls, unchanged pins, and no report artifacts. This is not human report approval. |
| Tests / typecheck / scoped lint | **Pass** | Final `npm test` 427/427; focused diagnostic regression is included; `npm run typecheck` exit 0; scoped ESLint exit 0. |
| Production build | **Pass** | Final `npm run build` exit 0. Existing broad-file-pattern and stale browser-mapping warnings were present. |
| Human approval of report quality or release | **Pending** | The owner authorization was for the diagnostic only. No report was produced for approval. |
| Production activation | **Unchanged / not approved** | No diagnostic result can satisfy qualification or activation. |

## Safe stopping point

The fixed run ID is stopped after one unknown-cost ZDR route-selection rejection and one unknown-cost OpenAI-only non-ZDR schema rejection. The live C01 continuation proves that OpenRouter selected OpenAI and returned an OpenAI-attributed `invalid_json_schema` error; it does not reveal the exact schema incompatibility. The used preflight record remains unchanged and run-pinned. A separately versioned v2 no-dispatch record corrects its descriptive ZDR flag and embedded wire-schema digest. Neither attempt may be automatically replayed; both $0.115 reservations remain held. C02 was not reached. This ledger authorizes no additional provider request, profile, report type, schema/prompt/provider-policy change, routing qualification claim, report release, or production activation.

## Verification notes

- The first corrected-preflight generation attempt exited before dispatch because its guard expected the pre-continuation 115,000-micro reservation state. The live run had already advanced to its exact stopped state with two unknown reservations. The generator now pins run SHA `3959ea…` and records both reservations; generation completed as a no-dispatch operation with zero API-key reads and zero provider calls.
- A focused-test rerun initially stopped before its transport factory. A fresh read-only diagnosis confirmed the test helper was seeding from the mutable live run after the continuation had been consumed. It now seeds from the byte-preserved eligible ZDR parent in `history/`; the focused suite passes 21/21. This was a fixture setup defect, not a changed routing or provider behavior. The full suite, typecheck, scoped lint and build also pass.
- A final independent read-only Sol review found two more v2 record details to correct: distinguish the prepared-request fingerprint from the observed live journal fingerprint, and mark C02's provider acceptance as untested because it was never dispatched. The v2 generator and assertions now record those distinctions. The latest no-dispatch generation completed with zero calls and file SHA `87f8ffed…`; final `npm test` 427/427, focused regression, typecheck, scoped lint and production build all pass. The independent read-only recheck passed: request fingerprints, C02's untested status, current run and archived parent digests, and the used preflight pin all match.
