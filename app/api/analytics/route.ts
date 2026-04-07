import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, accounts } from "@/lib/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const CATEGORY_COLORS: Record<string, string> = {
  "Food & Drink": "#ECAA0B", "Groceries": "#ECAA0B", "Restaurants": "#ECAA0B",
  "Shopping": "#FF6F69", "Transportation": "#AD74FF", "Housing": "#2CA2FF",
  "Entertainment": "#AD74FF", "Health": "#0BC18D", "Financial": "#2CA2FF",
  "Travel": "#ECAA0B", "Education": "#AD74FF", "Income": "#0BC18D",
};

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const [categoryBreakdown, dayOfWeek, topMerchants, countrySpend, fxData, userAccounts] =
      await Promise.all([
        resilientQuery(() =>
          db
            .select({
              category: transactions.categorySuggestion,
              total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
            })
            .from(transactions)
            .where(and(eq(transactions.userId, userId), sql`CAST(${transactions.baseAmount} AS numeric) < 0`))
            .groupBy(transactions.categorySuggestion)
            .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
            .limit(10),
        ),

        resilientQuery(() =>
          db
            .select({
              dow: sql<number>`EXTRACT(DOW FROM ${transactions.postedDate}::date)::int`,
              total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
            })
            .from(transactions)
            .where(and(eq(transactions.userId, userId), sql`CAST(${transactions.baseAmount} AS numeric) < 0`))
            .groupBy(sql`EXTRACT(DOW FROM ${transactions.postedDate}::date)`)
            .orderBy(sql`EXTRACT(DOW FROM ${transactions.postedDate}::date)`),
        ),

        resilientQuery(() =>
          db
            .select({
              name: transactions.merchantName,
              total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
              count: sql<number>`COUNT(*)::int`,
              currency: transactions.baseCurrency,
            })
            .from(transactions)
            .where(and(eq(transactions.userId, userId), sql`${transactions.merchantName} IS NOT NULL`))
            .groupBy(transactions.merchantName, transactions.baseCurrency)
            .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
            .limit(10),
        ),

        resilientQuery(() =>
          db
            .select({
              country: transactions.countryIso,
              total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
              count: sql<number>`COUNT(*)::int`,
            })
            .from(transactions)
            .where(and(eq(transactions.userId, userId), sql`${transactions.countryIso} IS NOT NULL`))
            .groupBy(transactions.countryIso)
            .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
            .limit(10),
        ),

        resilientQuery(() =>
          db
            .select({
              spreadBps: transactions.implicitFxSpreadBps,
              baseAmount: transactions.baseAmount,
            })
            .from(transactions)
            .where(
              and(eq(transactions.userId, userId), sql`${transactions.foreignCurrency} IS NOT NULL`),
            ),
        ),

        resilientQuery(() =>
          db.select({ primaryCurrency: accounts.primaryCurrency }).from(accounts).where(eq(accounts.userId, userId)).limit(1),
        ),
      ]);

    const primaryCurrency = userAccounts[0]?.primaryCurrency ?? "USD";

    const dowArray = Array(7).fill(0);
    for (const row of dayOfWeek) {
      const idx = row.dow === 0 ? 6 : row.dow - 1;
      dowArray[idx] = parseFloat(row.total ?? "0");
    }

    let fxTotal = 0;
    let worstSpread = 0;
    for (const row of fxData) {
      const spread = parseFloat(row.spreadBps ?? "0");
      const amount = Math.abs(parseFloat(row.baseAmount));
      if (spread > 0) {
        fxTotal += amount * (spread / 10000);
        if (spread > worstSpread) worstSpread = spread;
      }
    }

    return NextResponse.json(
      {
        categoryBreakdown: categoryBreakdown.map((c) => ({
          label: c.category ?? "Uncategorized",
          amount: parseFloat(c.total ?? "0"),
          color: CATEGORY_COLORS[c.category ?? ""] ?? "#808080",
        })),
        dayOfWeekSpend: dowArray,
        topMerchants: topMerchants.map((m) => ({
          name: m.name ?? "Unknown",
          total: parseFloat(m.total ?? "0"),
          count: m.count,
          currency: m.currency,
        })),
        countrySpend: countrySpend.map((c) => ({
          country: c.country ?? "XX",
          total: parseFloat(c.total ?? "0"),
          count: c.count,
        })),
        fxFees: {
          total: Math.round(fxTotal * 100) / 100,
          count: fxData.length,
          worstSpread,
          currency: primaryCurrency,
        },
        primaryCurrency,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/analytics", err);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500, headers: NO_STORE });
  }
}
