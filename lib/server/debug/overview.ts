import { prisma } from "../../prisma.ts";
import { activateReviewedPwqe5QualificationManifest, OPENROUTER_SITE_MODEL, QUALIFICATION_MODEL_ORDER } from "../openrouter/policy.ts";

function countMap(rows: readonly { status: string; _count: { _all: number } }[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

export async function loadDebugOverview(): Promise<Record<string, unknown>> {
  await prisma.$queryRaw`SELECT 1`;
  const [sessions, responses, snapshots, reportRuns, reportArtifacts, reportAttempts, activeAttemptStatuses, debugRuns, debugRunStatuses] = await Promise.all([
    prisma.patternworkV31AssessmentSession.count(),
    prisma.patternworkV31AssessmentResponse.count(),
    prisma.patternworkV31AssessmentSnapshot.count(),
    prisma.patternworkV31ReportRun.count(),
    prisma.patternworkV31ReportArtifact.count(),
    prisma.patternworkV31ReportWorkflowAttempt.count(),
    prisma.patternworkV31ReportWorkflowAttempt.groupBy({
      by: ["status"],
      where: { status: { in: ["QUEUED", "RUNNING", "STALLED"] } },
      _count: { _all: true },
    }),
    prisma.patternworkDebugReportRun.count(),
    prisma.patternworkDebugReportRun.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  let productionModelStatus = "Needs a new reviewed qualification manifest.";
  try {
    const activation = activateReviewedPwqe5QualificationManifest(
      process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON,
      process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256,
    );
    const allPinsMatch = Object.values(activation.policy).every((pin) => pin.model === OPENROUTER_SITE_MODEL && pin.reasoningEffort === "max");
    productionModelStatus = allPinsMatch ? "Activated: GPT-6 Luna · max" : "Configured manifest is not pinned to GPT-6 Luna · max.";
  } catch {
    productionModelStatus = "Not activated: new provider qualification and review are required.";
  }

  return {
    database: "connected",
    counts: { sessions, responses, snapshots, reportRuns, reportArtifacts, reportAttempts, debugRuns },
    activeReportAttempts: countMap(activeAttemptStatuses),
    debugRunsByStatus: countMap(debugRunStatuses),
    openRouter: {
      requestedModel: OPENROUTER_SITE_MODEL,
      reasoningEffort: "max",
      candidateCount: QUALIFICATION_MODEL_ORDER.length,
      apiKeyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      productionModelStatus,
    },
    observedAt: new Date().toISOString(),
  };
}
