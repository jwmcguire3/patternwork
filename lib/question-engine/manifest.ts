import {
  PATTERNWORK_CONTRACT_ID,
  PATTERNWORK_INTEGRITY_CONTRACT_ID,
  PATTERNWORK_PACKAGE_VERSION,
  type AssessmentStage,
  type BankItemManifestEntry,
  type InstrumentBank,
  type InstrumentManifest,
  type InteractionFamilyCode,
  type LayerSectionCode,
  type MappingSectionCode,
} from "./types.ts";

const INVENTORY_SOURCE = "specs/patternwork/question-engine-v3.1/02_complete_interaction_inventory.md";
const MAPPING_SOURCE = "specs/patternwork/question-engine-v3.1/03_core_mapping_bank.md";
const DEEPENING_SOURCE = "specs/patternwork/question-engine-v3.1/04_adaptive_deep_dive_banks.md";

export const INTERACTION_FAMILIES = [
  ["RL", "Referent Lock"], ["MS", "Memory Snap"], ["BDA", "Before–During–After Strip"],
  ["BTM", "Body Topography Map"], ["FSR", "First-Signal Race"], ["VFR", "Voice or Felt-Rule Capture"],
  ["RLB", "Ritual Loop Builder"], ["BSP", "Blocked-Strategy Probe"], ["PIS", "Part Identity Sort"],
  ["PDL", "Polarization Duel"], ["RMX", "Relationship Matrix"], ["PCR", "Pace Curve"],
  ["RRE", "Rupture–Repair Exchange"], ["WMA", "Working-Model Attribution"],
  ["RSR", "Regulation Sequence Ranking"], ["SEF", "Secure Exception Finder"], ["FCF", "Fit Confirmation"],
] .map(([code, name]) => ({ code, name })) as InstrumentManifest["interactionFamilies"];

type ItemTuple = readonly [id: `${InteractionFamilyCode}-${number}`, version: string, title: string, sourceLine: number];

const inventoryTuples: readonly ItemTuple[] = [
  ["RL-001","3.1.0","closest current relationship",27], ["RL-002","3.1.0","family comparison referent",36], ["RL-003","3.1.0","reliably safer comparison",45],
  ["MS-001","3.1.0","delayed reply",65], ["MS-002","3.1.0","anticipated evaluation",74], ["MS-003","3.1.0","conflict heat",83],
  ["BDA-001","3.1.0","evaluation cascade",103], ["BDA-002","3.1.0","unanswered message aftermath",112], ["BDA-003","3.1.0","overload and recovery",121],
  ["BTM-001","3.1.0","mobilized waiting",141], ["BTM-002","3.1.0","connected ordinary baseline",150], ["BTM-003","3.1.0","shutdown-like distance",159],
  ["FSR-001","3.1.0","ambiguity onset",179], ["FSR-002","3.1.0","seen succeeding",188], ["FSR-003","3.1.0","grief or loss recall",197],
  ["VFR-001","3.1.0","before evaluation",217], ["VFR-002","3.1.0","delayed reply",226], ["VFR-003","3.1.0","conflict withdrawal",235],
  ["RLB-001","3.1.0","review loop",255], ["RLB-002","3.1.0","checking contact",264], ["RLB-003","3.1.0","getting through overload",273],
  ["BSP-001","3.1.0","cannot recheck",293], ["BSP-002","3.1.0","cannot avoid the task",302], ["BSP-003","3.1.0","cannot leave conflict",311],
  ["PIS-001","3.1.0","evaluation patterns",331], ["PIS-002","3.1.0","contact versus withdrawal",340], ["PIS-003","3.1.0","body-state grouping",349],
  ["PDL-001","3.1.0","submit versus perfect",369], ["PDL-002","3.1.0","reach versus disappear",378], ["PDL-003","3.1.0","speak versus freeze",387],
  ["RMX-001","3.1.0","delayed response across people",407], ["RMX-002","3.1.0","asking for help",416], ["RMX-003","3.1.0","repair reception",425],
  ["PCR-001","3.1.0","contact pace",445], ["PCR-002","3.1.0","disclosure and dependence",454], ["PCR-003","3.1.0","conflict and repair pace",463],
  ["RRE-001","3.1.0","user initiates",483], ["RRE-002","3.1.0","other initiates after withdrawal",492], ["RRE-003","3.1.0","reassurance residue",501],
  ["WMA-001","3.1.0","unread message",521], ["WMA-002","3.1.0","criticism",530], ["WMA-003","3.1.0","softened apology",539],
  ["RSR-001","3.1.0","after evaluation pressure",559], ["RSR-002","3.1.0","after conflict",568], ["RSR-003","3.1.0","brief reset now",577],
  ["SEF-001","3.1.0","overload that did not take over",597], ["SEF-002","3.1.0","receiving positive attention",606], ["SEF-003","3.1.0","conflict that repaired enough",615],
  ["FCF-001","3.1.0","candidate evaluation pattern",635], ["FCF-002","3.1.0","state signature",644], ["FCF-003","3.1.0","relationship-specific sequence",653],
];

