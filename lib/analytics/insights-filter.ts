import "server-only";

import { and, eq, sql, type SQL } from "drizzle-orm";
import {
  categoryRollupLabelSql,
  leafCategory,
  parentCategory,
} from "@/lib/db/category-rollup";
import {
  excludeCardPaymentsSql,
  excludeIgnoredSql,
  primaryCurrencyOnlySql,
  spendingIntelligenceOutflowSql,
} from "@/lib/db/excluded-transactions";
import { db, resilientQuery } from "@/lib/db";
import { accounts, transactions, userCategories } from "@/lib/db/schema";
import {
  amountRangeSqlParts,
  parseAmountRangeParam,
  type AmountRangeFilter,
} from "@/lib/analytics/amount-range";
import type { AnalyticsStackBy } from "@/lib/analytics/workspace-filters";

const MAX_MONTHS = 72;
const DEFAULT_MONTHS = 72;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 60;

type DiscretionaryType = "non-discretionary" | "semi-discretionary" | "discretionary";

const DISC_TYPE_LABEL_TO_KEY: Record<string, DiscretionaryType> = {
  "Non-discretionary": "non-discretionary",
  "Semi-discretionary": "semi-discretionary",
  Discretionary: "discretionary",
  "non-discretionary": "non-discretionary",
  "semi-discretionary": "semi-discretionary",
  discretionary: "discretionary",
};

export type InsightsFilterQuery = {
  granularity: "day" | "month";
  months: number;
  days: number;
  amountRange: AmountRangeFilter;
  stackBy: AnalyticsStackBy;
  soloCategory: string | null;
  excludeNames: string[];
};

export function parseInsightsFilterQuery(
  searchParams: URLSearchParams,
): InsightsFilterQuery {
  const granularityRaw = (searchParams.get("granularity") ?? "month").trim();
  const granularity: "day" | "month" = granularityRaw === "day" ? "day" : "month";

  const rawMonths = parseInt(searchParams.get("months") ?? String(DEFAULT_MONTHS), 10);
  const months = Math.min(
    MAX_MONTHS,
    Math.max(1, Number.isFinite(rawMonths) ? Math.floor(rawMonths) : DEFAULT_MONTHS),
  );

  const rawDays = parseInt(searchParams.get("days") ?? String(DEFAULT_DAYS), 10);
  const days = Math.min(
    MAX_DAYS,
    Math.max(1, Number.isFinite(rawDays) ? Math.floor(rawDays) : DEFAULT_DAYS),
  );

  const amountRange = parseAmountRangeParam(
    searchParams.get("minAmount"),
    searchParams.get("maxAmount"),
  );

  const stackByRaw = (searchParams.get("stackBy") ?? "category").trim();
  const stackBy: AnalyticsStackBy =
    stackByRaw === "discretionary" ? "discretionary" : "category";

  const soloRaw = searchParams.get("category")?.trim() ?? "";
  const soloCategory =
    soloRaw && soloRaw.length <= 128 && stackBy === "category" ? soloRaw : null;

  const excludeNames = searchParams
    .getAll("exclude")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 128);

  return {
    granularity,
    months,
    days,
    amountRange,
    stackBy,
    soloCategory,
    excludeNames,
  };
}

function genMonthKeys(n: number, anchor: { year: number; month: number } | null): string[] {
  const out: string[] = [];
  let yr: number;
  let mo: number;
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

function genDayKeys(n: number, end: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - i),
    );
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export type ResolvedSpendWindow = {
  primaryCurrency: string;
  /** Inclusive start YYYY-MM-DD */
  startDate: string;
  /** Inclusive end YYYY-MM-DD */
  endDate: string;
  /** Human label for UI (e.g. merchants date range). */
  dateRangeLabel: string;
  monthsCoveredHint: number;
};

function formatMonthYearLabel(ymd: string): string {
  const [y, m] = ymd.slice(0, 10).split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1, 1));
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const yy = String(y).slice(-2);
  return `${mon}-${yy}`;
}

/**
 * Same anchoring rules as monthly-stacks / daily-stacks:
 * month mode → up to N months ending at latest outflow month;
 * day mode → last N calendar days ending at latest outflow day.
 */
