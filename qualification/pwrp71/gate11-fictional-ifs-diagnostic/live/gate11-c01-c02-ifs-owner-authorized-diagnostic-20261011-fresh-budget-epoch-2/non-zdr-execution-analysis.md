# Non-ZDR continuation — execution analysis

Date: 2026-10-11
Run: `gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011-fresh-budget-epoch-2`
Scope: fictional `route-replays-v5`, C01/C02, IFS, `openai/gpt-6-luna`, reasoning `max`
Result: **stopped after C01; no report generated**

## Authorization and source pins

The owner-authorized diagnostic was limited to C01/C02 IFS. It used the recorded $0.115 per-call reservation and $3.00 fresh epoch-2 aggregate authorization. Non-ZDR was explicitly allowed for this continuation; prompts may be retained by the provider. The request still specified `data_collection: "deny"`, OpenAI only, and no fallbacks. The ordinary routing qualification and production activation gates were not changed or claimed.

The stopped run records the reviewed runtime hash `d08a7da2c6e3119c75e3e60917da42a60bbe6615024f901ac5b11ed26fa06d7d`, C01 packet `c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036`, and C02 packet `c14bbcbd4ff8b6f69c1074b12a15d9132be9d3373d5d825257ff5dcf8ad61055`. These matched the reviewed pins. The request used the pinned report prompt, schema, model, and reasoning effort.

## Provider attempts

| Attempt | Dispatch result | Recorded provider result | Consequence |
|---|---|---|---|
| C01, epoch-2 initial request, ZDR required | HTTP 404 | “No endpoints found matching your data policy (Zero data retention)” | OpenRouter could not select an eligible endpoint under the ZDR requirement. No report. |
| C01, owner-authorized non-ZDR continuation | HTTP 400 | Provider metadata attributes the response to OpenAI; upstream code `invalid_json_schema`; not retryable | The request reached the selected OpenAI provider, but OpenAI rejected the wire schema. No report. |

The second request omitted the `zdr` provider option, kept `data_collection: "deny"`, selected `only: ["openai"]`, and disabled fallbacks. The sanitized attempt receipt does not retain the provider's `error.raw` detail. Therefore, the exact unsupported schema keyword, path, or other cause cannot be established from this run. The error does establish that removing the ZDR routing requirement got past endpoint selection and that the present request was rejected for schema validity. No schema or prompt change was made to try to force acceptance.

The actual C01 non-ZDR wire body SHA-256 was `4db2ad54d5fcb3de6d1753c0d3f90dfd169983beb668e8cf15e0a5bad93e735c`. Its canonical embedded strict wire-schema digest is `8f0f6f91d4037a2c929253bc21e35c96bc3f86c4c28193cafefe22640fb5b451`. The prior no-dispatch record for this continuation had an incorrect descriptive ZDR flag and declared wire-schema digest `624462e600a1ca626d444427f0dfb84022f6900410c3eb89d6d0f747a39e8342`; the actual embedded schema digest was already `8f0f6f…`. That historical file remains unchanged. Corrected metadata is retained separately in `provider-preflight/c01-c02-ifs-openai-only-non-zdr-continuation-v2-no-dispatch-20261011.json` (file SHA-256 `87f8ffedc0c605990ad9ee98ae6188e0554cb1e9173f321bf10d787d137571bb`). It distinguishes the prepared request fingerprint from the observed C01 journal attempt fingerprint and records C02 as untested. The correction is evidence bookkeeping only and did not dispatch a request.

## Cost, output, and stop condition

The journal records two dispatched C01 requests in the fresh authorization epoch. Neither returned usage or cost, so both $0.115 reservations remain unknown: **$0.230 reserved**, **$2.770 unreserved** under the $3.00 authorization. These are reservation figures, not confirmed invoice amounts. No attempt was repeated after the unknown-cost outcome.

C01 stopped the cohort. C02 was not sent. There is no generated draft, token usage, finish reason, validation result, automated reviewer receipt, or prose to evaluate against CQ01. The semantic comparison and independent report-quality review therefore remain unavailable; the previous source-backed C01/C02 contrast has not been changed or approved by this failed generation attempt.

## Qualification status

- Non-ZDR route selection: evidenced for this one request; OpenAI returned the response.
- PWRP 7.1 OpenAI schema compatibility: **rejected for the current schema; precise cause unknown**.
- Fictional report generation and validation: **not completed**.
- C01/C02 semantic report comparison: **not available**.
- Full routing qualification, human report approval, and production activation: **not claimed; unchanged**.

The fixed run remains stopped. Resolving the schema error requires a separately reviewed diagnosis of the provider's detailed schema rejection; it does not justify changing the pinned schema or repeating either unknown-cost attempt.
