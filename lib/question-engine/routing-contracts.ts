import { DEEPENING_ITEMS, getBankItem, MAPPING_ITEMS } from "./manifest.ts";
import type { AssessmentStage, BankItemId, InstrumentBank, InteractionFamilyCode } from "./types.ts";

export const EXECUTABLE_ROUTING_CONTRACT_VERSION = "PWQE3-ACC-2.1" as const;

export type RoutingSurfaceStatus = "compiled";
export type RoutingRecoveryMode = "none" | "optional-resource" | "required-resource" | "canonical-btm" | "resource-ending";

export interface ExplicitEligibilityContract {
  readonly allowedStages: readonly AssessmentStage[];
  readonly minimumEvidenceResponses: number;
  readonly minimumIndependentEpisodes: number;
  readonly minimumNamedReferents: number;
  readonly requiresSafetyContext: boolean;
  readonly requiresSafeContext: boolean;
  readonly prerequisiteBankItemIds: readonly BankItemId[];
  readonly prerequisiteMode: "any" | "all";
}

export interface ExplicitBranchContract {
  readonly selectedOptionRoutes: readonly {
    readonly optionId: string;
    readonly routeBankItemIds: readonly BankItemId[];
  }[];
  readonly declaredTargetBankItemIds: readonly BankItemId[];
  readonly defaultAction: "continue-canonical-plan";
  readonly safetySignalsTakePriority: true;
  readonly proseDisposition: "retained-as-non-executable-provenance";
}

export interface ExplicitRecoveryContract {
  readonly mode: RoutingRecoveryMode;
  readonly preferredBankItemIds: readonly BankItemId[];
  readonly blocksHighIntensity: boolean;
  readonly blocksStandardCompletion: boolean;
}

export interface ExecutableRoutingContract {
  readonly contractVersion: typeof EXECUTABLE_ROUTING_CONTRACT_VERSION;
  readonly bankItemId: BankItemId;
  readonly bankItemVersion: string;
  readonly bank: Extract<InstrumentBank, "mapping" | "deepening">;
  readonly family: InteractionFamilyCode;
  readonly compilation: RoutingSurfaceStatus;
  readonly eligibilityCompilation: RoutingSurfaceStatus;
  readonly branchCompilation: RoutingSurfaceStatus;
  readonly recoveryCompilation: RoutingSurfaceStatus;
  readonly uncompiledFragments: readonly [];
  readonly provenance: {
    readonly sourcePath: string;
    readonly sourceLine: number;
    readonly authoredBlockSha256: string;
  };
  readonly eligibility: ExplicitEligibilityContract;
  readonly branches: ExplicitBranchContract;
  readonly recovery: ExplicitRecoveryContract;
}

type Profile = "calibration" | "mapping" | "deep" | "deep-referent" | "deep-two-referents" | "confirmation";
type ReviewedTuple = readonly [
  bankItemId: BankItemId,
  authoredBlockSha256: string,
  profile: Profile,
  recovery: RoutingRecoveryMode,
  declaredTargets?: readonly BankItemId[],
];

