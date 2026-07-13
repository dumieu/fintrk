import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, accounts, userCategories } from "@/lib/db/schema";
import {
  categoryRollupLabelSql,
  leafCategory,
  parentCategory,
} from "@/lib/db/category-rollup";
import {
  excludeCardPaymentsSql,
  excludeIgnoredSql,
  primaryCurrencyOnlySql,
  spendingIntelligenceInflowSql,
  spendingIntelligenceOutflowSql,
} from "@/lib/db/excluded-transactions";
import { eq, and, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";
import {
  analyticsCategoryColor,
  buildSubcategoryDrilldownColors,
} from "@/lib/analytics-category-colors";
import { buildDailyStacks } from "@/lib/analytics/daily-stacks";
import {
  amountRangeSqlParts,
  niceTxnSizeCeiling,
  parseAmountRangeParam,
} from "@/lib/analytics/amount-range";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Six years of monthly bars (72 months). */
const MAX_MONTHS = 72;
const DEFAULT_MONTHS = 72;
/** Rolling window for avg spend / avg income reference lines on the chart. */
const REF_AVG_MONTHS = 12;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 60;

type DiscretionaryType = "non-discretionary" | "semi-discretionary" | "discretionary";

const DISC_TYPE_ORDER: DiscretionaryType[] = [
  "non-discretionary",
  "semi-discretionary",
  "discretionary",
];

const DISC_TYPE_LABEL: Record<DiscretionaryType, string> = {
  "non-discretionary": "Non-discretionary",
  "semi-discretionary": "Semi-discretionary",
  discretionary: "Discretionary",
};

/** Matches Discretionary vs Non-discretionary card accents. */
const DISC_TYPE_COLOR: Record<DiscretionaryType, string> = {
  "non-discretionary": "#FF6F69",
  "semi-discretionary": "#F2C94C",
  discretionary: "#5DD3F3",
};

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
  month: string; // YYYY-MM or YYYY-MM-DD in day mode
  total: number;
  segments: MonthlyStackSegment[]; // sorted by total desc within the month
}

