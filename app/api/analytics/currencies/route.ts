import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery, resilientRawSql, rawSql } from "@/lib/db";
import { transactions, accounts } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Currencies the user has actually spent in, paginated.
 * The "currency" of a transaction is the foreign currency the merchant charged in
 * (or the account's base currency for domestic spend), `COALESCE(foreign_currency, base_currency)`.
 * Totals are summed in the user's base/primary currency for cross-card comparability.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rawOffset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);
    const rawLimit = parseInt(
      request.nextUrl.searchParams.get("limit") ?? String(DEFAULT_LIMIT),
      10,
    );
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_LIMIT),
    );
    const fetchLimit = limit + 1;

    const currencyExpr = sql<string>`COALESCE(${transactions.foreignCurrency}, ${transactions.baseCurrency})`;

    const whereOutflow = and(
      eq(transactions.userId, userId),
      sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
    );

    const [rows, grandRow, userAccounts, maxRows] = await Promise.all([
      resilientQuery(() =>
        db
          .select({
            currency: currencyExpr,
            total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(transactions)
          .where(whereOutflow)
          .groupBy(currencyExpr)
          .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
          .limit(fetchLimit)
          .offset(offset),
      ),
      resilientQuery(() =>
        db
          .select({
            grandTotal: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.baseAmount} AS numeric))), 0)`,
          })
          .from(transactions)
          .where(whereOutflow),
      ),
      resilientQuery(() =>
        db
          .select({ primaryCurrency: accounts.primaryCurrency })
          .from(accounts)
          .where(eq(accounts.userId, userId))
          .limit(1),
      ),
      /** Max of per-currency totals — bypass Drizzle subquery aggregate (flaky) with raw SQL. */
      resilientRawSql(() =>
        rawSql`
          SELECT COALESCE(MAX(per_total), 0)::text AS max_total
          FROM (
            SELECT SUM(ABS(CAST(base_amount AS numeric))) AS per_total
            FROM transactions
            WHERE user_id = ${userId}
              AND CAST(base_amount AS numeric) < 0
            GROUP BY COALESCE(foreign_currency, base_currency)
          ) s
        `,
      ),
    ]);

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const primaryCurrency = userAccounts[0]?.primaryCurrency ?? "USD";
    const grandTotal = parseFloat(grandRow[0]?.grandTotal ?? "0");
    const maxRow = maxRows[0] as { max_total: string } | undefined;
    const maxCurrencyTotal = parseFloat(maxRow?.max_total ?? "0");

    const currencies = slice
      .map((c) => ({
        currency: (c.currency ?? "").toString().toUpperCase().slice(0, 3) || "???",
        total: parseFloat(c.total ?? "0"),
        count: c.count,
      }))
      .filter((c) => c.currency.length === 3);

    return NextResponse.json(
      {
        currencies,
        offset,
        nextOffset: offset + currencies.length,
        hasMore,
        primaryCurrency,
        grandTotal: Math.round(grandTotal * 100) / 100,
        maxCurrencyTotal: Math.round(maxCurrencyTotal * 100) / 100,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/analytics/currencies", err);
    return NextResponse.json(
      { error: "Failed to load currencies" },
      { status: 500, headers: NO_STORE },
    );
  }
}
