/** True for the Python replay operator, including its historical prefixed form. */
export function isReplayOperatorItem(item: unknown): boolean {
  return item === "REPLAY" || (typeof item === "string" && item.startsWith("REPLAY:"));
}
