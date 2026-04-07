import "server-only";

const SENSITIVE_PATTERNS = [
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{9,}\b/g,
];

function sanitize(message: string): string {
  let clean = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    clean = clean.replace(pattern, "[REDACTED]");
  }
  return clean;
}

export function logServerError(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    JSON.stringify({
      _type: "server_error",
      context,
      message: sanitize(message),
      ts: new Date().toISOString(),
    }),
  );
}
