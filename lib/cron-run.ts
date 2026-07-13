import "server-only";

import { db } from "@/lib/db";
import { cronRuns } from "@/lib/db/schema";

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

/**
 * Upserts cron_runs last failure. Call from catch blocks.
 */
export async function recordCronFailure(
  cronPath: string,
  durationMs: number,
  summary?: Record<string, unknown>,
): Promise<void> {
  try {
    await db
      .insert(cronRuns)
      .values({
        cronPath,
        lastSuccessAt: new Date(0),
        failureDurationMs: durationMs,
        failureSummary: summary ?? null,
        lastFailureAt: new Date(),
      })
      .onConflictDoUpdate({
        target: cronRuns.cronPath,
        set: {
          lastFailureAt: new Date(),
          failureDurationMs: durationMs,
          failureSummary: summary ?? null,
        },
      });
  } catch (err) {
    console.error("[cron-run] Failed to record failure:", err);
  }
}
