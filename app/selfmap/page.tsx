"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BODY_IMPULSES,
  BODY_ZONES,
  QUESTIONS,
  type AnswerKey,
  type BodyImpulse,
  type BodyZone,
  type QuestionResponse,
  type SelfMapQuestion,
} from "./questions";

type SavedProgressPayload = {
  currentIndex: number;
  responses: Record<string, QuestionResponse>;
};

const STORAGE_KEY = "selfmap-local-progress";

function buildEmptyResponse(questionId: string): QuestionResponse {
  return {
    questionId,
    primary: null,
    secondary: null,
    somatic: null,
    impulse: null,
    note: null,
  };
}

export default function SelfMapAssessmentPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, QuestionResponse>>(
    () =>
      QUESTIONS.reduce<Record<string, QuestionResponse>>((acc, q) => {
        acc[q.id] = buildEmptyResponse(q.id);
        return acc;
      }, {})
  );
  const [showSecondReaction, setShowSecondReaction] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  const question = QUESTIONS[currentIndex];
  const response = responses[question.id];
  const total = QUESTIONS.length;
  const progressPercent = Math.round(((currentIndex + 1) / total) * 100);
  const completedCount = useMemo(
    () => Object.values(responses).filter((r) => r.primary !== null).length,
    [responses]
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedProgressPayload;
        if (parsed.responses) {
          setResponses((prev) => ({
            ...prev,
            ...parsed.responses,
          }));
        }
        if (
          typeof parsed.currentIndex === "number" &&
          parsed.currentIndex >= 0 &&
          parsed.currentIndex < QUESTIONS.length
        ) {
          setCurrentIndex(parsed.currentIndex);
        }
      }
    } catch {
      // ignore malformed local storage
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          currentIndex,
          responses,
        } satisfies SavedProgressPayload)
      );
    } catch {
      // ignore local storage write issues
    }
  }, [currentIndex, responses, hydrated]);

  useEffect(() => {
    setShowSecondReaction(Boolean(response.secondary));
  }, [question.id, response.secondary]);

  function updateResponse(
    updater: (prev: QuestionResponse) => QuestionResponse
  ) {
    setResponses((prev) => ({
      ...prev,
      [question.id]: updater(prev[question.id] ?? buildEmptyResponse(question.id)),
    }));
  }

  function handlePrimarySelect(key: AnswerKey) {
    updateResponse((prev) => {
      const nextSecondary = prev.secondary === key ? null : prev.secondary;
      return {
        ...prev,
        primary: key,
        secondary: nextSecondary,
      };
    });
  }

  function handleSecondarySelect(key: AnswerKey) {
    updateResponse((prev) => ({
      ...prev,
      secondary: prev.secondary === key ? null : key,
    }));
  }

  function handleSomaticSelect(zone: BodyZone) {
    updateResponse((prev) => ({
      ...prev,
      somatic: zone,
    }));
  }

  function handleImpulseSelect(impulse: BodyImpulse) {
    updateResponse((prev) => ({
      ...prev,
      impulse: prev.impulse === impulse ? null : impulse,
    }));
  }

  const canContinue =
    response.primary !== null &&
    response.somatic !== null &&
    (!question.enhancedBodyPrompt || response.impulse !== null);

  function goNext() {
    if (!canContinue) return;
    if (currentIndex < total - 1) {
      setCurrentIndex((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goBack() {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function saveAndResumeLater() {
    setSaveState("idle");

    const payload = {
      currentIndex,
      responses,
    };

    try {
      const local = JSON.stringify(payload);
      window.localStorage.setItem(STORAGE_KEY, local);

      startTransition(async () => {
        const res = await fetch("/api/selfmap-progress", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          setSaveState("error");
          return;
        }

        setSaveState("saved");
      });
    } catch {
      setSaveState("error");
    }
  }

  function exportPreviewLog() {
    const lines = QUESTIONS.map((q) => {
      const r = responses[q.id];
      const secondary = r.secondary ?? "-";
      const somatic = r.somatic ? normalizeSomaticForLog(r.somatic) : "NONE";

      const base = [
        q.id,
        q.category,
        q.axis,
        q.load,
        q.intensityCandidate ? "Y" : "",
        r.primary ?? "-",
        secondary,
        somatic,
        q.scenarioTag,
      ];

      if (q.enhancedBodyPrompt && r.impulse) {
        base.push(r.impulse);
      }

      return base.join("|");
    });

    return `[SELFMAP_V4.1|COUNT=${QUESTIONS.length}|QBANK=1.0]
${lines.join("\n")}
[END]`;
  }

  if (!hydrated) {
    return (
      <main className="assessment-shell">
        <div className="assessment-frame">
          <div className="assessment-loading">Loading assessment…</div>
        </div>
      </main>
    );
  }

  const previewLog = exportPreviewLog();

  return (
    <main className="assessment-shell">
      <div className="assessment-frame">
        <ProgressHeader
          current={currentIndex + 1}
          total={total}
          percent={progressPercent}
          completedCount={completedCount}
          onSave={saveAndResumeLater}
          saveState={saveState}
          isPending={isPending}
        />

        <section className="assessment-stage">
          <QuestionCard question={question} />

          <div className="response-stack">
            <AnswerSequence
              title="First reaction"
              subtitle="What shows up first in you?"
              selected={response.primary}
              options={question.answers}
              onSelect={handlePrimarySelect}
            />

            {response.primary && (
              <div className="sequence-reveal">
                {!showSecondReaction ? (
                  <button
                    type="button"
                    className="inline-link-button"
                    onClick={() => setShowSecondReaction(true)}
                  >
                    Add a second reaction
                  </button>
                ) : (
                  <AnswerSequence
                    title="What tends to happen next?"
                    subtitle="Optional. Pick the next move if there is one."
                    selected={response.secondary}
                    options={question.answers.filter(
                      (option) => option.key !== response.primary
                    )}
                    onSelect={handleSecondarySelect}
                    compact
                  />
                )}
              </div>
            )}

            <BodySection
              selected={response.somatic}
              onSelect={handleSomaticSelect}
            />

            {question.enhancedBodyPrompt && (
              <ImpulseSection
                selected={response.impulse}
                onSelect={handleImpulseSelect}
              />
            )}
          </div>
        </section>

        <footer className="assessment-footer">
          <div className="assessment-footer__left">
            <button
              type="button"
              className="pw-button pw-button--secondary"
              onClick={goBack}
              disabled={currentIndex === 0}
            >
              Back
            </button>
          </div>

          <div className="assessment-footer__center">
            <SequenceSummary
              primary={response.primary}
              secondary={response.secondary}
              answers={question.answers}
              somatic={response.somatic}
              impulse={response.impulse}
            />
          </div>

          <div className="assessment-footer__right">
            <button
              type="button"
              className="pw-button"
              onClick={goNext}
              disabled={!canContinue}
            >
              {currentIndex === total - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </footer>

        <details className="assessment-debug">
          <summary>Debug / log preview</summary>
          <pre>{previewLog}</pre>
        </details>
      </div>
    </main>
  );
}

function ProgressHeader({
  current,
  total,
  percent,
  completedCount,
  onSave,
  saveState,
  isPending,
}: {
  current: number;
  total: number;
  percent: number;
  completedCount: number;
  onSave: () => void;
  saveState: "idle" | "saved" | "error";
  isPending: boolean;
}) {
  return (
    <header className="assessment-header">
      <div className="assessment-header__meta">
        <div>
          <p className="eyebrow">SelfMap assessment</p>
          <h1 className="assessment-title">One question at a time.</h1>
          <p className="assessment-subtitle">
            Choose what happens first, then what tends to come next, then where
            it lands in your body.
          </p>
        </div>

        <div className="assessment-actions">
          <button
            type="button"
            className="pw-button pw-button--secondary"
            onClick={onSave}
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save and resume later"}
          </button>

          <div
            className={`save-indicator ${
              saveState === "saved"
                ? "is-saved"
                : saveState === "error"
                ? "is-error"
                : ""
            }`}
            aria-live="polite"
          >
            {saveState === "saved" && "Saved"}
            {saveState === "error" && "Could not save to server"}
          </div>
        </div>
      </div>

      <div className="progress-card">
        <div className="progress-card__top">
          <span>
            Question {current} of {total}
          </span>
          <span>{completedCount} answered</span>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Assessment progress"
        >
          <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </header>
  );
}

function QuestionCard({ question }: { question: SelfMapQuestion }) {
  return (
    <section className="question-card">
      <div className="question-card__meta">
        <span className="question-chip">{question.category.toUpperCase()}</span>
        <span className={`question-chip question-chip--${question.load}`}>
          {question.load}
        </span>
      </div>

      <p className="question-label">Scenario</p>
      <p className="question-scenario">{question.scenario}</p>

      <div className="question-prompt-wrap">
        <p className="question-label">Prompt</p>
        <h2 className="question-prompt">{question.prompt}</h2>
        <p className="question-helper">
          Choose the first thing that shows up. If something clearly comes next,
          you can add that too.
        </p>
      </div>
    </section>
  );
}

function AnswerSequence({
  title,
  subtitle,
  selected,
  options,
  onSelect,
  compact = false,
}: {
  title: string;
  subtitle: string;
  selected: AnswerKey | null;
  options: { key: AnswerKey; label: string }[];
  onSelect: (key: AnswerKey) => void;
  compact?: boolean;
}) {
  return (
    <section className="answer-group">
      <div className="section-heading">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>

      <div className={`answer-grid ${compact ? "is-compact" : ""}`}>
        {options.map((option) => {
          const isSelected = selected === option.key;

          return (
            <button
              key={option.key}
              type="button"
              className={`answer-card ${isSelected ? "is-selected" : ""}`}
              onClick={() => onSelect(option.key)}
              aria-pressed={isSelected}
            >
              <span className="answer-card__text">{option.label}</span>
              {isSelected && (
                <span className="answer-card__badge">
                  {title === "First reaction" ? "First" : "Next"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BodySection({
  selected,
  onSelect,
}: {
  selected: BodyZone | null;
  onSelect: (zone: BodyZone) => void;
}) {
  return (
    <section className="body-section">
      <div className="section-heading">
        <h3>Where do you feel this in your body?</h3>
        <p>Pick the strongest place, if there is one.</p>
      </div>

      <div className="body-layout">
        <BodyDiagram selected={selected} onSelect={onSelect} />

        <div className="body-chip-grid">
          {BODY_ZONES.map((zone) => {
            const isSelected = selected === zone.value;

            return (
              <button
                key={zone.value}
                type="button"
                className={`body-chip ${isSelected ? "is-selected" : ""}`}
                onClick={() => onSelect(zone.value)}
                aria-pressed={isSelected}
              >
                {zone.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BodyDiagram({
  selected,
  onSelect,
}: {
  selected: BodyZone | null;
  onSelect: (zone: BodyZone) => void;
}) {
  const zones: {
    key: Exclude<BodyZone, "somewhere_else" | "none">;
    label: string;
    className: string;
  }[] = [
    { key: "head", label: "Head", className: "zone-head" },
    { key: "throat", label: "Throat", className: "zone-throat" },
    { key: "chest", label: "Chest", className: "zone-chest" },
    { key: "stomach", label: "Stomach", className: "zone-stomach" },
    { key: "shoulders", label: "Shoulders", className: "zone-shoulders" },
    { key: "limbs", label: "Limbs", className: "zone-limbs" },
  ];

  return (
    <div className="body-diagram-card" aria-label="Body selector">
      <div className="body-diagram">
        <div className="body-silhouette" aria-hidden="true" />
        {zones.map((zone) => {
          const isSelected = selected === zone.key;

          return (
            <button
              key={zone.key}
              type="button"
              className={`body-zone ${zone.className} ${
                isSelected ? "is-selected" : ""
              }`}
              onClick={() => onSelect(zone.key)}
              aria-label={zone.label}
              aria-pressed={isSelected}
            />
          );
        })}
      </div>
    </div>
  );
}

function ImpulseSection({
  selected,
  onSelect,
}: {
  selected: BodyImpulse | null;
  onSelect: (impulse: BodyImpulse) => void;
}) {
  return (
    <section className="impulse-section">
      <div className="section-heading">
        <h3>What does your body want to do?</h3>
        <p>Pick the closest match.</p>
      </div>

      <div className="impulse-grid">
        {BODY_IMPULSES.map((impulse) => {
          const isSelected = selected === impulse.value;

          return (
            <button
              key={impulse.value}
              type="button"
              className={`impulse-chip ${isSelected ? "is-selected" : ""}`}
              onClick={() => onSelect(impulse.value)}
              aria-pressed={isSelected}
            >
              {impulse.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SequenceSummary({
  primary,
  secondary,
  answers,
  somatic,
  impulse,
}: {
  primary: AnswerKey | null;
  secondary: AnswerKey | null;
  answers: { key: AnswerKey; label: string }[];
  somatic: BodyZone | null;
  impulse: BodyImpulse | null;
}) {
  const primaryLabel = answers.find((a) => a.key === primary)?.label;
  const secondaryLabel = answers.find((a) => a.key === secondary)?.label;

  return (
    <div className="sequence-summary">
      {primaryLabel ? (
        <>
          <div className="sequence-summary__item">
            <span className="sequence-summary__label">First</span>
            <span className="sequence-summary__value">{primaryLabel}</span>
          </div>

          {secondaryLabel && (
            <div className="sequence-summary__item">
              <span className="sequence-summary__label">Next</span>
              <span className="sequence-summary__value">{secondaryLabel}</span>
            </div>
          )}

          {somatic && (
            <div className="sequence-summary__item">
              <span className="sequence-summary__label">Body</span>
              <span className="sequence-summary__value">
                {formatSomatic(somatic)}
              </span>
            </div>
          )}

          {impulse && (
            <div className="sequence-summary__item">
              <span className="sequence-summary__label">Impulse</span>
              <span className="sequence-summary__value">
                {formatImpulse(impulse)}
              </span>
            </div>
          )}
        </>
      ) : (
        <span className="sequence-summary__empty">
          Your selections will appear here.
        </span>
      )}
    </div>
  );
}

function normalizeSomaticForLog(zone: BodyZone): string {
  switch (zone) {
    case "somewhere_else":
      return "somewhere_else";
    case "none":
      return "NONE";
    default:
      return zone;
  }
}

function formatSomatic(zone: BodyZone): string {
  switch (zone) {
    case "somewhere_else":
      return "Somewhere else";
    case "none":
      return "None / not sure";
    default:
      return zone.charAt(0).toUpperCase() + zone.slice(1);
  }
}

function formatImpulse(impulse: BodyImpulse): string {
  return impulse === "curl_up"
    ? "Curl up"
    : impulse.charAt(0).toUpperCase() + impulse.slice(1);
}
