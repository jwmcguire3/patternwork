# Independent current-scope review: C01 and C02 IFS

**Reviewer:** separate read-only Codex sub-agent `/root/c01_c02_current_routing_review` (GPT-6.1 Sol)
**Reviewed commit:** `917bece69d3b4e01e175d8448bb412a91a968f92`
**Scope:** current v5 fictional C01 and C02 IFS packet source/lineage for the bounded diagnostic request.
**Verdict:** both packets are source- and lineage-sound for this narrow diagnostic; this does not qualify general router behavior, live report quality, or production activation.

The reviewer independently recomputed the source/runtime pins and executed the semantic evidence verifier, authored-response binding check, and current IFS adapter in memory. No files, receipts, provider calls, credentials, or commits were created or accessed by that review.

| Profile | Current responses | IFS observations | Across-packet verifier observations / targets | Finding |
|---|---:|---:|---:|---|
| C01 | 39 | 34 | 124 / 89 | Semantic verifier pass; authored binding zero failures; IFS adapter accepted. |
| C02 | 34 | 33 | 121 / 83 | Semantic verifier pass; authored binding zero failures; IFS adapter accepted. |

C01 preserves its original D20.need, D65.judge, D66.compelled, D67.not_allowed, D68.pushed, D69.less_notice, and D92.more_hidden anchors on one occurrence and step; all 11 required original semantic responses are accepted.

C02 preserves D20.none, D65.patient, D66.choice, D69.hidden_only, D92.more_asked, and D23.stay on one occurrence and step; all 10 required original semantic responses are accepted. D67/D68 are absent from canonical responses, the administered trace, and packet observations; source coverage rules exclude them under D20.none.

Both packets have no superseded or invalidated responses, sequence edges, or corrections. Neither qualifies sequence, correction, or distinctness behavior. Each has synthetic Mapping scaffold answers; these remain marked synthetic. D18 is unadministered, and each fictional replay ends while additional targets remain open.

Strict cross-engine parity remains `incomplete_unsupported_coverage`: 893 unsupported surfaces and zero unexplained differences on comparable surfaces. Live model/schema acceptance, billing behavior, production browser/persistence integration, and semantic report quality remain untested.

## Reviewed pins

| Identity | SHA-256 |
|---|---|
| Current router runtime | `d08a7da2c6e3119c75e3e60917da42a60bbe6615024f901ac5b11ed26fa06d7d` |
| Question source | `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832` |
| Question manifest | `144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc` |
| Report manifest | `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5` |
| v5 fixture manifest | `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f` |
| Semantic case set | `fec1752b4a4892da77fcadbf78688b23fd77e010b845ae6ddcd4523c0547569d` |
| C01 v5 artifact | `87096b8f1381866954c3fbbd299530da34865850d2d1e22ae988a18154896d11` |
| C01 IFS packet | `c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036` |
| C02 v5 artifact | `1840d101d9fd08b8f5bfaf80a0247843e4ec8589b7fa7f92c3a7a0955e00ab2e` |
| C02 IFS packet | `c14bbcbd4ff8b6f69c1074b12a15d9132be9d3373d5d825257ff5dcf8ad61055` |

The fixture provenance commit is `e3cb96593bd232f346cb561cda98b4d4c863a4cb`. Packet digests are canonical JSON digests; text manifest digests use LF normalization.
