import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyAnswer,
  generateLog,
  isAnswered,
  sanitizeNote,
  type AssessmentAnswersState,
} from "./log-generator.ts";
import { type QuestionData } from "./questions_data.ts";

const questions: QuestionData[] = [
  {
    num: 1,
    answerType: "T1",
    text: "q1",
    tap1: [{ id: "A", text: "a" }],
    tap2: [{ id: "B", text: "b" }],
  },
  {
    num: 2,
    answerType: "T5",
    text: "q2",
    leftLabel: "left",
    rightLabel: "right",
  },
  {
    num: 3,
    answerType: "T6",
    text: "q3",
    options: [{ id: "A", text: "a" }, { id: "B", text: "b" }],
  },
];

test("sanitizeNote strips pipes and newlines", () => {
  assert.equal(sanitizeNote("  a|b\n c  "), "a/b c");
});

test("isAnswered respects answer type", () => {
  assert.equal(isAnswered({ type: "T1", tap1: "A", tap2: null, notes: "" }), false);
  assert.equal(isAnswered({ type: "T1", tap1: "A", tap2: "B", notes: "" }), true);
  assert.equal(isAnswered({ type: "T5", value: null, notes: "" }), false);
  assert.equal(isAnswered({ type: "T5", value: 42, notes: "" }), true);
});

test("generateLog serializes all new answer formats", () => {
  const answers: AssessmentAnswersState = {
    1: { type: "T1", tap1: "A", tap2: "B", notes: "hello" },
    2: { type: "T5", value: 77, notes: "" },
    3: { type: "T6", order: ["B", "A"], notes: "ranked" },
  };

  const log = generateLog(questions, answers);
  assert.ok(log.includes("Q01|T1|tap1=A;tap2=B|hello"));
  assert.ok(log.includes("Q02|T5|value=77|"));
  assert.ok(log.includes("Q03|T6|order=B>A|ranked"));
});

test("createEmptyAnswer defaults by type", () => {
  assert.deepEqual(createEmptyAnswer("T3"), { type: "T3", selected: null, notes: "" });
});
