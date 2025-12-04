// app/assessment/page.tsx
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
          goal is to map how your system actually behaves, so the Profile and
          Companion can speak in the same language you do.
        </p>
        <p>
          In the final version, this page will walk you through the assessment
          one question at a time, with options to move back, see an alternative
          example, and add your own written notes.
        </p>

        <div className="hero-actions">
          <button className="btn" disabled>
            Assessment engine coming soon
          </button>
        </div>
      </div>
    </main>
  );
}
