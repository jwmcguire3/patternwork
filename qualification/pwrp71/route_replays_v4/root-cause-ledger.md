# v3 first Deepening divergence root-cause ledger

- Audited from base commit: `fbc0bf440d3f79668c8987a8ef2f2d1738a82c42`.
- Inputs: `qualification/pwrp71/route_replays_v3/<profile>.json`, the unchanged
  `constructed_histories_v2/<profile>.json` histories, and the pinned PWQE 5.1
  question, routing-target, coverage-rule, session, and router contracts.
- Boundary: findings describe the first actual `diverged` event in each v3
  production-session trace. Since v3 stops at that event, “answer-only” means
  only that the issued question itself had no matching response; it does not
  establish downstream completion or packet eligibility.

## Cause classes

1. **Unmatched response on a usable occurrence.** The router selected a
   supported question for a server-established actual occurrence. A compatible
   answer is enough to continue past that first stop, but does not prove the
   intended semantic case is complete.
2. **Synthetic Mapping side effect / context drift.** Generic Mapping scaffold
   answers create a legitimate but incidental target. The question can fit that
   scaffold event, while its occurrence or priority diverts the session from
   the authored case.
3. **Supported entry or focus interaction missing.** A declared fixture
   occurrence, `focusOccurrenceId`, or permission is not by itself a
   server-established actual episode or an opt-in. A production respondent
   needs the supported entry/permission/focus interaction and its required
   occurrence family.
4. **Source/runtime mismatch.** The router-issued variant differs from an
   original authored answer. The answer must remain unchanged and the
   discrepancy must remain visible.

`focusTopics` and topic permission are separate inputs. A topic listed only as
focused does not grant opt-in. Likewise, a fixture occurrence reference does
not become a runtime occurrence until a real session route establishes it.

## Profile ledger

