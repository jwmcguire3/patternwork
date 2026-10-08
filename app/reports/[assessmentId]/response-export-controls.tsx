"use client";

import { useState } from "react";
import styles from "./response-export-controls.module.css";

export function ResponseExportControls() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const requestLink = async () => {
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/response-exports/request-link", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      if (!response.ok) throw new Error("export link request failed");
      setMessage("We sent a one-time export link to the email address saved with this assessment.");
    } catch {
      setMessage("We could not send an export link. Please try again later.");
    } finally {
      setSending(false);
    }
  };
  return <section className={styles.exports} aria-labelledby="response-exports-title">
    <h2 id="response-exports-title">Your response export</h2>
    <p>Exports include your selected responses and private notes. They do not include report interpretations or internal system data.</p>
    <p className={styles.warning}>Treat a downloaded export as sensitive plaintext. Do not save or share it on a device you do not trust.</p>
    <button className={styles.exportButton} type="button" onClick={() => void requestLink()} disabled={sending}>{sending ? "Sending secure link…" : "Email me a secure export link"}</button>
    <p className={styles.exportHelp}>For your privacy, a report-view link cannot download responses. The one-time email link creates a separate 24-hour export session and opens the authorized PDF and JSON download page.</p>
    {message ? <p className={styles.exportMessage} role="status">{message}</p> : null}
  </section>;
}
