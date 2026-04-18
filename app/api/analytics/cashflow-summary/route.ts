import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, accounts } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const DEFAULT_MAX_MONTHS = 12;
const HARD_MAX_MONTHS = 24;
/** A month is dropped from the average if its expenses are below this fraction
 *  of the surviving months' average expenses. */
const LOW_EXPENSE_THRESHOLD = 0.2;

export interface CashflowSummaryResponse {
  /** Average monthly *income* over the surviving months. */
  avgMonthlyIncome: number;
  /** Average monthly *expenses* over the surviving months. */
  avgMonthlyExpenses: number;
  /** avgMonthlyIncome − avgMonthlyExpenses. */
  gap: number;
  /** Months actually used to compute the averages (post-filter, ≤ requested cap). */
  monthsUsed: number;
  /** Maximum window length requested (e.g. 12 = "last 12 months max"). */
  maxMonthsConsidered: number;
  primaryCurrency: string;
}

/**
 * Rolling cashflow average that:
 *   1. starts from the user's most-recent **N** months that contain ANY
 *      transactions (N capped by `?months=`, default 12),
 *   2. iteratively drops any month whose total expenses fall below 20 % of
 *      the surviving months' average expenses (filters out partial /
 *      zero-activity months that would otherwise drag the average to 0),
 *   3. averages income / expenses / gap across the surviving months only.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rawMonths = parseInt(
      request.nextUrl.searchParams.get("months") ?? String(DEFAULT_MAX_MONTHS),
      10,
    );
    const maxMonths = Math.min(
      HARD_MAX_MONTHS,
      Math.max(1, Number.isFinite(rawMonths) ? Math.floor(rawMonths) : DEFAULT_MAX_MONTHS),
    );

    /** Per-month income / expense totals, ordered newest-first. We'll trim and
     *  filter in JS — far simpler than expressing the iterative threshold rule
     *  as SQL, and the row count is tiny (≤ a few dozen). */
    const [userAccounts, monthlyRows] = await Promise.all([
      resilientQuery(() =>
        db
          .select({ primaryCurrency: accounts.primaryCurrency })
          .from(accounts)
          .where(eq(accounts.userId, userId))
          .limit(1),
      ),
      resilientQuery(() =>
        db
          .select({
            month: sql<string>`to_char(date_trunc('month', ${transactions.postedDate}::date), 'YYYY-MM')`,
            income: sql<string>`COALESCE(SUM(CASE WHEN CAST(${transactions.baseAmount} AS numeric) > 0 THEN CAST(${transactions.baseAmount} AS numeric) END), 0)`,
            expenses: sql<string>`COALESCE(SUM(CASE WHEN CAST(${transactions.baseAmount} AS numeric) < 0 THEN -CAST(${transactions.baseAmount} AS numeric) END), 0)`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              sql`CAST(${transactions.baseAmount} AS numeric) <> 0`,
            ),
          )
          .groupBy(sql`date_trunc('month', ${transactions.postedDate}::date)`)
          .orderBy(sql`date_trunc('month', ${transactions.postedDate}::date) DESC`),
      ),
    ]);

    const primaryCurrency = userAccounts[0]?.primaryCurrency ?? "USD";

    type MonthAgg = { month: string; income: number; expenses: number };
    const allMonths: MonthAgg[] = monthlyRows.map((r) => ({
      month: r.month,
      income: parseFloat(r.income ?? "0"),
      expenses: parseFloat(r.expenses ?? "0"),
    }));

    /** Step 1 — only months that actually have transactions, newest first,
     *  capped to the rolling window. */
    let candidates = allMonths
      .filter((m) => m.income > 0 || m.expenses > 0)
      .slice(0, maxMonths);

    /** Step 2 — iteratively drop months whose expenses are below 20 % of the
     *  surviving expense average. Repeats until the surviving set is stable
     *  (or empty). Bounded by candidates.length to guarantee termination. */
    let surviving = candidates;
    for (let pass = 0; pass < candidates.length; pass++) {
      if (surviving.length === 0) break;
      const expensesSum = surviving.reduce((s, m) => s + m.expenses, 0);
      const avgExp = expensesSum / surviving.length;
      const threshold = avgExp * LOW_EXPENSE_THRESHOLD;
      const next = surviving.filter((m) => m.expenses >= threshold);
      if (next.length === surviving.length) break;
      surviving = next;
    }

    const monthsUsed = surviving.length;
    let avgMonthlyIncome = 0;
    let avgMonthlyExpenses = 0;
    if (monthsUsed > 0) {
      const incomeSum = surviving.reduce((s, m) => s + m.income, 0);
      const expensesSum = surviving.reduce((s, m) => s + m.expenses, 0);
      avgMonthlyIncome = Math.round((incomeSum / monthsUsed) * 100) / 100;
      avgMonthlyExpenses = Math.round((expensesSum / monthsUsed) * 100) / 100;
    }
    const gap = Math.round((avgMonthlyIncome - avgMonthlyExpenses) * 100) / 100;

    const payload: CashflowSummaryResponse = {
      avgMonthlyIncome,
      avgMonthlyExpenses,
      gap,
      monthsUsed,
      maxMonthsConsidered: maxMonths,
      primaryCurrency,
    };

    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/analytics/cashflow-summary", err);
    return NextResponse.json(
      { error: "Failed to load cashflow summary" },
      { status: 500, headers: NO_STORE },
    );
  }
}