// Each tuple is a reviewed execution decision bound to the exact canonical authored block.
// Prose remains visible to the renderer, but runtime behavior comes only from this table.
const REVIEWED_ACTIVE_ITEMS: readonly ReviewedTuple[] = [
  ["RL-101","883366183232c46296946cb541ac4b64a5c3a0dc8c988fe70bdf251d67f4a5c4","calibration","none",["MS-101","MS-102","MS-103","RMX-104","BDA-105","MS-106","MS-107"]],
  ["RL-102","81ffefcf17b8c843af92c28dd566265eaedda45fc4c2a4b902a875badff9895c","calibration","none"],
  ["RL-103","276d2ddbf9b786e8f0b4bccdf00faf841722d08ce22ded086c3d1dd6f0d17a3f","calibration","none"],
  ["RL-104","1d146fca2e53bd1b7612502a477f2783279f31ccf55595ac4f2f9b6975242963","calibration","none"],
  ["RL-105","61dbc351bbcf6634cf79a914f584311e83bfad35626a1687cd39d1dbd8be9d49","calibration","none"],
  ["MS-101","52e345d001d083ac6ee86eaceccb85b1787bdbc80341220833c253583f3bb3b9","mapping","optional-resource",["WMA-101"]],
  ["WMA-101","dc0ac3188c73693deeb7ed2120c3d5ffad9b6b72b252a0aad4e254c5c37a6812","mapping","required-resource",["SEF-113","MS-107"]],
  ["RRE-101","313f4691ef2618ebc40ce27bb59a6d02b55e0966e9a809c9c4d33bff4ef25417","mapping","required-resource",["SEF-113","RSR-114"]],
  ["MS-102","7699b6e3c19ec10b368b6971dfbea928363229447dd10901e0289eade03395b3","mapping","none",["BDA-102"]],
  ["BDA-102","19cdc0408ebee8e9db6bb0ae2fa6556d014a45c1c58905ce403699058578338c","mapping","optional-resource"],
  ["RRE-102","f048c753455b3b5d200793911cf6f897ca104ffe2e035446c46f945a00882fe8","mapping","required-resource"],
  ["MS-103","920825c16ad6a7a3d6581692f43202d145744b4c71cc1eb05f23f7d032a373b1","mapping","optional-resource"],
  ["BDA-103","80ebdd5684a2d014c15f33eba4a7d778d17f99599605a55cc64978445509fc04","mapping","required-resource",["RSR-114"]],
  ["RMX-104","08ca6457784e2a6a8e0ffae9d5ee7b29943979d0274852f44fedde306bcc539e","mapping","none"],
  ["BDA-105","7d89b0e5d230f1ae8af60d400277455ea33f8b53977f8f2490aabbfde03523a9","mapping","optional-resource",["BSP-106","FSR-105"]],
  ["FSR-105","cf62b875efce1e495fa460c48f3d710fd387953761853f813ac898d479f590f9","mapping","optional-resource"],
  ["MS-106","6a52c39740ab0e1ce12a72be6bcc3625aa584d8ac38bd351a5e6a9036ea2096a","mapping","none"],
  ["BSP-106","790b70ec9ad3b99f563a3a5bc34576d5405a53babf8271de2adcb204f1559f51","mapping","required-resource"],
  ["MS-107","fe402a5d9177e06b9d5dfe7c8389919195d0e008437fbf133f3b904ff9332737","mapping","resource-ending",["SEF-113"]],
  ["VFR-107","40bcb79d0278bec2e1e50d9e587ac8266a6c27c6ddc0e4433768e3abae7faf4b","mapping","none"],
  ["BDA-108","829d961019bf734d7c07391cd4b510d99ca0accba4dade3b7a724b818632e564","mapping","optional-resource"],
  ["RLB-108","316922153760dfe9d9416245fb288a93936a6772e6b495f4e4a1436197edebbd","mapping","required-resource"],
  ["BDA-109","2501436752e7f10043045f3e60c009ec7ea2ef9ec43c883850c51becd0df9012","mapping","required-resource",["RSR-114","SEF-113"]],
  ["BTM-109","3ec93b782860ad9fb2a05c35b1fe68b2e0be01f08742400d70cb0e586d2c919a","mapping","canonical-btm",["RSR-003"]],
  ["WMA-110","8593b9b7d93971a66cf3cb3b8fbeb20684d278ec35760641ef2ed3a286ca7fe1","mapping","none"],
  ["MS-110","3afbf4991455a61e7f0161e4072880293cea253ba37f07a72a634f77d6476fd2","mapping","none",["RMX-104"]],
  ["MS-111","38ee8db347c1cf185817742bb2d3f308d3fe859805e03d7b9fb1e09215edceb9","mapping","optional-resource",["MS-106"]],
  ["RLB-111","5777cfd91e93ff78b339b716974bcdf37bf6ea59055e6c36ffc540229f4b5eb3","mapping","optional-resource"],
  ["MS-112","d1cb73bcec6a1b964b33655109f36eac37ad6e62f817476ad2c3d9624a9bd886","mapping","required-resource",["RSR-112"]],
  ["RSR-112","79a420edf066bf723c4512922b28d2657d69ee5ee747be0aeb771fa57e40c179","mapping","resource-ending"],
  ["MS-113","9fb21ea257748025fe398a52c27903bf6b1dba86ed96d3f4388e3a448a7f6336","mapping","none"],
  ["SEF-113","952e103e7b53b388f952187572347f8097d1b5b3e497a6f464c43ca40f93e2df","mapping","resource-ending"],
  ["BTM-114","56f854b99bb07ad8e50b046ae8fc10cc7673ac965162d556226e08a4a2fe7ebf","mapping","canonical-btm",["RSR-003"]],
  ["RSR-114","244b1b983d69dbf00f396ee3d16ab2f4fd4539478c83ed2b0351e5bdb6f55476","mapping","resource-ending"],

  ["VFR-201","c2bfc9ea486ed8ff9d5e995a9e34bdcd83368c556173f160bd7480a60678765e","deep","optional-resource",["MS-201","BSP-201","PIS-201","BTM-202"]],
  ["BSP-201","bc56db65fb2375c84d0025d827b688a086c6c20942d7d928d9096ecc020056ef","deep","required-resource"],
  ["RLB-201","a616bdc3e8253295ffb539ad7af4a5d0f25b28397eff5699847094881499f1ed","deep","optional-resource"],
  ["BDA-201","d0c9815cc60a13f98b195e81e79aec91cebc0cdfea85ab6501fcd1cb70de33a0","deep","optional-resource"],
  ["BTM-201","f6f0f1c5323bc28fdd264148e177b233515a4589b44603e458dec5d3f05640cb","deep","canonical-btm",["MS-201","BDA-203","RSR-003"]],
  ["BDA-202","6b62f568088836700f81f55eec2f4bb13173c664c8f658294665287b32f1e5d9","deep","required-resource"],
  ["PDL-201","d061adbd4f79d0b6ae45f755b4c34fa935d956f04ca4c09c4af71461b3197f1b","deep","required-resource"],
  ["RSR-201","22127fb7eb7a778ad9e80af302be72f9a51f0fc22a450f2cf7825fb6a112aed1","deep","resource-ending"],
  ["BTM-202","2e620a3a3c19900d5579994178c54946221f8007cc18a1a1c7f7024505a12248","deep","canonical-btm",["RSR-003"]],
  ["FSR-201","b50fe2086c11b697328f9d02bcb9622049a60a1abcb3e7f3491b234223f5a327","deep","optional-resource"],
  ["FSR-202","e550f8ac1abe13d2122398f7ff0c04a840ec7e32da4b47ba41cf038020ff58b3","deep","required-resource"],
  ["BDA-203","611423499e4aac435b333dff43fb4c5914ceacaa2ca52f2187e1fe3c8ec46df8","deep","optional-resource"],
  ["BDA-204","04608ac5ffb1e01f7d272e6bb4efd00e28d674fa0cb40ae9ea7fec869aef8122","deep","optional-resource"],
  ["RSR-202","f8f0d0c94094df80a66b847e073e4c3d3deeb53ed1bffd0a62c7f504b11b2446","deep","resource-ending"],
  ["RSR-203","272762223db22340982dfc3b555411c63a4b89f1964589b7d78ee1ef2637d358","deep-referent","resource-ending",["RRE-203"]],
  ["WMA-201","097a2eff2895ec9c279ad955217f037a730ace48938cfa0958c49e34dcd46f89","deep-referent","optional-resource"],
  ["BDA-205","15423ed6bc530d7c7d665f27c2c1c67eaa89573994a893c936ec81d3e3e38748","deep-referent","required-resource"],
  ["BDA-206","c0cbe6b610d5e7df2d4e0240fa091254edf5d1c24633bf3775595b54340b60e1","deep-referent","optional-resource"],
  ["RRE-201","2eaf5bfef3f6a9813c457e643de039d87a5793495f012113f7c6635071d0959a","deep-referent","required-resource",["RRE-202","RRE-203"]],
  ["RRE-202","2e02927ea0de2c782cbead1afc0aefc0827c924c81a8a57e3f7b4e62a582ae99","deep-referent","required-resource"],
  ["RRE-203","a953f0552af1f7cc6d3bdb7bdbd27561e65ef461b0e1f233c562337de7603bc2","deep-referent","optional-resource"],
  ["PCR-201","8fd537912e415e98cd66e66f72fbaca03cd98821fbab7ef8561452726eb5a180","deep-referent","resource-ending"],
  ["RMX-201","755f438cf49398c493822bbd80c02266095587cbd06a5c0feb744a2616271686","deep-two-referents","resource-ending"],
  ["SEF-201","3bd50d80ae74d492eefeb3288c569393d69ba0798f0fb6f35684412d6374c222","deep","resource-ending"],
  ["MS-201","419f97ac9e020680d3edfe61fd207f8464ffddad267f2989bd95c0a3d947facc","confirmation","resource-ending"],
  ["PIS-201","ff67d2e36299c6210bfcd38dd40c2d2f97954a97ed4fa26db33b0ad0df62d0d5","confirmation","required-resource"],
  ["FCF-201","c97b9920ff9b5b0675366db49c21e841fd99ef8ebd9ae9e5bcfee40ef4b2ee4a","confirmation","resource-ending",["RSR-201","SEF-201"]],
];

