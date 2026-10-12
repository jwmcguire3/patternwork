# Gate 11 fictional IFS diagnostic — final gate ledger

| Gate | Status | Evidence / limit |
|---|---|---|
| Owner authorization | **Pass for this diagnostic only** | Existing recorded approval covers fictional v5 C01/C02 IFS, $0.115 per-call reservation, $3 aggregate cap. It is not a routing receipt or activation approval. |
| Source and packet pins | **Pass** | Runtime and source hashes matched the reviewed candidate. C01/C02 packet hashes matched `c4b836…e036` and `c14bbc…1055`. |
| Fixture validity | **Pass** | Current response bindings and packet evidence match the reviewed v5 artifacts. C01/C02 retain the CQ01 positive/negative contrast. |
| Diagnostic authorization boundary | **Pass** | CLI-only explicit flag, exact cohort/report/fixture/model/effort and spend caps, pinned source preflight, durable budget journal, exact-body check, one-use dispatch, separate diagnostic result schema. |
| Full routing qualification | **Incomplete** | The normal preflight remains blocked because a current independently reviewed full-routing receipt is absent. No receipt was created or inferred. |
| Provider-specific wire/schema readiness | **Code corrected; provider acceptance untested** | The historical C01 HTTP 400 detail identified `properties.report_release` as a `const` schema without an explicit `type`. The strict wire projector now adds an inferred primitive type to homogeneous enum/const nodes across the shared draft and review schemas. Four versioned no-dispatch preflights bind corrected request bodies. No provider call was made after the correction. |
| Paid provider generation | **Fail / stopped** | Two durable C01 requests total: one ZDR route-selection rejection and one OpenAI non-ZDR schema rejection. Neither returned a generation envelope, token usage, finish reason, report prose, validation result or reviewer receipt. C02 was not sent. |
| Budget accounting | **Unknown cost; reservations retained** | Neither error response supplied usage or cost. Both $0.115 reservations remain held ($0.230 total); $2.770 of the $3.000 authorization remains unreserved. Actual invoice cost is not confirmed, and neither attempt may be repeated automatically. |
| Draft validation | **Unavailable** | No draft was returned. |
| Automated reviewer | **Unavailable** | No draft reached the reviewer. |
| CQ01 report-quality review | **Unavailable** | Source-backed packet distinction is present, but there is no generated prose to grade for interpretation, omissions, overreach, negative-control handling, or quality. |
| Independent code/run review | **Pass, scoped** | Read-only Sol review approved the continuation boundary before execution. A separate read-only Sol review recomputed the stopped run/dispatch digests, confirmed the no-response attempt, retained reservations, zero C02 calls, unchanged pins, and no report artifacts. This is not human report approval. |
| Tests / typecheck / scoped lint | **Pass after schema correction** | `npm test` 434/434; focused diagnostic regression 24/24; focused schema projection tests 3/3; `npm run typecheck` exit 0; scoped ESLint exit 0. |
| Production build | **Pass after schema correction** | `npm run build` exit 0. Existing broad-file-pattern and stale browser-mapping warnings were present. |
| Human approval of report quality or release | **Pending** | The owner authorization was for the diagnostic only. No report was produced for approval. |
| Production activation | **Unchanged / not approved** | No diagnostic result can satisfy qualification or activation. |

## Safe stopping point

The fixed run ID is stopped after one unknown-cost ZDR route-selection rejection and one unknown-cost OpenAI-only non-ZDR schema rejection. The live C01 continuation proves that OpenRouter selected OpenAI and returned an OpenAI-attributed `invalid_json_schema` error; it does not reveal the exact schema incompatibility. The used preflight record remains unchanged and run-pinned. A separately versioned v2 no-dispatch record corrects its descriptive ZDR flag and embedded wire-schema digest. Neither attempt may be automatically replayed; both $0.115 reservations remain held. C02 was not reached. This ledger authorizes no additional provider request, profile, report type, schema/prompt/provider-policy change, routing qualification claim, report release, or production activation.

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

All four records mark dispatch, provider calls, and API-key reads as zero. Their C01/C02 packet pins are unchanged. The prior provider response and its old request body remain intact; corrected-schema provider acceptance is untested. Existing unknown-cost reservations were not released or retried, and this implementation work added no live spend.

Verification after this correction: `npm test` passed 434/434; the focused diagnostic file passed 24/24; schema-projection tests passed 3/3; typecheck and scoped ESLint exited 0; production build exited 0. The build reported the same broad dynamic-file-pattern and stale browser-mapping warnings noted above. No live provider generation was run.
