import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { productionProviderBudget } from "./provider-factory.ts";
import { resolveOpenRouterTimeoutMs } from "../openrouter/client.ts";
import { prisma } from "../../prisma.ts";
import { cookieKeyringFromEnv, encryptionKeyringFromEnv } from "../security/index.ts";

const execFileAsync = promisify(execFile);

export interface ReportPreflightResult {
  readonly ok: boolean;
  readonly checks: readonly { readonly name: string; readonly ok: boolean; readonly message: string }[];
}

const DELIVERY_ONLY_CHECKS = new Set(["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_FROM", "REPORT_BCC_EMAIL", "public-app-url"]);

/** Delivery failures remain observable but must never block valid report artifacts. */
export function reportGenerationReadiness(result: ReportPreflightResult): ReportPreflightResult {
  const generationChecks = result.checks.filter((check) => !DELIVERY_ONLY_CHECKS.has(check.name));
  return { ok: generationChecks.every((check) => check.ok), checks: generationChecks };
}

export async function runReportPreflight(_workspaceRoot?: string, databaseCheck: () => Promise<void> = async () => {
  await prisma.patternworkV31AssessmentSnapshot.count({ take: 1 });
  await prisma.patternworkV31ReportWorkflowAttempt.count({ take: 1 });
  await prisma.patternworkV31ReportProviderLedger.count({ take: 1 });
}): Promise<ReportPreflightResult> {
  const checks: Array<{ name: string; ok: boolean; message: string }> = [];
  const required = ["DATABASE_URL", "OPENROUTER_API_KEY", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_FROM", "REPORT_BCC_EMAIL"] as const;
  for (const name of required) checks.push({ name, ok: Boolean(process.env[name]?.trim()), message: process.env[name]?.trim() ? "configured" : "missing" });
  try { productionProviderBudget(); checks.push({ name: "OPENROUTER_MAX_COST_PER_ASSESSMENT_USD", ok: true, message: "valid aggregate and per-call limits" }); }
  catch { checks.push({ name: "OPENROUTER_MAX_COST_PER_ASSESSMENT_USD", ok: false, message: "aggregate/per-call limit is invalid" }); }
  try { resolveOpenRouterTimeoutMs(); checks.push({ name: "OPENROUTER_TIMEOUT_MS", ok: true, message: "valid complete-response deadline" }); }
  catch { checks.push({ name: "OPENROUTER_TIMEOUT_MS", ok: false, message: "complete-response deadline is invalid" }); }
  for (const [name, check] of [["encryption-keyring", encryptionKeyringFromEnv], ["assessment-cookie-keyring", cookieKeyringFromEnv]] as const) {
    try { check(); checks.push({ name, ok: true, message: "valid" }); }
    catch { checks.push({ name, ok: false, message: "missing or invalid" }); }
  }
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.PATTERNWORK_APP_URL;
  try {
    const url = new URL(rawUrl ?? "");
    const secure = url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname);
    checks.push({ name: "public-app-url", ok: secure, message: secure ? "valid" : "must use HTTPS" });
  } catch { checks.push({ name: "public-app-url", ok: false, message: "missing or invalid" }); }
  try { await databaseCheck(); checks.push({ name: "report-attempt-tables", ok: true, message: "migration ready" }); }
  catch { checks.push({ name: "report-attempt-tables", ok: false, message: "migration not ready" }); }
  checks.push(...await probeReportPdfTools());
  return { ok: checks.every((check) => check.ok), checks };
}

/** Probe the same explicitly selected text extractor used by the PDF renderer. */
export async function probeReportPdfTools(
  env: Readonly<Record<string, string | undefined>> = process.env,
  execute: (command: string, args: string[]) => Promise<unknown> = (command,args) => execFileAsync(command,args,{windowsHide:true,timeout:5_000}),
): Promise<ReportPreflightResult["checks"]> {
  const python=env.PDF_PYTHON_PATH?.trim();
  const tools = [
    python
      ? {name:"pdf-text-verifier",command:python,args:["-c","from pypdf import PdfReader"],setting:"PDF_PYTHON_PATH + pypdf"}
      : {name:"pdf-text-verifier",command:env.PDFTOTEXT_PATH?.trim()||"pdftotext",args:["-v"],setting:"PDFTOTEXT_PATH"},
    {name:"pdf-metadata-verifier",command:env.PDFINFO_PATH?.trim()||"pdfinfo",args:["-v"],setting:"PDFINFO_PATH"},
    {name:"pdf-raster-verifier",command:env.PDFTOPPM_PATH?.trim()||"pdftoppm",args:["-v"],setting:"PDFTOPPM_PATH"},
  ];
  const checks: {name:string;ok:boolean;message:string}[]=[];
  for(const tool of tools){
    try {await execute(tool.command,tool.args);checks.push({name:tool.name,ok:true,message:"available"});}
    catch {checks.push({name:tool.name,ok:false,message:`${tool.setting} is unavailable`});}
  }
  return checks;
}
