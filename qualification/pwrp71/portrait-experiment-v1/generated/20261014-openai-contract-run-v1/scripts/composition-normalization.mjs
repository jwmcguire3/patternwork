const CONSTRUCT_ALIASES = Object.freeze({
  overload_context: "description",
  gradual_onset: "description",
  attention_narrowing: "description",
  mixed_energy: "description",
  delayed_recognition: "description",
  reported_recovery_order: "recovery",
  speech_access_return: "recovery",
  cognitive_clarity: "recovery",
  choice_capacity: "capacity",
  functional_capacity: "capacity",
  felt_ease: "context_contrast",
  residual_strain: "context_contrast",
  outward_inward_difference: "context_contrast",
  partial_easing: "recovery",
  recovery_context: "recovery",
  coarse_easing_time: "recovery",
  concern_salience_change: "state_transition",
});

const P02_CONSTRUCT_ALIASES = Object.freeze({
  preventive_protection: "protective_function",
  relational_management: "description",
  anticipated_disconnection_or_uncertainty: "working_expectation",
  reported_temporal_order: "description",
  response_change: "state_transition",
  reactive_interruption: "protective_function",
  immediate_relief: "description",
  leaving_or_ending_exchange: "description",
});

const P02_SUPPORT_BY_CLAIM = Object.freeze({
  c_conflict_preventive_explaining: ["direct_report", "stated_aim", "remembered_expectation", "inferred_function"],
  c_conflict_reported_sequence: ["direct_report", "actual_sequence"],
  c_conflict_exit_relief: ["direct_report", "stated_aim", "reported_effect", "inferred_function"],
});

function asRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function enumSet(value, label) {
  if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== "string")) {
    throw new Error(`Pinned PWRP schema is missing ${label} enum values.`);
  }
  return new Set(value);
}

function claimSchemaParts(schema) {
  const root = asRecord(schema, "PWRP draft schema");
  const rootProperties = asRecord(root.properties, "PWRP draft schema properties");
  const claims = asRecord(rootProperties.claims, "PWRP claims schema");
  const claimItems = asRecord(claims.items, "PWRP claim item schema");
  const claimProperties = asRecord(claimItems.properties, "PWRP claim properties");
  const defs = asRecord(root.$defs, "PWRP schema definitions");
  const contentStatus = asRecord(rootProperties.content_status, "PWRP content_status schema");
  const questions = asRecord(rootProperties.reflection_questions, "PWRP reflection_questions schema");
  const kind = asRecord(claimProperties.kind, "PWRP claim kind schema");
  const supportBasis = asRecord(claimProperties.support_basis, "PWRP support_basis schema");
  const supportItems = asRecord(supportBasis.items, "PWRP support_basis item schema");
  const construct = asRecord(defs.construct, "PWRP construct definition");
  const nameRegistry = asRecord(rootProperties.name_registry, "PWRP name_registry schema");
  const nameItems = asRecord(nameRegistry.items, "PWRP name_registry item schema");
  const nameProperties = asRecord(nameItems.properties, "PWRP name_registry properties");
  const relationships = asRecord(rootProperties.relationships, "PWRP relationships schema");
  const relationshipItems = asRecord(relationships.items, "PWRP relationship item schema");
  const relationshipProperties = asRecord(relationshipItems.properties, "PWRP relationship properties");
  const kinds = enumSet(kind.enum, "claim kind");
  const constructs = enumSet(construct.enum, "construct");
  const supports = enumSet(supportItems.enum, "support_basis");
  const statuses = enumSet(contentStatus.enum, "content_status");
  const entityKinds = enumSet(nameProperties.entity_kind?.enum, "name_registry entity_kind");
  const roles = enumSet(nameProperties.role?.enum, "name_registry role");
  const relations = enumSet(relationshipProperties.relation?.enum, "relationship relation");
  if (questions.items?.type !== "string" || !kinds.has("reported") || !constructs.has("description") || !supports.has("direct_report")) {
    throw new Error("Pinned PWRP schema no longer matches the reviewed fictional composition adapter contract.");
  }
  return { claimProperties, kinds, constructs, supports, statuses, entityKinds, roles, relations };
}

/**
 * Deterministically projects the unchanged intermediate claim graph and composition
 * output into the pinned PWRP report schema. Original inputs are not mutated.
 */
