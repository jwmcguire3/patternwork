# Patternwork Question Engine v3.1 — Architecture and Authoring Contract

Status: accepted implementation contract; verification pending  
Release package: `3.1.0`  
Contract ID: `PWQE3-CONTRACT-2`  
Instrument type: adaptive self-understanding evidence engine; not a diagnostic test

## 1. Purpose and boundaries

The engine collects direct, repeated, and user-confirmed evidence for three individualized reports: internal protective-pattern/IFS-informed, self-reported autonomic-state/polyvagal-informed, and relationship-specific attachment-informed. It does not diagnose, infer trauma or developmental origins, identify exiles, or claim physiological measurement.

The unit of design is an evidence object. Administration ends at evidence sufficiency, not at a fixed question count or promised completion time. A user who stops early receives only supported sections and a transparent list of underdetermined areas.

## 2. Separated system responsibilities

1. **Question engine:** presents one cognitively simple interaction at a time and records raw responses without framework labels.
2. **Evidence/scoring engine:** creates and updates `EpisodeEvidence`, `PartProfile`, `StateSignature`, `AttachmentPattern`, coverage, contradiction, and confidence records.
3. **Report writer:** receives only structured evidence objects, selected attributable excerpts, response IDs, and section confidence. It never infers directly from a flat answer list.

## 3. Administration architecture

The default is two resumable passes across six stage boundaries:

- `S0 Calibration`: referents, context safety/reliability, time windows, internal modality, body confounds, skip/pause consent.
- `S1 Mapping`: broad, low-to-moderate-burden episode sampling across relationships, life domains, and anticipatory/immediate/aftermath horizons.
- `S2 Adjudication`: candidate detection followed by user merge/split/reject/rename decisions.
- `S3 Deepening`: gap-driven dossiers, repeated body signatures and recovery paths, and relationship-specific sequence evidence.
- `S4 Chains`: manager-to-firefighter, ambiguity-to-move-to-response, and rupture-to-state-to-repair chains.
- `S5 Resources and fit`: secure exceptions, regulation and co-regulation, access to curiosity/calm/compassion/choice, corrections, and a regulated ending.

Pass 1 normally covers S0–S2 and produces a normal, framework-neutral **Mapping Summary**. It is a complete supported-only product, not an exceptional failure state. Pass 2 normally covers S3–S5 and is optional gap-directed deepening. Save/resume is available at every stage boundary and after any pause; declining Pass 2 preserves the Mapping Summary and its explicit remaining questions.

### Pass-1 Mapping Summary section codes

- `MAP-01` scope and completion
- `MAP-02` supported episodes and contexts
- `MAP-03` observed body/action signals
- `MAP-04` supported sequences
- `MAP-05` variations and exceptions
- `MAP-06` resources and supports
- `MAP-07` uncertainty, contradictions, and limits
- `MAP-08` remaining questions and optional Pass-2/resume

## 4. Stable identifiers

### Evidence and response identifiers

- Raw interaction instance: `RI-{session}-{sequence}`
- Raw response: `RR-{session}-{sequence}-{field}`
- Referent: `REF-{user-scoped-sequence}`
- Episode: `EP-{user-scoped-sequence}`
- Candidate cluster: `CL-{user-scoped-sequence}`
- Confirmed part or cluster profile: `PT-{user-scoped-sequence}`
- State signature: `ST-{user-scoped-sequence}`
- Attachment pattern: `AP-{user-scoped-sequence}`
- Contradiction: `CX-{user-scoped-sequence}`
- Coverage cell: `CV-{report-section-code}`
- Report evidence packet: `PKT-{report-type}-{version}`

IDs are opaque, immutable, user-scoped, and never encode a psychological conclusion.

### Interaction-family codes

