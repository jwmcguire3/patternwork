import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import type { NotificationType } from "../lib/server/notifications/types.ts";

export interface StatusNotificationProps {
  readonly type: NotificationType;
  readonly actionUrl: string;
}

const copy: Record<NotificationType, { readonly subject: string; readonly heading: string; readonly body: string; readonly button: string }> = {
  RESUME_LINK: { subject: "Resume your Patternwork assessment", heading: "Your secure resume link", body: "Use the button below to return to your assessment.", button: "Resume assessment" },
  EXPORT_LINK: { subject: "Your secure Patternwork response export link", heading: "Your secure response export link", body: "Use the button below to authorize a response export for 24 hours. The email does not contain your responses or private notes.", button: "Authorize response export" },
  REPORT_STARTED: { subject: "Your Patternwork report is being prepared", heading: "Your report is being prepared", body: "We will email you when it is ready to view.", button: "Open Patternwork" },
  REPORT_FAILED: { subject: "Update on your Patternwork report", heading: "Your report needs attention", body: "We were unable to finish preparing your report. Please use the secure link to return to Patternwork.", button: "Open Patternwork" },
};

export default function StatusNotification({ type, actionUrl }: StatusNotificationProps) {
  const message = copy[type];
  return <Html><Head /><Preview>{message.subject}</Preview><Body style={{ backgroundColor: "#f2f5f3", color: "#25313a", fontFamily: "Arial, sans-serif", padding: "28px 12px" }}><Container style={{ backgroundColor: "white", border: "1px solid #dfe7e2", borderRadius: 12, margin: "0 auto", maxWidth: 560, padding: 34 }}><Text style={{ color: "#52716a", fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>PATTERNWORK</Text><Heading style={{ fontSize: 24 }}>{message.heading}</Heading><Text>{message.body}</Text><Button href={actionUrl} style={{ backgroundColor: "#315f66", borderRadius: 8, color: "white", fontWeight: 700, padding: "13px 20px", textDecoration: "none" }}>{message.button}</Button><Text style={{ color: "#65737b", fontSize: 12 }}>If you did not request this email, you can ignore it.</Text></Container></Body></Html>;
}
