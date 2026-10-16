/**
 * Execution mode belongs to the caller, not to a respondent or their evidence.
 * Reject the retired classification interface; never silently scrub a bound
 * packet and keep its old digest. Ordinary source/currentness lineage is valid.
 */
const RETIRED_KEYS = new Set([
  "origin", "respondentorigin", "participantorigin", "respondentsource",
  "issynthetic", "isfictional", "isreal", "isrealparticipant",
  "responseprovenance", "responseprovenancebyresponseid",
  "syntheticreferentroles", "syntheticdeepeningansweraudit",
  "syntheticrespondentcontrols", "fictionalcontrolhistory",
]);
const CLASSIFICATION_TEXT = [
  /\b(?:synthetic|fictional|simulated|invented|real)[ _-]+(?:respondents?|participants?|answers?|responses?|profiles?|personas?)\b/iu,
  /\b(?:original_authored_fictional|new_synthetic|new_fictional_control_outcome)\b/iu,
  /\bsource provenance:/iu,
  /\bnot real participant data\b/iu,
];

export function assertNoRespondentClassification(value: unknown, location = "$"): void {
  if (typeof value === "string") {
    if (CLASSIFICATION_TEXT.some(pattern => pattern.test(value))) {
      throw new Error(`Retired respondent classification at ${location}. Rebuild from canonical selections; do not relabel the evidence.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRespondentClassification(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z]/gu, "");
      if (RETIRED_KEYS.has(normalized) || normalized.startsWith("synthetic") || normalized.startsWith("fictional")) {
        throw new Error(`Retired respondent classification field at ${location}.${key}.`);
      }
      assertNoRespondentClassification(child, `${location}.${key}`);
    }
  }
}
