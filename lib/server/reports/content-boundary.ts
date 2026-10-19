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

const RESPONDENT_NAME_KEYS = new Set([
  "name", "fullname", "respondentname", "respondentfullname", "participantname",
  "participantfullname", "personname", "personfullname", "subjectname", "subjectfullname",
  "firstname", "givenname", "middlename", "lastname", "familyname", "surname",
  "respondentfirstname", "respondentgivenname", "respondentmiddlename", "respondentlastname",
  "respondentfamilyname", "respondentsurname", "participantfirstname", "participantgivenname",
  "participantmiddlename", "participantlastname", "participantfamilyname", "participantsurname",
  "displayname", "respondentdisplayname", "participantdisplayname", "preferredname",
  "preferredfullname", "legalname", "legalfullname", "birthname", "maidenname",
  "chosenname", "nickname", "alias", "username", "respondentusername", "participantusername",
  "identityname", "identityfullname", "honorific", "salutation",
]);

export function isRespondentNameFieldKey(key: string): boolean {
  return RESPONDENT_NAME_KEYS.has(key.toLowerCase().replace(/[^a-z]/gu, ""));
}

const RESPONDENT_IDENTITY_KEYS = new Set([
  "email", "emailaddress", "emailhash", "hashedemail", "contactemail", "contactemailhash", "respondentemail", "participantemail", "useremail", "useremailhash",
  "accountid", "accountidentifier", "accountnumber", "accountno", "acctid", "acctnumber",
  "useraccountid", "externalaccountid", "memberid", "memberidentifier", "membernumber",
  "customerid", "customeridentifier", "customernumber", "userid", "useridentifier",
  "externaluserid", "authuserid", "identityuserid", "respondentid", "participantid",
  "clientuserid",
  "phone", "phonenumber", "mobilephone", "streetaddress", "mailingaddress", "postaladdress",
  "ssn", "socialsecuritynumber", "nationalid", "governmentid", "taxid",
]);

export function isRespondentIdentityFieldKey(key: string): boolean {
  return RESPONDENT_IDENTITY_KEYS.has(key.toLowerCase().replace(/[^a-z]/gu, ""));
}

/** Reject identity-bearing field names before any report contract is serialized. */
export function assertNoRespondentIdentityFields(value: unknown, location = "$"): void {
  const visit = (current: unknown, currentPath: string): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${currentPath}[${index}]`));
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      const keyPath = `${currentPath}.${key}`;
      if (isRespondentIdentityFieldKey(key)) {
        throw new Error(`Respondent identity field at ${keyPath} is prohibited from provider input.`);
      }
      visit(child, keyPath);
    }
  };
  visit(value, location);
}

export function assertNoRespondentFullName(value: unknown, location = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRespondentFullName(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z]/gu, "");
      if (RESPONDENT_NAME_KEYS.has(normalized)) {
        throw new Error(`Respondent name field at ${location}.${key} is prohibited from provider input.`);
      }
      assertNoRespondentFullName(child, `${location}.${key}`);
    }
  }
}

const GENERATED_REPORT_ENTITY_KINDS = new Set(["ifs_part", "state_pattern", "relational_pattern", "descriptive_pattern"]);

/**
 * A validated PWRP draft may contain author-generated labels for IFS parts or
 * patterns in name_registry. Permit only those schema-defined labels while
 * retaining the respondent-name ban everywhere else.
 */
export function assertNoRespondentFullNameInGeneratedDraft(value: unknown, location = "$"): void {
  const visit = (current: unknown, currentPath: string, isDraftRoot = false): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${currentPath}[${index}]`));
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      const keyPath = `${currentPath}.${key}`;
      const normalized = key.toLowerCase().replace(/[^a-z]/gu, "");
      if (isDraftRoot && key === "name_registry" && Array.isArray(child)) {
        child.forEach((entry, index) => {
          const entryPath = `${keyPath}[${index}]`;
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            visit(entry, entryPath);
            return;
          }
          const row = entry as Record<string, unknown>;
          const allowGeneratedEntityLabel = row.author_generated === true
            && typeof row.name === "string"
            && typeof row.entity_kind === "string"
            && GENERATED_REPORT_ENTITY_KINDS.has(row.entity_kind);
          for (const [rowKey, rowValue] of Object.entries(row)) {
            const normalizedRowKey = rowKey.toLowerCase().replace(/[^a-z]/gu, "");
            if (RESPONDENT_NAME_KEYS.has(normalizedRowKey)) {
              if (rowKey === "name" && allowGeneratedEntityLabel) continue;
              throw new Error(`Respondent or unverified name field at ${entryPath}.${rowKey} cannot be sent for review.`);
            }
            visit(rowValue, `${entryPath}.${rowKey}`);
          }
        });
        continue;
      }
      if (RESPONDENT_NAME_KEYS.has(normalized)) {
        throw new Error(`Respondent name field at ${keyPath} is prohibited from provider input.`);
      }
      visit(child, keyPath);
    }
  };
  visit(value, location, true);
}

const GENERATED_LAYER_TYPES = new Set(["IFS", "PV", "ATT"]);

/**
 * Check PWRP model inputs while allowing schema-validated, author-generated
 * entity labels in the current draft and in accepted synthesis layers.
 */
export function assertNoRespondentFullNameInPwrp71ModelInput(value: unknown, location = "$"): void {
  const visit = (current: unknown, currentPath: string, isRoot = false): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${currentPath}[${index}]`));
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      const keyPath = `${currentPath}.${key}`;
      if (isRoot && (key === "draft" || key === "rejected_output")) {
        assertNoRespondentFullNameInGeneratedDraft(child, keyPath);
        continue;
      }
      if (isRoot && key === "accepted_layers") {
        if (!child || typeof child !== "object" || Array.isArray(child)) {
          throw new Error(`Accepted PWRP layers at ${keyPath} must be a report-type map.`);
        }
        for (const [reportType, draft] of Object.entries(child)) {
          if (!GENERATED_LAYER_TYPES.has(reportType)) {
            throw new Error(`Accepted PWRP layer at ${keyPath}.${reportType} is not an allowed synthesis source.`);
          }
          assertNoRespondentFullNameInGeneratedDraft(draft, `${keyPath}.${reportType}`);
        }
        continue;
      }
      const normalized = key.toLowerCase().replace(/[^a-z]/gu, "");
      if (RESPONDENT_NAME_KEYS.has(normalized)) {
        throw new Error(`Respondent name field at ${keyPath} is prohibited from provider input.`);
      }
      visit(child, keyPath);
    }
  };
  visit(value, location, true);
}
