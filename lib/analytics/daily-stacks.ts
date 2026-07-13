import "server-only";

import { and, eq, sql } from "drizzle-orm";

import {
  analyticsCategoryColor,
  buildSubcategoryDrilldownColors,
} from "@/lib/analytics-category-colors";
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
import { db, resilientQuery } from "@/lib/db";
import { accounts, transactions, userCategories } from "@/lib/db/schema";
import {
  amountRangeSqlParts,
  niceTxnSizeCeiling,
  type AmountRangeFilter,
} from "@/lib/analytics/amount-range";

export type DailyStackSegment = {
  name: string;
  color: string;
  amount: number;
  count: number;
};

export type DailyStack = {
  month: string; // YYYY-MM-DD period key (reuses chart stack shape)
  total: number;
  segments: DailyStackSegment[];
};

export type DailyStacksResponse = {
  months: DailyStack[];
  categories: { name: string; color: string; total: number; share: number }[];
  discretionaryMonths: DailyStack[];
  discretionaryCategories: { name: string; color: string; total: number; share: number }[];
  parentCategory?: string;
  maxStack: number;
  grandTotal: number;
  avgMonthlyIncomeLast12: number | null;
  incomeMonthsCount: number;
  avgMonthlySpendLast12: number | null;
  primaryCurrency: string;
  monthsRequested: number;
  granularity: "day";
  daysRequested: number;
  /** Max ABS(base_amount) across outflow (slider ceiling). */
  txnSizeMax: number;
};

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

const DISC_TYPE_COLOR: Record<DiscretionaryType, string> = {
  "non-discretionary": "#FF6F69",
  "semi-discretionary": "#F2C94C",
  discretionary: "#5DD3F3",
};

const REF_AVG_DAYS = 14;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Contiguous UTC day keys ending at `end` inclusive, oldest → newest. */
export function genDayKeys(n: number, end: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - i),
    );
    out.push(isoDay(d));
  }
  return out;
}

/**
 * Last `days` calendar days of outflow stacks (category + discretionary type),
 * keyed as YYYY-MM-DD. Zero-spend days are kept so the walk is a continuous path.
 */
