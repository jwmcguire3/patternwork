# PWQE5 migration notes

## Release binding

New assessment sessions use assessmentKey: "patternwork-pwqe5", consent PWQE5-CONSENT-1, question release PWQE-5.0.0-design.1, router candidate PW-ROUTER-1.0.0-candidate.1, and the pinned PWQE5 source-manifest digest. Session state is versioned as PWQE5-AS-1; respondent answers use PWQE5-RS-1.

Responses remain encrypted at rest. The router derives occurrences, observations, targets, missingness, and correction effects from the canonical answer log. The server owns occurrence IDs and routing state. Private notes remain encrypted and are excluded from the report packet.

Completed passes freeze a PWQE6 router packet into the existing encrypted snapshot field. The packet is bound to urn:patternwork:router-evidence:1; generated reports use the pinned v6 prompts and report_draft.schema.json and preserve the existing artifact, PDF, and delivery lifecycle.

## Database and old assessments

PWQE5 uses the existing generic version, release, encrypted-state, and snapshot fields. This integration adds no Prisma schema migration. Deployment still needs the repository's normal existing migrations applied, including any unrelated pre-existing work in the checkout.

The user confirmed that no old assessments exist and that legacy support is not required. New session, resume, report-access, and snapshot paths bind to PWQE5. Old engine session and snapshot contracts are not readable through the new assessment service, and no old assessment data is rebound to PWQE5.

The obsolete A–F reference checks were not used as acceptance criteria. The replacement evidence is the deterministic router suite, authored fictional/negative-case fixtures, UI-state tests, source integrity tests, and PWQE6 report validation tests.

## Activation behavior

The imported release is still marked as a design candidate. Assessment start and report generation fail closed until OPENROUTER_QUALIFICATION_MANIFEST_JSON contains the exact reviewed PWQE5 activation manifest and OPENROUTER_QUALIFICATION_MANIFEST_SHA256 pins its canonical digest. An old V3.1 qualification manifest does not activate PWQE5.