export function normalizeCompositionForPwrp71({ profile, composition, interpretation, schema, packetSha256, compositionSha256, interpretationSha256 }) {
  if (profile !== "C10" && profile !== "P02") throw new Error("This versioned composition projection is limited to the reviewed fictional profiles C10 and P02.");
  const output = asRecord(composition, "Composition output");
  const graph = asRecord(interpretation, "Frozen interpretation graph");
  const { claimProperties, kinds, constructs, supports, statuses, entityKinds, roles } = claimSchemaParts(schema);
  const allowedClaimFields = new Set(Object.keys(claimProperties));
  const sourceClaims = graph.claims;
  if (!Array.isArray(sourceClaims) || sourceClaims.length === 0) throw new Error(`The source-checked ${profile} graph must contain claims.`);
  const claimIds = new Set();
  const claimTransforms = [];
  const reportClaims = sourceClaims.map((candidate, index) => {
    const source = asRecord(candidate, `${profile} claim ${index}`);
    const unknownFields = Object.keys(source).filter((key) => !allowedClaimFields.has(key));
    if (unknownFields.length) throw new Error(`${profile} claim ${index} has fields absent from the pinned PWRP schema: ${unknownFields.join(", ")}.`);
    if (typeof source.id !== "string" || !source.id || claimIds.has(source.id)) throw new Error(`${profile} claim ${index} has a missing or duplicate ID.`);
    claimIds.add(source.id);

    const sourceKind = source.kind;
    const reportKind = sourceKind === "observation" ? "reported"
      : sourceKind === "interpretation" && profile === "P02" ? "supported_interpretation" : sourceKind;
    if (typeof reportKind !== "string" || !kinds.has(reportKind)) throw new Error(`${profile} claim ${source.id} has no safe PWRP kind mapping.`);

    if (!Array.isArray(source.constructs) || source.constructs.some((value) => typeof value !== "string")) {
      throw new Error(`${profile} claim ${source.id} constructs are not a string list.`);
    }
    const constructMappings = source.constructs.map((value) => {
      if (constructs.has(value)) return { source: value, report: value, rule: "unchanged_allowed_enum" };
      const alias = profile === "P02" ? P02_CONSTRUCT_ALIASES[value] : CONSTRUCT_ALIASES[value];
      if (!alias || !constructs.has(alias)) throw new Error(`${profile} claim ${source.id} construct ${value} has no pinned safe PWRP mapping.`);
      return { source: value, report: alias, rule: profile === "P02" ? "versioned_p02_semantic_alias" : "versioned_c10_semantic_alias" };
    });
    const reportConstructs = [...new Set(constructMappings.map((row) => row.report))];
    if (!reportConstructs.length) reportConstructs.push("description");

    let reportSupportBasis;
    let supportBasisMapping;
    if (Array.isArray(source.support_basis)) {
      if (source.support_basis.some((value) => typeof value !== "string" || !supports.has(value))) {
        throw new Error(`${profile} claim ${source.id} has unsupported support_basis values.`);
      }
      reportSupportBasis = [...new Set(source.support_basis)];
      supportBasisMapping = "preserved_schema_enum_list";
    } else if (profile === "P02" && typeof source.support_basis === "string" && P02_SUPPORT_BY_CLAIM[source.id]) {
      reportSupportBasis = [...P02_SUPPORT_BY_CLAIM[source.id]];
      supportBasisMapping = "reviewed_p02_claim_id_and_source_index_support_projection";
    } else if (sourceKind === "observation" && typeof source.support_basis === "string" && source.support_basis.startsWith("Direct source-indexed")) {
      reportSupportBasis = ["direct_report"];
      if (Array.isArray(source.sequence_edge_ids) && source.sequence_edge_ids.length > 0 && supports.has("actual_sequence")) {
        reportSupportBasis.push("actual_sequence");
      }
      supportBasisMapping = "source_observation_to_direct_report";
    } else {
      throw new Error(`${profile} claim ${source.id} support_basis cannot be projected without interpreting unsupported prose.`);
    }

    let reportUncertainty;
    let uncertaintyMapping;
    if (Array.isArray(source.remaining_uncertainty)
      && source.remaining_uncertainty.every((value) => typeof value === "string")) {
      reportUncertainty = [...source.remaining_uncertainty];
      uncertaintyMapping = "preserved_string_list";
    } else if (typeof source.remaining_uncertainty === "string" && source.remaining_uncertainty.length > 0) {
      reportUncertainty = [source.remaining_uncertainty];
      uncertaintyMapping = "single_uncertainty_string_to_singleton_list";
    } else {
      throw new Error(`${profile} claim ${source.id} has invalid remaining_uncertainty.`);
    }

    const reportClaim = {
      ...source,
      kind: reportKind,
      constructs: reportConstructs,
      support_basis: reportSupportBasis,
      remaining_uncertainty: reportUncertainty,
    };
    claimTransforms.push({
      claimId: source.id,
      sourceKind,
      reportKind,
      constructMappings,
      supportBasisMapping,
      sourceSupportBasis: source.support_basis,
      reportSupportBasis,
      uncertaintyMapping,
    });
    return reportClaim;
  });

  // The production report validator requires derived claims to carry every
  // premise's leaf observations. Close that lineage here without changing the
  // unchanged intermediate graph; the receipt records only the references
  // added by this deterministic projection.
  const sourceClaimsById = new Map(sourceClaims.map((claim) => [claim.id, claim]));
  const evidenceClosure = (claimId, stack = new Set()) => {
    const source = sourceClaimsById.get(claimId);
    if (!source) throw new Error(`Claim dependency ${claimId} does not resolve in the ${profile} source graph.`);
    if (stack.has(claimId)) throw new Error(`Claim dependency cycle includes ${claimId}.`);
    const nextStack = new Set(stack).add(claimId);
    if (!Array.isArray(source.evidence_ids) || source.evidence_ids.some((id) => typeof id !== "string")
      || !Array.isArray(source.counterevidence_ids) || source.counterevidence_ids.some((id) => typeof id !== "string")) {
      throw new Error(`Claim ${claimId} evidence and counterevidence must be string arrays.`);
    }
    const evidence = new Set(source.evidence_ids);
    const counterevidence = new Set(source.counterevidence_ids);
    if (!Array.isArray(source.depends_on_claim_ids)) throw new Error(`Claim ${claimId} dependencies must be an array.`);
    for (const dependencyId of source.depends_on_claim_ids) {
      if (typeof dependencyId !== "string") throw new Error(`Claim ${claimId} has a non-string dependency.`);
      const premise = evidenceClosure(dependencyId, nextStack);
      for (const id of premise.evidence_ids) evidence.add(id);
      for (const id of premise.counterevidence_ids) counterevidence.add(id);
    }
    if ([...evidence, ...counterevidence].some((id) => typeof id !== "string")) {
      throw new Error(`Claim ${claimId} evidence lineage contains a non-string reference.`);
    }
    return { evidence_ids: [...evidence], counterevidence_ids: [...counterevidence] };
  };
  const dependencyEvidenceClosure = [];
  for (const reportClaim of reportClaims) {
    const source = sourceClaimsById.get(reportClaim.id);
    const closed = evidenceClosure(reportClaim.id);
    const addedEvidenceIds = closed.evidence_ids.filter((id) => !reportClaim.evidence_ids.includes(id));
    const addedCounterevidenceIds = closed.counterevidence_ids.filter((id) => !reportClaim.counterevidence_ids.includes(id));
    if (addedEvidenceIds.length || addedCounterevidenceIds.length) {
      reportClaim.evidence_ids = closed.evidence_ids;
      reportClaim.counterevidence_ids = closed.counterevidence_ids;
      dependencyEvidenceClosure.push({
        claimId: reportClaim.id,
        dependsOnClaimIds: [...source.depends_on_claim_ids],
        addedEvidenceIds,
        addedCounterevidenceIds,
        rule: "transitive_premise_leaf_evidence_retained_for_report_validator",
      });
    }
  }

  const sourceNames = graph.name_registry ?? [];
  const sourceRelationships = graph.relationships ?? [];
  if (!Array.isArray(sourceNames) || !Array.isArray(sourceRelationships)) {
    throw new Error("Interpretation name_registry and relationships must be arrays.");
  }
  let nameRegistry = sourceNames;
  let relationships = sourceRelationships;
  const nameRegistryMappings = [];
  const relationshipOmissions = [];
  if (profile === "P02") {
    if (!entityKinds.has("descriptive_pattern") || !roles.has("descriptive_pattern")) {
      throw new Error("Pinned PWRP schema cannot represent P02 candidate response functions as bounded descriptive patterns.");
    }
    const nameIds = new Set();
    nameRegistry = sourceNames.map((candidate, index) => {
      const source = asRecord(candidate, `P02 name_registry ${index}`);
      if (typeof source.name_id !== "string" || !source.name_id || nameIds.has(source.name_id)
        || typeof source.name !== "string" || !source.name.trim()
        || source.entity_kind !== "candidate_response_function"
        || source.role !== "preventive relational protection" && source.role !== "reactive immediate-relief interruption"
        || typeof source.author_generated !== "boolean" || !Array.isArray(source.supporting_claim_ids)
        || source.supporting_claim_ids.length === 0
        || source.supporting_claim_ids.some((id) => typeof id !== "string" || !claimIds.has(id))) {
        throw new Error(`P02 name_registry ${index} is not a current, bounded candidate response function.`);
      }
      nameIds.add(source.name_id);
      nameRegistryMappings.push({
        nameId: source.name_id,
        sourceEntityKind: source.entity_kind,
        sourceRole: source.role,
        reportEntityKind: "descriptive_pattern",
        reportRole: "descriptive_pattern",
        rule: "candidate_response_function_to_descriptive_pattern; do not imply an IFS part or fixed role",
      });
      return {
        name_id: source.name_id,
        name: source.name,
        entity_kind: "descriptive_pattern",
        role: "descriptive_pattern",
        author_generated: source.author_generated,
        supporting_claim_ids: [...new Set(source.supporting_claim_ids)],
      };
    });
    const relationshipsByNameId = new Set(nameRegistry.map((entry) => entry.name_id));
    for (const [index, candidate] of sourceRelationships.entries()) {
      const source = asRecord(candidate, `P02 relationship ${index}`);
      if (source.relation !== "reported_temporal_sequence"
        || typeof source.id !== "string" || !source.id
        || !relationshipsByNameId.has(source.from_name_id) || !relationshipsByNameId.has(source.to_name_id)
        || !Array.isArray(source.claim_ids) || source.claim_ids.length === 0
        || source.claim_ids.some((id) => typeof id !== "string" || !claimIds.has(id))) {
        throw new Error(`P02 relationship ${index} cannot be represented without changing its reported temporal meaning.`);
      }
      relationshipOmissions.push({
        relationshipId: source.id,
        sourceRelation: source.relation,
        claimIds: [...new Set(source.claim_ids)],
        rule: "omitted_from_report_relationship_enum; temporal order remains in the cited claim and section prose",
      });
    }
    relationships = [];
  }

  const rawQuestions = output.reflection_questions;
  if (!Array.isArray(rawQuestions)) throw new Error("Composition reflection_questions must be an array.");
  const reflectionQuestionBindings = [];
  const reflectionQuestions = rawQuestions.map((candidate, index) => {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    const question = asRecord(candidate, `Reflection question ${index}`);
    if (typeof question.text !== "string" || !question.text.trim() || !Array.isArray(question.claim_ids)
      || question.claim_ids.length === 0 || question.claim_ids.some((id) => typeof id !== "string" || !claimIds.has(id))) {
      throw new Error(`Reflection question ${index} requires nonempty text and bindings to current ${profile} claims.`);
    }
    reflectionQuestionBindings.push({ index, text: question.text, claim_ids: [...new Set(question.claim_ids)] });
    return question.text;
  });

  if (!Array.isArray(output.sections) || output.sections.length === 0) throw new Error("Composition must contain report sections.");
  const hasReaderContent = typeof output.title === "string" && output.title.trim().length > 0
    && output.sections.some((section) => typeof asRecord(section, "Composition section").text === "string"
      && section.text.trim().length > 0);
  const contentStatus = hasReaderContent && reportClaims.length > 0 ? "complete" : "insufficient_evidence";
  if (!statuses.has(contentStatus)) throw new Error("Derived report content_status is not allowed by the pinned schema.");

  const receipt = {
    schemaVersion: profile === "P02"
      ? "PATTERNWORK-P02-PWRP71-COMPOSITION-NORMALIZATION-V3"
      : "PATTERNWORK-C10-PWRP71-COMPOSITION-NORMALIZATION-V1",
    status: "normalized_without_changing_provider_artifacts",
    profileId: profile,
    reportType: "IFS",
    packetSha256,
    sourceCompositionFileSha256: compositionSha256,
    sourceInterpretationFileSha256: interpretationSha256,
    normalizationRules: {
      observationKind: "observation -> reported",
      customConstructs: "versioned profile-specific aliases map to pinned PWRP enum labels; original labels remain in the immutable source graph and this receipt",
      supportBasis: "direct source-indexed observation prose -> direct_report; append actual_sequence only when explicit source sequence-edge IDs exist",
      remainingUncertainty: "a nonempty source string becomes a singleton array; existing arrays are preserved",
      contentStatus: "complete only when nonempty reader-facing title and section text and at least one current source claim exist; otherwise insufficient_evidence",
      nameRegistry: "P02 candidate response functions are mapped to bounded descriptive patterns; no IFS part identity is implied",
      relationships: "P02 reported temporal sequence is omitted from the closed relationship enum; sequence edge remains bound to its claim and text; unknown relations fail closed",
      reflectionQuestions: "bound objects are projected to schema strings only after every claim binding resolves; bindings are retained in this receipt",
    },
    sourceContentStatus: output.content_status,
    reportContentStatus: contentStatus,
    claimTransforms,
    dependencyEvidenceClosure,
    reflectionQuestionBindings,
    sourceGraphClaimCount: sourceClaims.length,
    reportClaimCount: reportClaims.length,
    nameRegistryMappings,
    sourceRelationshipCount: sourceRelationships.length,
    reportRelationshipCount: relationships.length,
    relationshipOmissions,
    providerOutputUnmodified: true,
    interpretationGraphUnmodified: true,
  };
  return { claims: reportClaims, nameRegistry, relationships, reflectionQuestions, contentStatus, receipt };
}