const SELECTED_OPTION_ROUTES: Readonly<Record<string, readonly { readonly optionId: string; readonly routeBankItemIds: readonly BankItemId[] }[]>> = {
  "RL-101": [
    { optionId:"OPT-RL-101-17c9b0555385219b", routeBankItemIds:["MS-101"] },
    { optionId:"OPT-RL-101-876a70d2b8ab1846", routeBankItemIds:["MS-102"] },
    { optionId:"OPT-RL-101-2688b5c1989e243c", routeBankItemIds:["MS-103"] },
    { optionId:"OPT-RL-101-2c6eaecafad1aa93", routeBankItemIds:["RMX-104"] },
    { optionId:"OPT-RL-101-f2b7a0580b6d0efd", routeBankItemIds:["BDA-105"] },
  ],
  "MS-101": [{ optionId:"OPT-MS-101-2878a5e974a5054a", routeBankItemIds:["WMA-101"] }],
  "BDA-105": [{ optionId:"OPT-BDA-105-d7fca09cffd62b98", routeBankItemIds:["BSP-106"] }],
  "MS-110": [{ optionId:"OPT-MS-110-887146cc8aade749", routeBankItemIds:["RMX-104"] }],
  "MS-111": [{ optionId:"OPT-MS-111-1c58f822632d00ac", routeBankItemIds:["MS-106"] }],
  "MS-112": [{ optionId:"OPT-MS-112-38fa78d2a608e0fc", routeBankItemIds:["RSR-112"] }],
  "VFR-201": [
    { optionId:"OPT-VFR-201-eddbed64c88316ed", routeBankItemIds:["MS-201"] },
    { optionId:"OPT-VFR-201-d4f9fe9036ffeda1", routeBankItemIds:["BSP-201"] },
  ],
  "BTM-201": [
    { optionId:"OPT-BTM-201-6fd6ad7dc44b8182", routeBankItemIds:["PIS-201"] },
    { optionId:"OPT-BTM-201-2986a7bda5770a3e", routeBankItemIds:["BDA-203"] },
  ],
};

