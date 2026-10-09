# Independent Gate 10 technical review

**Review result: scoped technical findings only; routing qualification receipt remains pending.** This is an independent agent review, not a human signature, authenticated qualification manifest, spending authorization, or activation approval.

## Identity and scope

- Reviewer: fresh Codex sub-agent `/root/gate10_source_review`, with a separately delegated read-only dispatch-path audit.
- Date: 2026-10-09.
- Source commit: `bbd357322191364d2b2e0306a8b7f9f76ca2c267`.
- Source tree: `ab7e1fa50a99af414db79213b7f5e966d9f9b32e`.
- Isolated checkout: `C:\Users\jwmcg\.codex\worktrees\gate10-final-review\patternwork`.
- The reviewer verified commit/tree values but its shell did not expose the checkout's `.git` pointer/status. The primary repository's `git worktree list` independently shows this detached worktree at `bbd3573`. Its PowerShell view converted tracked text to CRLF; LF-normalized fixture and question-manifest digests matched the pinned identities. This is a reviewer-environment visibility/line-ending note, not evidence of primary-worktree source drift.
- No edits, tests, provider calls, credential reads, qualification receipts, or commits were made by the reviewer.

## Pins inspected

- Question release `PWQE-5.1.0-candidate.1`; question source SHA-256 `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832`; source-manifest normalized SHA-256 `144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc`.
- Router runtime SHA-256 `d08a7da2c6e3119c75e3e60917da42a60bbe6615024f901ac5b11ed26fa06d7d`.
- Report source manifest SHA-256 `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5`.
- v5 replay manifest normalized SHA-256 `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f`; C10 artifact normalized SHA-256 `6591fd1aae22a887b213958412813376b9ab6102581e487357b6319459d90afe`; C12 artifact normalized SHA-256 `a7a2fee9449d2079992a0559422be15d93af97d723358b3c7d2b9b8d942cdf19`.
- Representative C10 D36 packet content digest: `109ad81a85793f0f114351e42e7f2f4f62e927a80a76e23b0afee4e112b87cb3`.
- Primary-workspace cap proposal JSON SHA-256 `a3b0babcf545561098534362cbacbba858f9126ed20193019f9bb535f3fc0b6`.
- C01 final wire-body SHA-256 `6ed4e11f7e3b81a302f4adc603380d4bcde17842b92dc2b5bca38465e0979c24`; C02 `9512d05c596173e8a97e846748bd40c0601e1daa32e64e20f41a2f1272f7dcfe`.

## Capability findings

| Capability | Verdict | Finding and limit |
|---|---|---|
| A. Occurrence integrity and replay outcomes | **PARTIAL** | Source rules specify occurrence-keyed targets, explicit distinctness, allowed replay outcomes, and bounded attempts. Session code and tests retain binding decisions and replay lineage. Retained routes demonstrate examples; complete live persistence/browser behavior and every rejection route remain unqualified. |
| B. Routing and target lifecycle | **PARTIAL** | Source rules cover target opening/closing, alternatives, candidate rejection, attempt limits, and stopping. The reviewed code keeps practical alternatives and negative states. Entry-point, replay-candidate, opt-out, and post-target parity surfaces remain materially unsupported for broad reachability/completion conclusions. |
| C. Corrections, currentness, and resume | **PARTIAL** | Reviewed code records correction/replay history and invalidates dependent evidence; packet assembly filters stale responses. Adapter D36 evidence binds to canonical same-snapshot responses. Selected tests and packets are not a complete production persistence/browser-flow proof. |
| D. Sequence and comparison integrity | **PARTIAL** | C10's selected D36 order `[D36.input, D36.words, D36.think]` yields two adjacent `before` edges bound to its current response. C12's confirmed known-delay occasion remains distinct from its separate `no_event` binding. C07 and selected correction tests cover bounded cases; no complete route-outcome qualification follows. |
| E. Completion, packet release, current snapshot | **PARTIAL** | Current packet and adapter checks bind selected v5 packets, including D36 canonical currentness. The retained 125 accepted outputs are mock structural results, not live report-release, semantic-quality, or full production completion evidence. |

## Requested routing verdict questions

1. **Contract completeness:** The source contract is detailed enough to evaluate selected routes and packet invariants; it does not define a complete oracle for all router behavior.
2. **Output consistency:** The inspected C10 D36 order and C12 separate-occasion/no-event evidence preserve their bounded distinctions. This is not a general output-match result.
3. **Lineage:** Examined packets bind response, occurrence, step, sequence, source, and packet evidence. The v5 source manifest labels the corpus as an internal replay, and source-history provenance says much Mapping material is synthetic; the corpus does not qualify actual server candidate replay.
4. **Negative alternatives:** The inspected source and tests allow ordinary and competing explanations to remain valid. This does not establish every negative route.
5. **Strict parity:** The 893 unsupported surfaces include replay/entry-point outputs, binding controls, opt-out routes, mapping readiness, and post-target transitions. Zero unexplained differences applies only to comparable surfaces. These gaps prevent broad qualification but do not erase the selected packet anchors.
6. **Qualification scope:** Findings justify only narrow technical conclusions about reviewed contracts and retained fictional packets. They do not justify full routing qualification, production activation, or human semantic acceptance.
7. **C01 IFS blockers:** A trusted current-runtime/current-packet routing receipt and explicit human spending authorization are absent. Remote provider/model/schema acceptance and actual billing behavior are untested. Per-call charge protection remains provider-dependent.

## Dispatch and budget finding

The live qualification runner wraps report generation in `JournaledPwrp71Transport`. It fingerprints the final serialized body, endpoint, caps, and price-basis digest; checks both limits; and durably reserves before granting a one-use dispatch authorization. Unknown attempts retain their reservations and cannot be retried automatically. Initial, review, repair, and escalation requests are separate journaled attempts. The independent dispatch audit found this to be the inspected dispatch-capable PWRP 7.1 route.

The normal report workflow and `/debug` pass `OpenRouterClient` directly, but PWRP 7.1 requests are rejected at that client boundary before `fetch` without the one-use authorization. The client uses a schema-name marker (`_pwrp71_`) to identify this contract family; the reviewed generator uses that marker. Treat this as a convention-based guard and preserve a regression for all supported PWRP call paths if schema naming changes.

The no-dispatch cap proposal is **$0.115 per call / $1.50 aggregate**, `BLOCKED`, with `dispatchPerformed=false`, zero calls, and no API key read. Values are proposals, not authorization or invoice guarantees. Local reservations cover one run journal, not distinct run IDs or account-wide usage. OpenRouter's `max_price` is a provider route price filter; it does not set a request-total USD charge limit.

## Review assurance boundary

`validatePwrp71RoutingEvidence` checks `status: qualified`, source/runtime hashes, commit-string shape, and selected packet hashes. It does not verify a signature, reviewer key, authenticated identity, or authorization role. The approval input similarly carries self-asserted `reviewedBy` text and checklist booleans; deployment digest pinning detects post-configuration changes but does not authenticate who made the original decision. No independently qualified receipt was present or created.

**Narrow additive assurance proposal:** retain all current source, fixture, packet, semantic, and human approval checks, and add a detached signature over the canonical routing-evidence payload plus reviewer identity, role, reviewed scope, and timestamp. Verify it against a reviewer public key/key identifier provisioned through a separately controlled deployment trust store (not from the evidence JSON and not from the repository). Missing/untrusted keys or invalid signatures must fail closed. Define key rotation/revocation and the human reviewer eligibility outside the candidate artifact. Do not create or accept a signed `qualified` receipt until an authorized independent reviewer actually grants that scope.
