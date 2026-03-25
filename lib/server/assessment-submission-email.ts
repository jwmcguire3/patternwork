import { Resend } from "resend";

const INTERNAL_TO_EMAIL = "map@patternwork.io";
const DEFAULT_FROM_EMAIL = "Patternwork <onboarding@resend.dev>";

export type AssessmentSubmissionEmailInput = {
  userEmail: string;
  submissionTimestampIso: string;
  answeredCount?: number;
  log: string;
  answers?: unknown;
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable answers payload]";
  }
}

function buildEmailText({
  userEmail,
  submissionTimestampIso,
  answeredCount,
  log,
  answers,
}: AssessmentSubmissionEmailInput): string {
  const sections = [
    "New Patternwork assessment submission",
    "",
    `Submitted email: ${userEmail}`,
    `Submitted at: ${submissionTimestampIso}`,
    `Answered count: ${typeof answeredCount === "number" ? answeredCount : "N/A"}`,
    "",
    "SELFMAP / assessment log:",
    "----------------------------------------",
    log,
    "----------------------------------------",
  ];

  if (answers && typeof answers === "object") {
    sections.push(
      "",
      "Answers JSON (debug):",
      "----------------------------------------",
      safeJson(answers),
      "----------------------------------------"
    );
  }

  return sections.join("\n");
}

export async function sendAssessmentSubmissionEmail(
  input: AssessmentSubmissionEmailInput
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM || DEFAULT_FROM_EMAIL;
  const subject = `New assessment submission • ${input.userEmail}`;

  await resend.emails.send({
    from,
    to: INTERNAL_TO_EMAIL,
    subject,
    text: buildEmailText(input),
  });
}