| Profile | First divergent issue and selection cause | Fit to original circumstance; first blocker | Context audit (focus, topic, occurrence, referent) | Synthetic Mapping side effect and legitimate production reach |
|---|---|---|---|---|
| P01 | D16 / `practical_context`, priority 3, on authored E1; M03 exposure evidence opens this target. | Real-world conditions can matter to the rehearsal, but D16 is incidental to the stopping-condition distinction. No matching D16 response is the first blocker. | E1 is a real session occurrence and the selected context is valid; no topic opt-in or referent defect is implicated. | Synthetic scaffold exists, but this D16 is bound to E1. A real respondent can reach it from comparable Mapping evidence. |
| P02 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; generic M05/M06 self-response evidence opens the target. | D65 can describe the synthetic mistake event, but does not test the manager-to-firefighter handoff in authored E1. Missing D65 is not the only blocker to that original case. | Issued occurrence is M04, not the intended conflict occurrence. The original D61 conflict opener lacks a supported opt-in/actual conflict episode in this replay. | Generic M04–M06 scaffold creates an unrelated coverage target. A respondent can receive D65 about that real M04 event; reaching the original conflict scenario requires a supported conflict entry. |
| P03 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open the target. | D65 is unrelated to relationship uncertainty versus practical information. It is a valid follow-up to the synthetic mistake only. | Intended focus E1 is not the candidate occurrence. Earlier authored D43/D44 answers were issued in this replay, but that does not make the later D65 part of their scenario. | The scaffold diverts to a new self-stance target. D65 is production-reachable for M04; the original case needs its own episode/focus. |
| P04 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open the target. | D65 does not discriminate relationship uncertainty from practical information-seeking. No matching D65 is the immediate stop; fixing it alone would not make this the intended case. | Candidate is M04 rather than intended E1. No relevant topic opt-in is required for D65; the authored uncertainty scenario remains separately contextualized. | Generic M04 coverage is incidental. Production can ask D65 after equivalent Mapping responses, but this is not evidence for P04's original distinction. |
| P05 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open the target. | It does not distinguish involuntary loss of words from chosen withdrawal. A separate M10 body-detail versus `M10.observable` mismatch is also present. | D65 uses M04 rather than the authored episode. Body-detail permission is not focus. The original M10 response must not be translated into an observable-variant answer. | Synthetic M04 creates incidental coverage; router’s separate M10 observable administration is structural only and preserves a source-contract mismatch. Equivalent users can reach each router question, but the authored M10 answer is not interchangeable. |
| P06 | D16 / `practical_context`, priority 3, on authored E1; practical-condition evidence opens it. | Compatible as real-world context but incidental to the handoff distinction. No D16 answer is the first blocker. | Occurrence/focus is valid; no missing opt-in or referent decision identified. | D16 is reachable by a real respondent from comparable Mapping evidence. |
| P07 | D65 / `coverage_self_stance`, priority 4, on authored E2 mistake; generic M05/M06 evidence opens it. | Could describe ordinary behavior around E2, but the authored case is ordinary effective behavior without forced pathology and has no authored Deepening answers. The first stop is missing D65; completing it would not supply the absent semantic anchor. | E2 is actual, but intended focus is E1. The wrong occurrence matters to the semantic claim even though D65 is answerable. | Generic self-stance coverage ranks ahead of the intended ordinary case. A respondent can receive D65 about a mistake, which is not evidence that ordinary functioning was observed. |
| P08 | D16 / `practical_context`, priority 3, on authored E1 help-request; practical-condition evidence opens it. | A condition affecting need visibility can fit, though D16 is incidental. Missing D16 is the immediate blocker. | Candidate is the real focused E1 occurrence; no topic/referent defect identified. | D16 is production-reachable after equivalent Mapping evidence. Other authored answers/permissions remain separately gated. |
| P09 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open it. | It does not test observed function versus an unstated motive. Missing D65 is only the blocker for continuing the incidental M04 branch. | The authored D61 answers point to a declared but not Mapping-established conflict occurrence; focus points at M02 and does not bind that occurrence. No conflict opt-in is present. | Generic scaffold creates the D65 target. The original D61 scenario needs a supported conflict entry and occurrence. Never answer D79 if it is later issued; it is expressly forbidden. |
| C01 | D16 / `practical_context`, priority 3, on actual M20 help-request; M20 need and M21 burden evidence open it. | Coherent to asking for help, but incidental to difficulty allowing need. Missing D16 is the first stop. | M20 is a real occurrence; body detail is permission-only and focus is separate. Original answers on M20 remain eligible. | The current target comes from authored M20 facts rather than the generic filler. A real respondent can reach it. |
| C02 | D16 / `practical_context`, priority 3, on actual M20 help-request; M20/M21 evidence opens it. | Coherent to the request event, incidental to internal permission. Missing D16 is the immediate stop. | M20 occurrence is valid. Body detail is permission-only. D67 and D68 remain prohibited answers even if later issued. | D16 is production-reachable from the request facts; that does not qualify the internal-permission distinction. |
| C03 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open the target. | It fits only the synthetic mistake event, not withheld pride in D72. The authored D72 answer was already issued and accepted before this divergence; D65 is the immediate stop on a separate target. | `self_expression` is opted in and focused. The router-issued D72 entry established the actual occurrence. | Synthetic M04 creates an incidental side target after the original D72 branch is reached. |
| C04 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open the target. | It fits the scaffold only, not legitimate privacy versus withheld ambition in D72. The authored D72 answer was issued and accepted before D65. | `self_expression` is opted in and focused; the router-issued D72 entry established the actual occurrence. | The scaffold creates an unrelated follow-up after the original branch is preserved. |
| C05 | D02 / `function`, priority 4, on synthetic M04; M04 fix and M05/M06 consequences open it. | D02 can explain the fix attempt but is incidental to involuntary loss of words. A D02 response is the first blocker only; the intended branch remains unverified. | M04 is an actual synthetic Mapping episode. No focus or topic error explains this specific D02 issue. | Synthetic mistake/repair answers create the target. A real respondent can reach D02 about an actual fix event. |
| C06 | D23 / `coverage_feeling_tolerance`, priority 4, on M26 two-pulls; feeling/action evidence opens it. | The prompt can fit a feeling episode in the synthetic competing-wants event, but the issue is incidental to the two-concerns distinction. Missing D23 is the first stop. | M26 is established; the candidate is not the intended second concern context. No separate topic/referent defect was identified at this stop. | M26/M27 scaffold evidence creates this target. D23 is reachable if the respondent had the described pause with the feeling; do not infer that experience solely to close the target. |
| C07 | D16 / `practical_context`, priority 3, on actual first M02 review; M03 exposure opens it. | Plausible practical context for rehearsal, but incidental to the distinct-occasion continuity comparison. Missing D16 is the first blocker. | First M02 is real and correctly focused. The second M02 occasion is not established by occurrence IDs alone; the router-issued replay request and `different` decision must create it. | Synthetic Mapping scaffold opens a competing practical target. A real respondent can answer it; v3 does not complete the replay chain. |
| C08 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open the target. | D65 is about that mistake event, not the D61 conflict/return case. The authored D61 answer was issued and accepted before D65. | Conflict is opted in and focused; the router-issued D61 entry established the actual conflict occurrence. | Generic M04 target is reachable and incidental after the original conflict opener. |
| C09 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open the target. | D65 does not test absence of return in the authored conflict. The authored D61 answer was issued and accepted before D65. | Conflict is opted in and focused; the router-issued D61 entry established the actual occurrence. D79 remains explicitly forbidden. | Generic M04 is reachable and incidental after the original opener. If D79 is issued later, record the discrepancy without answering. |
| C10 | D02 / `function`, priority 4, on overload M10; M10/M11/M12 observations open it. | D02 is a plausible follow-up to overload but incidental to ordered recovery evidence. The missing D02 answer is the first Deepening stop. | Mapping used `M10.observable` despite an authored body-detail M10 response. Keep this variant mismatch explicit; permission cannot silently rewrite the original response. | Synthetic M10–M14 evidence also creates follow-up targets. Real respondents can be asked D02 about overload; source M10 remains unreconciled. |
| C11 | D02 / `function`, priority 4, on overload M10; M10/M11/M12 observations open it. | Plausible to overload, incidental to recovery timing and social support. D02 is the first missing response. | Same `M10.observable` versus authored body-detail mismatch as C10. No claim of semantic equivalence is supported. | Scaffold overload evidence creates this legitimate but incidental target. A respondent can reach D02; original M10 must be preserved. |
| C12 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open it. | Not either authored waiting occasion; missing D65 only blocks the incidental M04 branch. | Intended M17 and `known_delay` occurrences are declared separately. D42 is attached to the known-delay occasion, but the current v3 route has no confirmed distinctness decision for the pair. | Generic scaffold diverts from context-specific expectations. A real user can answer D65 for M04; C12 still requires two actual, separately linked and correctly distinguished waits. |
| C13 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open the target. | Incidental to new-connection pacing. The authored D52 answer was issued and accepted before D65. | `growing_closeness` is opted in and focused; the router-issued D52 entry established the actual `new_closeness` occurrence. | M04 scaffold opens an incidental target after the closeness opener. |
| C14 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open it. | D65 is unrelated to withheld-pride/privacy and incomplete repair. It is the first blocker only for the M04 side branch. | The candidate is M04, not authored repair occurrence M24; the declared M24 source reference does not alter this candidate. | Generic mistake scaffold diverts. A user can answer D65 for M04; the repair case needs the actual M24 occurrence and its follow-ups. |
| C15 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open the target. | Incidental to encouragement versus permission-seeking in D97. The authored D97 answer was issued and accepted before D65. | `exploration` is opted in and focused; the D97 route established the actual episode and accepted the declared friend referent. | Generic M04 opens an incidental side target after the D97 semantic branch. |
| C16 | D65 / `coverage_self_stance`, priority 4, on synthetic M04; M05/M06 open the target. | Incidental to encouragement versus approval-seeking in D97. The authored D97 answer was issued and accepted before D65. | `exploration` is opted in and focused; the D97 route established the actual episode and accepted the declared friend referent. | Generic M04 opens an incidental side target after the D97 semantic branch. |