const mappingTuples: readonly ItemTuple[] = [
  ["RL-101","1.0","People and roles to use today",43], ["RL-102","1.0","What the relationship is like lately",68], ["RL-103","1.0","Which time frame is real enough to answer",88], ["RL-104","1.0","How experience is easiest to notice",98], ["RL-105","1.0","Things that may be affecting body sensations today",108],
  ["MS-101","1.0","The unanswered message from the closest person",120], ["WMA-101","1.0","What the silence seems to say",142], ["RRE-101","1.0","A repair arrives after distance",152], ["MS-102","1.0","The close friend cancels at the last minute",171], ["BDA-102","1.0","After a disagreement with a close friend",188], ["RRE-102","1.0","Starting repair with a friend",200], ["MS-103","1.0","Before seeing or calling a caregiver",210], ["BDA-103","1.0","A critical or loaded comment from a caregiver",227], ["RMX-104","1.0","Same family cue, different person",237], ["BDA-105","1.0","The evaluation on the calendar",247], ["FSR-105","1.0","The first few seconds of feedback",257], ["MS-106","1.0","Asking someone for help",267], ["BSP-106","1.0","If the usual way of asking were unavailable",277], ["MS-107","1.0","Someone notices you did well",287], ["VFR-107","1.0","What receiving praise asks of you",297], ["BDA-108","1.0","A mistake others might notice",307], ["RLB-108","1.0","What lets the mistake loop stop",317], ["BDA-109","1.0","Anger during a live conflict",327], ["BTM-109","1.0","One body map from conflict",337], ["WMA-110","1.0","Ambiguous tone, not just delay",347], ["MS-110","1.0","What you do while waiting for clarity",357], ["MS-111","1.0","The moment money feels tight",367], ["RLB-111","1.0","The money-pressure loop",377], ["MS-112","1.0","A loss that comes back unexpectedly",387], ["RSR-112","1.0","What helps after a loss reminder",397], ["MS-113","1.0","An evening alone",407], ["SEF-113","1.0","When the usual pattern eased up",417], ["BTM-114","1.0","When the body has had too much",427], ["RSR-114","1.0","Later recovery detail after overload",437],
];

type DeepTuple = readonly [
  id: `${InteractionFamilyCode}-${number}`,
  version: string,
  title: string,
  sourceLine: number,
  moduleGroup: NonNullable<BankItemManifestEntry["moduleGroup"]>,
];
const deepeningTuples: readonly DeepTuple[] = [
  ["VFR-201","3.0.0","Voice, mode, and function capture",27,"protective-pattern"], ["BSP-201","3.0.0","Blocked move, feared outcome, and protective intent",40,"protective-pattern"], ["RLB-201","3.0.0","Ritual sequence, stopping state, and interruption",53,"protective-pattern"], ["BDA-201","3.0.0","Immediate payoff and three kinds of cost",66,"protective-pattern"], ["BTM-201","3.0.0","Repeated body signature for a candidate pattern",79,"protective-pattern"], ["BDA-202","3.0.0","Manager → breakthrough → firefighter → aftermath chain",92,"protective-pattern"], ["PDL-201","3.0.0","Polarization and allies",105,"protective-pattern"], ["RSR-201","3.0.0","Access to curiosity, calm, compassion, and choice",118,"protective-pattern"],
  ["BTM-202","3.0.0","Ordinary baseline and accessible range",133,"state-signature-transition"], ["FSR-201","3.0.0","Mobilization entry and peak",146,"state-signature-transition"], ["FSR-202","3.0.0","Deactivation entry and peak",159,"state-signature-transition"], ["BDA-203","3.0.0","Mixed or rapidly shifting signature",172,"state-signature-transition"], ["BDA-204","3.0.0","Exit, stuck point, residue, and recovery curve",185,"state-signature-transition"], ["RSR-202","3.0.0","Self-regulation: sequence and actual effect",198,"state-signature-transition"], ["RSR-203","3.0.0","Co-regulation, contact dose, and aggravation",211,"state-signature-transition"],
  ["WMA-201","3.0.0","Ambiguity and working models",226,"relationship-sequence"], ["BDA-205","3.0.0","Proximity-seeking and protest sequence",239,"relationship-sequence"], ["BDA-206","3.0.0","Deactivation and distancing sequence",252,"relationship-sequence"], ["RRE-201","3.0.0","Rupture response",265,"relationship-sequence"], ["RRE-202","3.0.0","Repair initiated by the user",278,"relationship-sequence"], ["RRE-203","3.0.0","Repair received and reassurance uptake",291,"relationship-sequence"], ["PCR-201","3.0.0","Pace thresholds by dimension",304,"relationship-sequence"], ["RMX-201","3.0.0","Cross-relationship cue matrix",317,"relationship-sequence"], ["SEF-201","3.0.0","Secure exception finder",330,"relationship-sequence"],
  ["MS-201","3.0.0","Blankness, low interoception, and accessibility route",345,"adjudication-accessibility-confirmation"], ["PIS-201","3.0.0","Candidate identity sort: merge, split, allies, opponents",358,"adjudication-accessibility-confirmation"], ["FCF-201","3.0.0","Fit confirmation and correction",371,"adjudication-accessibility-confirmation"],
];

