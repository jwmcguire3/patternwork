# Independent semantic evaluation — C01/C02 IFS, CQ01

## Scope and decision

This is a source-linked, read-only review of the two completed fictional IFS reports against `CQ01` in `qualification/pwrp71/SEMANTIC_CASES.json` and the exact evidence supplied to each report. The independent review was performed by a Sol subagent; it is independent of the generating model's automated reviewer but is not human approval, clinical review, routing qualification, or production approval.

**Paired result:** the reports demonstrate the intended CQ01 contrast. Both retain the same outwardly smaller help request. C01 describes internal restriction and difficulty allowing the need; C02 preserves internal acknowledgment, patience, and choice. C01 has a **qualified pass with a medium reader-facing omission**. C02 **passes CQ01**, with one low-severity wording/metadata concern in an unrelated mistake vignette.

CQ01 expects the writer to separate outwardly minimized need from the room the person gives that need privately, retain the actual response and remaining need, avoid inferring an Exile from a small request, and avoid dismissing convergent internal-exclusion evidence without a trauma-history requirement. It is an authored acceptance criterion, not a provider result.

## Source-to-report comparison

| CQ01 distinction | C01 source and report | C02 source and report | Finding |
|---|---|---|---|
| Similar outwardly small request | `M20.small` and `M21.burden` appear in report claim C02. | `M20.small` / `O076d8b25454a577f4432` and `M21.burden` / `Od9704c6deb2becba7a82` support claim C1. | The shared outward behavior is preserved; it is not treated as sufficient to infer identical inner experience. |
| Internal judgment and difficulty allowing the need | `D65.judge` / `O34b33020127869263c07` and `D67.not_allowed` / `Oe362438f0da7e64b9154` support C01 claim C01. | C02 has different positive evidence: `D20.none` / `Ob7b22dee1237d506900d`, `D23.stay` / `O9fa0e941d6e9288221cb`, and `D69.hidden_only` / `O14b968bee810bdc5acfd`, reflected in claim C2. | The positive/negative contrast is supported by actual answers, not by treating a missing answer as evidence. |
| Compulsion despite awareness | `D66.compelled` / `O01655ad79d9c10d210dc` is retained in C01 JSON claim C03. The final Markdown omits that the respondent noticed the reaction yet still felt driven to act one way. | `D65.patient` / `Oea2905d770692fd464bb` and `D66.choice` / `O292f9bea129c568e8a80` support C02 claim C4's bounded account of patience and room to consider different responses. | **Medium omission in C01 prose.** This removes an important distinction between awareness and available choice; it weakens the contrast but does not erase the central CQ01 finding. |
| Pushed-away or less-noticed experience | C01 `D68.pushed` / `O247dfc0175eee139cd14` and `D69.less_notice` / `O392b1669958da6f248e3` appear in its event-scoped claims. | C02's `D69.hidden_only` says the feeling remained known while less was shown. | The distinction is preserved; C02 is not assigned an Exile merely because outward expression was reduced. |
| Actual help and remaining need | C01 claim C06 retains `D91.offered` / `O5e8107e82a82c19de984` and `D92.more_hidden` / `Oaf627ea10c70e967ed78`: help was offered, some need remained, and more was not said. | C02 claim C3 retains `D91.offered` / `O4caf8a55757553cbf5de` and `D92.more_asked` / `Oa4f43ede1e9922fe9087`: some need remained and was voiced. | Both preserve what the other person actually did and what happened to the need. Neither says the remaining need was met. |
| Negative branch | C01's converging inner-exclusion answers support its bounded interpretation; the report does not require trauma history or infer a permanent identity. | C02's `D20.none` branch legitimately leaves D67/D68 unadministered. Those hypothetical answers remain source material only and are not presented as administered observations. | The negative control remains distinct and is not filled in with synthetic answers. |

## Dimensions

### Evidence faithfulness

Both reports cite observations present in their exact IFS packet and bind the core help-request claims to the correct occurrence. The reviewer found no material unsupported CQ01 additions. C01's event-scoped protective interpretation is supported by judgment, compulsion, concealment, help offered, and remaining need. C02's event-scoped Manager interpretation preserves the reported burden-limiting aim, distinguishes a plausible visibility function from a stated aim, and does not claim to know the helper's actual feelings.

### Coverage and omissions

C01's JSON contains the `D66.compelled` evidence, but its reader-facing Markdown does not say that awareness coexisted with feeling driven to act one way. This is a medium omission because it matters to the contrast with C02's reported patience and choice. C02 covers the main CQ01 distinction and the actual help/remaining-need outcome.

### Alternatives and missingness

Both reports distinguish the respondent's remembered expectation from the other person's actual intention. Both avoid claiming that an offer fulfilled the need. C02 explicitly says the need was acknowledged and could remain present, and does not invent an Exile. Its D67/D68 absences are consistent with the source branch and are not treated as observed answers.

### Psychological specificity and narrative quality

The central help-request passages are concrete, scoped to one episode, and distinguish inner response from outward display. Both reports also spend space on synthetic scaffold episodes; the independent reviewer found those passages repetitive and less useful than the central contrast. They are fictional context, not independent corroboration of the original authored scenario.

### Cross-report and synthesis quality

Not assessed: this run generated only IFS for each profile. PV, ATT, MAP, and SYNTHESIS were not dispatched, so no cross-report consistency or synthesis claim is made.

### Fictional provenance

The input contained explicit fictional-source and synthetic-scaffold provenance markers. The outputs do not repeat those markers or claim they validate the psychological interpretation. No controlled comparison isolates whether those markers affected the wording or model behavior.

## Additional low-severity issue outside CQ01

C02 claim C8 and its Markdown describe correcting a mistake and then trying to learn from it, and the claim metadata labels the relationship `actual_sequence`. The reviewed packet has no sequence edges for this event; its `first` and `self_response` bindings support the actions and reported effect, but do not establish an explicit before edge. This does not affect C02's CQ01 verdict. It should be treated as a low-severity sequencing/metadata overreach in that unrelated vignette.

## Structural reviewer receipts versus semantic judgment

The production automated reviewer returned `accept` for both validated drafts, with no listed issues. Those are model-generated structural review receipts, not independent semantic approval. The read-only Sol review independently examined the source and actual prose and found the C01 omission and C02 sequencing caveat above. Owner approval of report quality remains pending; production activation is unchanged.
