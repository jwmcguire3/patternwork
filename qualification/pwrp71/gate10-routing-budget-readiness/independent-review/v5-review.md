# Prior independent technical review — v5 baseline

**Reviewer:** separate Codex sub-agent `/root/independent_routing_review` in an isolated, read-only checkout.
**Reviewed revision:** `8dd192a7076ae535b90f340a778d915a8a2338bd`.
**Scope:** source, runtime, tests, and retained v5 fictional replay evidence. The reviewer did not edit files or run tests. This is an agent technical review, not a human signature, approval, or unrestricted routing qualification.

## Verdict at the reviewed revision

The reviewer found **PARTIAL** for occurrence integrity; routing/target lifecycle; correction/currentness; sequence/comparison integrity; and completion/packet release. It found the specific C10 D36 selected-order path and C12 D42 known-delay separate-event path consistent with source in the reviewed v5 records. Those cases did not establish the rest of the unsupported parity surface.

The reviewer identified two reproducible packet defects that Gate 10 addressed:

1. `target_resolutions[].attempts` counted stored superseded/invalidated responses. The current packet builder excludes stale responses and a regression checks the active-attempt count.
2. D36 sequence validation did not bind edge relation/direction to the selected adjacent option order. The packet builder and adapter now validate ordered edges; the regression tampers relation and direction, recomputes the packet digest, and requires rejection.

The reviewer also concluded strict parity omissions materially prevent full routing qualification, though they do not erase the specific reviewed anchors. It characterized source-contract evidence as scoped and said broader production integration, parity, and human review remain outstanding.

## Exact baseline pins reviewed

- Question source SHA-256 `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832`.
- Question source manifest SHA-256 `144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc`.
- Report source manifest SHA-256 `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5`.
- v5 replay corpus manifest SHA-256 `97bc995d84496fe4917c12a9334036e1b8256aca0d8896e99b4a0bc454c54999`.
- C10 replay artifact SHA-256 `6591fd1aae22a887b213958412813376b9ab6102581e487357b6319459d90afe`; C12 artifact SHA-256 `a7a2fee9449d2079992a0559422be15d93af97d723358b3c7d2b9b8d942cdf19`.
- C10 MAP/Deepening packet digests: `49f0fc44783d6c88bd87d49197d9dac3d36753248c3a0850151c057e904a7923` / `109ad81a85793f0f114351e42e7f2f4f62e927a80a76e23b0afee4e112b87cb3`.
- C12 MAP/Deepening packet digests: `cf74a7de815caac52380e2eae54ef87869d5058dc08956dae82d680b52678063` / `57fdf0b4be110c2240f17bc1593ab654f7228c690d2b0ed94097276f8cb00faa`.

These findings apply to the named baseline only. The Gate 10 patch needs a fresh review against the candidate runtime and current packet digests; see `reviewer-handoff.md`. No `qualified` routing receipt has been created.