function item(tuple: ItemTuple, bank: InstrumentBank, stages: readonly AssessmentStage[], sourcePath: string): BankItemManifestEntry {
  const [bankItemId, version, title, sourceLine] = tuple;
  const [family, numeric] = bankItemId.split("-");
  return { bankItemId, family: family as InteractionFamilyCode, numericId: Number(numeric), version, title, bank, stages, sourcePath, sourceLine };
}

export const INVENTORY_ITEMS = inventoryTuples.map((tuple) => item(tuple, "inventory", ["S0","S1","S2","S3","S4","S5"], INVENTORY_SOURCE));
export const MAPPING_ITEMS = mappingTuples.map((tuple) => item(tuple, "mapping", tuple[0].startsWith("RL-") ? ["S0"] : ["S1"], MAPPING_SOURCE));
export const DEEPENING_ITEMS = deepeningTuples.map((tuple) => ({ ...item([tuple[0], tuple[1], tuple[2], tuple[3]], "deepening", tuple[4] === "adjudication-accessibility-confirmation" ? ["S2","S3","S4","S5"] : ["S3","S4","S5"], DEEPENING_SOURCE), moduleGroup: tuple[4] }));

export const LAYER_SECTION_CODES = [
  ...Array.from({ length: 12 }, (_, index) => `IFS-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 11 }, (_, index) => `PV-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 12 }, (_, index) => `ATT-${String(index + 1).padStart(2, "0")}`),
] as LayerSectionCode[];

export const MAPPING_SECTION_CODES = Array.from({ length: 8 }, (_, index) => `MAP-${String(index + 1).padStart(2, "0")}`) as MappingSectionCode[];

export const PATTERNWORK_INSTRUMENT_MANIFEST: InstrumentManifest = {
  contractId: PATTERNWORK_CONTRACT_ID,
  integrityContractId: PATTERNWORK_INTEGRITY_CONTRACT_ID,
  packageVersion: PATTERNWORK_PACKAGE_VERSION,
  mappingBankVersion: "PWQE3-CMB-1.0",
  deepeningBankVersion: "3.0.0",
  interactionFamilies: INTERACTION_FAMILIES,
  inventoryItems: INVENTORY_ITEMS,
  mappingItems: MAPPING_ITEMS,
  deepeningItems: DEEPENING_ITEMS,
  bankItems: [...INVENTORY_ITEMS, ...MAPPING_ITEMS, ...DEEPENING_ITEMS],
  sectionCodes: LAYER_SECTION_CODES,
  mappingSectionCodes: MAPPING_SECTION_CODES,
  invariants: {
    deterministicAssessment: true,
    aiDuringQuestionsRoutingOrScoring: false,
    canonicalJsonAuthoritative: true,
    selectedAuthoredTextQuoteEligible: false,
  },
};

export function getBankItem(bankItemId: string): BankItemManifestEntry | undefined {
  return PATTERNWORK_INSTRUMENT_MANIFEST.bankItems.find((candidate) => candidate.bankItemId === bankItemId);
}
