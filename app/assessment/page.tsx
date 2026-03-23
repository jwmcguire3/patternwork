// app/assessment/page.tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type QuestionData = {
  num: number;
  category: string;
  axis: string;
  load: "mild" | "moderate" | "high";
  ic: string;
  scenarioTag: string;
  text: string;
  options: Record<string, string>;
  bodyPrompt: "standard" | "enhanced";
};

type Answer = {
  selected: string[]; // ordered: first = PRIMARY, rest = SECONDARY
  bodyZones: string[];
  impulse: string | null;
  notes: string;
};

type AnswersState = Record<number, Answer>;

const BODY_ZONES = [
  "head",
  "eyes",
  "throat",
  "chest",
  "shoulders",
  "stomach",
  "arms",
  "legs",
] as const;

const IMPULSES = [
  { key: "run", label: "run / leave" },
  { key: "fight", label: "fight / push back" },
  { key: "freeze", label: "freeze / can't move" },
  { key: "curl_up", label: "curl up / get small" },
  { key: "reach", label: "reach / hold on" },
  { key: "hide", label: "hide" },
  { key: "nothing", label: "nothing / can't feel it" },
] as const;

const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"] as const;

// ═══════════════════════════════════════════════════════════════
// QUESTION BANK (inline for single-file deployment)
// In production, import from a separate file
// ═══════════════════════════════════════════════════════════════

// PLACEHOLDER: This will be replaced with the full 60-question bank.
// For now we embed a note — the actual data comes from the xlsx.
// See the companion questions_data.ts file for the full export.

/* ─── paste QUESTIONS array from questions_data.ts here ─── */
// @ts-expect-error — will be populated
let QUESTIONS: QuestionData[] = [];

// We'll dynamically import or inline. For this file, assume QUESTIONS
// is imported at build time. The page works with any length array.

// ═══════════════════════════════════════════════════════════════
// UTILITY: generate SelfMap log output
// ═══════════════════════════════════════════════════════════════