export async function buildDailyStacks(
  userId: string,
  days: number,
  drillCategory: string | null,
  amountRange: AmountRangeFilter = { min: null, max: null },
): Promise<DailyStacksResponse> {
  const amountParts = amountRangeSqlParts(amountRange);
  const primaryCurrencyRows = await resilientQuery(() =>
    db
      .select({ primaryCurrency: accounts.primaryCurrency })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .limit(1),
  );
  const primaryCurrency = primaryCurrencyRows[0]?.primaryCurrency ?? "USD";

  const maxDateRows = await resilientQuery(() =>
    db
      .select({
        maxDate: sql<string>`MAX(${transactions.postedDate}::date)::text`,
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
  );

  const maxRaw = maxDateRows[0]?.maxDate;
  const end =
    maxRaw && /^\d{4}-\d{2}-\d{2}/.test(maxRaw)
      ? new Date(`${maxRaw.slice(0, 10)}T00:00:00Z`)
      : new Date(
          Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate(),
          ),
        );

  const dayKeys = genDayKeys(days, end);
  const startDate = dayKeys[0]!;
  const endDate = dayKeys[dayKeys.length - 1]!;

  const [rows, incomeRows, discRows, sizeMaxRows] = await Promise.all([
    drillCategory
      ? resilientQuery(() =>
          db
            .select({
              day: sql<string>`to_char(${transactions.postedDate}::date, 'YYYY-MM-DD')`,
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
                excludeIgnoredSql(),
                primaryCurrencyOnlySql(primaryCurrency),
                spendingIntelligenceOutflowSql(),
                sql`${transactions.postedDate}::date >= ${startDate}::date`,
                sql`${transactions.postedDate}::date <= ${endDate}::date`,
                sql`${categoryRollupLabelSql} = ${drillCategory}`,
                ...amountParts,
              ),
            )
            .groupBy(sql`${transactions.postedDate}::date`, leafCategory.id, leafCategory.name),
        )
      : resilientQuery(() =>
          db
            .select({
              day: sql<string>`to_char(${transactions.postedDate}::date, 'YYYY-MM-DD')`,
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
                excludeIgnoredSql(),
                primaryCurrencyOnlySql(primaryCurrency),
                spendingIntelligenceOutflowSql(),
                sql`${transactions.postedDate}::date >= ${startDate}::date`,
                sql`${transactions.postedDate}::date <= ${endDate}::date`,
                ...amountParts,
              ),
            )
            .groupBy(sql`${transactions.postedDate}::date`, categoryRollupLabelSql),
        ),
    resilientQuery(() =>
      db
        .select({
          day: sql<string>`to_char(${transactions.postedDate}::date, 'YYYY-MM-DD')`,
          total: sql<string>`COALESCE(SUM(CAST(${transactions.baseAmount} AS numeric)), 0)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(),
            excludeIgnoredSql(),
            primaryCurrencyOnlySql(primaryCurrency),
            spendingIntelligenceInflowSql(),
            sql`${transactions.postedDate}::date >= ${startDate}::date`,
            sql`${transactions.postedDate}::date <= ${endDate}::date`,
          ),
        )
        .groupBy(sql`${transactions.postedDate}::date`)
        .orderBy(sql`${transactions.postedDate}::date DESC`),
    ),
    drillCategory
      ? Promise.resolve(
          [] as {
            day: string;
            type: string | null;
            total: string;
            count: number;
          }[],
        )
      : resilientQuery(() =>
          db
            .select({
              day: sql<string>`to_char(${transactions.postedDate}::date, 'YYYY-MM-DD')`,
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
                excludeCardPaymentsSql(),
                excludeIgnoredSql(),
                primaryCurrencyOnlySql(primaryCurrency),
                spendingIntelligenceOutflowSql(),
                sql`${userCategories.subcategoryType} IS NOT NULL`,
                sql`${transactions.postedDate}::date >= ${startDate}::date`,
                sql`${transactions.postedDate}::date <= ${endDate}::date`,
                ...amountParts,
              ),
            )
            .groupBy(sql`${transactions.postedDate}::date`, userCategories.subcategoryType),
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

  const byDay = new Map<string, Map<string, { amount: number; count: number }>>();
  const totalByCat = new Map<string, number>();
  for (const r of rows) {
    const day = "day" in r ? r.day : "";
    const c = drillCategory
      ? (("subcategory" in r ? r.subcategory : null) ?? "Uncategorized")
      : (("category" in r ? r.category : null) ?? "Uncategorized");
    const amount = parseFloat(r.total ?? "0");
    const count = r.count ?? 0;
    if (!day || !c) continue;
    if (!byDay.has(day)) byDay.set(day, new Map());
    byDay.get(day)!.set(c, { amount, count });
    totalByCat.set(c, (totalByCat.get(c) ?? 0) + amount);
  }

  const grandTotal = Array.from(totalByCat.values()).reduce((a, b) => a + b, 0);
  const subcategoryColors = drillCategory
    ? buildSubcategoryDrilldownColors(drillCategory, totalByCat, dayKeys.length)
    : null;

  const colorForSegment = (name: string) => {
    if (subcategoryColors) return subcategoryColors.get(name) ?? analyticsCategoryColor(drillCategory!);
    return analyticsCategoryColor(name);
  };

  const categories = Array.from(totalByCat.entries())
    .map(([name, total]) => ({
      name,
      color: colorForSegment(name),
      total: Math.round(total * 100) / 100,
      share: grandTotal > 0 ? Math.round((total / grandTotal) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  let maxStack = 0;
  const monthsOut: DailyStack[] = dayKeys.map((dk) => {
    const seg = byDay.get(dk);
    if (!seg || seg.size === 0) {
      return { month: dk, total: 0, segments: [] };
    }
    const segments: DailyStackSegment[] = Array.from(seg.entries())
      .map(([name, v]) => ({
        name,
        color: colorForSegment(name),
        amount: Math.round(v.amount * 100) / 100,
        count: v.count,
      }))
      .sort((a, b) => b.amount - a.amount);
    const total = segments.reduce((a, b) => a + b.amount, 0);
    if (total > maxStack) maxStack = total;
    return { month: dk, total: Math.round(total * 100) / 100, segments };
  });

  const incomeDays = incomeRows
    .map((r) => parseFloat(r.total ?? "0"))
    .filter((v) => v > 0)
    .slice(0, REF_AVG_DAYS);
  const incomeMonthsCount = incomeDays.length;
  const incomeSum = incomeDays.reduce((a, b) => a + b, 0);
  const avgMonthlyIncomeLast12 =
    incomeMonthsCount > 0
      ? Math.round((incomeSum / incomeMonthsCount) * 100) / 100
      : null;

  const spendWindow = monthsOut.slice(-Math.min(REF_AVG_DAYS, monthsOut.length));
  const spendSum = spendWindow.reduce((s, m) => s + m.total, 0);
  const avgMonthlySpendLast12 =
    spendWindow.length > 0
      ? Math.round((spendSum / spendWindow.length) * 100) / 100
      : null;

  const discByDay = new Map<string, Map<DiscretionaryType, { amount: number; count: number }>>();
  const discTotalByType = new Map<DiscretionaryType, number>();
  for (const r of discRows) {
    const t = r.type as DiscretionaryType | null;
    if (!t || !DISC_TYPE_ORDER.includes(t)) continue;
    const amount = parseFloat(r.total ?? "0");
    const count = r.count ?? 0;
    if (!discByDay.has(r.day)) discByDay.set(r.day, new Map());
    const prev = discByDay.get(r.day)!.get(t);
    if (prev) {
      prev.amount += amount;
      prev.count += count;
    } else {
      discByDay.get(r.day)!.set(t, { amount, count });
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

  const discretionaryMonths: DailyStack[] = dayKeys.map((dk) => {
    const seg = discByDay.get(dk);
    if (!seg || seg.size === 0) {
      return { month: dk, total: 0, segments: [] };
    }
    const segments: DailyStackSegment[] = DISC_TYPE_ORDER.filter((t) => seg.has(t)).map((t) => {
      const v = seg.get(t)!;
      return {
        name: DISC_TYPE_LABEL[t],
        color: DISC_TYPE_COLOR[t],
        amount: Math.round(v.amount * 100) / 100,
        count: v.count,
      };
    });
    const total = Math.round(segments.reduce((a, b) => a + b.amount, 0) * 100) / 100;
    return { month: dk, total, segments };
  });

  return {
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
    monthsRequested: days,
    granularity: "day",
    daysRequested: days,
    txnSizeMax: niceTxnSizeCeiling(parseFloat(sizeMaxRows[0]?.maxAbs ?? "0")),
  };
}
