export type AnswerKey = "A" | "B" | "C" | "D" | "E" | "F";

export type BodyZone =
  | "head"
  | "throat"
  | "chest"
  | "stomach"
  | "shoulders"
  | "limbs"
  | "somewhere_else"
  | "none";

export type BodyImpulse =
  | "run"
  | "freeze"
  | "curl_up"
  | "fight"
  | "reach"
  | "hide"
  | "nothing";

export type QuestionLoad = "mild" | "moderate" | "high";
export type QuestionCategory = "att" | "ifs" | "state" | "agency";

export type AnswerOption = {
  key: AnswerKey;
  label: string;
};

export type SelfMapQuestion = {
  id: string;
  number: number;
  category: QuestionCategory;
  axis: string;
  load: QuestionLoad;
  intensityCandidate: boolean;
  scenarioTag: string;
  scenario: string;
  prompt: string;
  answers: AnswerOption[];
  enhancedBodyPrompt?: boolean;
};

export type QuestionResponse = {
  questionId: string;
  primary: AnswerKey | null;
  secondary: AnswerKey | null;
  somatic: BodyZone | null;
  impulse: BodyImpulse | null;
  note?: string | null;
};

export const BODY_ZONES: { value: BodyZone; label: string }[] = [
  { value: "head", label: "Head" },
  { value: "throat", label: "Throat" },
  { value: "chest", label: "Chest" },
  { value: "stomach", label: "Stomach" },
  { value: "shoulders", label: "Shoulders" },
  { value: "limbs", label: "Limbs" },
  { value: "somewhere_else", label: "Somewhere else" },
  { value: "none", label: "None / not sure" },
];

export const BODY_IMPULSES: { value: BodyImpulse; label: string }[] = [
  { value: "run", label: "Run" },
  { value: "freeze", label: "Freeze" },
  { value: "curl_up", label: "Curl up" },
  { value: "fight", label: "Fight" },
  { value: "reach", label: "Reach" },
  { value: "hide", label: "Hide" },
  { value: "nothing", label: "Nothing" },
];

/**
 * Replace this seed set with your real 60-question bank.
 * Structure is already aligned to the report-engine format:
 * Q##|category|axis|load|ic|PRIMARY|SECONDARY|SOMATIC|scenario_tag[|IMPULSE]
 */
export const QUESTIONS: SelfMapQuestion[] = [
  {
    id: "Q01",
    number: 1,
    category: "att",
    axis: "4",
    load: "mild",
    intensityCandidate: false,
    scenarioTag: "partner_goes_quiet",
    scenario:
      "Someone close to you seems a little off and gives shorter replies than usual.",
    prompt: "What happens in you first?",
    answers: [
      { key: "A", label: "I pause and try to understand what might actually be going on." },
      { key: "B", label: "I start adjusting myself and trying to keep things smooth." },
      { key: "C", label: "My mind locks on and starts turning it over." },
      { key: "D", label: "I get quieter and start pulling inward." },
      { key: "E", label: "I feel a quick spike of pressure or hurt." },
      { key: "F", label: "I go a little blank or distant." },
    ],
  },
  {
    id: "Q02",
    number: 2,
    category: "state",
    axis: "5",
    load: "moderate",
    intensityCandidate: false,
    scenarioTag: "task_pressure_builds",
    scenario:
      "You realize something important may not get done on time, and the pressure starts building.",
    prompt: "What happens in you first?",
    answers: [
      { key: "A", label: "I take a breath and steady myself before doing anything." },
      { key: "B", label: "I move into handling mode and start trying to fix it fast." },
      { key: "C", label: "I get mentally stuck and start replaying possibilities." },
      { key: "D", label: "My energy drops and I want to step back from it." },
      { key: "E", label: "I feel a surge of urgency, heat, or pressure." },
      { key: "F", label: "I check out a bit and stop feeling fully present." },
    ],
  },
  {
    id: "Q03",
    number: 3,
    category: "att",
    axis: "4,2",
    load: "high",
    intensityCandidate: true,
    scenarioTag: "deep_trust_shaken",
    scenario:
      "Someone you deeply trusted does something that leaves you feeling unexpectedly exposed or shaken.",
    prompt: "What happens in you first?",
    answers: [
      { key: "A", label: "I try to stay present and take in what is actually true before reacting." },
      { key: "B", label: "I shift into managing mode and try to hold everything together." },
      { key: "C", label: "My mind grabs onto it and starts replaying every detail." },
      { key: "D", label: "I pull inward and something in me starts going quiet." },
      { key: "E", label: "I feel a sharp emotional spike — heat, pressure, or protest." },
      { key: "F", label: "Part of me goes distant, numb, or not fully here." },
    ],
    enhancedBodyPrompt: true,
  },
];
