import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { excludeCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { eq, and, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * Merchants ranked by total spend (absolute outflow), paginated for infinite scroll.
 * Grouped by merchant name + base currency (same as legacy analytics aggregate).
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rawOffset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);
    const rawLimit = parseInt(request.nextUrl.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_LIMIT),
    );

    const fetchLimit = limit + 1;

    const rows = await resilientQuery(() =>
      db
        .select({
          name: transactions.merchantName,
          total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
          count: sql<number>`COUNT(*)::int`,
          currency: transactions.baseCurrency,
        })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), sql`${transactions.merchantName} IS NOT NULL`))
        .groupBy(transactions.merchantName, transactions.baseCurrency)
        .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
        .limit(fetchLimit)
        .offset(offset),
    );

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const merchants = slice.map((m) => ({
      name: m.name ?? "Unknown",
      total: parseFloat(m.total ?? "0"),
      count: m.count,
      currency: m.currency,
    }));

    return NextResponse.json(
      {
        merchants,
        offset,
        nextOffset: offset + merchants.length,
        hasMore,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/analytics/merchants", err);
    return NextResponse.json(
      { error: "Failed to load merchants" },
      { status: 500, headers: NO_STORE },
    );
  }
}
