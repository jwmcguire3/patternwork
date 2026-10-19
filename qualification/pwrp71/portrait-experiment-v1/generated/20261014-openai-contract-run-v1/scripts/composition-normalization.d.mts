export function normalizeCompositionForPwrp71(input: {
  profile: string;
  composition: unknown;
  interpretation: unknown;
  schema: unknown;
  packetSha256: string;
  compositionSha256: string;
  interpretationSha256: string;
}): {
  claims: Record<string, unknown>[];
  nameRegistry: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
  reflectionQuestions: string[];
  contentStatus: "complete" | "insufficient_evidence";
  receipt: Record<string, unknown>;
};
