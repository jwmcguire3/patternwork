import { useState } from "react";

type Phase = {
  range: string;
  heading: string;
  body: string;
};

const PHASES: Phase[] = [
  {
    range: "Days 1–2",
    heading: "Familiar territory",
    body: "The aches, the nausea, appetite gone, trouble sleeping, short fuse. Roughly what you already feel at the end of a long gap. You have been here many times.",
  },
  {
    range: "Days 3–6",
    heading: "The peak, and the part you haven't seen",
    body: "Worst sleep, most irritability, sweating and chills, appetite at its lowest. This is further than you've been getting — and it is more of the same rather than something new and worse. Then it turns.",
  },
  {
    range: "Days 7–14",
    heading: "It starts giving things back",
    body: "Physical symptoms fade steadily. The aches and nausea go first. Appetite returns, often suddenly and with interest. Sleep begins arriving in longer stretches.",
  },
  {
    range: "Weeks 2–6",
    heading: "The unglamorous stretch",
    body: "No more sickness, but sleep is still uneven and mood still flat. Vivid, strange dreams are normal — that's REM rebounding, and it means sleep is rebuilding. This is where most people go back, because the dramatic part is over and it stops feeling like there's a reason to be struggling. There is one. Give it the full six weeks.",
  },
];

const SURVIVAL = [
  {
    term: "Sleep",
    detail:
      "This is the thing that breaks people. Fixed wake time every day. Cool, dark room. No caffeine after early afternoon. Awake more than twenty minutes — get up. If it's severe, a doctor can help short-term, and that's a reasonable thing to ask for.",
  },
  {
    term: "The aches",
    detail:
      "Ordinary painkillers work. Nothing exotic required. A warm shower helps the shivery feeling more than it should, and costs nothing.",
  },
  {
    term: "Eating",
    detail:
      "Small and often. Big meals will be unappealing and won't happen. Smoothies, soup, toast, yogurt — anything that goes down. Appetite comes back in week two.",
  },
  {
    term: "Fluids",
    detail:
      "Especially if you're sweating at night. Something with electrolytes if there's a lot of it.",
  },
  {
    term: "Movement",
    detail:
      "Once past the first couple of days — a walk is enough. Exercise has real evidence behind it for cravings, mood and sleep, and it's the most effective free thing available.",
  },
];

const SETUP = [
  {
    term: "Clear the house first",
    detail:
      "Product and equipment both. Days three to six are not when you want to be relying on willpower to walk past something.",
  },
  {
    term: "Tell one person",
    detail:
      "Not to be supervised — so someone understands that if you're miserable and snappish this week, it's chemistry, and it has an end date.",
  },
  {
    term: "Decide now what you do",
    detail:
      "The thought will arrive, probably around day three, and it will sound extremely reasonable. Arguing with it live while you feel awful is a losing position. Pick the action in advance: outside, shower, text one specific person. Something with a body attached.",
  },
  {
    term: "On tapering",
    detail:
      "It works for some people and it's fair if stopping outright has failed before. But it asks you to measure out a smaller amount and then stop, every single day — the exact thing that's currently hard — and money keeps going out the whole time. For this particular loop, the shorter sharp version is usually cleaner. It's also completely safe: unlike alcohol or benzodiazepines, there's no medical danger in stopping abruptly.",
  },
];

