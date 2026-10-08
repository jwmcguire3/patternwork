"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./debug.module.css";

type Overview = {
  database: string;
  counts: Record<string, number>;
  activeReportAttempts: Record<string, number>;
  debugRunsByStatus: Record<string, number>;
  openRouter: {
    requestedModel: string;
    reasoningEffort: string;
    candidateCount: number;
    apiKeyConfigured: boolean;
    productionModelStatus: string;
  };
  observedAt: string;
};

type RecentRun = {
  id: string;
  profileId: string;
  mode: string;
  status: string;
  phase: string;
  progressNote: string;
  requestedModel: string;
  reasoningEffort: string;
  totalCostMicros: string;
  heartbeatAt: string;
  createdAt: string;
  completedAt: string | null;
  failureCode: string | null;
};

type ReportResult = {
  reportType: string;
  title: string;
  reportMarkdown: string;
  draft: Record<string, unknown>;
  reviewerReceipts: { verdict?: string; summary?: string }[];
  sourcePins: { questionSourceManifestSha256: string; reportSourceManifestSha256: string; packetSha256: string; routingQualificationSha256: string };
  usage: { model: string; costMicros: number; totalTokens: number; attempts: number };
};

type ActiveRun = RecentRun & {
  result: ReportResult[] | null;
  totalCostUsd: number;
  updatedAt: string;
};

type ProfileAvailability = { id: string; title: string; eligible: boolean; status: string; reason?: string };

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function money(micros: string | number): string {
  return `$${(Number(micros) / 1_000_000).toFixed(4)}`;
}

