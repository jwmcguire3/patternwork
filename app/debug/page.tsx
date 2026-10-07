import type { Metadata } from "next";
import DebugClient from "./debug-client";
import styles from "./debug.module.css";

export const metadata: Metadata = {
  title: "Debug | Patternwork",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default function DebugPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <p className={styles.kicker}>Operator workspace</p>
        <h1>Debug</h1>
        <p className={styles.lede}>Read-only database health, report queue overview, and isolated report drafts from the nine fictional profiles.</p>
        <DebugClient />
      </div>
    </main>
  );
}
