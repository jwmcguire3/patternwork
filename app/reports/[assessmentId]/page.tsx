import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ASSESSMENT_SESSION_COOKIE } from "@/lib/server/security";
import { authorizedSessionFromCookies, loadActiveReportSets, loadReportProgress, REPORT_VIEW_COOKIE } from "../_server/access";
import { DeleteAssessmentButton } from "./delete-assessment";
import styles from "../reports.module.css";

const labels: Readonly<Record<string, string>> = { MAP: "Mapping Summary", IFS: "IFS Report", PV: "Polyvagal Report", ATT: "Attachment Report", SYNTHESIS: "Synthesis Report" };

export default async function ReportBundlePage({ params }: { readonly params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  const jar = await cookies();
  const authorized = authorizedSessionFromCookies({ assessment: jar.get(ASSESSMENT_SESSION_COOKIE)?.value, report: jar.get(REPORT_VIEW_COOKIE)?.value });
  if (!authorized || authorized !== assessmentId) notFound();
  const [sets, progress] = await Promise.all([loadActiveReportSets(assessmentId), loadReportProgress(assessmentId)]);
  return <main className={styles.shell}>
    <header className={styles.header}><div><p className={styles.eyebrow}>PATTERNWORK</p><h1>Your report bundle</h1><p>Validated, descriptive reflections from your completed assessment.</p></div></header>
    {progress.failed ? <section className={styles.empty}><h2>We could not finish one report set</h2><p>No partial set was released or emailed. You can safely return later or request a new secure link after support retries generation.</p></section> : null}
    {sets.length === 0 && !progress.failed ? <section className={styles.empty}><h2>{progress.generating ? "Your reports are being prepared" : "No complete report set is available yet"}</h2><p>Refresh this page later. A report set appears only after every PDF in that set has passed validation.</p></section> : sets.map((set) => <section className={styles.set} key={set.snapshotId}>
      <h2>{set.completedPass === 1 ? "Pass 1 — Mapping Summary" : "Pass 2 — Complete reports"}</h2>
      {set.artifacts.map((artifact) => <article className={styles.report} id={artifact.reportId} key={artifact.reportId}>
        <div className={styles.reportHeading}><h3>{labels[artifact.reportType] ?? artifact.reportType}</h3><a href={`/api/reports/download/${encodeURIComponent(assessmentId)}/${encodeURIComponent(artifact.reportId)}`}>Download PDF</a></div>
        <div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{artifact.markdown}</ReactMarkdown></div>
      </article>)}
    </section>)}
    <footer className={styles.danger}><h2>Privacy controls</h2><p>You can permanently remove the assessment, responses, reports, PDFs, links, and delivery records.</p><DeleteAssessmentButton /></footer>
  </main>;
}
