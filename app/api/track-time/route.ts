import { NextResponse } from "next/server";
import { z } from "zod";
import { resilientAuth } from "@/lib/auth-resilient";
import { db, rawSql, resilientRawSql } from "@/lib/db";
import { pageTimeTracking } from "@/lib/db/schema";
import { logAppError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

const trackTimeSchema = z.object({
  pathname: z.string().min(1).max(512),
  durationMs: z.number().int().min(1).max(86_400_000),
});

let ensureTablePromise: Promise<void> | null = null;

function ensurePageTimeTrackingTable(): Promise<void> {
  ensureTablePromise ??= (async () => {
    await resilientRawSql(
      () => rawSql`
        CREATE TABLE IF NOT EXISTS page_time_tracking (
          id serial PRIMARY KEY,
          clerk_user_id varchar(255) NOT NULL,
          pathname varchar(512) NOT NULL,
          duration_ms integer NOT NULL,
          created_at timestamptz DEFAULT now() NOT NULL
        )
      `,
    );
    await resilientRawSql(
      () => rawSql`
        CREATE INDEX IF NOT EXISTS page_time_tracking_user_idx
        ON page_time_tracking (clerk_user_id)
      `,
    );
    await resilientRawSql(
      () => rawSql`
        CREATE INDEX IF NOT EXISTS page_time_tracking_user_path_idx
        ON page_time_tracking (clerk_user_id, pathname)
      `,
    );
  })().catch((err) => {
    ensureTablePromise = null;
    throw err;
  });

  return ensureTablePromise;
}

export async function POST(request: Request) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) {
      return new Response(null, { status: 204 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(null, { status: 204 });
    }

    const data = trackTimeSchema.parse(body);

    await ensurePageTimeTrackingTable();

    await db.insert(pageTimeTracking).values({
      clerkUserId: userId,
      pathname: data.pathname,
      durationMs: data.durationMs,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid tracking data" }, { status: 400 });
    }

    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "aborted" || msg.includes("AbortError") || msg.includes("body used already")) {
      return new Response(null, { status: 204 });
    }

    logAppError({ context: "POST /api/track-time", error, request });
    return new Response(null, { status: 500 });
  }
}
