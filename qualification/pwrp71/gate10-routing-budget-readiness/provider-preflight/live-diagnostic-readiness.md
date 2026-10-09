# C01/C02 IFS no-dispatch readiness

The executable `npm run reports:preflight:pwrp71` prepared the exact initial IFS request body for fictional fixtures C01 and C02 from the explicitly selected v5 corpus. The retained run ID is `gate10-c01-c02-ifs-no-dispatch-current`.

| Profile | Packet digest | Serialized wire-body SHA-256 | Body bytes | Conservative full-context quote |
|---|---|---|---:|---:|
| C01 | `c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036` | `3a022081807cf2ac7657a5ff2c56a5407f9493361a8dced781acea486b80e7dc` | 78,904 | 115,000 microdollars |
| C02 | `c14bbcbd4ff8b6f69c1074b12a15d9132be9d3373d5d825257ff5dcf8ad61055` | `0723a85bdb584d6df1deb74c73cc2274d27e531b0d541a4d7a2f783f28bc5f96` | 76,000 | 115,000 microdollars |

Both request bodies use model `openai/gpt-6-luna`, reasoning `max`, the pinned IFS schema name, strict projected JSON schema, ZDR/data-collection policy, max-price envelope, explicit cache mode, and deterministic idempotency keys. The JSON artifact retains the full request bodies, prompts, schema, prompt/evidence binding hashes, fixture pins, and privacy fields.

Current result: **BLOCKED**. Two requests are locally prepared; dispatch is false, provider call count is zero, and the command reports it did not read an API key. Request fingerprints that bind spending caps are null because no caps were supplied. Blockers are:

1. No explicit per-call ceiling.
2. No explicit aggregate run budget.
3. No independent source-bound qualified routing receipt for the current runtime and these exact packet digests.
4. No human authorization for a paid request.

The preflight proves local serialization only. It does not establish actual remote model/provider/schema acceptance, billing behavior, report quality, routing qualification, or spending authorization. See `budget/provider-billing-assumptions.md` for the difference between a provider-dependent quote and an enforceable invoice ceiling.

## Minimum next steps for a single C01 IFS diagnostic

1. Obtain a fresh, isolated, source- and packet-bound technical review of the current candidate; have an authorized reviewer decide whether to issue the required routing qualification receipt. The old v5 review alone does not bind the current runtime.
2. Have the account owner explicitly specify both a positive per-call USD ceiling and aggregate run USD ceiling. Current input quote is $0.115 per initial request; a completed report can require separate review/repair calls, each of which consumes its own reservation. The aggregate limit must reflect all attempts the owner is willing to permit; there is no inferred/default cap.
3. Immediately recheck the currently selected model/provider price, endpoint parameter support, reasoning billing, and account credit/fee plan. OpenRouter docs list request parameters, but no authenticated request compatibility check has been performed.
4. Regenerate a cap-bound preflight/fingerprint with those exact values; then, only after separate explicit user authorization, execute the diagnostic-only live command for C01/IFS. The preflight tool itself remains permanently no-dispatch.
5. Review the actual output and provider receipt independently. One diagnostic does not authorize broad report quality, human semantic acceptance, or activation.

No provider request was run for this artifact.
