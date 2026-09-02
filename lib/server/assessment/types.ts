import type { AssessmentStage, BankItemId, InteractionFamilyCode, JsonValue } from "@/lib/question-engine/types";

export type AssessmentPass = 1 | 2;
export type CompletionState = "PARTIAL" | "COMPLETED" | "SKIPPED";
export type UserArousal = "low" | "unknown" | "elevated" | "high";
export type InteractionForm = "recall" | "map" | "sort" | "rank" | "threshold" | "text" | "resource";

export interface InteractionViewModel {
  readonly interactionInstanceId: string;
  readonly bankItemId: BankItemId;
  readonly bankItemVersion: string;
  readonly family: InteractionFamilyCode;
  readonly title: string;
  readonly stage: AssessmentStage;
  readonly pass: AssessmentPass;
  readonly administrationSequence: number;
  readonly form: InteractionForm;
  readonly intensity: 0 | 1 | 2 | 3;
  readonly canSkip: true;
  readonly canPause: true;
  readonly routeReason: string;
  readonly authored?: {
    readonly prompt: string;
    readonly mechanic: string;
    readonly eligibility: string;
    readonly burden: { readonly authored: string; readonly label?: string; readonly numericIntensity?: number };
    readonly optionGroups: readonly { readonly groupId: string; readonly label: string; readonly options: readonly { readonly optionId?: string; readonly label: string; readonly authored: string }[] }[];
    readonly responseLibraries: readonly { readonly libraryId: string; readonly title: string; readonly options: readonly { readonly optionId: string; readonly label: string }[] }[];
    readonly limits: string;
    readonly recovery: string;
  };
}

export interface CompletedInteraction {
  readonly interactionInstanceId: string;
  readonly bankItemId: BankItemId;
  readonly family: InteractionFamilyCode;
  readonly stage: AssessmentStage;
  readonly form: InteractionForm;
  readonly intensity: 0 | 1 | 2 | 3;
  readonly completionState: Exclude<CompletionState, "PARTIAL">;
  readonly resourceOrOrdinary: boolean;
}

export interface AssessmentRoutingState {
  readonly schemaVersion: "PWAS-1";
  readonly pass: AssessmentPass;
  readonly stage: AssessmentStage;
  readonly administrationSequence: number;
  readonly currentInteraction: InteractionViewModel | null;
  readonly completedInteractions: readonly CompletedInteraction[];
  readonly recentFamilies: readonly InteractionFamilyCode[];
  readonly recentForms: readonly InteractionForm[];
  readonly consecutiveHighIntensity: number;
  readonly pendingBtmTransition: boolean;
  readonly requiresLowIntensityAfterRre: boolean;
  readonly skipCounts: Readonly<Partial<Record<InteractionFamilyCode, number>>>;
  readonly userArousal: UserArousal;
  readonly safeResumeStage: AssessmentStage;
  readonly mappingCompleted: boolean;
  readonly deepeningCompleted: boolean;
  readonly fitCompleted: boolean;
  readonly coverage: {
    readonly directSamples: number;
    readonly domains: readonly string[];
    readonly horizons: readonly string[];
    readonly ifsDirect: number;
    readonly pvDirect: number;
    readonly attachmentDirect: number;
    readonly mappingGate: "red" | "amber" | "green";
    readonly deepeningGate: "red" | "amber" | "green";
  };
  readonly endingSatisfied: boolean;
  readonly paused: boolean;
  readonly routeTrace: readonly { readonly selectedBankItemId: BankItemId; readonly reason: string }[];
}

export interface AssessmentResponseInput {
  readonly interactionInstanceId: string;
  readonly bankItemId?: BankItemId;
  readonly completionState: CompletionState;
  readonly response?: JsonValue;
  readonly responseOrder?: readonly string[];
  readonly userArousal?: UserArousal;
  readonly unsafeContext?: boolean;
}

export interface AssessmentStateView {
  readonly sessionId: string;
  readonly status: "IN_PROGRESS" | "PASS1_COMPLETE" | "PASS2_IN_PROGRESS" | "COMPLETE" | "PAUSED";
  readonly revision: number;
  readonly pass: AssessmentPass;
  readonly stage: AssessmentStage;
  readonly safeResumeStage: AssessmentStage;
  readonly currentInteraction: InteractionViewModel | null;
  readonly canCompletePass: boolean;
  readonly canPause: boolean;
  readonly completedCount: number;
  readonly currentResponse?: { readonly completionState: CompletionState; readonly response: JsonValue; readonly responseOrder: readonly string[] } | null;
  readonly reportStatus?: "NOT_STARTED" | "GENERATING" | "READY" | "FAILED";
  readonly reportReadyUrl?: string | null;
}
