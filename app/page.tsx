// app/page.tsx
export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <header className="hero">
        <div className="container">
          <h1>
            The patterns behind your states, reactions, and identity.
            <br />
            Mapped. Regulated. Reorganized.
          </h1>
          <p className="hero-sub">
            Patternwork is a method for understanding how your internal patterns
            operate — and learning how to work with them.
          </p>

          <div className="hero-actions">
            <a href="#assessment" className="btn">
              Start the Assessment
            </a>
            <a href="#method" className="btn btn-secondary">
              Learn the Method
            </a>
          </div>
        </div>
      </header>

      {/* WHAT PATTERNWORK DOES */}
      <section className="section-alt" id="what">
        <div className="container">
          <h2>What Patternwork Does</h2>

          <div className="grid-3">
            <div className="card">
              <h3>Identify</h3>
              <p>
                Your system repeats itself. Patternwork maps those patterns
                across states, parts, protectors, and narratives — so you can
                see what’s actually driving your reactions.
              </p>
            </div>

            <div className="card">
              <h3>Regulate</h3>
              <p>
                Your nervous system and protectors move through predictable
                loops. Patternwork gives you tools to stabilize those shifts and
                interrupt autopilot responses.
              </p>
            </div>

            <div className="card">
              <h3>Reorganize</h3>
              <p>
                Identity, attachment, and role patterns shape how you think and
                connect. Patternwork helps you reorganize the deeper structure
                so your system stops pulling in different directions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="method">
        <div className="container narrow">
          <h2>How Patternwork Works</h2>

          <p>
            Patternwork maps the internal patterns you describe through a
            structured assessment and shows you how they interact.
          </p>

          <ul>
            <li>A clear pattern map of your states, protectors, and loops</li>
            <li>
              A regulation profile showing how your system stabilizes and
              destabilizes
            </li>
            <li>
              Identity and role patterns influencing long-term behavior
            </li>
            <li>
              Integration tools that help you work with your system instead of
              against it
            </li>
          </ul>

          <p>
            The goal isn’t a type or label. The goal is coherence — a system
            that can understand itself.
          </p>
        </div>
      </section>

      {/* ASSESSMENT OVERVIEW */}
      <section className="section-alt" id="assessment">
        <div className="container narrow">
          <h2>The Patternwork Assessment</h2>

          <p>The Assessment identifies patterns in four areas:</p>

          <ol>
            <li>
              <strong>State Patterns</strong> — how your nervous system moves
              through activation, shutdown, and mixed states.
            </li>
            <li>
              <strong>Protector Patterns</strong> — how parts manage threat,
              loss, and overwhelm.
            </li>
            <li>
              <strong>Attachment Patterns</strong> — how you regulate closeness,
              distance, and emotional risk.
            </li>
            <li>
              <strong>Identity Patterns</strong> — roles, habits, and narrative
              loops that shape how you move through your life.
            </li>
          </ol>

          <p>
            Your answers generate a Patternwork Profile — a map of how your
            internal system is organized.
          </p>

          <div id="assessment-start" />

          <div className="hero-actions">
            <a href="/assessment" className="btn">
              Start the Assessment
            </a>
          </div>
        </div>
      </section>

      {/* COMPANION TEASER */}
      <section className="section" id="companion">
        <div className="container narrow">
          <h2>The Patternwork Companion</h2>

          <p>
            The Companion helps you apply what you learn from your Patternwork
            Profile. It supports you with:
          </p>

          <ul>
            <li>Real-time interpretations of your states</li>
            <li>Explanations for why certain patterns activate</li>
            <li>Regulation tools tailored to your system</li>
            <li>Pattern-focused practices for shifting old responses</li>
          </ul>

          <p>
            It’s not therapy. It’s a structured way to work with your internal
            system with clarity and precision.
          </p>
        </div>
      </section>

      {/* WHY PATTERNS MATTER */}
      <section className="section-alt" id="why-patterns-matter">
        <div className="container narrow">
          <h2>Why Patterns Matter</h2>

          <p>Patterns help explain:</p>

          <ul>
            <li>Why the same reactions repeat in different contexts</li>
            <li>Why relationships follow familiar loops</li>
            <li>Why goals collapse at predictable stages</li>
            <li>Why regulation is easier in some situations than others</li>
            <li>
              Why identity can feel stable at times and fragile at others
            </li>
          </ul>

          <p>
            Once the pattern is visible, it can be changed. Patternwork gives
            you the structure to do that with accuracy instead of guesswork.
          </p>
        </div>
      </section>

      {/* BEGIN CTA */}
      <section className="section" id="begin">
        <div className="container narrow">
          <h2>Begin Patternwork</h2>
          <p>
            Start with the assessment or learn the method. Either way, the work
            begins with seeing your patterns clearly.
          </p>

          <div className="hero-actions">
            <a href="/assessment" className="btn">
              Start the Patternwork Assessment
            </a>
            <a href="/method" className="btn btn-secondary">
              Learn the Method</a>
          </div>

          <p style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
            Patternwork is an educational and reflective framework. It is not a
            diagnosis and does not replace therapy or medical care.
          </p>
        </div>
      </section>
    </>
  );
}
