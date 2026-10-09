# Routing qualification gaps

The ordinary parity audit exited 0 with status `completed; not a parity-pass assertion`. The strict audit exited 1 with status `incomplete_unsupported_coverage`: 893 unsupported comparison surfaces and zero unexplained differences among the compared surfaces. The 893 total counts additive surfaces, not unique rows; the categories can overlap.

Both commands were rerun against the final router runtime SHA-256 `e7937399a9c5fd96bc0fbe7413e0dc26452a33b11a92d653a968f0b76abb7ac6`. Full outputs are retained under [routing-parity](routing-parity/); the normal output SHA-256 is `79dc018f98964cf36c8c73dd7c04a46be9444548a0254708393d7a1cd1941e79`, and the strict output SHA-256 is `aa0cf3dfd3ee2146ad1a57373d8c136e7a14e515f8c20d4dda1105085f2fad67`.

## Remaining strict coverage

| Unsupported surface | Count |
|---|---:|
| Replay candidate rows without cross-engine comparison | 88 |
| TypeScript entry-point candidates without a Python equivalent | 189 |
| TypeScript entry-point choices without a Python equivalent | 28 |
| TypeScript entry-point finishes without a Python equivalent | 23 |
| Other finish rows after divergence or outside policy | 25 |
| Python binding controls not normalized against TypeScript session decisions | 32 |
| Python `mapping_ready` controls not normalized against TypeScript pass transitions | 25 |
| Python replay rejections without cross-engine comparison | 17 |
| TypeScript replay rejections without cross-engine comparison | 17 |
| Opt-out cohort replay/control surfaces without cross-engine comparison | 144 |
| Post-target rows without an accepted response transition | 50 |
| Post-target entry-point pseudo-rows | 255 |

The strict gate remains incomplete. No comparison was deleted or redefined as a pass. The pinned D41 extension qualified seven source-bound cases as an independent contract suite, not as Python/TypeScript parity. The controlled-replay contract qualifies the original C07 route and its explicit different-event binding; it does not cover all replay candidates and rejection behavior.

## Capability assessment

| Capability | Python/reference parity | Source-contract evidence | Production implementation evidence | Remaining limitation |
|---|---|---|---|---|
| Occurrence creation and binding | Partial; binding controls are not fully normalized | Explicit binding outcomes and forged-scope rejection passed | Current response/occurrence packet bindings pass for all 25 v5 profiles | No complete live persistence/browser route qualification |
| Replay confirmation and child episodes | No Python equivalent for authored REPLAY operator | C07 source-bound replay lifecycle passed | C07 and all selected v5 lifecycle replays exercised | Evidence is scoped; broad replay candidate/rejection coverage is absent |
| Distinctness and same/unknown/no-event | Partial; 32 binding surfaces unsupported | `different`, `same`, `unknown`, `no_event`, and `skip` contracts passed | C07 pair lineage and source-only controls pass | Not every outcome followed through storage, packet, and correction independently |
| Target transitions | Partial; entry-point and post-target surfaces remain unsupported | Selected source gates and target semantics covered | Selected target changes pass with evidence links | Most entry-point behavior has no Python reference equivalent |
| Corrections and invalidation | Incomplete after reference divergence | Correction-sensitive source guards passed | Supersession, rerouting, and stale evidence tests pass | Complete persistence-to-report lifecycle lacks independent reference review |
| Step and sequence lineage | Not adequate for packet sequence evidence | Selected ordered-answer and C07 contracts pass | V5 verifier checks current response, source option, occurrence, step, target, and order | New verifier is machine-generated qualification, not external review |
| Mapping/Deepening completion | Incomplete; `mapping_ready` controls are not normalized | Selected budget, stop, and completion boundaries pass | 25/25 full-session fictional routes complete | Terminal behavior and optional-entry space are not fully comparable |
| Packet currentness and adapter evidence | Not applicable to Python router parity | V5 response-to-packet contract passes | 25/25 profile packets/adapters and stale exclusion pass | No independently reviewed qualification evidence is pinned to the report run |

## Separate status

- **Production routing completeness:** selected v5 fictional cohort passed 25/25; production integration beyond this cohort remains unqualified.
- **Cross-engine parity:** incomplete, with 893 unsupported surfaces and zero unexplained differences on compared surfaces.
- **Independent contract coverage:** passed for declared source-bound contracts and the v5 response-to-packet invariants; broader coverage remains partial. These are independent-of-router contract checks, not an independent human audit.
- **Report packet readiness:** v5 fictional packet/adapter checks passed; this says nothing about report quality.
- **External review readiness:** the evidence package is assembled; independent review is pending.

Full machine-readable findings are in [routing-gap-ledger.json](routing-gap-ledger.json).