function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function DebugClient() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [runs, setRuns] = useState<RecentRun[]>([]);
  const [profiles, setProfiles] = useState<ProfileAvailability[]>([]);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [profileId, setProfileId] = useState("P01");
  const [mode, setMode] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState("");
  const [secondsToRefresh, setSecondsToRefresh] = useState(30);

  const api = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(path, { ...init, headers, cache: "no-store" });
    return responseJson<T>(response);
  }, [token]);

  const loadOverview = useCallback(async () => {
    const result = await api<Overview>("/api/debug/overview");
    setOverview(result);
    setLastCheckedAt(new Date().toISOString());
  }, [api]);

  const loadRecentRuns = useCallback(async () => {
    const result = await api<{ runs: RecentRun[]; profiles: ProfileAvailability[] }>("/api/debug/reports");
    setRuns(result.runs);
    setProfiles(result.profiles);
    if (!result.profiles.some((profile) => profile.id === profileId && profile.eligible)) {
      const firstEligible = result.profiles.find((profile) => profile.eligible);
      if (firstEligible) setProfileId(firstEligible.id);
    }
  }, [api, profileId]);

  const loadRun = useCallback(async (runId: string) => {
    const result = await api<ActiveRun>(`/api/debug/reports/${encodeURIComponent(runId)}`);
    setActiveRun(result);
    setLastCheckedAt(new Date().toISOString());
    setSecondsToRefresh(30);
    if (result.status === "SUCCEEDED" || result.status === "FAILED") {
      await loadRecentRuns();
      await loadOverview();
    }
  }, [api, loadOverview, loadRecentRuns]);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api<Overview>("/api/debug/overview");
      setOverview(result);
      const recent = await api<{ runs: RecentRun[]; profiles: ProfileAvailability[] }>("/api/debug/reports");
      setRuns(recent.runs);
      setProfiles(recent.profiles);
      const firstEligible = recent.profiles.find((profile) => profile.eligible);
      if (firstEligible) setProfileId(firstEligible.id);
      setConnected(true);
      setLastCheckedAt(new Date().toISOString());
    } catch (caught) {
      setConnected(false);
      setError(caught instanceof Error ? caught.message : "Unable to connect.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshAll() {
    setError("");
    try {
      await Promise.all([loadOverview(), loadRecentRuns()]);
      if (activeRun && (activeRun.status === "QUEUED" || activeRun.status === "RUNNING")) await loadRun(activeRun.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Refresh failed.");
    }
  }

  async function startRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api<{ run: RecentRun }>("/api/debug/reports", {
        method: "POST",
        body: JSON.stringify({ profileId, mode }),
      });
      setActiveRun({ ...result.run, result: [], totalCostUsd: 0, updatedAt: result.run.createdAt });
      await loadRecentRuns();
      await loadRun(result.run.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start report run.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!connected || !activeRun || (activeRun.status !== "QUEUED" && activeRun.status !== "RUNNING")) return;
    const countdown = window.setInterval(() => setSecondsToRefresh((remaining) => remaining <= 1 ? 30 : remaining - 1), 1_000);
    const poll = window.setInterval(() => { void loadRun(activeRun.id).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Status refresh failed.")); }, 30_000);
    return () => { window.clearInterval(countdown); window.clearInterval(poll); };
  }, [activeRun, connected, loadRun]);

  return (
    <div className={styles.workspace}>
      {!connected ? (
        <section className={styles.card}>
          <h2>Operator access</h2>
          <p>Enter the configured debug token. It stays in this tab’s memory and is sent only to the guarded debug APIs.</p>
          <form onSubmit={connect} className={styles.loginForm}>
            <label htmlFor="debug-token">Debug token</label>
            <input id="debug-token" type="password" autoComplete="current-password" value={token} onChange={(event) => setToken(event.target.value)} required />
            <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Connecting…" : "Open debug tools"}</button>
          </form>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </section>
      ) : (
        <>
          <section className={styles.topline}>
            <div><strong>Database</strong><span className={styles.status}>{overview?.database ?? "checking"}</span></div>
            <button type="button" className={styles.secondary} onClick={() => void refreshAll()}>Refresh data</button>
          </section>

          {overview && (
            <>
              <section className={styles.card}>
                <div className={styles.cardHeading}><div><p className={styles.kicker}>Read-only database overview</p><h2>Stored records</h2></div><span className={styles.muted}>Updated {dateTime(overview.observedAt)}</span></div>
                <div className={styles.metricGrid}>
                  {[
                    ["Assessment sessions", overview.counts.sessions],
                    ["Responses", overview.counts.responses],
                    ["Snapshots", overview.counts.snapshots],
                    ["Report runs", overview.counts.reportRuns],
                    ["Report artifacts", overview.counts.reportArtifacts],
                    ["Workflow attempts", overview.counts.reportAttempts],
                    ["Debug runs", overview.counts.debugRuns],
                  ].map(([label, count]) => <div className={styles.metric} key={label}><span>{label}</span><strong>{count}</strong></div>)}
                </div>
                <p className={styles.privacyNote}>This page exposes aggregate counts and debug-run drafts only. It does not expose respondent records, contact details, or arbitrary SQL access.</p>
              </section>

              <section className={styles.card}>
                <p className={styles.kicker}>OpenRouter configuration</p>
                <h2>{overview.openRouter.requestedModel} · {overview.openRouter.reasoningEffort}</h2>
                <div className={styles.configGrid}>
                  <span>API key</span><strong>{overview.openRouter.apiKeyConfigured ? "Configured" : "Missing"}</strong>
                  <span>Qualification lanes</span><strong>{overview.openRouter.candidateCount}</strong>
                  <span>Production reports</span><strong>{overview.openRouter.productionModelStatus}</strong>
                </div>
                <p className={styles.privacyNote}>Debug outputs are validated drafts. They are not released, emailed, or added to respondent assessment records.</p>
              </section>
            </>
          )}

          <section className={styles.card}>
            <p className={styles.kicker}>Fictional profile runner</p>
            <h2>Run report drafts</h2>
            <p>Choose one of the authored fictional profiles. Each run stays separate from assessment sessions and follows the selected report sequence.</p>
            <p className={styles.privacyNote}>Provider runs are enabled only for profiles whose exact packet is passed in final PWQE 5.1 routing qualification evidence. Pending profiles remain visible and cannot be run.</p>
            <form onSubmit={startRun} className={styles.runForm}>
              <label>Profile
                <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id} disabled={!profile.eligible}>{profile.id} · {profile.title}{profile.eligible ? "" : " · routing pending"}</option>)}
                </select>
              </label>
              <label>Report set
                <select value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="mapping">Mapping report</option>
                  <option value="ifs">IFS deepening report</option>
                  <option value="pv">PV deepening report</option>
                  <option value="att">ATT deepening report</option>
                  <option value="deepening">All three deepening reports</option>
                  <option value="all">All five reports, including synthesis</option>
                </select>
              </label>
              <button className={styles.primary} type="submit" disabled={busy || !overview?.openRouter.apiKeyConfigured || !profiles.some((profile) => profile.id === profileId && profile.eligible)}>{busy ? "Starting…" : "Start report run"}</button>
            </form>
            {!profiles.some((profile) => profile.eligible) && <p className={styles.error}>No profile is eligible yet. Complete final PWQE 5.1 routing qualification for the exact candidate packets.</p>}
            {!overview?.openRouter.apiKeyConfigured && <p className={styles.error}>Set OPENROUTER_API_KEY to run provider drafts.</p>}
          </section>

          {activeRun && (
            <section className={styles.card} aria-live="polite">
              <div className={styles.cardHeading}><div><p className={styles.kicker}>Current run · {activeRun.profileId}</p><h2>{activeRun.status}: {activeRun.phase}</h2></div><span className={`${styles.badge} ${activeRun.status === "FAILED" ? styles.failed : activeRun.status === "SUCCEEDED" ? styles.complete : styles.running}`}>{activeRun.status}</span></div>
              <p>{activeRun.progressNote}</p>
              {(activeRun.status === "QUEUED" || activeRun.status === "RUNNING") && <p className={styles.pollNote}>Next status refresh in {secondsToRefresh}s. Last checked {dateTime(lastCheckedAt)}. The page keeps showing elapsed-time feedback while OpenRouter is working.</p>}
              <div className={styles.runMeta}><span>Model: {activeRun.requestedModel} · {activeRun.reasoningEffort}</span><span>Cost so far: {money(activeRun.totalCostMicros)}</span><span>Heartbeat: {dateTime(activeRun.heartbeatAt)}</span></div>
              {activeRun.failureCode && <p className={styles.error}>Run stopped: {activeRun.failureCode}</p>}
              {!!activeRun.result?.length && <div className={styles.results}>
                {activeRun.result.map((report) => <article className={styles.report} key={report.reportType}>
                  <div className={styles.reportHeading}><h3>{report.title || report.reportType}</h3><span>{report.reportType} · {report.usage.attempts} call(s) · {money(report.usage.costMicros)}</span></div>
                  <p className={styles.privacyNote}>PWRP 7.1 reviewed draft · {report.reviewerReceipts.length} reviewer receipt(s) · packet {report.sourcePins.packetSha256.slice(0, 12)} · routing evidence {report.sourcePins.routingQualificationSha256.slice(0, 12)}</p>
                  {report.reviewerReceipts.map((receipt, index) => <p className={styles.privacyNote} key={`${report.reportType}-review-${index}`}>Review {receipt.verdict ?? "recorded"}: {receipt.summary ?? "Receipt is bound to this accepted draft."}</p>)}
                  <div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{report.reportMarkdown}</ReactMarkdown></div>
                </article>)}
              </div>}
            </section>
          )}

          <section className={styles.card}>
            <div className={styles.cardHeading}><div><p className={styles.kicker}>Run history</p><h2>Recent debug runs</h2></div><span className={styles.muted}>Active workflow attempts: {Object.entries(overview?.activeReportAttempts ?? {}).map(([status, count]) => `${status} ${count}`).join(" · ") || "none"}</span></div>
            {runs.length ? <div className={styles.tableWrap}><table><thead><tr><th>Profile</th><th>Report set</th><th>Status</th><th>Phase</th><th>Cost</th><th>Created</th><th></th></tr></thead><tbody>
              {runs.map((run) => <tr key={run.id}><td>{run.profileId}</td><td>{run.mode}</td><td>{run.status}</td><td>{run.phase}</td><td>{money(run.totalCostMicros)}</td><td>{dateTime(run.createdAt)}</td><td><button type="button" className={styles.linkButton} onClick={() => void loadRun(run.id)}>Open</button></td></tr>)}
            </tbody></table></div> : <p>No debug report runs yet.</p>}
          </section>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
