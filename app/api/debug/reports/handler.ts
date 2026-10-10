import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { prisma } from "../../../../lib/prisma.ts";
import { authorizeDebugRequest, debugAuthorizationResponse } from "../../../../lib/server/debug/auth.ts";
import { OPENROUTER_SITE_MODEL } from "../../../../lib/server/openrouter/policy.ts";
import { assertDebugProfileEligible, DEBUG_PROFILE_IDS, DEBUG_REPORT_MODES, listDebugProfileAvailability, type DebugReportMode, type DebugReportRunInput } from "../../../../lib/server/debug/report-runner.ts";
import { debugReportWorkflow } from "../../../../workflows/debug-report.ts";

const NO_STORE = { "cache-control": "no-store, private", "x-robots-tag": "noindex, nofollow, noarchive" };
const MAX_ACTIVE_RUNS = 3;

export async function GET(request: Request): Promise<Response> {
  const unauthorized = debugAuthorizationResponse(authorizeDebugRequest(request));
  if (unauthorized) return unauthorized;
  try {
    const runs = await prisma.patternworkDebugReportRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, profileId: true, mode: true, status: true, phase: true, progressNote: true, requestedModel: true, reasoningEffort: true, totalCostMicros: true, heartbeatAt: true, createdAt: true, completedAt: true, failureCode: true },
    });
    const profiles = await listDebugProfileAvailability();
    return NextResponse.json({ runs: runs.map((run) => ({ ...run, totalCostMicros: run.totalCostMicros.toString() })), profiles }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Debug report runs could not be loaded." }, { status: 503, headers: NO_STORE });
  }
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = debugAuthorizationResponse(authorizeDebugRequest(request));
  if (unauthorized) return unauthorized;
  let body: { profileId?: unknown; mode?: unknown };
  try { body = await request.json() as { profileId?: unknown; mode?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE }); }
  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  if (!DEBUG_PROFILE_IDS.includes(profileId) || typeof body.mode !== "string" || !DEBUG_REPORT_MODES.includes(body.mode as DebugReportMode)) {
    return NextResponse.json({ error: "Choose an authored PWRP 7.1 profile and a supported report set." }, { status: 400, headers: NO_STORE });
  }
  const mode = body.mode as DebugReportMode;

  try {
    await assertDebugProfileEligible(profileId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Routing qualification is pending for this profile.";
    const pending = message.startsWith("debug_router_qualification_pending:");
    return NextResponse.json({ error: message.replace(/^debug_router_qualification_pending:[^:]+:/u, "") }, { status: pending ? 409 : 503, headers: NO_STORE });
  }

  if (!process.env.OPENROUTER_API_KEY) return NextResponse.json({ error: "OpenRouter is not configured." }, { status: 503, headers: NO_STORE });
  const cap = Number(process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD);
  if (!Number.isFinite(cap) || cap <= 0) return NextResponse.json({ error: "The OpenRouter cost cap is not configured." }, { status: 503, headers: NO_STORE });

  try {
    const active = await prisma.patternworkDebugReportRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } });
    if (active >= MAX_ACTIVE_RUNS) return NextResponse.json({ error: "Three debug report runs are already active. Wait for one to finish." }, { status: 429, headers: NO_STORE });

    const runId = randomUUID();
    const record = await prisma.patternworkDebugReportRun.create({
      data: {
        id: runId,
        profileId,
        mode,
        requestedModel: OPENROUTER_SITE_MODEL,
        reasoningEffort: "max",
      },
      select: { id: true, profileId: true, mode: true, status: true, phase: true, progressNote: true, createdAt: true },
    });
    try {
      const workflow = await start(debugReportWorkflow, [{ runId, profileId, mode } satisfies DebugReportRunInput]);
      await prisma.patternworkDebugReportRun.update({ where: { id: runId }, data: { workflowRunId: workflow.runId } });
      return NextResponse.json({ run: record, workflowRunId: workflow.runId }, { status: 202, headers: NO_STORE });
    } catch {
      await prisma.patternworkDebugReportRun.update({
        where: { id: runId },
        data: { status: "FAILED", phase: "COMPLETE", progressNote: "The workflow could not be started.", failureCode: "ENQUEUE_FAILED", completedAt: new Date(), heartbeatAt: new Date() },
      });
      return NextResponse.json({ error: "The report workflow could not be started." }, { status: 503, headers: NO_STORE });
    }
  } catch {
    return NextResponse.json({ error: "Unable to create a debug report run." }, { status: 503, headers: NO_STORE });
  }
}