## Cross-profile conclusions before response authoring

- The missing respondent answer is the immediate stop in all 25 artifacts, but
  it is the only established cause only for the usable-occurrence cases listed
  above. A v3 artifact cannot prove anything beyond its first divergence.
- Generic Mapping answers, especially M04/M05/M06 and M10–M14, create
  legitimate router targets that are incidental to several original anchors.
  Their targets must be answered only from the corresponding synthetic event
  facts, and reported separately from the original semantic case.
- Declared opening episodes D72, D97, D52, and C08/C09 D61 were issued and
  accepted by their supported entry routes before the later v3 divergence.
  P02/P09 have conflict answers in source history but no conflict opt-in, so
  their D61 scenario remains unavailable without an explicit supported
  synthetic topic-permission decision. Focus-only declarations never create
  an occurrence.
- C07 requires the router-issued M02 replay request, explicit `different`
  decision, second M02 root, attached M03, and the exact confirmed pair before
  D56/D57/D77 can count. C12 also requires explicit distinctness for its two
  waiting occasions. No fixture occurrence identifiers alone establish either
  relation.
- P05/C10/C11 expose M10 source/runtime variant mismatches. Preserve original
  body-detail answers and identify any separate router-issued observable
  response as synthetic structural scaffolding.
- C02 D67/D68 and C09 D79 are forbidden. The first divergence does not issue
  them, so no hypothetical answer is authorized.

No response, source contract, or router behavior was changed to prepare this
ledger. It is the baseline for the v4 respondent policy and subsequent route
qualification.
