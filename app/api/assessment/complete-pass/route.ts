import { NextRequest, NextResponse } from "next/server";
import { completeAssessmentPass } from "@/lib/server/assessment";
import { assessmentErrorStatus, authenticatedAssessmentSessionId } from "@/lib/server/assessment/http";
import { AssessmentError } from "@/lib/server/assessment/errors";

export async function POST(request: NextRequest) {
  let body: { expectedRevision?: unknown; completedPass?: unknown; action?: unknown; optedInTopics?: unknown; focusOccurrenceRefs?: unknown; detailPermissions?: unknown; comparisonDecisions?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");
  const comparisonDecisions = (value: unknown): value is { firstRef: string; secondRef: string; relation: "different" | "same" | "cannot_tell" }[] => Array.isArray(value) && value.every((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry)
    && Object.keys(entry).sort().join("\u0000") === ["firstRef", "relation", "secondRef"].join("\u0000")
    && typeof (entry as Record<string, unknown>).firstRef === "string"
    && typeof (entry as Record<string, unknown>).secondRef === "string"
    && ["different", "same", "cannot_tell"].includes(String((entry as Record<string, unknown>).relation)));
  if (!Number.isInteger(body.expectedRevision) || ![1, 2].includes(Number(body.completedPass)) || (body.action !== undefined && !["finish", "continue", "end"].includes(String(body.action)))
    || (body.optedInTopics !== undefined && !stringArray(body.optedInTopics))
    || (body.focusOccurrenceRefs !== undefined && !stringArray(body.focusOccurrenceRefs))
    || (body.detailPermissions !== undefined && !stringArray(body.detailPermissions))
    || (body.comparisonDecisions !== undefined && !comparisonDecisions(body.comparisonDecisions))) return NextResponse.json({ error: "Revision, completed pass, and pass-two context must follow the request contract." }, { status: 400 });
  try {
    const result = await completeAssessmentPass(authenticatedAssessmentSessionId(request), {
      expectedRevision: body.expectedRevision as number,
      completedPass: body.completedPass as 1 | 2,
      action: body.action as "finish" | "continue" | "end" | undefined,
      optedInTopics: body.optedInTopics as string[] | undefined,
      focusOccurrenceRefs: body.focusOccurrenceRefs as string[] | undefined,
      detailPermissions: body.detailPermissions as string[] | undefined,
      comparisonDecisions: body.comparisonDecisions as { firstRef: string; secondRef: string; relation: "different" | "same" | "cannot_tell" }[] | undefined,
    });
    return NextResponse.json({ ...result, assessmentId: result.state.sessionId, reportReadyUrl: result.state.reportReadyUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AssessmentError ? error.message : "Report preparation is temporarily unavailable. Your answers remain saved; please try again later." }, { status: assessmentErrorStatus(error) });
  }
}
