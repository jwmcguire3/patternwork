# C01/C02 IFS no-dispatch readiness

The executable `npm run reports:preflight:pwrp71` prepared the exact initial IFS request body for fictional fixtures C01 and C02 from the explicitly selected v5 corpus. The current cap-bound no-dispatch run is `gate10-c01-c02-ifs-no-dispatch-cap-proposal-1500000-20261009-r2`; the earlier uncapped run remains preserved separately.

| Profile | Packet digest | Serialized wire-body SHA-256 | Body bytes | Conservative full-context quote |
|---|---|---|---:|---:|
| C01 | `c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036` | `6ed4e11f7e3b81a302f4adc603380d4bcde17842b92dc2b5bca38465e0979c24` | 78,929 | 115,000 microdollars |
| C02 | `c14bbcbd4ff8b6f69c1074b12a15d9132be9d3373d5d825257ff5dcf8ad61055` | `9512d05c596173e8a97e846748bd40c0601e1daa32e64e20f41a2f1272f7dcfe` | 76,025 | 115,000 microdollars |

The final request fingerprints are C01 `9e662ebc3a55c598995bd53793a408bb79b9bb22091d9f50d2f58449066cfc34` and C02 `0e442a594b1f334c848ab8c0dba5701914062bccdeea7f2e0cb080d76530175d`. Wire-request fingerprints are C01 `934d422dc0203746d64022db13097dfcd7d0268de0864d662692e5ebda249902` and C02 `b2cdd6a0182e6abff9904baa5e6ac01fb8a288290391c34a428063d856ca0dd2`.

Both request bodies use model `openai/gpt-6-luna`, reasoning `max`, the pinned IFS schema name, strict projected JSON schema, ZDR/data-collection policy, max-price envelope, explicit cache mode, and `usage: { include: true }`. The exact body includes the provider schema and both fully assembled prompts. The `x-request-id` value is retained as a correlation ID; no remote idempotency behavior is assumed. The JSON artifact retains the full request bodies, prompts, schema, prompt/evidence binding hashes, fixture pins, exact body hashes, request fingerprints, and privacy fields.

Current result: **BLOCKED**. Two requests are locally prepared; dispatch is false, provider call count is zero, and the command reports it did not read an API key. The dry-run proposal is **$0.115 per call and $1.50 aggregate for the C01/C02 pair**, enough for twelve maximum-sized attempts under the current bounded generator loop. These numbers are not spending authorization. The current blockers are:

1. No independently reviewed, source-bound qualified routing receipt for the current runtime and these exact packet digests.
2. No human authorization for a paid request.

The preflight proves local serialization only. It does not establish actual remote model/provider/schema acceptance, usage metadata, billing behavior, report quality, routing qualification, or spending authorization. The per-call charge bound remains provider-dependent; the cap-bound fingerprint does not turn the proposal into an invoice guarantee. See `budget/provider-billing-assumptions.md` for the limits.

## Minimum next steps for a single C01 IFS diagnostic

1. Obtain a fresh, isolated, source- and packet-bound technical review of the current candidate; have an authorized reviewer decide whether to issue the required routing qualification receipt. The old v5 review alone does not bind the current runtime.
2. Have the account owner explicitly authorize a per-call USD ceiling and an aggregate run ceiling, and configure an external account/key/workspace guardrail that covers other run IDs and account activity. The current $0.115/$1.50 values are only an unapproved proposal.
3. Immediately recheck the currently selected model/provider price, endpoint parameter support, usage behavior, reasoning billing, and account credit/fee plan. OpenRouter docs list request parameters, but no authenticated request compatibility check has been performed.
4. Regenerate a cap-bound preflight/fingerprint using the authorized exact values; then, only after both the source-bound routing receipt and explicit user spending authorization exist, execute the diagnostic-only live command for C01/IFS. The preflight tool itself remains permanently no-dispatch.
5. Review the actual output and provider receipt independently. One diagnostic does not authorize broad report quality, human semantic acceptance, or activation.

No provider request was run for this artifact.
