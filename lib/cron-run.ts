import "server-only";

import { db } from "@/lib/db";
import { cronRuns } from "@/lib/db/schema";
import { sanitizeErrorMessage } from "@/lib/safe-error";

/**
 * Upserts cron_runs last success. Call on every cron success path (including early returns).
 */
export async function recordCronRun(
  cronPath: string,
  durationMs: number,
  summary?: Record<string, unknown>,
): Promise<void> {
  try {
    await db
      .insert(cronRuns)
      .values({
        cronPath,
        lastSuccessAt: new Date(),
        durationMs,
        summary: summary ?? null,
      })
      .onConflictDoUpdate({
        target: cronRuns.cronPath,
        set: {
          lastSuccessAt: new Date(),
          durationMs,
          summary: summary ?? null,
        },
      });
  } catch (err) {
    console.error("[cron-run] Failed to record success:", err);
  }
}

/** Redact PII-ish strings inside failure summaries before persisting. */
function sanitizeFailureSummary(
  summary?: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!summary) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(summary)) {
    if (typeof v === "string") out[k] = sanitizeErrorMessage(v);
    else out[k] = v;
  }
  return out;
}

/**
 * Upserts cron_runs last failure. Call from catch blocks.
 * String fields in `summary` are sanitized (no raw emails / card-like digits).
 */
export async function recordCronFailure(
  cronPath: string,
  durationMs: number,
  summary?: Record<string, unknown>,
): Promise<void> {
  const failureSummary = sanitizeFailureSummary(summary);
  try {
    await db
      .insert(cronRuns)
      .values({
        cronPath,
        lastSuccessAt: new Date(0),
        failureDurationMs: durationMs,
        failureSummary,
        lastFailureAt: new Date(),
      })
      .onConflictDoUpdate({
        target: cronRuns.cronPath,
        set: {
          lastFailureAt: new Date(),
          failureDurationMs: durationMs,
          failureSummary,
        },
      });
  } catch (err) {
    console.error("[cron-run] Failed to record failure:", err);
  }
}
