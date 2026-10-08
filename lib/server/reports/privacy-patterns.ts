const LABELED_ACCOUNT_ID = /\b(?:account|acct|member|customer)[\s:#-]*(?:id|identifier|number|no\.?|#|code)[\s:#-]*([A-Z0-9-]{5,})\b/iu;
const BARE_ACCOUNT_ID = /\b(?:account|acct|member|customer)[\s:#-]+([A-Z0-9-]{5,})\b/iu;

function looksLikeIdentifierToken(value: string, allowUppercaseWord: boolean): boolean {
  return /\d/u.test(value) || (allowUppercaseWord && /^[A-Z]{5,}$/u.test(value));
}

/** Match account or member identifiers without treating the next prose word as an ID. */
export function containsAccountIdentifier(value: string): boolean {
  const labeled = LABELED_ACCOUNT_ID.exec(value)?.[1];
  if (labeled && looksLikeIdentifierToken(labeled, true)) return true;
  const bare = BARE_ACCOUNT_ID.exec(value)?.[1];
  return Boolean(bare && looksLikeIdentifierToken(bare, false));
}
