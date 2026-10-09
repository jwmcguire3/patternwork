# PWQE 5.1 fictional session replays, v3

This directory contains versioned artifacts produced by replaying the authored v2 fictional histories through the production PWQE 5.1 session lifecycle. The replay driver lets the server select each candidate, submits only a matching authored response (or an explicitly labeled synthetic Mapping scaffold), and records the resulting packet, provenance, controls, routing trace, and unreached authored answers. The source package in `constructed_histories_v2/` remains unchanged.

These are internal fictional-session and offline report-qualification results. They are not production evidence, independent routing qualification, semantic approval, or an activation declaration.

## Reproduce

Run these commands from the repository root:

```powershell
npm run pwqe51:replay:fictional
npm run reports:qualify:pwrp71 -- offline --fixture-set route-replays-v3 --profiles P01,P02,P03,P04,P05,P06,P07,P08,P09,C01,C02,C03,C04,C05,C06,C07,C08,C09,C10,C11,C12,C13,C14,C15,C16 --reports ALL --cost-cap-micros 500000 --run-id v3-offline-matrix-20261008d --output-root qualification/pwrp71/route_replays_v3/offline-run
npm run pwqe51:replay:ledger -- --run qualification/pwrp71/route_replays_v3/offline-run/v3-offline-matrix-20261008d/run.json
```

The replay exporter accepts `--profiles P01,C01` for a subset and `--output-dir <directory>` to preserve the default artifacts. The qualification runner requires the explicit `route-replays-v3` fixture set and has no v1 fallback. Offline mode uses deterministic mocked provider responses and makes no paid provider requests.

The route replay was run twice from equivalent inputs after answer-disposition classification was included in the semantic digest. All 25 semantic result hashes matched; full artifact hashes differed because actual runtime session, occurrence, response, and target identifiers are freshly allocated for each run. The per-profile semantic hashes and artifact hashes are in `manifest.json`.

## Source identities

The replay manifest pins these inputs:

| Input | Identity |
|---|---|
| Repository base verified after `git fetch origin` | `69d3edaa63bfef08b1adc99c76263cb23672b9fe` (`origin/main` matched) |
| Authored v2 manifest SHA-256 | `77d050e360778965c29041ba86f1233343596969915a49961ae68778797a52ee` |
| Source commit recorded by v2 manifest | `e3cb96593bd232f346cb561cda98b4d4c863a4cb` |
| PWQE question release | `PWQE-5.1.0-candidate.1` |
| PWQE question source SHA-256 | `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832` |
| PWQE question source manifest SHA-256 | `144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc` |
| PWRP report release | `PWRP-7.1.0-candidate.1` |
| PWRP source manifest SHA-256 | `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5` |
| v3 replay manifest SHA-256 | `da699629a1fa13e81f07259a06e4a4dbcbed4de0afa94274f10aca36bccf98ad` |
| Router runtime SHA-256 pinned by the offline run | `475c2dd7982aab84958c9c89996456c479ca7968c9005d632201c9f7c7aab1d0` |

The replay artifacts also carry the original fixture identity and hash, source-to-runtime response correspondence, provenance categories, server-issued IDs, current and superseded responses, episode registry, sequence graph, missingness/control history, target resolution, and packet validation for each profile.

## Offline matrix result

Run `v3-offline-matrix-20261008d` contains 125 profile/report combinations: 25 accepted MAP reports, 100 blocked Deepening or synthesis reports, and zero failed reports. Reported provider cost was `$0.000000`. The run fingerprint is `dc32a6ac160c31765bed8e67426b8f210a038be6888748e785f150c115c61f27`; the canonical qualification run SHA-256 is `9022d3e38f7005253a13142ea6d99b57ca47db84ebf39a13b4eddc0aefd298a4`.

Every profile completed Mapping through the real session functions and produced an adapter-accepted Mapping packet. Every Deepening replay is partial: the first issued Deepening candidate did not match an authored answer with satisfied occurrence, target, variant, and context prerequisites. The disposition ledger classifies 74 original answers as issued and accepted, 49 as eligible but not reached because the router ranked another candidate first, 80 as ineligible in the current context, 3 as source-contract mismatches, and 3 as intentionally forbidden. No Deepening packet was built. The 100 blocked outputs therefore carry `route_replay_stage_incomplete`, `route_replay_packet_unavailable`, and failure code `route_replay_report_ineligible`. This is the current route outcome for these histories, not evidence that all older blocked outputs have been fixed.

The profile-specific first divergence and original-answer dispositions are recorded in `qualification-ledger.md` and the machine-readable `qualification-ledger.json`. In particular, C02's two withheld answers and C09's one withheld answer remain intentionally forbidden; the sparse C15/C16 histories gain no synthetic Deepening responses. P05/C10/C11 preserve their authored M10 variant mismatch and use a separately labeled synthetic Mapping scaffold only to test structural completion.

The prior aggregate of 95 blocked offline outputs could not be reconciled: the corresponding historical run artifacts or issue-code ledger are not present in this repository snapshot. The 125 v3 outcomes are separately fingerprinted above and must not be counted as 95 distinct defects or as proof that those older outcomes were repaired.

## Qualification boundary and remaining gates

The focused tests exercise router-issued C07 replay, respondent-confirmed distinctness, exact D56/D57/D77 pair binding, correction invalidation, replay correction, response serialization/resume, P01/P09/C07/C12 artifact distinctions, partial-order recovery edges, and adapter validation. Internal replay and self-tests do not satisfy independent routing review. Independent routing qualification and human/semantic approval remain external gates. No real-user data, production database, paid provider, activation manifest, production activation, or report-prompt changes were used.

For the implementation branch's final code commit, use `git rev-parse HEAD`. The source baseline remained `69d3edaa63bfef08b1adc99c76263cb23672b9fe` when remote refs were refreshed.