function eligibilityFor(profile: Profile, stages: readonly AssessmentStage[]): ExplicitEligibilityContract {
  const referents = profile === "deep-two-referents" ? 2 : profile === "deep-referent" ? 1 : 0;
  return {
    allowedStages: stages,
    minimumEvidenceResponses: profile === "calibration" ? 0 : 1,
    minimumIndependentEpisodes: 0,
    minimumNamedReferents: referents,
    requiresSafetyContext: referents > 0,
    requiresSafeContext: false,
    prerequisiteBankItemIds: [],
    prerequisiteMode: "all",
  };
}

function buildContract(tuple: ReviewedTuple): ExecutableRoutingContract {
  const [bankItemId, authoredBlockSha256, profile, recoveryMode, declaredTargets = []] = tuple;
  const item = getBankItem(bankItemId);
  if (!item || item.bank === "inventory") throw new Error(`PWQE3 routing contract references inactive item ${bankItemId}.`);
  const preferredBankItemIds = recoveryMode === "canonical-btm" ? ["RSR-003" as BankItemId]
    : recoveryMode === "required-resource" ? declaredTargets.filter((id) => ["RSR","SEF","MS"].includes(id.split("-")[0]))
    : recoveryMode === "resource-ending" ? declaredTargets.filter((id) => ["RSR","SEF"].includes(id.split("-")[0])) : [];
  return {
    contractVersion: EXECUTABLE_ROUTING_CONTRACT_VERSION,
    bankItemId,
    bankItemVersion: item.version,
    bank: item.bank,
    family: item.family,
    compilation: "compiled",
    eligibilityCompilation: "compiled",
    branchCompilation: "compiled",
    recoveryCompilation: "compiled",
    uncompiledFragments: [],
    provenance: { sourcePath:item.sourcePath, sourceLine:item.sourceLine, authoredBlockSha256 },
    eligibility: eligibilityFor(profile, item.stages),
    branches: {
      selectedOptionRoutes: SELECTED_OPTION_ROUTES[bankItemId] ?? [],
      declaredTargetBankItemIds: declaredTargets,
      defaultAction: "continue-canonical-plan",
      safetySignalsTakePriority: true,
      proseDisposition: "retained-as-non-executable-provenance",
    },
    recovery: {
      mode: recoveryMode,
      preferredBankItemIds,
      blocksHighIntensity: recoveryMode === "required-resource" || recoveryMode === "canonical-btm",
      blocksStandardCompletion: recoveryMode === "required-resource" || recoveryMode === "canonical-btm",
    },
  };
}

