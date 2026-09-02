import { redirect } from "next/navigation";
import styles from "./reports.module.css";

export default async function ReportsLanding({ searchParams }: { readonly searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  if (params.token) redirect(`/reports/consume?token=${encodeURIComponent(params.token)}`);
  return <main className={styles.shell}><section className={styles.empty}><p className={styles.eyebrow}>PATTERNWORK</p><h1>Secure reports</h1><p>{params.error ? "This secure link is invalid, expired, or has already been used." : "Use the secure link sent to your email, or return from your active assessment session."}</p></section></main>;
}
