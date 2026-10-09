# Live provider readiness

**Status: not ready; no live calls were made.** The v5 packets and adapters pass their checks, and the exact model, prompt, schema, and source pins are retained. The offline run made zero provider calls and produced empty `insufficient_evidence` drafts, so it does not evaluate report quality.

The candidate policy requests `openai/gpt-6-luna` with `max` reasoning effort. A deterministic offline run confirms the local request preparation and schema pins; it does not verify that the real provider accepts the current wire schema or produces useful prose.

The live runner still requires independently reviewed routing qualification evidence bound to the question source, router runtime, exact run, commit, and selected packet digests. The current v5 run is `pwrp71-v5-provenance-full-20261008-cap5usd`, with qualification digest `8157fe09b0d4d73f5ce4dca47e26f5a73951f24f75a710f4e076e485c0c34ec8`, fixture manifest `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f`, and router runtime `e7937399a9c5fd96bc0fbe7413e0dc26452a33b11a92d653a968f0b76abb7ac6`. Its `routeParity` is pending, and independent qualification evidence has not been obtained. The cost-accounting code reserves unknown-cost attempts and checks the aggregate cap before calls, but a separate per-call monetary ceiling is not represented in the runner evidence. No monetary cap was provided for live work.

The initial 10-profile cohort is C01, C02, C07, C08, C09, C10, C11, C12, C15, and C16. Current MAP, IFS, PV, and ATT packet digests for those profiles are listed in the JSON receipt. C10 and C11 use the separately identified Mapping-entry permission experiment with their original M10 selections preserved.

The next external prerequisites are an authorized per-call and aggregate cap, an enforceable per-call ceiling, independent routing review pinned to the exact current sources, run, commit, and packet digests, and confirmation that this evidence meets the existing runner contract. Once satisfied, start with one report type and preserve actual model, token, cost, finish-reason, validation, and review receipts. No source, policy, or readiness control was loosened.

See the detailed machine-readable state in [live-provider-readiness.json](live-provider-readiness.json).
