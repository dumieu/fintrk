import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { doubleChargeWatchlistExclusions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";
import { ensureDoubleChargeWatchlistTable } from "@/lib/ensure-double-charge-watchlist";
import { doubleChargeWatchlistExcludeSchema } from "@/lib/validations/double-charge-watchlist";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();
    await ensureDoubleChargeWatchlistTable();

    const body = await request.json();
    const parsed = doubleChargeWatchlistExcludeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });
    }

    const { merchantKey, displayName } = parsed.data;

    await resilientQuery(() =>
      db
        .insert(doubleChargeWatchlistExclusions)
        .values({
          userId,
          merchantKey,
          displayName,
        })
        .onConflictDoNothing({
          target: [doubleChargeWatchlistExclusions.userId, doubleChargeWatchlistExclusions.merchantKey],
        }),
    );

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/transactions/double-charge-watchlist/POST", err);
    return NextResponse.json({ error: "Failed to update watchlist" }, { status: 500, headers: NO_STORE });
  }
}

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();
    await ensureDoubleChargeWatchlistTable();

    const rows = await resilientQuery(() =>
      db
        .select({
          merchantKey: doubleChargeWatchlistExclusions.merchantKey,
          displayName: doubleChargeWatchlistExclusions.displayName,
        })
        .from(doubleChargeWatchlistExclusions)
        .where(eq(doubleChargeWatchlistExclusions.userId, userId)),
    );

    return NextResponse.json({ exclusions: rows }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/transactions/double-charge-watchlist/GET", err);
    return NextResponse.json({ error: "Failed to load watchlist exclusions" }, { status: 500, headers: NO_STORE });
  }
}
