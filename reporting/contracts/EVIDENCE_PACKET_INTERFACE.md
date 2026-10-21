# v7 report boundary and derivation contract

## Compatibility

The canonical `patternwork-router-evidence-v1` envelope is retained. PWQE 5.1 extends the questionnaire and routing source; it is not source-compatible with an old saved assessment. Active report contract `PWRP-7.1.0-candidate.1` is a separate versioned layer. The adapter validates the current 5.1 packet against the actual source and JSON Schema before preparing report input. New observations are retained without requiring a structural-summary hit.

The compatibility binding names the exact router source hash; the report release manifest separately binds prompts, schemas, and report implementation. Old report files remain within the immutable reference package because the old source hash covers them. They are not composed into active v7 requests.

## Responsibilities

Authenticated application storage supplies the immutable packet. The adapter projects a provider view retaining every current observation, selected authored text, basis, scope, episode/step graph, counterexample, actual constraints, missingness, and relevant disputes. It removes the administration journal/totals from the analyst view and does not forward private notes or auth data.

The formulation analyst interprets that material, including relationships not prelisted by the structural summary compiler. A separate narrator receives only the explicit meaning-unit projection, never source episodes or previous report prose. An independent reviewer receives original evidence, the formulation and the exact compiled report. The schema represents claims and named constructs; it does not classify people. Structural validation verifies IDs, source binding, current lineage, graph references, dependencies, and declared role coherence. A semantic reviewer decides whether the evidence warrants the interpretation actually written. Runtime performs approval, canonicalization, and release separately.

A content hash detects drift. It does not authenticate a browser packet or prove a respondent's identity. The standalone report CLI is for local trusted fixtures. Production must not expose packet upload, accepted-layer injection, review receipt injection, or local unsigned state as an authorization route.

## Draft changes

The old fields remain conceptually familiar: sections, claims, names, and reflection questions. v7 adds a report-release/evidence hash binding, title-to-claim coverage, content status, explicit constructs and support bases, claim dependencies, sequence-edge references, and typed part relationships. `exile` is representable; `protective_part` allows a protective entity whose Manager/Firefighter role is not distinguished. Self is expressed as capacity/interpretation claims, not a part-role enum.

Arrays of psychological findings have no minimum, maximum, or balance constraint. Reference minima on positive-claim evidence or name-support references do not require a psychological finding to exist. They require that a finding which is made has lineage. Empty name/relationship arrays are legitimate. Reflection questions are optional without a count target.

A portrait may omit unknown fields. No per-part mandatory fear, benefit, cost, body signature, biography, or exile link exists. Names are currently writer-generated because this question release does not collect user-authored names. Supporting later user-renaming needs a separate consented/stored presentation record; it must not fabricate an answer or silently change entity identity.

## Claims and relationships

Claims may depend on other claims only if the dependency graph is acyclic and the dependent claim retains the source leaves and relevant counterevidence. Settled claims cannot depend on open or unassessed premises. A model term cannot masquerade as a literal selected observation.

A handoff's sequence references must point at a supplied sequential relation. Code cannot establish the semantic job-change by finding an edge alone; the reviewer checks roles, function, and narrative scope. Recurrence requires actually distinct recalled occurrences, not repeated questions. Similarity and within-person contrast can be useful without claiming independent recurrence of one entity.

Relationships link named endpoints through an explicitly supported relationship claim. No relationship is added merely because two parts are named. Open relationship hypotheses remain open claims rather than asserted graph edges. Role labels do not turn model entities into independently observed psychological objects.

## Synthesis and names

Synthesis receives accepted layer artifacts from the trusted application store plus the same current underlying evidence. Different layers are not independent source observations. Reuse entity IDs/names, while checking for duplicate labels or conflicting identity/role definitions. Conflicts require review and consistent affected-layer revision, not string-based merging or a synthesis-only rename.

A supported new synthesis interpretation is allowed. The writer need not obey a whitelist of structural summaries or a prior layer's blind spot. A source-layer error must be corrected rather than amplified. Same-event integration, across-context comparison, and between-lens divergence remain distinct.

