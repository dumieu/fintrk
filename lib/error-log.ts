import "server-only";

import { after } from "next/server";

import { db, isTransientFetchError } from "@/lib/db";
import { errorLogs } from "@/lib/db/schema";
import { sanitizeErrorMessage } from "@/lib/safe-error";

interface ErrorLogOptions {
  userId?: string | null;
  context: string;
  error: unknown;
  errorCode?: string;
  severity?: "error" | "warning" | "critical";
  pathname?: string;
  request?: Request;
  metadata?: Record<string, unknown>;
}

type ErrorLogValues = typeof errorLogs.$inferInsert;

async function persistErrorLog(values: ErrorLogValues, attempt = 0): Promise<void> {
  try {
    await db.insert(errorLogs).values(values);
  } catch (dbErr) {
    if (isTransientFetchError(dbErr) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      return persistErrorLog(values, attempt + 1);
    }
    console.error("[error-log] Failed to persist error log:", dbErr);
  }
}

/**
 * Logs an application error to console and Neon `error_logs` for Admin Error Monitor.
 * Uses the same PII sanitization as `logServerError` in safe-error.ts.
 */
export function logAppError(opts: ErrorLogOptions): void {
  const raw =
    opts.error instanceof Error ? opts.error.message : String(opts.error);
  const message = sanitizeErrorMessage(raw);

  console.error(
    JSON.stringify({
      _type: "server_error",
      context: opts.context,
      message,
      ts: new Date().toISOString(),
    }),
  );

  let ip: string | undefined;
  let ua: string | undefined;
  if (opts.request) {
    const fwd = (opts.request.headers.get("x-forwarded-for") ?? "")
      .split(",")[0]
      .trim();
    ip = fwd || opts.request.headers.get("x-real-ip") || undefined;
    ua = opts.request.headers.get("user-agent") || undefined;
  }

  const values: ErrorLogValues = {
    clerkUserId: opts.userId ?? null,
    errorContext: opts.context,
    errorMessage: message,
    errorCode: opts.errorCode ?? null,
    severity: opts.severity ?? "error",
    pathname: opts.pathname ?? opts.context,
    ipAddress: ip ?? null,
    userAgent: ua ?? null,
    metadata: opts.metadata ?? null,
  };

  try {
    after(() => persistErrorLog(values));
  } catch {
    void persistErrorLog(values);
  }
}
