"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { QUESTIONS, type Option, type QuestionData } from "./questions_data";
import {
  createEmptyAnswer,
  generateLog,
  isAnswered,
  type AssessmentAnswer as Answer,
  type AssessmentAnswersState as AnswersState,
} from "./log-generator";

function ChoiceGroup({
  options,
  selected,
  onSelect,
}: {
  options: Option[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="assessment-options">
      {options.map((option) => (
        <button
          key={option.id}
          className={`assessment-option ${selected === option.id ? "assessment-option--primary" : ""}`}
          onClick={() => onSelect(option.id)}
        >
          <span className="assessment-option-text">{option.text}</span>
        </button>
      ))}
    </div>
  );
}

function RankList({
  options,
  order,
  onChange,
}: {
  options: Option[];
  order: string[];
  onChange: (ids: string[]) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const byId = useMemo(() => Object.fromEntries(options.map((o) => [o.id, o])), [options]);
  const ids = order.length ? order : options.map((o) => o.id);

  const move = (source: string, target: string) => {
    if (source === target) return;
    const next = [...ids];
    const from = next.indexOf(source);
    const to = next.indexOf(target);
    next.splice(from, 1);
    next.splice(to, 0, source);
    onChange(next);
  };

  return (
    <div className="assessment-rank-list">
      {ids.map((id, idx) => (
        <div
          key={id}
          className="assessment-rank-item"
          draggable
          onDragStart={() => setDragging(id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragging) move(dragging, id);
            setDragging(null);
          }}
        >
          <span className="assessment-rank-index">{idx + 1}</span>
          <span>{byId[id]?.text}</span>
        </div>
      ))}
    </div>
  );
}

function QuestionCard({
  question,
  answer,
  onUpdate,
  index,
  total,
  onNext,
  onPrev,
}: {
  question: QuestionData;
  answer: Answer;
  onUpdate: (a: Answer) => void;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
}) {
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [showNotes, setShowNotes] = useState(answer.notes.length > 0);
  const progress = ((index + 1) / total) * 100;

  const complete = isAnswered(answer);

  return (
    <div className="assessment-card">
      <div className="assessment-progress-row">
        <span className="assessment-counter">{index + 1} of {total}</span>
      </div>
      <div className="assessment-progress-track">
        <div className="assessment-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <p className="assessment-question">{question.text}</p>
      <p className="assessment-instruction">Answer format: <strong>{question.answerType}</strong></p>
      <div className="assessment-divider" />

      {question.answerType === "T1" && answer.type === "T1" && (
        <>
          <p className="assessment-section-title">Tap 1 (what happens first)</p>
          <ChoiceGroup options={question.tap1} selected={answer.tap1} onSelect={(id) => onUpdate({ ...answer, tap1: id })} />
          {answer.tap1 && (
            <>
              <div className="assessment-divider" />
              <p className="assessment-section-title">Tap 2 (what happens next)</p>
              <ChoiceGroup options={question.tap2} selected={answer.tap2} onSelect={(id) => onUpdate({ ...answer, tap2: id })} />
            </>
          )}
        </>
      )}

      {(question.answerType === "T2" || question.answerType === "T4") &&
        answer.type === question.answerType && (
          <ChoiceGroup options={question.options} selected={answer.selected} onSelect={(id) => onUpdate({ ...answer, selected: id })} />
        )}

      {question.answerType === "T3" && answer.type === "T3" && (
        <ChoiceGroup options={question.options} selected={answer.selected} onSelect={(id) => onUpdate({ ...answer, selected: id })} />
      )}

      {question.answerType === "T5" && answer.type === "T5" && (
        <div className="assessment-slider-wrap">
          <div className="assessment-slider-labels">
            <span>{question.leftLabel}</span>
            <span>{question.rightLabel}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={answer.value ?? 50}
            onChange={(e) => onUpdate({ ...answer, value: Number(e.target.value) })}
            className="assessment-slider"
          />
          <p className="assessment-section-subtitle">Current: {answer.value ?? 50}</p>
        </div>
      )}

      {question.answerType === "T6" && answer.type === "T6" && (
        <RankList
          options={question.options}
          order={answer.order}
          onChange={(next) => onUpdate({ ...answer, order: next })}
        />
      )}

      <div className="assessment-divider" />
      {!showNotes ? (
        <button
          className="assessment-notes-toggle"
          onClick={() => {
            setShowNotes(true);
            setTimeout(() => notesRef.current?.focus(), 50);
          }}
        >
          + add a note in your own words
        </button>
      ) : (
        <div className="assessment-notes-section">
          <label className="assessment-notes-label">In your own words (optional)</label>
          <textarea
            ref={notesRef}
            className="assessment-notes-textarea"
            value={answer.notes}
            onChange={(e) => onUpdate({ ...answer, notes: e.target.value })}
            rows={3}
            placeholder="If something doesn't fit neatly, say it here."
          />
        </div>
      )}

      <div className="assessment-nav">
        <button className="btn btn-secondary assessment-nav-btn" onClick={onPrev} disabled={index === 0}>Back</button>
        <button className="btn assessment-nav-btn" onClick={onNext} disabled={!complete} style={{ opacity: complete ? 1 : 0.4 }}>
          {index === total - 1 ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}

export default function AssessmentPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswersState>({});
  const [stage, setStage] = useState<"intro" | "questions" | "finalize" | "done">("intro");
  const [userEmail, setUserEmail] = useState("");
  const [devEmail, setDevEmail] = useState("");
  const [devStatus, setDevStatus] = useState<{ state: "idle" | "sending" | "success" | "error"; actionLabel: string; message: string }>({ state: "idle", actionLabel: "", message: "" });
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const question = QUESTIONS[currentIndex];
  const answer: Answer = answers[question?.num] ?? createEmptyAnswer(question.answerType);

  const updateAnswer = useCallback((a: Answer) => {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.num]: a }));
  }, [question]);

  const goNext = useCallback(() => {
    if (currentIndex < QUESTIONS.length - 1) {
      setCurrentIndex((i) => i + 1);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setStage("finalize");
  }, [currentIndex]);

  const goPrev = useCallback(() => {
    if (currentIndex === 0) return;
    setCurrentIndex((i) => i - 1);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentIndex]);

  const validateEmail = useCallback((email: string): string | null => {
    const trimmed = email.trim();
    if (!trimmed) return "Email is required.";
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmed)) return "Please enter a valid email address.";
    return null;
  }, []);

  const shouldShowDevPanel = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_SHOW_ASSESSMENT_DEVTOOLS === "true";

  async function sendThroughAssessmentRoute(actionLabel: string, payloadAnswers: AnswersState) {
    const targetEmail = (devEmail || userEmail).trim();
    const validationError = validateEmail(targetEmail);
    if (validationError) {
      setDevStatus({ state: "error", actionLabel, message: validationError });
      return;
    }

    setDevStatus({ state: "sending", actionLabel, message: "Sending through /api/save-assessment…" });

    try {
      const log = generateLog(QUESTIONS, payloadAnswers);
      const res = await fetch("/api/save-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payloadAnswers, log, userEmail: targetEmail }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setDevStatus({ state: "error", actionLabel, message: data?.error ?? `Request failed with status ${res.status}.` });
        return;
      }

      setDevStatus({ state: "success", actionLabel, message: data?.message ?? "Sent successfully." });
    } catch {
      setDevStatus({ state: "error", actionLabel, message: "Network error while sending test payload." });
    }
  }

  const renderDevPanel = () => {
    if (!shouldShowDevPanel) return null;

    const sample = QUESTIONS[0];
    const sampleAnswer = { [sample.num]: { type: sample.answerType, tap1: "A", tap2: "B", notes: "Basic test from assessment devtools." } as Answer };

    return (
      <div className="card" style={{ marginTop: "1rem", borderStyle: "dashed", borderColor: "var(--muted)", background: "rgba(255,255,255,.65)" }}>
        <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: "0.4rem" }}>Development-only quick email test tools</p>
        <p style={{ fontSize: "0.9rem", marginBottom: "0.8rem" }}>Sends payloads through <code>/api/save-assessment</code>.</p>
        <input id="devtools-email" type="email" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} placeholder={userEmail || "you@example.com"} className="assessment-input" style={{ marginBottom: "0.8rem" }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button className="btn btn-secondary" disabled={devStatus.state === "sending"} onClick={() => sendThroughAssessmentRoute("Basic test", sampleAnswer)}>Send basic test</button>
          <button className="btn btn-secondary" disabled={devStatus.state === "sending"} onClick={() => sendThroughAssessmentRoute("Current state", answers)}>Send current state/log</button>
        </div>
        {devStatus.state !== "idle" && <p style={{ marginTop: "0.8rem", fontSize: "0.9rem", color: devStatus.state === "error" ? "var(--danger, #b42318)" : devStatus.state === "success" ? "var(--accent-teal)" : "var(--muted)" }} role="status"><strong>{devStatus.actionLabel}:</strong> {devStatus.message}</p>}
      </div>
    );
  };

  async function handleSubmit() {
    const validationError = validateEmail(userEmail);
    setEmailError(validationError);
    setSubmitError(null);
    if (validationError) return;

    const trimmed = userEmail.trim();
    setSubmitting(true);
    try {
      const log = generateLog(QUESTIONS, answers);
      const res = await fetch("/api/save-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, log, userEmail: trimmed }),
      });
      if (!res.ok) {
        setSubmitError("Could not submit your request. Please try again.");
        return;
      }
      const data = await res.json();
      setAssessmentId(data.assessmentId ?? null);
      setUserEmail(trimmed);
      setStage("done");
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "intro") {
    return (
      <main className="section"><div className="container narrow"><h2>Patternwork Assessment</h2><p>55 scenario-based prompts with multiple answer types (T1-T6).</p><p>Each item now uses its own interaction model: two-tap sequencing, single-pick, forced binary, spatial position, continuum slider, or ranking.</p><div style={{ marginTop: "2.5rem" }}><button className="btn" onClick={() => setStage("questions")}>Begin assessment</button></div>{renderDevPanel()}</div></main>
    );
  }

  if (stage === "finalize") {
    return (
      <main className="section"><div className="container narrow"><div className="card"><h3 style={{ marginBottom: "0.75rem" }}>Assessment complete</h3><p style={{ marginBottom: "0.25rem", fontSize: "0.95rem" }}>{QUESTIONS.length} of {QUESTIONS.length} questions answered.</p><p style={{ marginBottom: "1.5rem", fontSize: "0.95rem" }}>Enter your email to receive your free report.</p><div style={{ marginBottom: "1.25rem" }}><label htmlFor="report-request-email" style={{ display: "block", marginBottom: "0.4rem" }}>Email</label><input id="report-request-email" type="email" value={userEmail} onChange={(e) => { const next = e.target.value; setUserEmail(next); setSubmitError(null); if (emailError) setEmailError(validateEmail(next)); }} onBlur={() => setEmailError(validateEmail(userEmail))} placeholder="you@example.com" className="assessment-input" aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "email-error" : undefined} />{emailError && <p id="email-error" className="assessment-error">{emailError}</p>}</div>{submitError && <p className="assessment-error">{submitError}</p>}{submitting && <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "1rem" }} role="status">Submitting your report request…</p>}<div className="assessment-nav"><button className="btn btn-secondary" onClick={() => setStage("questions")} disabled={submitting}>Back to questions</button><button className="btn" onClick={handleSubmit} disabled={submitting}>{submitting ? "Submitting request…" : "Submit Report Request"}</button></div></div>{renderDevPanel()}</div></main>
    );
  }

  if (stage === "done") {
    return (
      <main className="section"><div className="container narrow"><div className="card"><h3 style={{ marginBottom: "0.75rem" }}>Request received</h3><p style={{ fontSize: "0.95rem" }}>Your assessment was submitted successfully.</p><p style={{ fontSize: "0.95rem", marginTop: "0.75rem" }}>Sent to: <strong>{userEmail}</strong></p>{assessmentId && <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>Reference: <code>{assessmentId}</code></p>}<div style={{ marginTop: "1.5rem" }}><a className="btn" href="https://patternwork.io/method" target="_blank" rel="noreferrer">Learn more</a></div>{renderDevPanel()}</div></div></main>
    );
  }

  return (
    <main className="section" ref={cardRef}>
      <div className="container narrow">
        <QuestionCard
          key={question.num}
          question={question}
          answer={answer}
          onUpdate={updateAnswer}
          index={currentIndex}
          total={QUESTIONS.length}
          onNext={goNext}
          onPrev={goPrev}
        />
        {renderDevPanel()}
      </div>
    </main>
  );
}
