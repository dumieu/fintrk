import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery, resilientRawSql, rawSql } from "@/lib/db";
import { transactions, accounts } from "@/lib/db/schema";
import { excludeCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { eq, and, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Countries ranked by total outflow (absolute spend), paginated for infinite scroll.
 * Includes `grandTotal` and `maxCountryTotal` for share % and bar width vs full dataset.
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

    const countryWhere = and(
      eq(transactions.userId, userId),
      excludeCardPaymentsSql(),
      sql`${transactions.countryIso} IS NOT NULL`,
      sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
    );

    const [rows, grandRow, userAccounts, maxRows] = await Promise.all([
      resilientQuery(() =>
        db
          .select({
            country: transactions.countryIso,
            total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(transactions)
          .where(countryWhere)
          .groupBy(transactions.countryIso)
          .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
          .limit(fetchLimit)
          .offset(offset),
      ),
      /** Sum of all outflows with a country (equals sum of per-country buckets). */
      resilientQuery(() =>
        db
          .select({
            grandTotal: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.baseAmount} AS numeric))), 0)`,
          })
          .from(transactions)
          .where(countryWhere),
      ),
      resilientQuery(() =>
        db
          .select({ primaryCurrency: accounts.primaryCurrency })
          .from(accounts)
          .where(eq(accounts.userId, userId))
          .limit(1),
      ),
      /** Max of per-country totals — Drizzle subquery aggregates were failing at runtime. */
      resilientRawSql(() =>
        rawSql`
          SELECT COALESCE(MAX(per_total), 0)::text AS max_total
          FROM (
            SELECT SUM(ABS(CAST(base_amount AS numeric))) AS per_total
            FROM transactions
            WHERE user_id = ${userId}
              AND country_iso IS NOT NULL
              AND CAST(base_amount AS numeric) < 0
              AND NOT EXISTS (
                SELECT 1
                FROM user_categories card_payment_category
                WHERE card_payment_category.id = transactions.category_id
                  AND card_payment_category.user_id = transactions.user_id
                  AND card_payment_category.slug = 'card-payments'
              )
            GROUP BY country_iso
          ) s
        `,
      ),
    ]);

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const primaryCurrency = userAccounts[0]?.primaryCurrency ?? "USD";
    const grandTotal = parseFloat(grandRow[0]?.grandTotal ?? "0");
    const maxRow = maxRows[0] as { max_total: string } | undefined;
    const maxCountryTotal = parseFloat(maxRow?.max_total ?? "0");

    const countries = slice.map((c) => ({
      country: c.country ?? "XX",
      total: parseFloat(c.total ?? "0"),
      count: c.count,
    }));

    return NextResponse.json(
      {
        countries,
        offset,
        nextOffset: offset + countries.length,
        hasMore,
        primaryCurrency,
        grandTotal: Math.round(grandTotal * 100) / 100,
        maxCountryTotal: Math.round(maxCountryTotal * 100) / 100,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/analytics/countries", err);
    return NextResponse.json(
      { error: "Failed to load countries" },
      { status: 500, headers: NO_STORE },
    );
  }
}
