# Gate 0 baseline

## Repository

- Verified supplied v4 branch: `codex/pwqe51-fictional-session-replay-pwrp71-v4`.
- Exact v4 commit: `9b7095919c99861510be8498b822ae8983eaed87`.
- The branch was missing from `origin` and has been pushed without rewriting it.
- Gate 0 found `origin/main` at `69d3edaa63bfef08b1adc99c76263cb23672b9fe`, the same commit as the merge-base used for v4; no later relevant main changes required reconciliation.
- Work branch created from v4: `codex/pwrp71-semantic-evidence-v5`.

## Source and fixture identities

| Source | Identity |
|---|---|
| Question release/source | `PWQE-5.1.0-candidate.1`, SHA-256 `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832` |
| Router | `PW-ROUTER-1.1.0-candidate.1`; final v5 runtime hash `e7937399a9c5fd96bc0fbe7413e0dc26452a33b11a92d653a968f0b76abb7ac6` |
| Report package | `PWRP-7.1.0-candidate.1`, manifest SHA-256 `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5` |
| Semantic case-set bytes | SHA-256 `aadc23bbcd8efb180fbccbe54f127024c7b4ea5593b60ca18afb5d4baaa0c819`, 14 cases |
| v2 constructed histories | raw manifest SHA-256 `3abd66592c840f3719cf4636fd283be6e8ab6d0cc931c1418eba24f072b5e7b3`; normalized identity pinned as `77d050e360778965c29041ba86f1233343596969915a49961ae68778797a52ee` |
| v3 route replay | manifest SHA-256 `da699629a1fa13e81f07259a06e4a4dbcbed4de0afa94274f10aca36bccf98ad` |
| v4 route replay | manifest SHA-256 `58503be292f08becb16403ff2be8b14b0b48c4da57acdfe2c8e92184c39605a2` |
| v5 route replay | manifest SHA-256 `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f` |

Router-packet, draft, and review schema hashes are retained in the [release-gate ledger](release-gate-ledger.json) and v5 offline run pins. The authored semantic case file, question bank, report prompts, schemas, provider policy, and activation controls were not changed.

## Supplied v4 claims and reproduced baseline

The v4 source and receipts support the supplied 25/25 Mapping and Deepening route completion, 125 accepted structural mock outputs, synthetic/original answer counts, 16 complete semantic cores, eight incomplete cores and P07's no-anchor status. The full v4 ledger, root-cause ledger, manifests, reproducibility records, offline receipts where present, and relevant source changes were inspected. The supplied v4 directory does not retain the offline run/attempt receipts its ledger names. Gate 0 reran the complete explicit v4 matrix without editing that directory and retained a new reproduction in `semantic-evidence-audit/v4-baseline-offline/`: 125/125 accepted, 250 completed mock attempts, zero issues/cost, qualification digest `7bdf032c26d05e535c71acc25c6630e80d5db98bb161aa94f8f8264f1a6d3085`. Its run, attempt, and report inventory hashes are in [v4-offline-baseline-summary.json](v4-offline-baseline-summary.json).

Gate 0 baseline commands passed: `npm test` (376 tests), typecheck, production build, scoped ESLint, and two full v4 fictional-session replays with matching normalized semantic hashes. Normal parity exited 0 but explicitly reports `completed; not a parity-pass assertion`. Strict parity remains `incomplete_unsupported_coverage`, with 893 unsupported comparison surfaces and zero unexplained differences.

The v4 fixture/source trees remain unchanged. Their file-level hashes are retained in [protected-source-hashes.json](protected-source-hashes.json).

## Model and approval gates

The current candidate order resolves to `openai/gpt-6-luna` at `max` reasoning effort, pinned by policy hash `f18d6512fbf586927d7d9f91d1dd50ea1a084a189c9b21b124d36449cc5f8e8c`. The runner requires source-bound, independently reviewed routing evidence and separate human report approval. Both remain outstanding. No paid provider call was authorized or made; production activation remains unchanged.
