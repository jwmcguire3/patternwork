# Independent reviewer package

This package assembles the source and retained evidence required for an independent routing and semantic-evidence review. It is evidence for review, not a declaration that the review has happened.

## Pinned inputs

- Exact start: v4 commit `9b7095919c99861510be8498b822ae8983eaed87`; current package sources and all v2/v3/v4 artifacts have protected hashes in [protected-source-hashes.json](protected-source-hashes.json).
- Authoritative 14-case source: [SEMANTIC_CASES.json](../SEMANTIC_CASES.json), byte SHA-256 `aadc23bbcd8efb180fbccbe54f127024c7b4ea5593b60ca18afb5d4baaa0c819`.
- Complete baseline/revised per-answer audit: [coverage-matrix.json](coverage-matrix.json) and [claim-evidence-audit.json](claim-evidence-audit.json). The matrix records v4 and v5 current response IDs, selected options, occurrence and step IDs, observation IDs, targets, comparison/sequence lineage, missingness, synthetic involvement, and withheld controls.
- Readable case matrix: [coverage-matrix.md](coverage-matrix.md).
- v5 full-session fictional corpus: [`route_replays_v5`](../route_replays_v5/manifest.json), manifest SHA-256 `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f`; current packet observations explicitly mark original versus synthetic provenance in the existing selection-reason field.
- Source-to-packet changes and their full occurrence, step, target, rationale, provenance, semantic necessity, and profile-effect record: [fixture-change ledger](fixture-change-ledger.md) and [JSON ledger](fixture-change-ledger.json).
- Mapping-entry body-detail experiment: [variant manifest](../route_replays_v5/experimental-fixtures/body-detail-opt-in-at-mapping/variant-manifest.json) and [comparison](../route_replays_v5/experimental-fixtures/body-detail-opt-in-at-mapping/comparison.md). It is distinct from unchanged v2 permission histories.
- Independent contract findings: [routing-gap-ledger.json](routing-gap-ledger.json), [anchor recovery priorities](anchor-recovery-priorities.md), and [positive/negative control comparison](profile-control-comparison.md).
- Reproduced v4 offline baseline: [summary](v4-offline-baseline-summary.md), run and attempt receipts under `v4-baseline-offline/`, and 250 report artifacts; the v4 fixture source directory remains unchanged.
- v5 offline matrix receipts and output hashes: [`offline-run`](../route_replays_v5/offline-run/pwrp71-v5-provenance-full-20261008-cap5usd/run.json), [attempt journal](../route_replays_v5/offline-run/pwrp71-v5-provenance-full-20261008-cap5usd/attempts.json), [summary](offline-run-summary.md), and 250 saved report artifacts.
- Normal and strict parity command outputs and exit receipts: [`routing-parity`](routing-parity/normal-parity-output.txt), [`strict output`](routing-parity/strict-parity-output.txt); strict parity remains incomplete with 893 overlapping unsupported surfaces and zero unexplained differences.
- Readiness and release state: [live-provider-readiness.json](live-provider-readiness.json) and [release-gate-ledger.md](release-gate-ledger.md).

## Requested independent review

1. Recheck each CQ01–CQ14 supported distinction against the original fictional answer, actual v4 and v5 responses, packet observations, source-selected options, and occurrence/step lineage. In particular, verify that C10 D36 expresses only its selected partial order and that C12 D42 is a separately prompted known-delay occasion.
2. Confirm the C01/C02, C03/C04, C08/C09, and C15/C16 contrasts remain distinguishable. Verify C02 D67/D68 and C09 D79 remain source-only and were never administered in either replay corpus.
3. Review whether the marked synthetic Mapping scaffold changes context or branch selection in a way that qualifies or weakens a case. Do not treat those responses as authored answers. Assess P07's sparse ordinary packet as a restraint outcome.
4. Independently challenge the replay, distinctness, alternative-binding, correction, completion, and packet-currentness contract evidence. The strict Python parity result is incomplete, as the [gap ledger](routing-gap-ledger.md) details.
5. Do not score mock report prose as semantic output: the 125 accepted outputs contain zero claims and are all `insufficient_evidence` placeholders. Genuine PWRP report-quality scoring requires a separately authorized live diagnostic and independent report review.

The current verifier and tests are machine-generated work products. They provide repeatable, source-bound evidence but do not substitute for this independent review. The exact selected packet digests and current runtime/fixture/offline pins are recorded in [live-provider-readiness.json](live-provider-readiness.json). No live provider call, human approval, or production activation is claimed.

Candidate review must resolve the final pushed commit on codex/pwrp71-semantic-evidence-v5 and bind the reviewer-supplied routing qualification receipt to that Git commit. This evidence package itself is not a reviewer receipt.
