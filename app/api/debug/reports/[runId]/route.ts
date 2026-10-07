import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma.ts";
import { authorizeDebugRequest, debugAuthorizationResponse } from "../../../../../lib/server/debug/auth.ts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store, private", "x-robots-tag": "noindex, nofollow, noarchive" };

export async function GET(request: Request, context: { readonly params: Promise<{ runId: string }> }): Promise<Response> {
  const unauthorized = debugAuthorizationResponse(authorizeDebugRequest(request));
  if (unauthorized) return unauthorized;
  const { runId } = await context.params;
  try {
    const run = await prisma.patternworkDebugReportRun.findUnique({ where: { id: runId } });
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404, headers: NO_STORE });
    return NextResponse.json({
      id: run.id,
      profileId: run.profileId,
      mode: run.mode,
      status: run.status,
      phase: run.phase,
      progressNote: run.progressNote,
      requestedModel: run.requestedModel,
      reasoningEffort: run.reasoningEffort,
      totalCostMicros: run.totalCostMicros.toString(),
      totalCostUsd: Number(run.totalCostMicros) / 1_000_000,
      result: run.resultJson,
      failureCode: run.failureCode,
      heartbeatAt: run.heartbeatAt,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Run status could not be loaded." }, { status: 503, headers: NO_STORE });
  }
}
