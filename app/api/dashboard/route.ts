import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, accounts, recurringPatterns, categories } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc, ne } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const thisMonth = monthRange(0);
    const lastMonth = monthRange(-1);

    const [
      userAccounts,
      thisMonthTxns,
      lastMonthTxns,
      recentTxns,
      recurring,
      categoryBreakdown,
    ] = await Promise.all([
      resilientQuery(() =>
        db.select().from(accounts).where(eq(accounts.userId, userId)),
      ),
      resilientQuery(() =>
        db
          .select({
            baseAmount: transactions.baseAmount,
            baseCurrency: transactions.baseCurrency,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              gte(transactions.postedDate, thisMonth.start),
              lte(transactions.postedDate, thisMonth.end),
            ),
          ),
      ),
      resilientQuery(() =>
        db
          .select({ baseAmount: transactions.baseAmount })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              gte(transactions.postedDate, lastMonth.start),
              lte(transactions.postedDate, lastMonth.end),
            ),
          ),
      ),
      resilientQuery(() =>
        db
          .select({
            id: transactions.id,
            postedDate: transactions.postedDate,
            rawDescription: transactions.rawDescription,
            merchantName: transactions.merchantName,
            baseAmount: transactions.baseAmount,
            baseCurrency: transactions.baseCurrency,
            foreignCurrency: transactions.foreignCurrency,
            categorySuggestion: transactions.categorySuggestion,
            countryIso: transactions.countryIso,
            isRecurring: transactions.isRecurring,
          })
          .from(transactions)
          .where(eq(transactions.userId, userId))
          .orderBy(desc(transactions.postedDate))
          .limit(8),
      ),
      resilientQuery(() =>
        db.select().from(recurringPatterns).where(
          and(eq(recurringPatterns.userId, userId), eq(recurringPatterns.isActive, true)),
        ),
      ),
      resilientQuery(() =>
        db
          .select({
            category: transactions.categorySuggestion,
            total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              gte(transactions.postedDate, thisMonth.start),
              lte(transactions.postedDate, thisMonth.end),
              sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
            ),
          )
          .groupBy(transactions.categorySuggestion)
          .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
          .limit(8),
      ),
    ]);

    const thisMonthIncome = thisMonthTxns
      .filter((t) => parseFloat(t.baseAmount) > 0)
      .reduce((s, t) => s + parseFloat(t.baseAmount), 0);
    const thisMonthExpenses = thisMonthTxns
      .filter((t) => parseFloat(t.baseAmount) < 0)
      .reduce((s, t) => s + Math.abs(parseFloat(t.baseAmount)), 0);

    const lastMonthExpenses = lastMonthTxns
      .filter((t) => parseFloat(t.baseAmount) < 0)
      .reduce((s, t) => s + Math.abs(parseFloat(t.baseAmount)), 0);
    const lastMonthIncome = lastMonthTxns
      .filter((t) => parseFloat(t.baseAmount) > 0)
      .reduce((s, t) => s + parseFloat(t.baseAmount), 0);

    const recurringTotal = recurring.reduce(
      (s, r) => s + Math.abs(parseFloat(r.expectedAmount)),
      0,
    );

    const primaryCurrency = userAccounts[0]?.primaryCurrency ?? "USD";

    let largestExpense = { merchant: "—", amount: 0 };
    for (const txn of thisMonthTxns) {
      const amt = Math.abs(parseFloat(txn.baseAmount));
      if (parseFloat(txn.baseAmount) < 0 && amt > largestExpense.amount) {
        largestExpense = { merchant: "Expense", amount: amt };
      }
    }

    const CATEGORY_COLORS: Record<string, string> = {
      "Food & Drink": "#ECAA0B",
      "Groceries": "#ECAA0B",
      "Restaurants": "#ECAA0B",
      "Shopping": "#FF6F69",
      "Transportation": "#AD74FF",
      "Housing": "#2CA2FF",
      "Entertainment": "#AD74FF",
      "Health": "#0BC18D",
      "Financial": "#2CA2FF",
      "Travel": "#ECAA0B",
    };

    return NextResponse.json(
      {
        kpis: {
          totalBalance: { value: thisMonthIncome - thisMonthExpenses, currency: primaryCurrency },
          monthlyIncome: { value: thisMonthIncome, previous: lastMonthIncome, currency: primaryCurrency },
          monthlyExpenses: { value: thisMonthExpenses, previous: lastMonthExpenses, currency: primaryCurrency },
          recurringTotal: { value: recurringTotal, count: recurring.length, currency: primaryCurrency },
          largestExpense,
          accountCount: userAccounts.length,
          transactionCount: thisMonthTxns.length,
        },
        recentTransactions: recentTxns,
        categoryBreakdown: categoryBreakdown.map((c) => ({
          label: c.category ?? "Uncategorized",
          amount: parseFloat(c.total ?? "0"),
          count: c.count,
          color: CATEGORY_COLORS[c.category ?? ""] ?? "#808080",
        })),
        recurringPatterns: recurring.map((r) => ({
          merchantName: r.merchantName,
          amount: parseFloat(r.expectedAmount),
          currency: r.currency,
          interval: r.intervalLabel,
          nextDate: r.nextExpectedDate,
        })),
        primaryCurrency,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/dashboard", err);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500, headers: NO_STORE });
  }
}
