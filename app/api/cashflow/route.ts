import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, recurringPatterns } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const dateFrom = sixMonthsAgo.toISOString().split("T")[0];

    const [histRows, recurring] = await Promise.all([
      resilientQuery(() =>
        db.select({
          month: sql<string>`to_char(${transactions.postedDate}::date, 'YYYY-MM')`,
          income: sql<string>`COALESCE(SUM(CASE WHEN CAST(${transactions.baseAmount} AS numeric) > 0 THEN CAST(${transactions.baseAmount} AS numeric) ELSE 0 END), 0)`,
          expenses: sql<string>`COALESCE(SUM(CASE WHEN CAST(${transactions.baseAmount} AS numeric) < 0 THEN ABS(CAST(${transactions.baseAmount} AS numeric)) ELSE 0 END), 0)`,
          baseCurrency: transactions.baseCurrency,
        }).from(transactions).where(
          and(eq(transactions.userId, userId), gte(transactions.postedDate, dateFrom)),
        ).groupBy(sql`to_char(${transactions.postedDate}::date, 'YYYY-MM')`, transactions.baseCurrency)
          .orderBy(sql`to_char(${transactions.postedDate}::date, 'YYYY-MM')`),
      ),
      resilientQuery(() =>
        db.select().from(recurringPatterns).where(
          and(eq(recurringPatterns.userId, userId), eq(recurringPatterns.isActive, true)),
        ),
      ),
    ]);

    const historical = histRows.map((r) => ({
      month: r.month,
      income: parseFloat(r.income),
      expenses: parseFloat(r.expenses),
      net: parseFloat(r.income) - parseFloat(r.expenses),
      currency: r.baseCurrency,
    }));

    const avgIncome = historical.length > 0
      ? historical.reduce((s, h) => s + h.income, 0) / historical.length
      : 0;
    const avgExpenses = historical.length > 0
      ? historical.reduce((s, h) => s + h.expenses, 0) / historical.length
      : 0;

    const monthlyRecurring = recurring.reduce((sum, r) => {
      const monthlyAmount = Math.abs(parseFloat(r.expectedAmount)) * (30 / r.intervalDays);
      return sum + monthlyAmount;
    }, 0);

    const primaryCurrency = histRows[0]?.baseCurrency ?? "USD";

    const projections: { month: string; income: number; expenses: number; net: number; isProjected: boolean }[] = [];
    const now = new Date();

    for (let i = 1; i <= 3; i++) {
      const future = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const projectedExpenses = Math.max(monthlyRecurring, avgExpenses * 0.7) + avgExpenses * 0.3;

      projections.push({
        month: monthKey(future),
        income: avgIncome,
        expenses: projectedExpenses,
        net: avgIncome - projectedExpenses,
        isProjected: true,
      });
    }

    const trend = historical.length >= 2
      ? historical[historical.length - 1].expenses > historical[historical.length - 2].expenses
        ? "increasing"
        : historical[historical.length - 1].expenses < historical[historical.length - 2].expenses
          ? "decreasing"
          : "stable"
      : "stable";

    return NextResponse.json({
      historical: historical.map((h) => ({ ...h, isProjected: false })),
      projections,
      monthlyRecurring,
      averageIncome: avgIncome,
      averageExpenses: avgExpenses,
      trend,
      currency: primaryCurrency,
    }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/cashflow", err);
    return NextResponse.json({ error: "Failed to compute cash flow" }, { status: 500, headers: NO_STORE });
  }
}
