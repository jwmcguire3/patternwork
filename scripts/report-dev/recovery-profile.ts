import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2 } from "../../lib/server/openrouter/policy.ts";

/** Separate run policy: never changes the inference candidate, source, or ordinary continuation. */
export const REPORT_DEV_BOUNDED_STRUCTURE_RECOVERY_V1 = Object.freeze({
 id:"report-dev-luna-high-128k-bounded-structure-v1",
 candidateId:REPORT_DEV_LUNA_HIGH_128K_CANDIDATE_V2.id,
 sourceMode:"generate",
 semanticRepairLimit:1,
 structuralCorrectionLimit:1,
 freshFullReviewLimit:1,
 maximumAggregateMicros:250_000,
 maximumPerCallMicros:500_000,
 failurePolicy:"terminal-no-further-recovery",
} as const);
export function recoveryProfileBinding(id:string) {
 if(id!==REPORT_DEV_BOUNDED_STRUCTURE_RECOVERY_V1.id)throw new Error("Unknown fixed report-dev recovery profile.");
 return {recoveryProfile:REPORT_DEV_BOUNDED_STRUCTURE_RECOVERY_V1,recoveryProfileSha256:sha256Canonical(REPORT_DEV_BOUNDED_STRUCTURE_RECOVERY_V1)};
}
export interface RecoverySource { readonly sourceRunDirectory:string; readonly outputRoot:string; }