function generateLog(questions: QuestionData[], answers: AnswersState): string {
  const lines: string[] = [`[SELFMAP_V4.1|COUNT=${questions.length}|QBANK=1.0]`];

  for (const q of questions) {
    const a = answers[q.num];
    if (!a || a.selected.length === 0) continue;

    const primary = a.selected[0];
    const secondary =
      a.selected.length > 1 ? a.selected.slice(1).join("") : "-";
    const somatic =
      a.bodyZones.length > 0 ? a.bodyZones.join(",") : "NONE";
    const qNum = String(q.num).padStart(2, "0");

    let line = `Q${qNum}|${q.category}|${q.axis}|${q.load}|${q.ic}|${primary}|${secondary}|${somatic}|${q.scenarioTag}`;

    if (q.bodyPrompt === "enhanced" && a.impulse) {
      line += `|${a.impulse}`;
    }

    lines.push(line);
  }

  lines.push("[END]");
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════
// BODY MAP SVG
// ═══════════════════════════════════════════════════════════════

function BodyMap({
  activeZones,
  onToggle,
}: {
  activeZones: Set<string>;
  onToggle: (zone: string) => void;
}) {
  const zoneColor = (zone: string) =>
    activeZones.has(zone) ? "var(--accent-teal)" : "var(--muted)";
  const zoneFill = (zone: string) =>
    activeZones.has(zone) ? "rgba(61,96,104,0.15)" : "none";
  const zoneWidth = (zone: string) => (activeZones.has(zone) ? 2.5 : 1.2);

  const hit = (zone: string) => (
    <style>{""}</style>
    // We handle clicks via the group onClick
  );

  return (
    <svg
      viewBox="0 0 140 320"
      width="140"
      height="320"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {/* Head */}
      <g
        onClick={() => onToggle("head")}
        style={{ cursor: "pointer" }}
      >
        <circle
          cx="70"
          cy="32"
          r="22"
          fill={zoneFill("head")}
          stroke={zoneColor("head")}
          strokeWidth={zoneWidth("head")}
        />
        {/* Eyes inside head */}
        <g onClick={(e) => { e.stopPropagation(); onToggle("eyes"); }} style={{ cursor: "pointer" }}>
          <ellipse
            cx="61"
            cy="29"
            rx="5"
            ry="3"
            fill={zoneFill("eyes")}
            stroke={zoneColor("eyes")}
            strokeWidth={zoneWidth("eyes")}
          />
          <ellipse
            cx="79"
            cy="29"
            rx="5"
            ry="3"
            fill={zoneFill("eyes")}
            stroke={zoneColor("eyes")}
            strokeWidth={zoneWidth("eyes")}
          />
        </g>
      </g>

      {/* Neck */}
      <line x1="70" y1="54" x2="70" y2="72" stroke="var(--muted)" strokeWidth="1.2" opacity="0.5" />

      {/* Throat */}
      <g onClick={() => onToggle("throat")} style={{ cursor: "pointer" }}>
        <ellipse
          cx="70"
          cy="63"
          rx="8"
          ry="9"
          fill={zoneFill("throat")}
          stroke={zoneColor("throat")}
          strokeWidth={zoneWidth("throat")}
        />
      </g>

      {/* Torso outline */}
      <ellipse
        cx="70"
        cy="118"
        rx="30"
        ry="42"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="1.2"
        opacity="0.35"
      />

      {/* Chest */}
      <g onClick={() => onToggle("chest")} style={{ cursor: "pointer" }}>
        <ellipse
          cx="70"
          cy="98"
          rx="20"
          ry="14"
          fill={zoneFill("chest")}
          stroke={zoneColor("chest")}
          strokeWidth={zoneWidth("chest")}
        />
      </g>

      {/* Stomach */}
      <g onClick={() => onToggle("stomach")} style={{ cursor: "pointer" }}>
        <ellipse
          cx="70"
          cy="132"
          rx="16"
          ry="14"
          fill={zoneFill("stomach")}
          stroke={zoneColor("stomach")}
          strokeWidth={zoneWidth("stomach")}
        />
      </g>

      {/* Shoulders */}
      <g onClick={() => onToggle("shoulders")} style={{ cursor: "pointer" }}>
        <rect
          x="24"
          y="78"
          width="14"
          height="24"
          rx="5"
          fill={zoneFill("shoulders")}
          stroke={zoneColor("shoulders")}
          strokeWidth={zoneWidth("shoulders")}
        />
        <rect
          x="102"
          y="78"
          width="14"
          height="24"
          rx="5"
          fill={zoneFill("shoulders")}
          stroke={zoneColor("shoulders")}
          strokeWidth={zoneWidth("shoulders")}
        />
      </g>

      {/* Arms */}
      <g onClick={() => onToggle("arms")} style={{ cursor: "pointer" }}>
        {/* Left arm */}
        <line x1="38" y1="82" x2="18" y2="130" stroke="var(--muted)" strokeWidth="1.2" opacity="0.4" />
        <rect
          x="8"
          y="126"
          width="12"
          height="34"
          rx="5"
          fill={zoneFill("arms")}
          stroke={zoneColor("arms")}
          strokeWidth={zoneWidth("arms")}
        />
        {/* Right arm */}
        <line x1="102" y1="82" x2="122" y2="130" stroke="var(--muted)" strokeWidth="1.2" opacity="0.4" />
        <rect
          x="120"
          y="126"
          width="12"
          height="34"
          rx="5"
          fill={zoneFill("arms")}
          stroke={zoneColor("arms")}
          strokeWidth={zoneWidth("arms")}
        />
      </g>

      {/* Connectors to legs */}
      <line x1="58" y1="158" x2="52" y2="210" stroke="var(--muted)" strokeWidth="1.2" opacity="0.4" />
      <line x1="82" y1="158" x2="88" y2="210" stroke="var(--muted)" strokeWidth="1.2" opacity="0.4" />

      {/* Legs */}
      <g onClick={() => onToggle("legs")} style={{ cursor: "pointer" }}>
        <rect
          x="42"
          y="208"
          width="16"
          height="48"
          rx="6"
          fill={zoneFill("legs")}
          stroke={zoneColor("legs")}
          strokeWidth={zoneWidth("legs")}
        />
        <rect
          x="82"
          y="208"
          width="16"
          height="48"
          rx="6"
          fill={zoneFill("legs")}
          stroke={zoneColor("legs")}
          strokeWidth={zoneWidth("legs")}
        />
      </g>

      {/* Zone labels (subtle, only on hover/active) */}
      {Array.from(activeZones).map((zone) => {
        const positions: Record<string, [number, number]> = {
          head: [70, 12],
          eyes: [70, 42],
          throat: [100, 63],
          chest: [105, 98],
          shoulders: [70, 74],
          stomach: [105, 136],
          arms: [4, 148],
          legs: [70, 268],
        };
        const [x, y] = positions[zone] || [0, 0];
        return (
          <text
            key={zone}
            x={x}
            y={y}
            textAnchor="middle"
            fontSize="9"
            fill="var(--accent-teal)"
            fontFamily="inherit"
            fontWeight="500"
          >
            {zone}
          </text>
        );
      })}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// QUESTION CARD COMPONENT
// ═══════════════════════════════════════════════════════════════

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
  const bodyZoneSet = new Set(answer.bodyZones);

  const toggleOption = useCallback(
    (key: string) => {
      const idx = answer.selected.indexOf(key);
      let next: string[];
      if (idx > -1) {
        next = answer.selected.filter((k) => k !== key);
      } else {
        next = [...answer.selected, key];
      }
      onUpdate({ ...answer, selected: next });
    },
    [answer, onUpdate]
  );

  const toggleBodyZone = useCallback(
    (zone: string) => {
      const set = new Set(answer.bodyZones);
      if (zone === "NONE") {
        onUpdate({ ...answer, bodyZones: [] });
        return;
      }
      if (set.has(zone)) {
        set.delete(zone);
      } else {
        set.add(zone);
      }
      onUpdate({ ...answer, bodyZones: Array.from(set) });
    },
    [answer, onUpdate]
  );

  const setImpulse = useCallback(
    (imp: string) => {
      onUpdate({
        ...answer,
        impulse: answer.impulse === imp ? null : imp,
      });
    },
    [answer, onUpdate]
  );

  const hasSelection = answer.selected.length > 0;
  const isEnhanced = question.bodyPrompt === "enhanced";
  const progress = ((index + 1) / total) * 100;

  return (
    <div className="assessment-card">
      {/* Progress */}
      <div className="assessment-progress-row">
        <span className="assessment-counter">
          {index + 1} of {total}
        </span>
      </div>
      <div className="assessment-progress-track">
        <div
          className="assessment-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question */}
      <p className="assessment-question">{question.text}</p>

      {/* Instruction */}
      <p className="assessment-instruction">
        Tap your <strong>first reaction</strong>, then optionally tap others in
        the order they come.
      </p>

      <div className="assessment-divider" />

      {/* Options */}
      <div className="assessment-options">
        {OPTION_KEYS.map((key) => {
          const pos = answer.selected.indexOf(key);
          const isFirst = pos === 0;
          const isSelected = pos > -1;

          return (
            <button
              key={key}
              className={`assessment-option ${
                isFirst
                  ? "assessment-option--primary"
                  : isSelected
                  ? "assessment-option--secondary"
                  : ""
              }`}
              onClick={() => toggleOption(key)}
            >
              {isSelected && (
                <span className="assessment-option-badge">
                  {pos === 0 ? "1st" : `${pos + 1}${ordSuffix(pos + 1)}`}
                </span>
              )}
              <span className="assessment-option-text">
                {question.options[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body + Impulse (revealed after first selection) */}
      {hasSelection && (
        <>
          <div className="assessment-divider" />

          {/* Body map section */}
          <div className="assessment-body-section">
            <p className="assessment-section-title">
              Where do you feel it?
            </p>
            <p className="assessment-section-subtitle">
              Tap on the body or the labels. Skip if nothing stands out.
            </p>

            <div className="assessment-body-layout">
              <div className="assessment-body-map">
                <BodyMap
                  activeZones={bodyZoneSet}
                  onToggle={toggleBodyZone}
                />
              </div>
              <div className="assessment-body-chips">
                {BODY_ZONES.map((zone) => (
                  <button
                    key={zone}
                    className={`assessment-chip ${
                      bodyZoneSet.has(zone) ? "assessment-chip--active" : ""
                    }`}
                    onClick={() => toggleBodyZone(zone)}
                  >
                    {zone}
                  </button>
                ))}
                <button
                  className={`assessment-chip assessment-chip--skip ${
                    answer.bodyZones.length === 0 && hasSelection
                      ? ""
                      : ""
                  }`}
                  onClick={() => toggleBodyZone("NONE")}
                >
                  nowhere specific
                </button>
              </div>
            </div>
          </div>

          {/* Impulse section (enhanced only) */}
          {isEnhanced && (
            <>
              <div className="assessment-divider" />
              <div className="assessment-impulse-section">
                <p className="assessment-section-title">
                  What does your body want to do?
                </p>
                <p className="assessment-section-subtitle">
                  The impulse underneath — not what you'd actually do.
                </p>
                <div className="assessment-impulse-chips">
                  {IMPULSES.map((imp) => (
                    <button
                      key={imp.key}
                      className={`assessment-chip ${
                        answer.impulse === imp.key
                          ? "assessment-chip--impulse-active"
                          : ""
                      }`}
                      onClick={() => setImpulse(imp.key)}
                    >
                      {imp.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Notes */}
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
              <label className="assessment-notes-label">
                In your own words (optional)
              </label>
              <textarea
                ref={notesRef}
                className="assessment-notes-textarea"
                value={answer.notes}
                onChange={(e) =>
                  onUpdate({ ...answer, notes: e.target.value })
                }
                rows={3}
                placeholder="If something doesn't fit neatly, say it here."
              />
            </div>
          )}
        </>
      )}

      {/* Navigation */}
      <div className="assessment-nav">
        <button
          className="btn btn-secondary assessment-nav-btn"
          onClick={onPrev}
          disabled={index === 0}
        >
          Back
        </button>
        <button
          className="btn assessment-nav-btn"
          onClick={onNext}
          disabled={!hasSelection}
          style={{ opacity: hasSelection ? 1 : 0.4 }}
        >
          {index === total - 1 ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}

function ordSuffix(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function AssessmentPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswersState>({});
  const [stage, setStage] = useState<"intro" | "questions" | "finalize" | "done">("intro");
  const [userEmail, setUserEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"" | "ok" | "err">("");
  const cardRef = useRef<HTMLDivElement>(null);

  const question = QUESTIONS[currentIndex];
  const answer: Answer = answers[question?.num] ?? {
    selected: [],
    bodyZones: [],
    impulse: null,
    notes: "",
  };

  const updateAnswer = useCallback(
    (a: Answer) => {
      if (!question) return;
      setAnswers((prev) => ({ ...prev, [question.num]: a }));
    },
    [question]
  );

  const goNext = useCallback(() => {
    if (currentIndex < QUESTIONS.length - 1) {
      setCurrentIndex((i) => i + 1);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setStage("finalize");
    }
  }, [currentIndex]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [currentIndex]);

  // Count answered
  const answeredCount = Object.values(answers).filter(
    (a) => a.selected.length > 0
  ).length;

  async function handleSubmit() {
    setEmailError(null);
    const trimmed = userEmail.trim();
    if (!trimmed) {
      setEmailError("Email is required to save your assessment.");
      return;
    }
    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const log = generateLog(QUESTIONS, answers);
      const res = await fetch("/api/save-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          log,
          userEmail: trimmed,
        }),
      });
      if (!res.ok) {
        setEmailError("Something went wrong saving your assessment.");
        return;
      }
      const data = await res.json();
      setAssessmentId(data.assessmentId ?? null);
      setStage("done");
    } catch {
      setEmailError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyLog() {
    try {
      const log = generateLog(QUESTIONS, answers);
      await navigator.clipboard.writeText(log);
      setCopyStatus("ok");
    } catch {
      setCopyStatus("err");
    }
  }

  // ─── INTRO ───
  if (stage === "intro") {
    return (
      <main className="section">
        <div className="container narrow">
          <h2>Patternwork Assessment</h2>
          <p>
            60 scenario-based questions. Each one describes a moment — stress,
            closeness, conflict, loss, intensity — and asks what happens in you
            first.
          </p>
          <p>
            There are no right answers. Every option describes a real pattern.
            Your job is to notice which one your system reaches for, and
            optionally which others follow.
          </p>
          <p>
            The output maps how your nervous system, protectors, and
            relational patterns behave under pressure. It is not a diagnosis
            and it is not scored.
          </p>

          <div style={{ marginTop: "2rem" }}>
            <h3>How it works</h3>
            <p>
              Each question shows six responses. Tap the one that happens
              first. If a second or third response also fits, tap those too —
              they'll be recorded in order. Then mark where you feel it in
              your body if anything stands out. Some questions also ask what
              your body wants to do.
            </p>
            <p>
              You can go back to any question and change your answer. Take
              your time. The assessment works best when you go with the
              honest answer, not the one you wish were true.
            </p>
          </div>

          <div style={{ marginTop: "2.5rem" }}>
            <button className="btn" onClick={() => setStage("questions")}>
              Begin assessment
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ─── FINALIZE ───
  if (stage === "finalize") {
    return (
      <main className="section">
        <div className="container narrow">
          <div className="card">
            <h3 style={{ marginBottom: "0.75rem" }}>
              Assessment complete
            </h3>
            <p style={{ marginBottom: "0.25rem", fontSize: "0.95rem" }}>
              {answeredCount} of {QUESTIONS.length} questions answered.
            </p>
            <p style={{ marginBottom: "1.5rem", fontSize: "0.95rem" }}>
              Enter your email to save your results and receive your
              Patternwork Map.
            </p>

            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{ display: "block", marginBottom: "0.4rem" }}
              >
                Email
              </label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="you@example.com"
                className="assessment-input"
              />
              {emailError && (
                <p className="assessment-error">{emailError}</p>
              )}
            </div>

            <div className="assessment-nav">
              <button
                className="btn btn-secondary"
                onClick={() => setStage("questions")}
                disabled={submitting}
              >
                Back to questions
              </button>
              <button
                className="btn"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Saving…" : "Save assessment"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ─── DONE ───
  if (stage === "done") {
    return (
      <main className="section">
        <div className="container narrow">
          <div className="card">
            <h3 style={{ marginBottom: "0.75rem" }}>Saved</h3>
            <p style={{ fontSize: "0.95rem" }}>
              Your assessment has been recorded. You'll receive your
              Patternwork Map at the email you provided.
            </p>
            {assessmentId && (
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "var(--muted)",
                  marginTop: "0.5rem",
                }}
              >
                Reference: <code>{assessmentId}</code>
              </p>
            )}

            <div style={{ marginTop: "1.5rem" }}>
              <button
                className="btn btn-secondary"
                onClick={handleCopyLog}
              >
                Copy raw log to clipboard
              </button>
              {copyStatus === "ok" && (
                <p
                  style={{
                    marginTop: "0.5rem",
                    fontSize: "0.85rem",
                    color: "var(--accent-forest)",
                  }}
                >
                  Copied.
                </p>
              )}
              {copyStatus === "err" && (
                <p className="assessment-error">
                  Clipboard not available.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ─── QUESTIONS ───
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
      </div>
    </main>
  );
}
