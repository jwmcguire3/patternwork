import test from "node:test";
import assert from "node:assert/strict";

import { generateLog, sanitizeNote, type AssessmentAnswersState } from "./log-generator.ts";
import { type QuestionData } from "./questions_data.ts";

const baseQuestion: Omit<QuestionData, "num" | "scenarioTag" | "supportsImpulse"> = {
  category: "att",
  axis: "4",
  load: "moderate",
  ic: "",
  text: "test",
  options: { A: "a", B: "b", C: "c", D: "d", E: "e", F: "f" },
  bodyPrompt: "standard",
};

function makeQuestion(num: number, scenarioTag: string, supportsImpulse: boolean): QuestionData {
  return {
    ...baseQuestion,
    num,
    scenarioTag,
    supportsImpulse,
    bodyPrompt: "standard",
  };
}

test("answered question with note and no impulse support includes NOTE column only", () => {
  const questions = [makeQuestion(1, "partner_goes_cold", false)];
  const answers: AssessmentAnswersState = {
    1: {
      selected: ["C", "E", "B"],
      bodyZones: ["chest"],
      impulse: "hide",
      notes: "felt pressure in the center of my chest",
    },
  };

  const log = generateLog(questions, answers);
  assert.ok(
    log.includes(
      "Q01|att|4|moderate||C|EB|chest|partner_goes_cold|felt pressure in the center of my chest",
    ),
  );
  assert.ok(!log.includes("|hide"));
});

test("answered question with empty note and no impulse support keeps trailing NOTE delimiter", () => {
  const questions = [makeQuestion(2, "irritation_at_work", false)];
  const answers: AssessmentAnswersState = {
    2: {
      selected: ["B", "A"],
      bodyZones: [],
      impulse: null,
      notes: "   ",
    },
  };

  const log = generateLog(questions, answers);
  assert.ok(log.includes("Q02|att|4|moderate||B|A|NONE|irritation_at_work|"));
});

test("answered question with impulse support and chosen impulse includes IMPULSE", () => {
  const questions = [makeQuestion(3, "felt_misunderstood", true)];
  const answers: AssessmentAnswersState = {
    3: {
      selected: ["E", "D", "C"],
      bodyZones: ["throat"],
      impulse: "hide",
      notes: "this reminded me of family conflict more than work",
    },
  };

  const log = generateLog(questions, answers);
  assert.ok(
    log.includes(
      "Q03|att|4|moderate||E|DC|throat|felt_misunderstood|this reminded me of family conflict more than work|hide",
    ),
  );
});

test("impulse-supporting question with no chosen impulse keeps empty trailing IMPULSE column", () => {
  const questions = [makeQuestion(8, "overloaded_and_numb", true)];
  const answers: AssessmentAnswersState = {
    8: {
      selected: ["F", "E"],
      bodyZones: [],
      impulse: null,
      notes: "",
    },
  };

  const log = generateLog(questions, answers);
  assert.ok(log.includes("Q08|att|4|moderate||F|E|NONE|overloaded_and_numb||"));
});

test("sanitizeNote strips pipes, collapses line breaks, and trims", () => {
  const sanitized = sanitizeNote("  alpha|beta\nline two\r\nline three  ");
  assert.equal(sanitized, "alpha/beta line two line three");
});

test("unanswered questions are skipped and header/footer remain exact", () => {
  const questions = [makeQuestion(1, "a", false), makeQuestion(2, "b", true)];
  const answers: AssessmentAnswersState = {
    1: {
      selected: [],
      bodyZones: ["chest"],
      impulse: null,
      notes: "ignored",
    },
  };

  const log = generateLog(questions, answers);
  assert.equal(log, "[SELFMAP_V4.1|COUNT=2|QBANK=1.0]\n[END]");
});

test("only primary selection sets SECONDARY to '-'", () => {
  const questions = [makeQuestion(4, "primary_only", false)];
  const answers: AssessmentAnswersState = {
    4: {
      selected: ["A"],
      bodyZones: [],
      impulse: null,
      notes: "note",
    },
  };

  const log = generateLog(questions, answers);
  assert.ok(log.includes("Q04|att|4|moderate||A|-|NONE|primary_only|note"));
});
