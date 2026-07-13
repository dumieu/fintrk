import { NextRequest, NextResponse } from "next/server";
import { db, resilientQuery } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { detectRecurringPatterns } from "@/lib/recurring-detector";
import { logServerError } from "@/lib/safe-error";
import { recordCronFailure, recordCronRun } from "@/lib/cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_PATH = "/api/cron/recurring";

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed in production; allow unauthenticated local runs when unset.
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    const userIds = await resilientQuery(() =>
      db.selectDistinct({ userId: accounts.userId }).from(accounts),
    );

    let totalPatterns = 0;

    for (const { userId } of userIds) {
      try {
        const count = await detectRecurringPatterns(userId);
        totalPatterns += count;
      } catch (err) {
        logServerError(`cron/recurring/${userId}`, err);
      }
    }

    const summary = {
      success: true,
      usersProcessed: userIds.length,
      patternsFound: totalPatterns,
    };
    await recordCronRun(CRON_PATH, Date.now() - started, summary);
    return NextResponse.json(summary);
  } catch (err) {
    logServerError("cron/recurring", err);
    await recordCronFailure(CRON_PATH, Date.now() - started, {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
