export type AssessmentAnswer = {
  selected: string[];
  bodyZones: string[];
  impulse: string | null;
  notes: string;
};

export type AssessmentAnswersState = Record<number, AssessmentAnswer | undefined>;

export function sanitizeNote(note: string): string {
  return note
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type LogQuestion = {
  num: number;
  category: string;
  axis: string;
  load: string;
  ic: string;
  scenarioTag: string;
  supportsImpulse: boolean;
};

function buildQuestionLine(question: LogQuestion, answer: AssessmentAnswer): string {
  const primary = answer.selected[0];
  const secondary = answer.selected.length > 1 ? answer.selected.slice(1).join("") : "-";
  const somatic = answer.bodyZones.length > 0 ? answer.bodyZones.join(",") : "NONE";
  const note = sanitizeNote(answer.notes);

  const fields = [
    `Q${String(question.num).padStart(2, "0")}`,
    question.category,
    question.axis,
    question.load,
    question.ic,
    primary,
    secondary,
    somatic,
    question.scenarioTag,
    note,
  ];

  if (question.supportsImpulse) {
    fields.push(answer.impulse ?? "");
  }

  return fields.join("|");
}

export function generateLog(
  questions: LogQuestion[],
  answers: AssessmentAnswersState,
): string {
  const lines: string[] = [`[SELFMAP_V4.1|COUNT=${questions.length}|QBANK=1.0]`];

  for (const question of questions) {
    const answer = answers[question.num];
    if (!answer || answer.selected.length === 0) {
      continue;
    }

    lines.push(buildQuestionLine(question, answer));
  }

  lines.push("[END]");
  return lines.join("\n");
}
