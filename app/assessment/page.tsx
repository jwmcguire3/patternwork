// app/assessment/page.tsx
"use client";

import { useState } from "react";

type Choice = {
  value: string;
  label: string;
};

type Question = {
  id: string;
  label: string;
  choices: Choice[];
  alts?: string[]; // alternative phrasings
};

const QUESTIONS: Question[] = [
  {
    id: "conflict-1",
    label:
      "When someone sounds irritated with you, what happens in you first?",
    choices: [
      { value: "steadying", label: "I steady myself and try to understand." },
      { value: "adjusting", label: "I adjust quickly to avoid making it worse." },
      { value: "replaying", label: "I replay their tone in my head." },
      { value: "pulling-back", label: "I pull back and show less of myself." },
      { value: "wave", label: "I feel a wave of emotion and react fast." },
      { value: "blank", label: "I go a bit blank or distant." },
    ],
    alts: [
      "When tension rises in a conversation, what happens in you first?",
      "When you sense a shift in someone’s tone toward you, what shows up first in your system?",
    ],
  },
  {
    id: "state-1",
    label:
      "On difficult days, which description fits you more often?",
    choices: [
      { value: "revved", label: "Revved up, restless, hard to slow down." },
      { value: "heavy", label: "Heavy, slowed, hard to start anything." },
      { value: "both", label: "It swings between both in the same day." },
      { value: "numb", label: "Mostly numb or checked-out." },
    ],
    alts: [
      "When you feel off, does your system tend to speed up, slow down, or both?",
    ],
  },
  {
    id: "attachment-1",
    label:
      "When a relationship starts to matter, what makes you most uneasy?",
    choices: [
      { value: "too-close", label: "Feeling too close or dependent." },
      { value: "rejection", label: "Fear they’ll lose interest or leave." },
      { value: "conflict", label: "Conflict or misalignment showing up." },
      { value: "exposed", label: "Feeling too seen or emotionally exposed." },
      { value: "none", label: "I don’t usually feel uneasy about that." },
    ],
    alts: [
      "When someone becomes important to you, what kind of risk feels sharpest?",
    ],
  },
];

type Answer = {
  choice?: string;
  text?: string;
  altIndex: number; // which version of the question text was shown
};

type AnswersState = Record<string, Answer>;

export default function AssessmentPage() {
  return (
    <main className="section">
      <div className="container narrow">
        <h2>Patternwork Assessment</h2>
        <p>
          The Patternwork Assessment is a structured set of questions designed
          to surface the patterns behind your states, protectors, attachment
          responses, and identity habits.
        </p>
        <p>
          It is not a diagnosis and is not scored like a personality test. The
          goal is to map how your system behaves, so the Profile and Companion
          can speak in the same language you do.
        </p>
        <p>
          Below is a simple prototype of the assessment flow: one question at a
          time, with space to choose an option and add your own words, and the
          ability to see an alternative version of the same question.
        </p>

        <AssessmentRunner />
      </div>
    </main>
  );
}

