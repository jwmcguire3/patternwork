import type { ApiRouteDefinition } from "@/lib/server/api-dispatch";
import { createApiDispatcher, withApiParams } from "@/lib/server/api-dispatch";
import * as assessment from "../assessment/handler";
import * as assessmentCompletePass from "../assessment/complete-pass/handler";
import * as assessmentControl from "../assessment/control/handler";
import * as assessmentPause from "../assessment/pause/handler";
import * as assessmentReplayBinding from "../assessment/replay-binding/handler";
import * as assessmentResendResume from "../assessment/resend-resume/handler";
import * as assessmentResponse from "../assessment/response/handler";
import * as assessmentResume from "../assessment/resume/handler";
import * as assessmentStart from "../assessment/start/handler";
import * as assessmentState from "../assessment/state/handler";
import * as retention from "../cron/assessment-retention/handler";
import * as debugOverview from "../debug/overview/handler";
import * as debugReports from "../debug/reports/handler";
import * as debugReportRun from "../debug/reports/[runId]/handler";
import * as reportArtifacts from "../reports/artifacts/[assessmentId]/[reportId]/handler";
import * as reportDownload from "../reports/download/[assessmentId]/[reportId]/handler";
import * as reportRequestLink from "../reports/request-link/handler";
import * as reportRetry from "../reports/retry/handler";
import * as reportStatus from "../reports/status/handler";
import * as resendWebhook from "../resend-webhook/handler";
import * as responseExportRequestLink from "../response-exports/request-link/handler";
import * as responseExportAlias from "../response-exports/[assessmentId]/handler";
import * as responseExportJson from "../response-exports/[assessmentId]/responses.json/handler";
import * as responseExportPdf from "../response-exports/[assessmentId]/responses.pdf/handler";
import * as saveAssessment from "../save-assessment/handler";
import * as selfmapProgress from "../selfmap-progress/handler";

export const dynamic = "force-dynamic";

const routes: readonly ApiRouteDefinition[] = [
  { pattern: ["assessment"], handlers: { DELETE: (request) => assessment.DELETE(request) } },
  { pattern: ["assessment", "complete-pass"], handlers: { POST: (request) => assessmentCompletePass.POST(request) } },
  { pattern: ["assessment", "control"], handlers: { POST: (request) => assessmentControl.POST(request) } },
  { pattern: ["assessment", "pause"], handlers: { POST: (request) => assessmentPause.POST(request) } },
  { pattern: ["assessment", "replay-binding"], handlers: { POST: (request) => assessmentReplayBinding.POST(request) } },
  { pattern: ["assessment", "resend-resume"], handlers: { POST: (request) => assessmentResendResume.POST(request) } },
  { pattern: ["assessment", "response"], handlers: { PUT: (request) => assessmentResponse.PUT(request) } },
  { pattern: ["assessment", "resume"], handlers: { GET: (request) => assessmentResume.GET(request) } },
  { pattern: ["assessment", "start"], handlers: { POST: (request) => assessmentStart.POST(request) } },
  { pattern: ["assessment", "state"], handlers: { GET: (request) => assessmentState.GET(request) } },
  { pattern: ["cron", "assessment-retention"], handlers: { GET: (request) => retention.GET(request) } },
  { pattern: ["debug", "overview"], handlers: { GET: (request) => debugOverview.GET(request) } },
  {
    pattern: ["debug", "reports"],
    handlers: {
      GET: (request) => debugReports.GET(request),
      POST: (request) => debugReports.POST(request),
    },
  },
  {
    pattern: ["debug", "reports", ":runId"],
    handlers: {
      GET: withApiParams<{ runId: string }>((request, context) => debugReportRun.GET(request, context)),
    },
  },
  {
    pattern: ["reports", "artifacts", ":assessmentId", ":reportId"],
    handlers: {
      GET: withApiParams<{ assessmentId: string; reportId: string }>((request, context) => reportArtifacts.GET(request, context)),
    },
  },
  {
    pattern: ["reports", "download", ":assessmentId", ":reportId"],
    handlers: {
      GET: withApiParams<{ assessmentId: string; reportId: string }>((request, context) => reportDownload.GET(request, context)),
    },
  },
  { pattern: ["reports", "request-link"], handlers: { POST: (request) => reportRequestLink.POST(request) } },
  { pattern: ["reports", "retry"], handlers: { POST: (request) => reportRetry.POST(request) } },
  { pattern: ["reports", "status"], handlers: { GET: (request) => reportStatus.GET(request) } },
  { pattern: ["resend-webhook"], handlers: { POST: (request) => resendWebhook.POST(request) } },
  { pattern: ["response-exports", "request-link"], handlers: { POST: (request) => responseExportRequestLink.POST(request) } },
  {
    pattern: ["response-exports", ":assessmentId"],
    handlers: {
      GET: withApiParams<{ assessmentId: string }>((request, context) => responseExportAlias.GET(request, context)),
    },
  },
  {
    pattern: ["response-exports", ":assessmentId", "responses.json"],
    handlers: {
      GET: withApiParams<{ assessmentId: string }>((request, context) => responseExportJson.GET(request, context)),
    },
  },
  {
    pattern: ["response-exports", ":assessmentId", "responses.pdf"],
    handlers: {
      GET: withApiParams<{ assessmentId: string }>((request, context) => responseExportPdf.GET(request, context)),
    },
  },
  { pattern: ["save-assessment"], handlers: { POST: (request) => saveAssessment.POST(request) } },
  {
    pattern: ["selfmap-progress"],
    handlers: {
      GET: () => selfmapProgress.GET(),
      POST: (request) => selfmapProgress.POST(request),
    },
  },
];

const dispatch = createApiDispatcher(routes);

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
export const PATCH = dispatch;
export const OPTIONS = dispatch;
