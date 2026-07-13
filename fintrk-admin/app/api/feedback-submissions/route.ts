import { NextRequest, NextResponse } from "next/server";

import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const sentimentParam = request.nextUrl.searchParams.get("sentiment");
    const sentimentFilter =
      sentimentParam === "loving_it" || sentimentParam === "tough_time"
        ? sentimentParam
        : null;

    const [statsRows, dailyRows, listRows] = await Promise.all([
      sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE sentiment = 'loving_it')::int AS loving_it,
          COUNT(*) FILTER (WHERE sentiment = 'tough_time')::int AS tough_time,
          COUNT(*) FILTER (WHERE message IS NOT NULL AND BTRIM(message) <> '')::int AS with_message,
          COUNT(*) FILTER (WHERE clerk_user_id IS NULL)::int AS anonymous,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7d,
          COUNT(*) FILTER (
            WHERE created_at >= NOW() - INTERVAL '14 days'
              AND created_at < NOW() - INTERVAL '7 days'
          )::int AS prev_7d
        FROM feedback_submissions
      `,
      sql`
        SELECT
          (created_at AT TIME ZONE 'UTC')::date AS day,
          COUNT(*)::int AS count
        FROM feedback_submissions
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      sentimentFilter
        ? sql`
            SELECT id, clerk_user_id, email, sentiment, message, created_at
            FROM feedback_submissions
            WHERE sentiment = ${sentimentFilter}
            ORDER BY created_at DESC
            LIMIT 400
          `
        : sql`
            SELECT id, clerk_user_id, email, sentiment, message, created_at
            FROM feedback_submissions
            ORDER BY created_at DESC
            LIMIT 400
          `,
    ]);

    const stats = statsRows[0] as {
      total: number;
      loving_it: number;
      tough_time: number;
      with_message: number;
      anonymous: number;
      last_7d: number;
      prev_7d: number;
    };

    const daily = (dailyRows as { day: string; count: number }[]).map((r) => ({
      day: typeof r.day === "string" ? r.day : String(r.day),
      count: r.count,
    }));

    const items = (listRows as Record<string, unknown>[]).map((r) => ({
      idFeedback: r.id as string,
      clerkUserId: (r.clerk_user_id as string | null) ?? null,
      email: r.email as string,
      sentiment: r.sentiment as string,
      message: (r.message as string | null) ?? null,
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
    }));

    const res = NextResponse.json({ stats, daily, items });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    console.error("Feedback submissions API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