export default function DoingTheHardPart() {
  const [daily, setDaily] = useState<number>(20);

  const spend = Number.isNaN(daily) ? 0 : daily;
  const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

  return (
    <article className="guide">
      <header>
        <p className="eyebrow">A guide for stopping</p>
        <h1>You've already been doing the hard part</h1>
        <p className="dek">For when going without already makes you feel ill.</p>
      </header>

      <section>
        <h2>What that feeling actually is</h2>
        <p>
          The aches. The queasiness. No appetite. The sense that you're coming
          down with something and can't quite shake it. Feeling wrung out and
          irritable and vaguely wrong in your own body.
        </p>
        <p>
          That's withdrawal. It has a clinical description and yours matches it
          closely — irritability, anxiety, poor sleep, appetite loss, stomach
          discomfort, headaches, sweating, chills, shakiness. People describe it
          as a low-grade flu that won't resolve, and that's a fair account of the
          physiology. Roughly half of people who use heavily and regularly get it
          when they stop.
        </p>
        <p>
          <strong>You're not imagining it and you're not being dramatic.</strong>{" "}
          This is a documented physical syndrome. Your receptors adapted to a
          constant supply and they're signalling its absence. That's chemistry,
          not character.
        </p>
        <p>
          And the second thing, which matters more:{" "}
          <strong>you already know exactly how bad it gets.</strong> That feeling
          arriving whenever you've gone a while without — that is the thing you're
          afraid of. It isn't an unknown horror waiting on the other side of a
          decision. You've met it many times.
        </p>
      </section>

      <section>
        <h2>The loop, stated plainly</h2>
        <p>
          Every time it starts, you use, and it lifts for a few hours. Then it
          comes back, and you use again.
        </p>
        <blockquote>
          You have been doing day one of withdrawal over and over, for months,
          without ever getting to day four.
        </blockquote>
        <p>
          You're paying the entire cost of quitting on a recurring basis and
          collecting none of the benefit — because each time, right at the point
          where it would start getting better, the clock resets to zero.
        </p>
        <p>
          The sickness isn't the price of stopping. It's the price of continuing.
          Stopping is the only thing that makes it stop being a recurring charge.
        </p>
      </section>

      <section>
        <h2>What you're actually buying now</h2>
        <p>
          Somewhere in there is a memory of this working — of it being good, being
          worth it. That memory is real. It happened.
        </p>
        <p>
          But the reason the same amount doesn't do what it used to is that your
          receptors have downregulated, and that isn't something you can outspend.
          Not with more, not with something stronger, not with a break too short
          to count. The good version isn't being withheld pending one final
          session. It's not on the shelf.
        </p>
        <p>
          So look at what the transaction actually is now. The money isn't buying
          pleasure. It's buying a few hours of not-feeling-sick, from a sickness
          that the purchase itself sustains.{" "}
          <strong>
            That's not a treat. It's a subscription fee on a problem, and the
            problem is the product.
          </strong>
        </p>

        <div className="calculator">
          <label htmlFor="daily-spend">Roughly, per day</label>
          <input
            id="daily-spend"
            type="number"
            min={0}
            value={Number.isNaN(daily) ? "" : daily}
            onChange={(e) => setDaily(parseFloat(e.target.value))}
          />
          <dl>
            <div>
              <dt>A week</dt>
              <dd>{money(spend * 7)}</dd>
            </div>
            <div>
              <dt>A month</dt>
              <dd>{money(spend * 30)}</dd>
            </div>
            <div>
              <dt>A year</dt>
              <dd>{money(spend * 365)}</dd>
            </div>
          </dl>
          <p className="note">
            It's invisible because it leaves in small pieces. Start a running
            total from today — in three weeks that figure is the most persuasive
            object you own.
          </p>
        </div>
      </section>

      <section>
        <h2>Here's the good news, and it's real</h2>
        <p>
          Receptor downregulation reverses. Brain imaging shows density beginning
          to recover within a couple of days of stopping and approaching normal by
          around four weeks.
        </p>
        <p>
          Which means the flatness — the sense that nothing much lands anymore,
          that ordinary things aren't enjoyable, that the good version of anything
          is gone — is not permanent, and not who you are now. It's a receptor
          state with a documented recovery curve. Food tasting like something
          again, actually wanting to do things, laughing at something without
          deciding to: those come back on roughly a one-month timeline.
        </p>
        <p>
          You can't get there by using less on a Tuesday. You get there by letting
          the clock run past four days for the first time.
        </p>
      </section>

      <section>
        <h2>What the clock looks like</h2>
        <ol className="timeline">
          {PHASES.map((phase) => (
            <li key={phase.range}>
              <p className="range">{phase.range}</p>
              <h3>{phase.heading}</h3>
              <p>{phase.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Getting through days three to six</h2>
        <dl className="definitions">
          {SURVIVAL.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2>Practical setup</h2>
        <dl className="definitions">
          {SETUP.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.detail}</dd>
            </div>
          ))}
        </dl>
        <p>
          Marijuana Anonymous and SMART Recovery both run online meetings at all
          hours and cost nothing. In the US, the SAMHSA helpline —{" "}
          <strong>1-800-662-4357</strong> — is free, confidential and open 24/7.
        </p>
      </section>

      <section>
        <h2>Worth a doctor if</h2>
        <ul>
          <li>
            Vomiting is severe, or you can't keep fluids down for a day or more.
          </li>
          <li>Symptoms are still severe and not improving after six weeks.</li>
          <li>
            The low mood gets heavy rather than just flat. If you find yourself
            having thoughts of hurting yourself, don't sit with that alone — call
            a doctor, a crisis line, or someone you trust.
          </li>
        </ul>
      </section>

      <section>
        <h2>The short version</h2>
        <p>
          The illness you're afraid of is the illness you already have, on repeat,
          at full price.
        </p>
        <p>
          You've done days one and two more times than you can count. What you
          haven't done is day five — and day five isn't a new and worse thing,
          it's the last of the same thing, after which it goes away and stays
          away.
        </p>
        <p>
          There's no version where you get one more good one first. That option
          quietly expired a while ago. What's still on the table is the part where
          it ends.
        </p>
      </section>
    </article>
  );
}
