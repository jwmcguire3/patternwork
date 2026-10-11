# Gate 11 — C01/C02 fictional IFS diagnostic execution report

**Date:** 2026-10-11
**Diagnostic status:** `diagnostic_stopped` after the first provider request
**Routing qualification:** not claimed
**Production activation effect:** none

## Authorization and reviewed scope

The run used the already recorded owner authorization in `../gate10-routing-budget-readiness/approval-statements/c01-c02-live-ifs-approval.md` and the narrow source/packet review in `../gate10-routing-budget-readiness/independent-review/c01-c02-current-scope-review.md`. The approval file was treated as a record of the user's decision, not as a credential or routing receipt.

The CLI invocation required the explicit `--owner-authorized-fictional-diagnostic` flag and accepted only C01/C02, IFS, `route-replays-v5`, `openai/gpt-6-luna`, reasoning `max`, a 115,000-microdollar per-call reservation, and a 3,000,000-microdollar aggregate cap. The run used the fixed ID `gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011`. No production record or customer packet was loaded.

## Current source, packet, request, and pricing pins

The diagnostic revalidated all pins immediately before transport creation. The saved run records:

| Pin | SHA-256 |
|---|---|
| PWQE 5.1 question source | `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832` |
| Question source manifest | `144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc` |
| Router runtime | `d08a7da2c6e3119c75e3e60917da42a60bbe6615024f901ac5b11ed26fa06d7d` |
| PWRP 7.1 source manifest | `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5` |
| Semantic case set | `fec1752b4a4892da77fcadbf78688b23fd77e010b845ae6ddcd4523c0547569d` |
| v5 fixture manifest | `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f` |
| C01 IFS packet | `c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036` |
| C02 IFS packet | `c14bbcbd4ff8b6f69c1074b12a15d9132be9d3373d5d825257ff5dcf8ad61055` |
| Pricing evidence file | `2fa98427307b6bfcbab46674261bef83b05f6d1cd7b697809a6838ed8e5ed4c0` |
| Final no-dispatch preflight file | `7ebb808f953d4516cba8d911e5c67161b8889d6bf39ff6820d5130120b029f76` |

The final regenerated preflight prepared exactly two requests and recorded zero provider calls. Its readiness remained `BLOCKED` for the full-routing workflow because no trusted qualified-routing receipt exists. The separate CLI diagnostic did not override or consume that gate. Both serialized candidate requests retained the exact pinned model and effort.