`RL` Referent Lock; `MS` Memory Snap; `BDA` Before–During–After Strip; `BTM` Body Topography Map; `FSR` First-Signal Race; `VFR` Voice or Felt-Rule Capture; `RLB` Ritual Loop Builder; `BSP` Blocked-Strategy Probe; `PIS` Part Identity Sort; `PDL` Polarization Duel; `RMX` Relationship Matrix; `PCR` Pace Curve; `RRE` Rupture–Repair Exchange; `WMA` Working-Model Attribution; `RSR` Regulation Sequence Ranking; `SEF` Secure Exception Finder; `FCF` Fit Confirmation.

Bank items append a three-digit number, for example `MS-014`. The ranges are reserved package-wide: `001–099` for the complete family inventory, `100–199` for calibration and broad mapping, and `200–299` for adaptive deepening. This keeps IDs unique even when the same family appears in several banks. Every rendered interaction instance also records its bank-item ID and version.

### Report-section codes

**IFS-informed report**

- `IFS-01` Evidence scope and limits
- `IFS-02` Confirmed protective parts and retained pattern clusters
- `IFS-03` Role and time horizon: manager, firefighter, mixed, uncertain
- `IFS-04` Voice, felt rule, image, urge, or blankness
- `IFS-05` Triggers, feared outcomes, and protective intent
- `IFS-06` Body signature, sequence, rituals, and stopping rules
- `IFS-07` Short-term payoff and internal/relational/functional costs
- `IFS-08` Alliances, polarizations, and internal conflicts
- `IFS-09` Manager-to-firefighter cascades and aftermath
- `IFS-10` Pressure on protected vulnerabilities, without origin claims
- `IFS-11` Access to curiosity, calm, compassion, and choice
- `IFS-12` Confidence, contradictions, and underdetermined areas

**Polyvagal-informed report**

- `PV-01` Evidence scope and self-report limits
- `PV-02` Ordinary baseline and accessible regulatory range
- `PV-03` Repeated activated/mobilized signature
- `PV-04` Repeated deactivated/shutdown signature
- `PV-05` Mixed or rapidly shifting signatures
- `PV-06` Entry sequence and first signals
- `PV-07` Peak signature, social availability, speech, orientation, and movement
- `PV-08` Transition paths, stuck points, and recovery time
- `PV-09` Effective self-regulation channels
- `PV-10` Effective co-regulation and aggravating channels
- `PV-11` Context, body confounds, confidence, and underdetermined areas

**Attachment-informed report**

- `ATT-01` Evidence scope, relationship contexts, and safety
- `ATT-02` Anxiety and avoidance dimensions by referent
- `ATT-03` Working-model evidence about self and others
- `ATT-04` Ambiguity interpretation and alternative reachability
- `ATT-05` Proximity-seeking and protest sequence
- `ATT-06` Deactivation and distancing sequence
- `ATT-07` Rupture response by relationship
- `ATT-08` Repair initiation and repair reception
- `ATT-09` Reassurance uptake and residue
- `ATT-10` Pace thresholds across closeness dimensions
- `ATT-11` Secure exceptions and cross-relationship differences
- `ATT-12` Confidence, contradictions, and underdetermined areas

## 5. Evidence grades and claim confidence

Evidence grades are independent labels, not a numeric ladder:

- `direct_single`: directly reported in one episode.
- `replicated`: substantively similar evidence in at least two independent episodes.
- `user_confirmed`: the user endorses or corrects a proposed label, sequence, summary, or cluster.
- `cross_context`: evidence spans more than one relationship or life domain.
- `contradicted`: meaningful unresolved competing evidence remains.

Section confidence:

- `high`: replicated and user-confirmed, with no unresolved `cap_low` or `omit_claim` contradiction.
- `medium`: direct evidence plus replication or explicit confirmation.
- `low`: single-context, indirect, ambiguous, or meaningfully contradicted evidence; only cautious observations may be included.
- `unsupported`: omit substantive prose and identify the missing evidence when useful.

Special floors apply: a major part dossier normally needs two independent episode anchors plus identity confirmation; a state signature normally needs repeated maps across separate episodes plus an entry/exit or recovery sequence; an attachment sequence normally needs multiple cues or explicit confirmation and stays relationship-specific absent cross-context evidence.

