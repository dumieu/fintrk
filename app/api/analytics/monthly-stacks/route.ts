import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, accounts } from "@/lib/db/schema";
import {
  categoryRollupLabelSql,
  leafCategory,
  parentCategory,
} from "@/lib/db/category-rollup";
import { excludeCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { eq, and, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const MAX_MONTHS = 36;
const DEFAULT_MONTHS = 21;

/**
 * Distinct color per **rollup category** for the stacked chart.
 *
 * Hand-picked Tableau-like categorical palette: each category gets its own
 * hue with adequate luminance separation so stacked segments are
 * unambiguously distinguishable. (Previously Household and Health & Fitness
 * both mapped to #0BC18D, making them indistinguishable when stacked.)
 */
const CATEGORY_COLORS: Record<string, string> = {
  Travel: "#A78BFA",                  // violet
  Shopping: "#38BDF8",                // sky blue
  Entertainment: "#F472B6",           // pink
  "Health & Fitness": "#34D399",      // emerald
  Health: "#34D399",
  Household: "#FB923C",               // orange
  Transportation: "#FBBF24",          // amber
  Transport: "#FBBF24",
  Education: "#818CF8",               // indigo
  "Restaurant & Entertain": "#F87171",// soft red
  Restaurants: "#F87171",
  "Food & Drink": "#F87171",
  Groceries: "#84CC16",               // lime
  Housing: "#06B6D4",                 // cyan
  Financial: "#6366F1",               // deep indigo
  Helper: "#C084FC",                  // light purple
  "School & Extracur": "#22D3EE",     // teal-cyan
  "Gifts & Donations": "#FB7185",     // rose
  Income: "#10B981",
  Tax: "#475569",                     // slate
  Other: "#94A3B8",                   // light slate
  Uncategorized: "#64748B",
};

/** Deterministic fallback color from category name (HSL evenly spaced). */
function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 60%)`;
}

function colorFor(name: string): string {
  return CATEGORY_COLORS[name] ?? hashColor(name);
}

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
  /** Largest single-month stack total — used for y-axis scaling. */
  maxStack: number;
  /** Sum across all months in the window. */
  grandTotal: number;
  /** Mean monthly *income* averaged ONLY across months that have positive
   *  income rows (capped at the chart cap, rolling). Null if no income at all. */
  avgMonthlyIncomeLast6: number | null;
  /** Count of income-bearing months actually used for the average. */
  incomeMonthsCount: number;
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

    /** Anchor the window at the user's actual outflow range so old datasets still render
     *  meaningful data and we don't show 19 empty bars when only 2 months exist. */
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
            sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
          ),
        ),
    );
    const rng = rangeRows[0];
    const anchor = rng && rng.maxY && rng.maxM ? { year: rng.maxY, month: rng.maxM } : null;
    const dataSpanMonths = rng && rng.maxY && rng.minY
      ? (rng.maxY - rng.minY) * 12 + (rng.maxM - rng.minM) + 1
      : null;
    /** Clamp requested months to the actual span (with a small floor for visual consistency). */
    const effectiveMonths = dataSpanMonths
      ? Math.max(1, Math.min(months, dataSpanMonths))
      : months;

    const monthKeys = genMonthKeys(effectiveMonths, anchor);
    const startMonth = monthKeys[0]; // oldest YYYY-MM in window
    const endMonthKey = monthKeys[monthKeys.length - 1];
    const startDate = `${startMonth}-01`;
    const endDateExclusive = `${endMonthKey}-01`;

    /** Income reference is averaged ONLY across months that actually have
     *  income (positive baseAmount), independent of the expense window. The
     *  cap is the same as the chart cap (DEFAULT_MONTHS most-recent income
     *  months, rolling) so a one-off historical bonus can't skew the line. */

    const [rows, userAccounts, incomeRows] = await Promise.all([
      resilientQuery(() =>
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
              sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
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
              sql`CAST(${transactions.baseAmount} AS numeric) > 0`,
            ),
          )
          .groupBy(sql`date_trunc('month', ${transactions.postedDate}::date)`)
          .orderBy(sql`date_trunc('month', ${transactions.postedDate}::date) DESC`),
      ),
    ]);

    const primaryCurrency = userAccounts[0]?.primaryCurrency ?? "USD";

    /** Aggregate totals per (month, category) — DB already groups, this just normalizes types. */
    const byMonth = new Map<string, Map<string, { amount: number; count: number }>>();
    const totalByCat = new Map<string, number>();
    for (const r of rows) {
      const m = r.month;
      const c = r.category ?? "Uncategorized";
      const amount = parseFloat(r.total ?? "0");
      const count = r.count ?? 0;
      if (!byMonth.has(m)) byMonth.set(m, new Map());
      byMonth.get(m)!.set(c, { amount, count });
      totalByCat.set(c, (totalByCat.get(c) ?? 0) + amount);
    }

    const grandTotal = Array.from(totalByCat.values()).reduce((a, b) => a + b, 0);

    /** Legend — categories sorted by overall total in the window. */
    const categories = Array.from(totalByCat.entries())
      .map(([name, total]) => ({
        name,
        color: colorFor(name),
        total: Math.round(total * 100) / 100,
        share: grandTotal > 0 ? Math.round((total / grandTotal) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    /** Build a contiguous month series with stable per-month segment ordering (largest at top). */
    let maxStack = 0;
    const monthsOut: MonthlyStack[] = monthKeys.map((mk) => {
      const seg = byMonth.get(mk);
      const segments: MonthlyStackSegment[] = seg
        ? Array.from(seg.entries())
            .map(([name, v]) => ({
              name,
              color: colorFor(name),
              amount: Math.round(v.amount * 100) / 100,
              count: v.count,
            }))
            .sort((a, b) => b.amount - a.amount)
        : [];
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

    const payload: MonthlyStacksResponse = {
      months: monthsOut,
      categories,
      maxStack: Math.round(maxStack * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      avgMonthlyIncomeLast6,
      incomeMonthsCount,
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
