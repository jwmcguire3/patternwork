export const PWRP71_PRODUCT_FRAME = "A working interpretation for self-reflection, not a diagnosis or a physiological measurement.";
export function renderPwrp71Markdown(draft: Record<string, unknown>): string {
  const lines = [`# ${String(draft.title)}`, ""];
  for (const value of Array.isArray(draft.sections) ? draft.sections : []) {
    const section = value as Record<string, unknown>;
    if (typeof section.heading === "string" && section.heading) lines.push(`## ${section.heading}`, "");
    lines.push(String(section.text), "");
  }
  const questions = Array.isArray(draft.reflection_questions) ? draft.reflection_questions : [];
  if (questions.length) { lines.push("## To notice", ""); for (const question of questions) lines.push(String(question), ""); }
  lines.push("---", "", `*${PWRP71_PRODUCT_FRAME}*`);
  return `${lines.join("\n").trimEnd()}\n`;
}
