export const PATTERNWORK_CONTRACT_ID = "PWQE3-CONTRACT-2" as const;
export const PATTERNWORK_INTEGRITY_CONTRACT_ID = "PWQE3-INTEGRITY-1" as const;
export const PATTERNWORK_PACKAGE_VERSION = "3.1.0" as const;
export const PATTERNWORK_PROMPT_RELEASE = "4.1.0" as const;
export const PATTERNWORK_WRITER_TEMPLATE_VERSION = "PWRP-V4.1" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type InteractionFamilyCode =
  | "RL" | "MS" | "BDA" | "BTM" | "FSR" | "VFR" | "RLB" | "BSP" | "PIS"
  | "PDL" | "RMX" | "PCR" | "RRE" | "WMA" | "RSR" | "SEF" | "FCF";

export type AssessmentStage = "S0" | "S1" | "S2" | "S3" | "S4" | "S5";
export type InstrumentBank = "inventory" | "mapping" | "deepening";
export type BankItemId = `${InteractionFamilyCode}-${number}`;
export type LayerReportType = "IFS" | "PV" | "ATT";
export type ReportType = LayerReportType | "MAP" | "SYNTHESIS";
export type EvidenceGrade = "direct_single" | "replicated" | "user_confirmed" | "cross_context" | "contradicted";
export type Confidence = "high" | "medium" | "low" | "unsupported";
export type ContradictionImpact = "omit_claim" | "cap_low" | "qualify" | "none";
export type CoverageRoutingState = "green" | "amber" | "red";
export type CoverageApplicability = "applicable" | "not_applicable" | "unknown";

export type IfsSectionCode = `IFS-${"01"|"02"|"03"|"04"|"05"|"06"|"07"|"08"|"09"|"10"|"11"|"12"}`;
export type PvSectionCode = `PV-${"01"|"02"|"03"|"04"|"05"|"06"|"07"|"08"|"09"|"10"|"11"}`;
export type AttachmentSectionCode = `ATT-${"01"|"02"|"03"|"04"|"05"|"06"|"07"|"08"|"09"|"10"|"11"|"12"}`;
export type LayerSectionCode = IfsSectionCode | PvSectionCode | AttachmentSectionCode;
export type MappingSectionCode = `MAP-${"01"|"02"|"03"|"04"|"05"|"06"|"07"|"08"}`;
export type SynthesisSectionCode = `SYN-${"01"|"02"|"03"|"04"|"05"|"06"|"07"}`;

export interface InteractionFamilyDefinition {
  readonly code: InteractionFamilyCode;
  readonly name: string;
}

export interface BankItemManifestEntry {
  readonly bankItemId: BankItemId;
  readonly family: InteractionFamilyCode;
  readonly numericId: number;
  readonly version: string;
  readonly title: string;
  readonly bank: InstrumentBank;
  readonly stages: readonly AssessmentStage[];
  readonly moduleGroup?: "protective-pattern" | "state-signature-transition" | "relationship-sequence" | "adjudication-accessibility-confirmation";
  readonly sourcePath: string;
  readonly sourceLine: number;
}

export interface InstrumentManifest {
  readonly contractId: typeof PATTERNWORK_CONTRACT_ID;
  readonly integrityContractId: typeof PATTERNWORK_INTEGRITY_CONTRACT_ID;
  readonly packageVersion: typeof PATTERNWORK_PACKAGE_VERSION;
  readonly mappingBankVersion: "PWQE3-CMB-1.0";
  readonly deepeningBankVersion: "3.0.0";
  readonly interactionFamilies: readonly InteractionFamilyDefinition[];
  readonly inventoryItems: readonly BankItemManifestEntry[];
  readonly mappingItems: readonly BankItemManifestEntry[];
  readonly deepeningItems: readonly BankItemManifestEntry[];
  readonly bankItems: readonly BankItemManifestEntry[];
  readonly sectionCodes: readonly LayerSectionCode[];
  readonly mappingSectionCodes: readonly MappingSectionCode[];
  readonly invariants: {
    readonly deterministicAssessment: true;
    readonly aiDuringQuestionsRoutingOrScoring: false;
    readonly canonicalJsonAuthoritative: true;
    readonly selectedAuthoredTextQuoteEligible: false;
  };
}

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export interface SourceManifestEntry {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface SourceManifest {
  readonly manifestVersion: string;
  readonly contractId: typeof PATTERNWORK_CONTRACT_ID;
  readonly integrityContractId: typeof PATTERNWORK_INTEGRITY_CONTRACT_ID;
  readonly instrumentPackageVersion: typeof PATTERNWORK_PACKAGE_VERSION;
  readonly reportPromptRelease: typeof PATTERNWORK_PROMPT_RELEASE;
  readonly hashAlgorithm: "sha256";
  readonly canonicalPopulation: string;
  readonly files: readonly SourceManifestEntry[];
}