export interface MonthlyStacksResponse {
  months: MonthlyStack[];
  /** Legend — categories ordered by total spend across the whole window. */
  categories: { name: string; color: string; total: number; share: number }[];
  /**
   * Parallel stacks grouped by leaf subcategory discretionary type
   * (Non / Semi / Discretionary) for the Stack-by Type chart mode.
   */
  discretionaryMonths: MonthlyStack[];
  discretionaryCategories: { name: string; color: string; total: number; share: number }[];
  /** Set when `category` query param requests a subcategory drill-down. */
  parentCategory?: string;
  /** Largest single-month stack total — used for y-axis scaling. */
  maxStack: number;
  /** Sum across all months in the window. */
  grandTotal: number;
  /** Mean monthly *income* averaged ONLY across months that have positive
   *  income, capped to the most recent {@link REF_AVG_MONTHS} income months.
   *  In day mode: mean daily income across recent income days. */
  avgMonthlyIncomeLast12: number | null;
  /** Count of income-bearing months actually used for the average. */
  incomeMonthsCount: number;
  /** Mean monthly spend across the rightmost {@link REF_AVG_MONTHS} bars.
   *  In day mode: mean daily spend across recent days in the window. */
  avgMonthlySpendLast12: number | null;
  primaryCurrency: string;
  monthsRequested: number;
  /** Present when `granularity=day` (Daily Walk). */
  granularity?: "month" | "day";
  daysRequested?: number;
  /** Max ABS(base_amount) across outflow — slider ceiling (unfiltered). */
  txnSizeMax: number;
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const drillCategory = request.nextUrl.searchParams.get("category")?.trim() ?? null;
    if (drillCategory && drillCategory.length > 128) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400, headers: NO_STORE },
      );
    }

    const amountRange = parseAmountRangeParam(
      request.nextUrl.searchParams.get("minAmount"),
      request.nextUrl.searchParams.get("maxAmount"),
    );
    const amountParts = amountRangeSqlParts(amountRange);

    const granularityRaw = (request.nextUrl.searchParams.get("granularity") ?? "").trim();
    const rawDays = parseInt(
      request.nextUrl.searchParams.get("days") ?? String(DEFAULT_DAYS),
      10,
    );
    if (granularityRaw === "day") {
      const days = Math.min(
        MAX_DAYS,
        Math.max(1, Number.isFinite(rawDays) ? Math.floor(rawDays) : DEFAULT_DAYS),
      );
      const payload = await buildDailyStacks(userId, days, drillCategory, amountRange);
      return NextResponse.json(payload, { headers: NO_STORE });
    }

    const rawMonths = parseInt(
      request.nextUrl.searchParams.get("months") ?? String(DEFAULT_MONTHS),
      10,
    );
    const months = Math.min(
      MAX_MONTHS,
      Math.max(1, Number.isFinite(rawMonths) ? Math.floor(rawMonths) : DEFAULT_MONTHS),
    );

    /**
     * Primary currency first: every sum below is scoped to it so bar totals
     * stay comparable (base_amount is per-currency) and match the drill-down
     * lists/tooltips, which also filter by base_currency = primary currency.
     */
    const primaryCurrencyRows = await resilientQuery(() =>
      db
        .select({ primaryCurrency: accounts.primaryCurrency })
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .limit(1),
    );
    const primaryCurrency = primaryCurrencyRows[0]?.primaryCurrency ?? "USD";

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
            excludeCardPaymentsSql(), excludeIgnoredSql(),
            primaryCurrencyOnlySql(primaryCurrency),
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
     *  income (positive baseAmount), capped to the most recent REF_AVG_MONTHS
     *  income months so a one-off historical bonus can't skew the line. */

    const [rows, incomeRows, discRows, sizeMaxRows] = await Promise.all([
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
                  excludeCardPaymentsSql(), excludeIgnoredSql(),
                  primaryCurrencyOnlySql(primaryCurrency),
                  spendingIntelligenceOutflowSql(),
                  sql`${transactions.postedDate}::date >= ${startDate}::date`,
                  sql`${transactions.postedDate}::date < (${endDateExclusive}::date + interval '1 month')`,
                  sql`${categoryRollupLabelSql} = ${drillCategory}`,
                  ...amountParts,
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
                  excludeCardPaymentsSql(), excludeIgnoredSql(),
                  primaryCurrencyOnlySql(primaryCurrency),
                  spendingIntelligenceOutflowSql(),
                  sql`${transactions.postedDate}::date >= ${startDate}::date`,
                  sql`${transactions.postedDate}::date < (${endDateExclusive}::date + interval '1 month')`,
                  ...amountParts,
                ),
              )
              .groupBy(
                sql`date_trunc('month', ${transactions.postedDate}::date)`,
                categoryRollupLabelSql,
              ),
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
              excludeCardPaymentsSql(), excludeIgnoredSql(),
              primaryCurrencyOnlySql(primaryCurrency),
              spendingIntelligenceInflowSql(),
            ),
          )
          .groupBy(sql`date_trunc('month', ${transactions.postedDate}::date)`)
          .orderBy(sql`date_trunc('month', ${transactions.postedDate}::date) DESC`),
      ),
      /** Monthly stacks by leaf subcategory discretionary type (for Stack-by Type). */
      drillCategory
        ? Promise.resolve(
            [] as {
              month: string;
              type: string | null;
              total: string;
              count: number;
            }[],
          )
        : resilientQuery(() =>
            db
              .select({
                month: sql<string>`to_char(date_trunc('month', ${transactions.postedDate}::date), 'YYYY-MM')`,
                type: userCategories.subcategoryType,
                total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
                count: sql<number>`COUNT(*)::int`,
              })
              .from(transactions)
              .innerJoin(
                userCategories,
                and(
                  eq(transactions.categoryId, userCategories.id),
                  eq(userCategories.userId, userId),
                ),
              )
              .where(
                and(
                  eq(transactions.userId, userId),
                  excludeCardPaymentsSql(), excludeIgnoredSql(),
                  primaryCurrencyOnlySql(primaryCurrency),
                  spendingIntelligenceOutflowSql(),
                  sql`${userCategories.subcategoryType} IS NOT NULL`,
                  sql`${transactions.postedDate}::date >= ${startDate}::date`,
                  sql`${transactions.postedDate}::date < (${endDateExclusive}::date + interval '1 month')`,
                  ...amountParts,
                ),
              )
              .groupBy(
                sql`date_trunc('month', ${transactions.postedDate}::date)`,
                userCategories.subcategoryType,
              ),
          ),
      resilientQuery(() =>
        db
          .select({
            maxAbs: sql<string>`COALESCE(MAX(ABS(CAST(${transactions.baseAmount} AS numeric))), 0)`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              excludeCardPaymentsSql(),
              excludeIgnoredSql(),
              primaryCurrencyOnlySql(primaryCurrency),
              spendingIntelligenceOutflowSql(),
            ),
          ),
      ),
    ]);

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
     *  income, capped to the most recent REF_AVG_MONTHS income months. */
    const incomeMonths = incomeRows
      .map((r) => parseFloat(r.total ?? "0"))
      .filter((v) => v > 0)
      .slice(0, REF_AVG_MONTHS);
    const incomeMonthsCount = incomeMonths.length;
    const incomeSum = incomeMonths.reduce((a, b) => a + b, 0);
    const avgMonthlyIncomeLast12 =
      incomeMonthsCount > 0
        ? Math.round((incomeSum / incomeMonthsCount) * 100) / 100
        : null;

    const spendLast12 = monthsOut.slice(-Math.min(REF_AVG_MONTHS, monthsOut.length));
    const spendLast12Sum = spendLast12.reduce((s, m) => s + m.total, 0);
    const avgMonthlySpendLast12 =
      spendLast12.length > 0
        ? Math.round((spendLast12Sum / spendLast12.length) * 100) / 100
        : null;

    /** Build discretionary-type monthly stacks (canonical Non → Semi → Disc order). */
    const discByMonth = new Map<string, Map<DiscretionaryType, { amount: number; count: number }>>();
    const discTotalByType = new Map<DiscretionaryType, number>();
    for (const r of discRows) {
      const t = r.type as DiscretionaryType | null;
      if (!t || !DISC_TYPE_ORDER.includes(t)) continue;
      const amount = parseFloat(r.total ?? "0");
      const count = r.count ?? 0;
      if (!discByMonth.has(r.month)) discByMonth.set(r.month, new Map());
      const prev = discByMonth.get(r.month)!.get(t);
      if (prev) {
        prev.amount += amount;
        prev.count += count;
      } else {
        discByMonth.get(r.month)!.set(t, { amount, count });
      }
      discTotalByType.set(t, (discTotalByType.get(t) ?? 0) + amount);
    }
    const discGrand = Array.from(discTotalByType.values()).reduce((a, b) => a + b, 0);
    const discretionaryCategories = DISC_TYPE_ORDER.map((t) => {
      const total = discTotalByType.get(t) ?? 0;
      return {
        name: DISC_TYPE_LABEL[t],
        color: DISC_TYPE_COLOR[t],
        total: Math.round(total * 100) / 100,
        share: discGrand > 0 ? Math.round((total / discGrand) * 10000) / 100 : 0,
      };
    }).filter((c) => c.total > 0);
    const discMonthKeys = Array.from(discByMonth.keys()).sort();
    const discretionaryMonths: MonthlyStack[] = discMonthKeys.map((mk) => {
      const seg = discByMonth.get(mk)!;
      const segments: MonthlyStackSegment[] = DISC_TYPE_ORDER.filter((t) => seg.has(t)).map((t) => {
        const v = seg.get(t)!;
        return {
          name: DISC_TYPE_LABEL[t],
          color: DISC_TYPE_COLOR[t],
          amount: Math.round(v.amount * 100) / 100,
          count: v.count,
        };
      });
      const total = Math.round(segments.reduce((a, b) => a + b.amount, 0) * 100) / 100;
      return { month: mk, total, segments };
    });

    const payload: MonthlyStacksResponse = {
      months: monthsOut,
      categories,
      discretionaryMonths,
      discretionaryCategories,
      ...(drillCategory ? { parentCategory: drillCategory } : {}),
      maxStack: Math.round(maxStack * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      avgMonthlyIncomeLast12,
      incomeMonthsCount,
      avgMonthlySpendLast12,
      primaryCurrency,
      monthsRequested: months,
      granularity: "month",
      txnSizeMax: niceTxnSizeCeiling(parseFloat(sizeMaxRows[0]?.maxAbs ?? "0")),
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