function AssessmentRunner() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswersState>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [stage, setStage] = useState<"questions" | "finalize" | "done">(
    "questions"
  );
  const [emailError, setEmailError] = useState<string | null>(null);

  const question = QUESTIONS[currentIndex];
  const answer = answers[question.id] ?? { altIndex: 0 };

  const questionText =
    answer.altIndex > 0 && question.alts && question.alts[answer.altIndex - 1]
      ? question.alts[answer.altIndex - 1]
      : question.label;

  function updateAnswer(partial: Partial<Answer>) {
    setAnswers((prev) => ({
      ...prev,
      [question.id]: {
        ...answer,
        ...partial,
      },
    }));
  }

  function handleChoiceChange(value: string) {
    updateAnswer({ choice: value });
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    updateAnswer({ text: e.target.value });
  }

  function handlePrev() {
    if (currentIndex === 0) return;
    setCurrentIndex((i) => i - 1);
  }

  function handleNext() {
    if (currentIndex < QUESTIONS.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      // Last question → move to finalize screen, no DB write yet
      setStage("finalize");
    }
  }

  function handleAlt() {
    if (!question.alts || question.alts.length === 0) return;

    const totalVariants = 1 + question.alts.length; // main + alts
    const nextAltIndex = (answer.altIndex + 1) % totalVariants;

    setAnswers((prev) => ({
      ...prev,
      [question.id]: {
        ...answer,
        altIndex: nextAltIndex,
      },
    }));
  }

  async function handleSubmit() {
    setEmailError(null);

    const trimmed = userEmail.trim();

    if (!trimmed) {
      setEmailError("Email is required to save your assessment.");
      return;
    }

    // super simple sanity check; you can tighten later
    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/save-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          userEmail: trimmed,
        }),
      });

      if (!res.ok) {
        console.error("Save failed", await res.json());
        setEmailError("Something went wrong saving your assessment.");
        return;
      }

      const data = await res.json();
      console.log("Saved assessment, id:", data.assessmentId);
      setSubmitted(true);
      setStage("done");
    } catch (err) {
      console.error("Network or server error", err);
      setEmailError("Network error while saving. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const isLast = currentIndex === QUESTIONS.length - 1;

  // --- RENDER ---

  if (stage === "finalize") {
    return (
      <div style={{ marginTop: "2rem" }}>
        <div className="card">
          <h3 style={{ marginBottom: "0.75rem" }}>Finalize your assessment</h3>
          <p style={{ marginBottom: "1rem", fontSize: "0.95rem" }}>
            Enter your email to save your assessment and receive your
            Patternwork Profile when it’s ready.
          </p>

          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", marginBottom: "0.4rem" }}>
              Email <span style={{ color: "#c0392b" }}>*</span>
            </label>
            <input
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "0.6rem",
                borderRadius: "6px",
                border: "1px solid #ccc",
                fontFamily: "inherit",
                fontSize: "0.95rem",
              }}
            />
            {emailError && (
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.85rem",
                  color: "#c0392b",
                }}
              >
                {emailError}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStage("questions")}
              disabled={submitting}
            >
              Back to questions
            </button>

            <button
              type="button"
              className="btn"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Finalize & save"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div style={{ marginTop: "2rem" }}>
        <div className="card">
          <h3 style={{ marginBottom: "0.75rem" }}>Assessment saved</h3>
          <p style={{ marginBottom: "0.75rem", fontSize: "0.95rem" }}>
            Your answers and email have been saved.
          </p>
          <p style={{ fontSize: "0.9rem" }}>
            In the full Patternwork release, this is where your Profile would be
            generated and either shown here or sent to your inbox.
          </p>
        </div>
      </div>
    );
  }

  // stage === "questions"
  return (
    <div style={{ marginTop: "2rem" }}>
      <div className="card">
        <p style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
          Question {currentIndex + 1} of {QUESTIONS.length}
        </p>
        <h3 style={{ marginBottom: "1rem" }}>Question</h3>
        <p style={{ marginBottom: "1.25rem" }}>{questionText}</p>

        <div style={{ marginBottom: "1.25rem" }}>
          {question.choices.map((choice) => (
            <label
              key={choice.value}
              style={{
                display: "block",
                marginBottom: "0.4rem",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name={question.id}
                value={choice.value}
                checked={answer.choice === choice.value}
                onChange={() => handleChoiceChange(choice.value)}
                style={{ marginRight: "0.5rem" }}
              />
              {choice.label}
            </label>
          ))}
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ display: "block", marginBottom: "0.4rem" }}>
            Optional: in your own words
          </label>
          <textarea
            value={answer.text ?? ""}
            onChange={handleTextChange}
            rows={4}
            style={{
              width: "100%",
              padding: "0.6rem",
              borderRadius: "6px",
              border: "1px solid #ccc",
              fontFamily: "inherit",
              fontSize: "0.95rem",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0 || submitting}
              className="btn btn-secondary"
            >
              Previous
            </button>

            <button
              type="button"
              onClick={handleAlt}
              className="btn btn-secondary"
              disabled={!question.alts || question.alts.length === 0 || submitting}
            >
              Alternative question
            </button>
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="btn"
            disabled={submitting}
          >
            {isLast ? "Finish & continue" : "Next"}
          </button>
        </div>
      </div>

      {submitted && (
        <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
          Assessment submitted. In the full version, this will generate your
          Patternwork Profile and optionally send it by email.
        </p>
      )}
    </div>
  );
}






