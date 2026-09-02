"use client";

import { useState } from "react";

export function DeleteAssessmentButton() {
  const [state, setState] = useState<"idle" | "deleting" | "failed">("idle");
  return <button type="button" disabled={state === "deleting"} onClick={async () => {
    if (!window.confirm("Permanently delete this assessment and all report artifacts? This cannot be undone.")) return;
    setState("deleting");
    const response = await fetch("/api/assessment", { method: "DELETE" });
    if (response.ok) window.location.assign("/"); else setState("failed");
  }}>{state === "deleting" ? "Deleting…" : state === "failed" ? "Deletion failed — try again" : "Delete my assessment"}</button>;
}