The current [OpenRouter model listing](https://openrouter.ai/openai/gpt-6-luna/) reports $0.10/M input and $0.50/M output, a 1.05M context, up to 128K completion tokens, and JSON-schema structured output. OpenRouter's [provider-selection documentation](https://openrouter.ai/docs/guides/routing/provider-selection) documents request-level provider controls, including price filtering. The saved cap is a conservative reservation, not a guaranteed invoice maximum.

## Implementation and safeguards

The new path is a CLI-only fictional diagnostic with a distinct `fictional_report_diagnostic` schema and statuses. It reuses production PWRP request preparation, the OpenRouter client, generation, deterministic validation, automated reviewer, repair, and the existing durable attempt journal. It does not call the full qualification runner or set `routeParity` to qualified.

The dispatch boundary checks the exact request body against a currently started journal reservation and requires the approved model, reasoning, endpoint, price-basis identity, and both exact limits. Each attempt can cross the HTTP boundary once. Existing dispatch entries survive a restart. A live result must report exactly `openai/gpt-6-luna`; a mock or mismatched model stops before review and before C02. Uncertain cost retains the reservation and blocks replay. Diagnostic output cannot be read as a qualification run or satisfy approval/activation contracts.

The ordinary routing-evidence validator, report prompts, schemas, question bank, provider policy, and activation controls were not weakened or changed. A narrow production audit-event fix now preserves draft-validation evidence for reviewer-requested repairs.

## Live provider attempt

One HTTP request was sent for **C01 IFS initial generation**. It received HTTP `400` from an OpenRouter-routed **Azure** endpoint, with upstream code `invalid_json_schema`. No successful generation envelope or token/cost usage was returned. The response did not provide a reviewer result.

The journal therefore marks this attempt `unknown`, retains its full **115,000-microdollar ($0.115) reservation**, and records no reported cost. The run shows:

| Measure | Result |
|---|---:|
| HTTP dispatches | 1 |
| Accepted reports | 0 |
| Reported provider cost | $0.00 (no usage was returned; this is not a confirmed final invoice) |
| Unknown/in-flight reservation held | $0.115 |
| Remaining authorized budget after the held reservation | $2.885 |
| C02 dispatches | 0 |
| Draft validator receipts | 0 |
| Automated reviewer receipts | 0 |

The run stopped on C01 and did not invoke C02, retry the failed request, or create another run ID. No report prose was generated or preserved. The provider-specific schema rejection means this attempt did **not** establish compatibility of the exact PWRP wire schema with the selected routed endpoint. The existing prompts, schema, and provider policy were left unchanged; no second provider request was attempted.

## CQ01 semantic comparison

CQ01 requires the report to separate an outwardly minimized request for help from the room the person gives that need internally, retain the reported need, avoid automatically inventing an exile from small outward behavior, and avoid dismissing converging exclusion evidence merely because no trauma history is present.

The source-backed contrast remains available in the reviewed v5 packets:

| C01 | C02 |
|---|---|
| Both profiles share an outwardly minimized request. C01's packet retains D20.need, D65.judge, D66.compelled, D67.not_allowed, D68.pushed, D69.less_notice, and D92.more_hidden on one occurrence/step. Help was offered; the remaining need was unspoken. All 11 required original semantic responses are retained. | C02's packet retains D20.none, D65.patient, D66.choice, D69.hidden_only, D92.more_asked, and D23.stay on one occurrence/step. Help was offered; the remaining need was expressed. All 10 required original semantic responses are retained. D67/D68 remain absent and prohibited under D20.none. |

These packet observations establish the authored evidence contrast, not the quality of a generated report. Because no report draft or reviewer receipt exists, the following are **not evaluable**: supported interpretation in report text, important omissions, unsupported additions, negative-control discrimination by the writer, claim-to-source accuracy, prose quality, psychological specificity, and effects of fictional provenance markers. CQ01 report-quality verdict: **unavailable — generation failed before a draft**. C02 has no live result to compare.

A separate read-only Sol reviewer independently recomputed the run and dispatch digests, confirmed the one C01/zero C02 dispatch state and the two current packet pins, and checked current response IDs, selected options, occurrence, and step. The packet contrast supports internal exclusion versus greater internal permission. It does not establish childhood origin, diagnosis, a fixed protector identity, Self leadership, or independent recurrence across occasions. Report-quality grading is unavailable without report output.

## Verification results

Exact command outputs and exit codes are retained under `verification/`.

| Command | Result |
|---|---|
| `npm test` | Pass, 415/415; exit 0 |
| `npm run typecheck` | Pass; exit 0 |
| Focused diagnostic and PWRP generation tests | Pass, 17/17; exit 0 |
| Scoped ESLint over changed implementation and tests | Pass; exit 0 |
| `npm run build` in the default sandbox | Failed before compilation with SWC Windows/OneDrive canonical-path access denied; exit 1 |
| `npm run build` with the same command outside the restricted sandbox | Pass; exit 0 |
| Final no-dispatch PWRP preflight | Completed; 2 prepared requests, 0 dispatches; readiness blocked by the unchanged full-routing gate; exit 0 |
| Explicit credential-presence check | `OPENROUTER_API_KEY=present`; value was not printed |
| Owner-authorized live diagnostic | One C01 request; stopped on provider HTTP 400; CLI exit 1 |

An independent read-only Sol review of the implementation found no remaining scoped dispatch blocker before execution. Full routing qualification, independent semantic report review, report acceptance, human approval beyond the existing diagnostic scope, and production activation remain unapproved or pending. Production activation remains unchanged.

## Durable artifacts

- Live diagnostic state: `live/gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011/run.json`
- Attempt journal: `live/gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011/attempts.json`
- HTTP dispatch/response receipt: `live/gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011/dispatches.json`
- Canonical integrity digests independently recomputed: run `63b73b54845e4a719603b77abddd403f7297c6d157be4a8ffbf5f1d29b2e73be`; dispatch file `4ed6f549476309b91ff8deb4d0144498813c5473e204bd1eb7624388ffa1d65f`.
- Exact CLI output and exit status: `verification/live-diagnostic-cli.log`, `verification/live-diagnostic-cli.exit-code.txt`
- Current no-dispatch preflight command output: `verification/final-no-dispatch-preflight.log`, `verification/final-no-dispatch-preflight.exit-code.txt`
- Verification logs and exit statuses: `verification/`
