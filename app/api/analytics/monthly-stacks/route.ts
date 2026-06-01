import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, accounts } from "@/lib/db/schema";
import {
  categoryRollupLabelSql,
  leafCategory,
  parentCategory,
} from "@/lib/db/category-rollup";
import {
  excludeCardPaymentsSql,
  spendingIntelligenceInflowSql,
  spendingIntelligenceOutflowSql,
} from "@/lib/db/excluded-transactions";
import { eq, and, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";
import {
  analyticsCategoryColor,
  buildSubcategoryDrilldownColors,
} from "@/lib/analytics-category-colors";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Six years of monthly bars (72 months). */
const MAX_MONTHS = 72;
const DEFAULT_MONTHS = 72;

/**
 * Generate a contiguous list of `YYYY-MM` keys ending at `anchor` (inclusive),
 * spanning `n` months back. When `anchor` is null, falls back to the current month.
 * Used to fill sparse DB rows so the x-axis always has a continuous month sequence.
 */
function genMonthKeys(n: number, anchor: { year: number; month: number } | null): string[] {
  const out: string[] = [];
  let yr: number;
  let mo: number; // 0-indexed
  if (anchor) {
    yr = anchor.year;
    mo = anchor.month - 1;
  } else {
    const now = new Date();
    yr = now.getUTCFullYear();
    mo = now.getUTCMonth();
  }
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(yr, mo - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export interface MonthlyStackSegment {
  name: string;
  color: string;
  amount: number;
  count: number;
}

export interface MonthlyStack {
  month: string; // YYYY-MM
  total: number;
  segments: MonthlyStackSegment[]; // sorted by total desc within the month
}

export interface MonthlyStacksResponse {
  months: MonthlyStack[];
  /** Legend — categories ordered by total spend across the whole window. */
  categories: { name: string; color: string; total: number; share: number }[];
  /** Set when `category` query param requests a subcategory drill-down. */
  parentCategory?: string;
  /** Largest single-month stack total — used for y-axis scaling. */
  maxStack: number;
  /** Sum across all months in the window. */
  grandTotal: number;
  /** Mean monthly *income* averaged ONLY across months that have positive
   *  income rows (capped at the chart cap, rolling). Null if no income at all. */
  avgMonthlyIncomeLast6: number | null;
  /** Count of income-bearing months actually used for the average. */
  incomeMonthsCount: number;
  /** Mean monthly spend across the rightmost 6 bars in the chart window. */
  avgMonthlySpendLast6: number | null;
  primaryCurrency: string;
  monthsRequested: number;
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rawMonths = parseInt(
      request.nextUrl.searchParams.get("months") ?? String(DEFAULT_MONTHS),
      10,
    );
    const months = Math.min(
      MAX_MONTHS,
      Math.max(1, Number.isFinite(rawMonths) ? Math.floor(rawMonths) : DEFAULT_MONTHS),
    );
    const drillCategory = request.nextUrl.searchParams.get("category")?.trim() ?? null;
    if (drillCategory && drillCategory.length > 128) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400, headers: NO_STORE },
      );
    }

    /** Anchor at the latest outflow month; query up to 6 years back, return only months with spend. */
    const rangeRows = await resilientQuery(() =>
      db
        .select({
          maxY: sql<number>`EXTRACT(YEAR FROM MAX(${transactions.postedDate}::date))::int`,
          maxM: sql<number>`EXTRACT(MONTH FROM MAX(${transactions.postedDate}::date))::int`,
          minY: sql<number>`EXTRACT(YEAR FROM MIN(${transactions.postedDate}::date))::int`,
          minM: sql<number>`EXTRACT(MONTH FROM MIN(${transactions.postedDate}::date))::int`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(),
            spendingIntelligenceOutflowSql(),
          ),
        ),
    );
    const rng = rangeRows[0];
    const anchor = rng && rng.maxY && rng.maxM ? { year: rng.maxY, month: rng.maxM } : null;
    /** Query window: up to `months` back from the latest outflow month. */
    const windowKeys = genMonthKeys(months, anchor);
    const startMonth = windowKeys[0];
    const endMonthKey = windowKeys[windowKeys.length - 1];
    const startDate = `${startMonth}-01`;
    const endDateExclusive = `${endMonthKey}-01`;

    /** Income reference is averaged ONLY across months that actually have
     *  income (positive baseAmount), independent of the expense window. The
     *  cap is the same as the chart cap (DEFAULT_MONTHS most-recent income
     *  months, rolling) so a one-off historical bonus can't skew the line. */

    const [rows, userAccounts, incomeRows] = await Promise.all([
      drillCategory
        ? resilientQuery(() =>
            db
              .select({
                month: sql<string>`to_char(date_trunc('month', ${transactions.postedDate}::date), 'YYYY-MM')`,
                subcategory: leafCategory.name,
                total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
                count: sql<number>`COUNT(*)::int`,
              })
              .from(transactions)
              .leftJoin(
                leafCategory,
                and(eq(transactions.categoryId, leafCategory.id), eq(leafCategory.userId, userId)),
              )
              .leftJoin(
                parentCategory,
                and(
                  eq(leafCategory.parentId, parentCategory.id),
                  eq(parentCategory.userId, userId),
                ),
              )
              .where(
                and(
                  eq(transactions.userId, userId),
                  excludeCardPaymentsSql(),
                  spendingIntelligenceOutflowSql(),
                  sql`${transactions.postedDate}::date >= ${startDate}::date`,
                  sql`${transactions.postedDate}::date < (${endDateExclusive}::date + interval '1 month')`,
                  sql`${categoryRollupLabelSql} = ${drillCategory}`,
                ),
              )
              .groupBy(
                sql`date_trunc('month', ${transactions.postedDate}::date)`,
                leafCategory.id,
                leafCategory.name,
              ),
          )
        : resilientQuery(() =>
            db
              .select({
                month: sql<string>`to_char(date_trunc('month', ${transactions.postedDate}::date), 'YYYY-MM')`,
                category: categoryRollupLabelSql,
                total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
                count: sql<number>`COUNT(*)::int`,
              })
              .from(transactions)
              .leftJoin(
                leafCategory,
                and(eq(transactions.categoryId, leafCategory.id), eq(leafCategory.userId, userId)),
              )
              .leftJoin(
                parentCategory,
                and(
                  eq(leafCategory.parentId, parentCategory.id),
                  eq(parentCategory.userId, userId),
                ),
              )
              .where(
                and(
                  eq(transactions.userId, userId),
                  excludeCardPaymentsSql(),
                  spendingIntelligenceOutflowSql(),
                  sql`${transactions.postedDate}::date >= ${startDate}::date`,
                  sql`${transactions.postedDate}::date < (${endDateExclusive}::date + interval '1 month')`,
                ),
              )
              .groupBy(
                sql`date_trunc('month', ${transactions.postedDate}::date)`,
                categoryRollupLabelSql,
              ),
          ),
      resilientQuery(() =>
        db
          .select({ primaryCurrency: accounts.primaryCurrency })
          .from(accounts)
          .where(eq(accounts.userId, userId))
          .limit(1),
      ),
      /** Per-month income totals for every month with positive baseAmount,
       *  ordered newest-first. We trim & average in JS using only the months
       *  that actually have income — independent of the expense window. */
      resilientQuery(() =>
        db
          .select({
            month: sql<string>`to_char(date_trunc('month', ${transactions.postedDate}::date), 'YYYY-MM')`,
            total: sql<string>`COALESCE(SUM(CAST(${transactions.baseAmount} AS numeric)), 0)`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              excludeCardPaymentsSql(),
              spendingIntelligenceInflowSql(),
            ),
          )
          .groupBy(sql`date_trunc('month', ${transactions.postedDate}::date)`)
          .orderBy(sql`date_trunc('month', ${transactions.postedDate}::date) DESC`),
      ),
    ]);

    const primaryCurrency = userAccounts[0]?.primaryCurrency ?? "USD";

    /** Aggregate totals per (month, category or subcategory). */
    const byMonth = new Map<string, Map<string, { amount: number; count: number }>>();
    const totalByCat = new Map<string, number>();
    for (const r of rows) {
      const m = r.month;
      const c = drillCategory
        ? ("subcategory" in r ? r.subcategory : null) ?? "Uncategorized"
        : ("category" in r ? r.category : null) ?? "Uncategorized";
      const amount = parseFloat(r.total ?? "0");
      const count = r.count ?? 0;
      if (!c || c.length === 0) continue;
      if (!byMonth.has(m)) byMonth.set(m, new Map());
      byMonth.get(m)!.set(c, { amount, count });
      totalByCat.set(c, (totalByCat.get(c) ?? 0) + amount);
    }

    const grandTotal = Array.from(totalByCat.values()).reduce((a, b) => a + b, 0);

    /** Only months that actually have outflow — no zero-padding on the x-axis. */
    const monthKeys = Array.from(byMonth.keys()).sort();

    const subcategoryColors = drillCategory
      ? buildSubcategoryDrilldownColors(drillCategory, totalByCat, monthKeys.length)
      : null;

    const colorForSegment = (name: string) => {
      if (subcategoryColors) return subcategoryColors.get(name) ?? analyticsCategoryColor(drillCategory!);
      return analyticsCategoryColor(name);
    };

    /** Legend — categories sorted by overall total in the window. */
    const categories = Array.from(totalByCat.entries())
      .map(([name, total]) => ({
        name,
        color: colorForSegment(name),
        total: Math.round(total * 100) / 100,
        share: grandTotal > 0 ? Math.round((total / grandTotal) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    /** Per-month stacks sorted by segment size (largest at top). */
    let maxStack = 0;
    const monthsOut: MonthlyStack[] = monthKeys.map((mk) => {
      const seg = byMonth.get(mk)!;
      const segments: MonthlyStackSegment[] = Array.from(seg.entries())
        .map(([name, v]) => ({
          name,
          color: colorForSegment(name),
          amount: Math.round(v.amount * 100) / 100,
          count: v.count,
        }))
        .sort((a, b) => b.amount - a.amount);
      const total = segments.reduce((a, b) => a + b.amount, 0);
      if (total > maxStack) maxStack = total;
      return { month: mk, total: Math.round(total * 100) / 100, segments };
    });

    /** Average monthly income across ONLY the months that actually have
     *  income, capped to the most recent `months` of those. So with 4 income
     *  months and 15 expense months, the divisor is 4. */
    const incomeMonths = incomeRows
      .map((r) => parseFloat(r.total ?? "0"))
      .filter((v) => v > 0)
      .slice(0, months);
    const incomeMonthsCount = incomeMonths.length;
    const incomeSum = incomeMonths.reduce((a, b) => a + b, 0);
    const avgMonthlyIncomeLast6 =
      incomeMonthsCount > 0
        ? Math.round((incomeSum / incomeMonthsCount) * 100) / 100
        : null;

    const spendLast6 = monthsOut.slice(-Math.min(6, monthsOut.length));
    const spendLast6Sum = spendLast6.reduce((s, m) => s + m.total, 0);
    const avgMonthlySpendLast6 =
      spendLast6.length > 0
        ? Math.round((spendLast6Sum / spendLast6.length) * 100) / 100
        : null;

    const payload: MonthlyStacksResponse = {
      months: monthsOut,
      categories,
      ...(drillCategory ? { parentCategory: drillCategory } : {}),
      maxStack: Math.round(maxStack * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      avgMonthlyIncomeLast6,
      incomeMonthsCount,
      avgMonthlySpendLast6,
      primaryCurrency,
      monthsRequested: months,
    };

    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/analytics/monthly-stacks", err);
    return NextResponse.json(
      { error: "Failed to load monthly stacks" },
      { status: 500, headers: NO_STORE },
    );
  }
}