## Generation completion and review

A provider `length`/incomplete finish cannot pass as a complete short report. Validate finish metadata before structural review; then check the declared draft and source binding. A repair must use the same immutable source; it cannot add evidence. Semantic acceptance remains distinct from deployment/provider authorization. Review receipts bind the exact draft and source hash; any changed draft invalidates the receipt.

The standalone validator intentionally does not use a keyword ban to enforce exile, Self, or physiology meaning. A semantically bad report can pass structural validation. The paired editorial qualification cases define the next live-model/human review gate; local unit tests do not claim to have executed it.

## Review and repair composition

Review requests treat shared/layer writer contracts as evaluation criteria and place the reviewer task last. They return the review schema, not a second report. Semantic review receipts bind the exact draft and evidence hashes. `prepare_repair` accepts only a bound `revise` receipt or a structural failure recomputed locally; it never accepts client-supplied evidence repairs or claims that an old acceptance transfers to new prose. The replacement must pass both structural validation and a fresh review.

Structured-output providers differ in the JSON Schema subset they accept. This reference supplies the full validation schema. The production transport must qualify its wire representation without dropping the full local checks. No provider compatibility result is implied here. Cross-layer name reconciliation also requires semantic review; string/ID checks cannot decide whether two independently invented names describe the same part.


## Formulation-first revision 1

Normal generation is formulation, narrative, independent review. The private formulation retains the original claim/role/relationship graph, an explicit Exile examination where meaningful vulnerability is present, alternatives, coverage, narrator-safe meanings and development order. Meaning units preserve material scope and contrasts but contain no assessment recaps. The narrative schema returns paragraphs and meaning-unit references only. Code compiles those references to the existing report draft without inventing new claims. The final draft carries formulation_sha256; the artifact persists the exact formulation envelope.

Analytical binding includes evidence/snapshot, selected lens, analytical prompts/schema, authored question context and versioned graph/runtime rules. Voice changes can reuse a validated saved formulation; analytical or evidence changes cannot. Reuse is not acceptance: a fresh prose generation and independent source-aware review are required. Private formulation coverage need not be reproduced exhaustively in public prose.

A review is bound to exact formulation, draft and evidence hashes. Grounding changes route to formulation; prose-only changes route to narrative using typed editorial actions and meaning-unit references, not raw source or free-form source-bearing review text. Source errors stop. One semantic revision is permitted; every replacement is revalidated and reviewed. Structural corrections are bounded. These controls do not authorize spending or production release.


## Portrait-quality revision 2
Formulations use PWRP-FORMULATION-3 and unit delivery modes develop, embed and guardrail. Guardrails remain available to the narrator as constraints but cannot be cited as narrated meaning or marked core. Unit-reference portraits hold the distinct emotional and functional dimensions of retained IFS parts; they are not obligatory prose sections. A narrative with nonempty formulation_requests cannot compile or be released. Such a request uses the existing bounded semantic-revision budget. Review candidate.5 requires anchored editorial judgments in addition to source and coverage review. The writer system excludes shared analytical and lens-classification prompts. Existing assessments, identity restrictions, spending authorization and delivery remain unchanged.

Each exile_assessment requires examined_claim_ids: current settled claims explicitly considered by its decision and reasoning. Every settled IFS claim tagged vulnerable_theme, vulnerable_part, burden, internal_exclusion or exile must be explicitly covered, including prospective references to an existing cluster. No coverage propagates through dependencies. Each assessment must include its own affect/exclusion/relationship warrant IDs in this examination list, while the warrant arrays retain their separate present-warrant meanings. Examination membership cannot replace a missing warrant or turn a prospective Self relationship into an earned Exile. Semantic review checks whether the actual reasoning covers every claim, especially new vulnerability assertions sharing a cluster's evidence or labels.

This required representation changes the analytical contract to pwrp71-portrait-first-3 and provider formulation schema names ending formulation_3; narrative_2 and review_candidate_5 are unchanged. Old formulations require fresh analysis under the new schema and prompt; no automatic field filling, rehashing or dependency exemption migrates them.