export const ACTIVE_EXECUTABLE_ROUTING_CONTRACTS = REVIEWED_ACTIVE_ITEMS.map(buildContract);
export const ACTIVE_EXECUTABLE_ROUTING_CONTRACTS_BY_ID: Readonly<Record<string, ExecutableRoutingContract>> = Object.freeze(Object.fromEntries(ACTIVE_EXECUTABLE_ROUTING_CONTRACTS.map((contract) => [contract.bankItemId, contract])));

export function validateExecutableRoutingContractInventory(): string[] {
  const issues: string[] = [];
  const active = [...MAPPING_ITEMS, ...DEEPENING_ITEMS];
  const activeIds = new Set(active.map((item) => item.bankItemId));
  const seen = new Set<string>();
  if (MAPPING_ITEMS.length !== 34) issues.push(`Expected 34 Mapping items; found ${MAPPING_ITEMS.length}.`);
  if (DEEPENING_ITEMS.length !== 27) issues.push(`Expected 27 Deepening items; found ${DEEPENING_ITEMS.length}.`);
  if (ACTIVE_EXECUTABLE_ROUTING_CONTRACTS.length !== active.length) issues.push(`Expected ${active.length} routing contracts; found ${ACTIVE_EXECUTABLE_ROUTING_CONTRACTS.length}.`);
  for (const contract of ACTIVE_EXECUTABLE_ROUTING_CONTRACTS) {
    if (seen.has(contract.bankItemId)) issues.push(`Duplicate routing contract ${contract.bankItemId}.`);
    seen.add(contract.bankItemId);
    if (!activeIds.has(contract.bankItemId)) issues.push(`Inactive routing contract ${contract.bankItemId}.`);
    if (contract.compilation !== "compiled" || contract.eligibilityCompilation !== "compiled" || contract.branchCompilation !== "compiled" || contract.recoveryCompilation !== "compiled") issues.push(`Routing surface is not compiled for ${contract.bankItemId}.`);
    if (contract.uncompiledFragments.length > 0) issues.push(`Routing surface has uncompiled fragments for ${contract.bankItemId}.`);
    if (!/^[a-f0-9]{64}$/u.test(contract.provenance.authoredBlockSha256)) issues.push(`Invalid authored hash for ${contract.bankItemId}.`);
    for (const target of [...contract.branches.declaredTargetBankItemIds, ...contract.recovery.preferredBankItemIds]) if (!getBankItem(target)) issues.push(`${contract.bankItemId} targets missing item ${target}.`);
  }
  for (const item of active) if (!seen.has(item.bankItemId)) issues.push(`Missing routing contract ${item.bankItemId}.`);
  return issues;
}

export function assertExecutableRoutingContractInventory(): void {
  const issues = validateExecutableRoutingContractInventory();
  if (issues.length > 0) throw new Error(`Invalid ${EXECUTABLE_ROUTING_CONTRACT_VERSION} inventory:\n${issues.join("\n")}`);
}

export function assertAuthoredRoutingSurfaceBindings(items: readonly {
  readonly bankItemId: BankItemId;
  readonly version: string;
  readonly sourcePath: string;
  readonly sourceLine: number;
  readonly authoredContentSha256: string;
}[]): void {
  const byId = new Map(items.map((item) => [item.bankItemId, item]));
  const issues: string[] = [];
  for (const contract of ACTIVE_EXECUTABLE_ROUTING_CONTRACTS) {
    const item = byId.get(contract.bankItemId);
    if (!item) { issues.push(`Canonical source block missing for ${contract.bankItemId}.`); continue; }
    if (item.version !== contract.bankItemVersion) issues.push(`${contract.bankItemId} version drift: ${item.version} != ${contract.bankItemVersion}.`);
    if (item.sourcePath !== contract.provenance.sourcePath || item.sourceLine !== contract.provenance.sourceLine) issues.push(`${contract.bankItemId} provenance location drift.`);
    if (item.authoredContentSha256 !== contract.provenance.authoredBlockSha256) issues.push(`${contract.bankItemId} authored eligibility/branch/recovery surface drift.`);
  }
  if (issues.length > 0) throw new Error(`Invalid ${EXECUTABLE_ROUTING_CONTRACT_VERSION} source binding:\n${issues.join("\n")}`);
}

assertExecutableRoutingContractInventory();
