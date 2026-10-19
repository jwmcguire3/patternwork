const MAX_CAUSE_DEPTH = 5;
const MAX_TEXT_LENGTH = 500;

function boundedString(value) {
  return sanitizedMessage(value);
}

function sanitizedMessage(value) {
  if (typeof value !== "string") return null;
  return value
    .replace(/\bBearer\s+[^\s"'`,;]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/((?:["']?)(?:proxy-)?authorization(?:["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[A-Za-z][A-Za-z0-9_-]*\s+[^\s,;}"']+|[^\s,;}"']+)/gi, "$1[REDACTED]")
    .replace(/((?:["']?)(?:api[_ -]?key|access[_ -]?token|token|secret|password)(?:["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}"']+)/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/gi, "$1?[REDACTED]")
    .slice(0, MAX_TEXT_LENGTH);
}

/** Keep allowlisted transport fields; scrub common inline credentials and omit headers/body. */
export function transportErrorDetails(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  while (current && chain.length < MAX_CAUSE_DEPTH && !seen.has(current)) {
    seen.add(current);
    const row = {
      name: boundedString(current.name),
      message: sanitizedMessage(current.message),
      code: boundedString(current.code),
      errno: boundedString(current.errno),
      syscall: boundedString(current.syscall),
      hostname: boundedString(current.hostname),
      address: boundedString(current.address),
      port: Number.isSafeInteger(current.port) ? current.port : null,
    };
    if (Object.values(row).some((value) => value !== null)) chain.push(row);
    current = current.cause;
  }
  return { schemaVersion: "PATTERNWORK-TRANSPORT-ERROR-DETAILS-V1", causeChain: chain };
}

export function safeTransportErrorRecord(error) {
  const details = transportErrorDetails(error);
  return {
    summary: details.causeChain[0]?.message ?? "Transport request failed",
    details,
  };
}