export async function resolveInsightsSpendWindow(
  userId: string,
  filter: InsightsFilterQuery,
): Promise<ResolvedSpendWindow> {
  const primaryCurrencyRows = await resilientQuery(() =>
    db
      .select({ primaryCurrency: accounts.primaryCurrency })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .limit(1),
  );
  const primaryCurrency = primaryCurrencyRows[0]?.primaryCurrency ?? "USD";

  const baseWhere = and(
    eq(transactions.userId, userId),
    excludeCardPaymentsSql(),
    excludeIgnoredSql(),
    primaryCurrencyOnlySql(primaryCurrency),
    spendingIntelligenceOutflowSql(),
  );

  if (filter.granularity === "day") {
    const maxDateRows = await resilientQuery(() =>
      db
        .select({
          maxDate: sql<string>`MAX(${transactions.postedDate}::date)::text`,
        })
        .from(transactions)
        .where(baseWhere),
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
    const dayKeys = genDayKeys(filter.days, end);
    const startDate = dayKeys[0]!;
    const endDate = dayKeys[dayKeys.length - 1]!;
    return {
      primaryCurrency,
      startDate,
      endDate,
      dateRangeLabel: `${formatMonthYearLabel(startDate)} : ${formatMonthYearLabel(endDate)}`,
      monthsCoveredHint: Math.max(1, Math.ceil(filter.days / 30)),
    };
  }

  const rangeRows = await resilientQuery(() =>
    db
      .select({
        maxY: sql<number>`EXTRACT(YEAR FROM MAX(${transactions.postedDate}::date))::int`,
        maxM: sql<number>`EXTRACT(MONTH FROM MAX(${transactions.postedDate}::date))::int`,
      })
      .from(transactions)
      .where(baseWhere),
  );
  const rng = rangeRows[0];
  const anchor = rng?.maxY && rng?.maxM ? { year: rng.maxY, month: rng.maxM } : null;
  const windowKeys = genMonthKeys(filter.months, anchor);
  const startMonth = windowKeys[0]!;
  const endMonth = windowKeys[windowKeys.length - 1]!;
  const startDate = `${startMonth}-01`;
  const [ey, em] = endMonth.split("-").map((s) => parseInt(s, 10));
  const lastDay = new Date(Date.UTC(ey, em, 0)).getUTCDate();
  const endDate = `${endMonth}-${String(lastDay).padStart(2, "0")}`;
  return {
    primaryCurrency,
    startDate,
    endDate,
    dateRangeLabel: `${formatMonthYearLabel(startDate)} : ${formatMonthYearLabel(endDate)}`,
    monthsCoveredHint: filter.months,
  };
}

/** Posted-date inclusive window matching chart stacks. */
export function insightsDateWindowSql(window: ResolvedSpendWindow): SQL {
  return sql`${transactions.postedDate}::date >= ${window.startDate}::date AND ${transactions.postedDate}::date <= ${window.endDate}::date`;
}

/**
 * Legend alignment:
 * - stackBy category: solo / exclude parent rollup labels
 * - stackBy discretionary: only discretionary-tagged spend; exclude hidden type labels
 */
export function insightsLegendFilterSql(
  userId: string,
  filter: InsightsFilterQuery,
): SQL[] {
  const parts: SQL[] = [];

  if (filter.stackBy === "category") {
    if (filter.soloCategory) {
      parts.push(sql`${categoryRollupLabelSql} = ${filter.soloCategory}`);
    } else if (filter.excludeNames.length > 0) {
      const list = sql.join(
        filter.excludeNames.map((n) => sql`${n}`),
        sql`, `,
      );
      parts.push(sql`${categoryRollupLabelSql} NOT IN (${list})`);
    }
    return parts;
  }

  const excludeTypes = filter.excludeNames
    .map((n) => DISC_TYPE_LABEL_TO_KEY[n])
    .filter((t): t is DiscretionaryType => t != null);

  if (excludeTypes.length > 0) {
    const list = sql.join(
      excludeTypes.map((t) => sql`${t}`),
      sql`, `,
    );
    parts.push(sql`EXISTS (
      SELECT 1 FROM user_categories uc_leg
      WHERE uc_leg.id = ${transactions.categoryId}
        AND uc_leg.user_id = ${userId}
        AND uc_leg.subcategory_type IS NOT NULL
        AND uc_leg.subcategory_type NOT IN (${list})
    )`);
  } else {
    parts.push(sql`EXISTS (
      SELECT 1 FROM user_categories uc_leg
      WHERE uc_leg.id = ${transactions.categoryId}
        AND uc_leg.user_id = ${userId}
        AND uc_leg.subcategory_type IS NOT NULL
    )`);
  }
  return parts;
}

export function insightsAmountSql(filter: InsightsFilterQuery): SQL[] {
  return amountRangeSqlParts(filter.amountRange);
}

/** Standard outflow scope used by Insights cards (matches chart). */
export function insightsBaseOutflowSql(
  userId: string,
  primaryCurrency: string,
): SQL | undefined {
  return and(
    eq(transactions.userId, userId),
    excludeCardPaymentsSql(),
    excludeIgnoredSql(),
    primaryCurrencyOnlySql(primaryCurrency),
    spendingIntelligenceOutflowSql(),
  );
}

export { leafCategory, parentCategory, categoryRollupLabelSql };
