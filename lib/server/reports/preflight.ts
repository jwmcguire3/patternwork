import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertPwqe6ReportActivationReady } from "./pwqe6-readiness.ts";
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

export async function runReportPreflight(workspaceRoot?: string, databaseCheck: () => Promise<void> = async () => {
  await prisma.patternworkV31AssessmentSnapshot.count({ take: 1 });
  await prisma.patternworkV31ReportWorkflowAttempt.count({ take: 1 });
}): Promise<ReportPreflightResult> {
  const checks: Array<{ name: string; ok: boolean; message: string }> = [];
  const required = ["DATABASE_URL", "OPENROUTER_API_KEY", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_FROM", "REPORT_BCC_EMAIL"] as const;
  for (const name of required) checks.push({ name, ok: Boolean(process.env[name]?.trim()), message: process.env[name]?.trim() ? "configured" : "missing" });
  const cap = Number(process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD);
  checks.push({ name: "OPENROUTER_MAX_COST_PER_ASSESSMENT_USD", ok: Number.isFinite(cap) && cap > 0, message: Number.isFinite(cap) && cap > 0 ? "valid" : "must be a positive number" });
  try {
    const activation = await assertPwqe6ReportActivationReady({ workspaceRoot });
    checks.push({ name: "PWQE5-source-and-reviewed-activation", ok: true, message: `source ${activation.sourceManifestSha256}; qualification ${activation.qualificationManifestSha256}` });
  } catch (error) {
    checks.push({ name: "PWQE5-source-and-reviewed-activation", ok: false, message: error instanceof Error ? error.message : String(error) });
  }
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
  for (const [name, environmentName, fallback] of [
    ["pdf-text-verifier", "PDFTOTEXT_PATH", "pdftotext"],
    ["pdf-metadata-verifier", "PDFINFO_PATH", "pdfinfo"],
    ["pdf-raster-verifier", "PDFTOPPM_PATH", "pdftoppm"],
  ] as const) {
    const command = process.env[environmentName]?.trim() || fallback;
    try { await execFileAsync(command, ["-v"], { windowsHide: true, timeout: 5_000 }); checks.push({ name, ok: true, message: "available" }); }
    catch { checks.push({ name, ok: false, message: `${environmentName} is unavailable` }); }
  }
  return { ok: checks.every((check) => check.ok), checks };
}
