import { NextRequest, NextResponse } from "next/server";
import { db, resilientQuery } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { detectRecurringPatterns } from "@/lib/recurring-detector";
import { logServerError } from "@/lib/safe-error";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    return NextResponse.json({ success: true, usersProcessed: userIds.length, patternsFound: totalPatterns });
  } catch (err) {
    logServerError("cron/recurring", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
