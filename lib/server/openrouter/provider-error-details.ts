const MAX_PROVIDER_ERROR_DETAIL_CHARS = 12_000;
const MAX_PROVIDER_ERROR_DEPTH = 6;
const MAX_PROVIDER_ERROR_ENTRIES = 64;

const SENSITIVE_PROVIDER_ERROR_KEY = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|credential)/iu;

function redactProviderErrorText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"']+/giu, "Bearer [redacted]")
    .replace(/\b(?:sk-(?:or-v1-|proj-|ant-)?|or-v1-)[A-Za-z0-9_-]{12,}\b/giu, "[redacted]")
    .replace(/((?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*["']?\s*[:=]\s*["']?)[^"',\s}\]]+/giu, "$1[redacted]");
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactProviderErrorText(value);
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (depth >= MAX_PROVIDER_ERROR_DEPTH) return "[nested detail omitted]";
  if (Array.isArray(value)) {
    return [
      ...value.slice(0, MAX_PROVIDER_ERROR_ENTRIES).map((item) => sanitizeValue(item, depth + 1)),
      ...(value.length > MAX_PROVIDER_ERROR_ENTRIES ? ["[additional entries omitted]"] : []),
    ];
  }
  if (typeof value !== "object") return String(value);

  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_PROVIDER_ERROR_ENTRIES);
  const sanitized = Object.fromEntries(entries.map(([key, child]) => [
    key,
    SENSITIVE_PROVIDER_ERROR_KEY.test(key) ? "[redacted]" : sanitizeValue(child, depth + 1),
  ]));
  if (Object.keys(value as Record<string, unknown>).length > MAX_PROVIDER_ERROR_ENTRIES) {
    sanitized.additionalDetails = "[additional entries omitted]";
  }
  return sanitized;
}

/**
 * Keeps bounded upstream rejection detail for an explicitly opted-in local
 * diagnostic. Authentication values are redacted, and very large details are
 * truncated before they enter a durable attempt receipt.
 */
export function sanitizeProviderErrorDetail(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  let sanitized: unknown;
  if (typeof value === "string") {
    try {
      sanitized = sanitizeValue(JSON.parse(value) as unknown, 0);
    } catch {
      const text = redactProviderErrorText(value);
      return text.length <= MAX_PROVIDER_ERROR_DETAIL_CHARS
        ? text
        : `${text.slice(0, MAX_PROVIDER_ERROR_DETAIL_CHARS)}[truncated]`;
    }
  } else {
    sanitized = sanitizeValue(value, 0);
  }

  const text = JSON.stringify(sanitized);
  return text.length <= MAX_PROVIDER_ERROR_DETAIL_CHARS
    ? text
    : `${text.slice(0, MAX_PROVIDER_ERROR_DETAIL_CHARS)}[truncated]`;
}
