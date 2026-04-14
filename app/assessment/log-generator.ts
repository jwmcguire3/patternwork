import type { AnswerType, QuestionData } from "./questions_data";

export type AssessmentAnswer =
  | { type: "T1"; tap1: string | null; tap2: string | null; notes: string }
  | { type: "T2" | "T3" | "T4"; selected: string | null; notes: string }
  | { type: "T5"; value: number | null; notes: string }
  | { type: "T6"; order: string[]; notes: string };

export type AssessmentAnswersState = Record<number, AssessmentAnswer | undefined>;

export function sanitizeNote(note: string): string {
  return note
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAnswered(answer: AssessmentAnswer | undefined): boolean {
  if (!answer) return false;

  switch (answer.type) {
    case "T1":
      return Boolean(answer.tap1 && answer.tap2);
    case "T2":
    case "T3":
    case "T4":
      return Boolean(answer.selected);
    case "T5":
      return answer.value !== null;
    case "T6":
      return answer.order.length > 0;
  }
}

function answerPayload(answer: AssessmentAnswer): string {
  switch (answer.type) {
    case "T1":
      return `tap1=${answer.tap1 ?? ""};tap2=${answer.tap2 ?? ""}`;
    case "T2":
    case "T3":
    case "T4":
      return `pick=${answer.selected ?? ""}`;
    case "T5":
      return `value=${answer.value ?? ""}`;
    case "T6":
      return `order=${answer.order.join(">")}`;
  }
}

export function generateLog(questions: QuestionData[], answers: AssessmentAnswersState): string {
  const lines: string[] = [`[SELFMAP_V5|COUNT=${questions.length}|QBANK=2.0]`];

  for (const question of questions) {
    const answer = answers[question.num];
    if (!isAnswered(answer) || !answer) continue;

    lines.push(
      [
        `Q${String(question.num).padStart(2, "0")}`,
        question.answerType,
        answerPayload(answer),
        sanitizeNote(answer.notes),
      ].join("|"),
    );
  }

  lines.push("[END]");
  return lines.join("\n");
}

export function createEmptyAnswer(type: AnswerType): AssessmentAnswer {
  switch (type) {
    case "T1":
      return { type, tap1: null, tap2: null, notes: "" };
    case "T2":
    case "T3":
    case "T4":
      return { type, selected: null, notes: "" };
    case "T5":
      return { type, value: null, notes: "" };
    case "T6":
      return { type, order: [], notes: "" };
  }
}