### Typed report-impact precedence

Contradictions and other claim constraints use only the typed `report_impact` values `omit_claim`, `cap_low`, `qualify`, or `none`, in that descending precedence order. `omit_claim` excludes the claim; `cap_low` requires low confidence and makes it synthesis-ineligible/underdetermined; `qualify` preserves the claim with the recorded context or limit; `none` adds no report constraint. The runtime does not use an undefined `material` predicate.

## 6. Universal interaction record

Every interaction definition declares:

- purpose and burden/intensity band;
- user-facing prompt and complete response mechanics;
- raw fields and target evidence fields;
- supported report-section codes;
- direct, inferred, and confirmatory signals kept separate;
- inferential limits and prohibited conclusions;
- prerequisites, branches, skip/uncertainty handling, and termination behavior;
- confidence contribution and replication/cross-item dependencies;
- recovery or low-intensity routing requirement where applicable.

Every administered instance records referent, structured window ID/revision, bank item/version, administration sequence/order, presented option order, selected/entered/edited response, certainty, skip reason if volunteered, start/completion state, and source response IDs. An episode ID represents one independently anchored event or typical-pattern anchor; repeated coverage counts only distinct episode IDs, never multiple fields or repeated screens from one episode.

All delivery artifacts bind to an immutable snapshot ID/revision plus canonical evidence and scope digests. Snapshot equivalence is exact; no live or bounded-delta substitution is permitted.

## 7. Global voice and accessibility contract

- Begin with a recognizable moment, named relationship, and embedded time horizon.
- Ask what actually happened, including what the person usually does despite wishing otherwise.
- Use first-person, ordinary, fragment-friendly response options with no obvious “healthy” answer.
- Offer uncertainty, dependence-on-person, none-of-these, skip, and pause paths when applicable.
- Do not treat a selected prewritten phrase as a quote. Only typed, edited, or explicitly confirmed wording can be quoted.
- Support words, wordless rules, images, body impulses, action urges, blankness, and difficult-to-access experience.
- Permit keyboard, screen reader, reduced-motion, non-drag, body-map-list, and low-interoception alternatives.
- Avoid assumptions about monogamy, cohabitation, gender, sexuality, touch comfort, biological family, employment, finances, disability, culture, or neurotype. Render only applicable prompts.

## 8. Safety, burden, and routing invariants

- Safety/reliability context precedes relational interpretation. Proportionate vigilance, protest, or withdrawal in coercive, threatening, or unreliable contexts is not pathologized.
- Never present more than two high-arousal interactions consecutively.
- Never use one family more than twice within five screens.
- Rotate recall, visual mapping, sorting, ranking, thresholds, and brief text capture.
- Separate mirrored probes to reduce pattern matching.
- After “it depends,” lock a named referent. After contradiction, test person, horizon, intensity, identity, or change-over-time discriminators.
- Body maps and rupture sequences are followed by a low-intensity or resource interaction.
- The session ends on resource-oriented, ordinary, or connected material—never at peak activation.
- At any skip/pause, preserve raw data, coverage state, safe resume point, and the minimum context needed to avoid forcing re-disclosure.

## 9. Stop contract

Completion requires all required report sections to be Green (high/medium) or intentionally Amber with an explicit confidence limit; every major candidate disposition resolved; body signatures replicated; attachment claims separated by relationship; contradictions resolved or retained transparently; final fit confirmation completed; and marginal coverage gain lower than burden. Unsupported sections are never filled with generic prose.

## 10. Package acceptance contract

The package is acceptable only if all eleven required deliverables are complete, every interaction family has at least three fully voiced examples, all banks trace to section codes and evidence fields, machine-readable schemas validate as JSON, every report claim can trace to evidence IDs, and two similar-looking respondents are demonstrated to diverge because of timing, function, body signature, or relationship context. Release additionally requires a new frozen fingerprint, integrated validation of packets/reports/traces/fixtures, and an independent review against that fingerprint. Type generation is downstream of accepted schemas and must not run against a partially accepted schema set.
