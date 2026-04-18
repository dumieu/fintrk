import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, accounts } from "@/lib/db/schema";
import {
  categoryRollupLabelSql,
  leafCategory,
  parentCategory,
} from "@/lib/db/category-rollup";
import { eq, and, sql, desc } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_NAME = 200;

type Entity = "category" | "merchant" | "country" | "dow" | "currency";

export interface AnalyticsDetailMonth {
  month: string;
  total: number;
  count: number;
}

export interface AnalyticsDetailRow {
  name: string;
  total: number;
  count: number;
}

export interface AnalyticsDetailTxn {
  date: string;
  description: string;
  amount: number;
  currency: string;
}

export interface AnalyticsDetailResponse {
  entity: Entity;
  value: string;
  label: string;
  primaryCurrency: string;
  total: number;
  count: number;
  share: number;
  avgPerTxn: number;
  uniqueDays: number;
  firstSeen: string | null;
  lastSeen: string | null;
  monthly: AnalyticsDetailMonth[];
  dowDistribution: number[];
  topMerchants: AnalyticsDetailRow[];
  topCategories: AnalyticsDetailRow[];
  topCountries: AnalyticsDetailRow[];
  topTransactions: AnalyticsDetailTxn[];
  monthlyAvg: number;
  monthlyMedian: number;
  busiestMonth: { month: string; total: number } | null;
  busiestDow: number | null;
  /** Echo of the `month=YYYY-MM` filter when set — lets the client highlight that bar in the 12-mo trend. */
  selectedMonth: string | null;
}

function emptyResp(
  entity: Entity,
  value: string,
  label: string,
  primaryCurrency: string,
  selectedMonth: string | null = null,
): AnalyticsDetailResponse {
  return {
    entity,
    value,
    label,
    primaryCurrency,
    total: 0,
    count: 0,
    share: 0,
    avgPerTxn: 0,
    uniqueDays: 0,
    firstSeen: null,
    lastSeen: null,
    monthly: [],
    dowDistribution: [0, 0, 0, 0, 0, 0, 0],
    topMerchants: [],
    topCategories: [],
    topCountries: [],
    topTransactions: [],
    monthlyAvg: 0,
    monthlyMedian: 0,
    busiestMonth: null,
    busiestDow: null,
    selectedMonth,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Pad monthly series to 12 calendar months ending at `anchor` (inclusive), oldest -> newest.
 * `rows` may be sparse and out of order; missing months are filled with zeros.
 * `anchor` is `YYYY-MM-DD` (use the user's latest outflow date for old datasets).
 */
function padMonthly(
  rows: { month: string; total: number; count: number }[],
  anchor: string | null,
): AnalyticsDetailMonth[] {
  const map = new Map(rows.map((r) => [r.month, r] as const));
  const out: AnalyticsDetailMonth[] = [];
  let yr: number;
  let mo: number; // 0-indexed
  if (anchor) {
    const [y, m] = anchor.split("-").map((s) => parseInt(s, 10));
    yr = y;
    mo = m - 1;
  } else {
    const now = new Date();
    yr = now.getUTCFullYear();
    mo = now.getUTCMonth();
  }
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(yr, mo - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const r = map.get(key);
    out.push({ month: key, total: r?.total ?? 0, count: r?.count ?? 0 });
  }
  return out;
}

/**
 * Map our UI day index (Mon=0..Sun=6) to Postgres EXTRACT(DOW) value (Sun=0..Sat=6) and back.
 */
function uiDowToPgDow(i: number): number {
  return (i + 1) % 7;
}
function pgDowToUiDow(d: number): number {
  return (d + 6) % 7;
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const entityRaw = (request.nextUrl.searchParams.get("entity") ?? "").trim();
    const value = (request.nextUrl.searchParams.get("value") ?? "").trim();
    const currencyParam = (request.nextUrl.searchParams.get("currency") ?? "").trim();
    /** Optional `YYYY-MM` filter — when set, all aggregates (top X / headline / dow / biggest)
     *  are scoped to that calendar month. The 12-month trend chart is intentionally NOT month-filtered
     *  so it always shows context (the selected month is highlighted client-side). */
    const monthParam = (request.nextUrl.searchParams.get("month") ?? "").trim();

    if (
      entityRaw !== "category" &&
      entityRaw !== "merchant" &&
      entityRaw !== "country" &&
      entityRaw !== "dow" &&
      entityRaw !== "currency"
    ) {
      return NextResponse.json({ error: "Invalid entity" }, { status: 400, headers: NO_STORE });
    }
    const entity = entityRaw as Entity;

    if (!value || value.length > MAX_NAME) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400, headers: NO_STORE });
    }

    /** Account currency — used as label currency when an entity-level currency isn't meaningful. */
    const userAccounts = await resilientQuery(() =>
      db
        .select({ primaryCurrency: accounts.primaryCurrency })
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .limit(1),
    );
    const primaryCurrency = userAccounts[0]?.primaryCurrency ?? "USD";

    /** Per-entity SQL fragment for the WHERE filter (and the human label). */
    let entityFilter = sql``;
    let label = value;

    if (entity === "category") {
      // Use the rollup label expression — same logic the chart uses.
      entityFilter = sql`${categoryRollupLabelSql} = ${value}`;
    } else if (entity === "merchant") {
      const cur = currencyParam && currencyParam.length === 3 ? currencyParam : null;
      entityFilter = cur
        ? sql`${transactions.merchantName} = ${value} AND ${transactions.baseCurrency} = ${cur}`
        : sql`${transactions.merchantName} = ${value}`;
    } else if (entity === "country") {
      const iso = value.toUpperCase();
      label = iso;
      entityFilter = sql`${transactions.countryIso} = ${iso}`;
    } else if (entity === "currency") {
      const iso = value.toUpperCase();
      if (iso.length !== 3) {
        return NextResponse.json(
          { error: "Invalid currency value (3-letter ISO 4217 code)" },
          { status: 400, headers: NO_STORE },
        );
      }
      label = iso;
      entityFilter = sql`COALESCE(${transactions.foreignCurrency}, ${transactions.baseCurrency}) = ${iso}`;
    } else {
      const ui = parseInt(value, 10);
      if (!Number.isFinite(ui) || ui < 0 || ui > 6) {
        return NextResponse.json(
          { error: "Invalid dow value (0..6 Mon..Sun)" },
          { status: 400, headers: NO_STORE },
        );
      }
      const pg = uiDowToPgDow(ui);
      label = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][ui];
      entityFilter = sql`EXTRACT(DOW FROM ${transactions.postedDate}::date) = ${pg}`;
    }

    /** Optional month-of-year filter (`YYYY-MM` → first-day-of-that-month UTC). */
    let monthFilter = sql``;
    let monthFilterActive = false;
    if (monthParam) {
      if (!/^\d{4}-\d{2}$/.test(monthParam)) {
        return NextResponse.json(
          { error: "Invalid month format (expected YYYY-MM)" },
          { status: 400, headers: NO_STORE },
        );
      }
      const monthStart = `${monthParam}-01`;
      monthFilter = sql`${transactions.postedDate}::date >= ${monthStart}::date AND ${transactions.postedDate}::date < (${monthStart}::date + interval '1 month')`;
      monthFilterActive = true;
    }

    /** Common base WHERE without the month filter — used for the 12-mo trend so it shows context. */
    const baseWhere = and(
      eq(transactions.userId, userId),
      sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
      entityFilter,
    );

    /** Aggregate-scoped WHERE — same as baseWhere plus the optional month filter. */
    const aggWhere = monthFilterActive
      ? and(baseWhere, monthFilter)
      : baseWhere;

    /** Anchor the 12-month trend at the user's latest outflow month so old datasets
     *  still produce a meaningful series. Falls back to CURRENT_DATE when none. */
    const trendAnchorRows = await resilientQuery(() =>
      db
        .select({
          d: sql<string | null>`to_char(MAX(${transactions.postedDate}::date), 'YYYY-MM-DD')`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
          ),
        ),
    );
    const trendAnchorDate = trendAnchorRows[0]?.d ?? null;
    const trendAnchorSql = trendAnchorDate
      ? sql`${trendAnchorDate}::date`
      : sql`CURRENT_DATE`;

    /** Headline aggregate. */
    const aggP = resilientQuery(() =>
      db
        .select({
          total: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.baseAmount} AS numeric))), 0)`,
          count: sql<number>`COUNT(*)::int`,
          firstSeen: sql<string | null>`MIN(${transactions.postedDate}::date)::text`,
          lastSeen: sql<string | null>`MAX(${transactions.postedDate}::date)::text`,
          uniqueDays: sql<number>`COUNT(DISTINCT ${transactions.postedDate}::date)::int`,
        })
        .from(transactions)
        .leftJoin(
          leafCategory,
          and(eq(transactions.categoryId, leafCategory.id), eq(leafCategory.userId, userId)),
        )
        .leftJoin(
          parentCategory,
          and(eq(leafCategory.parentId, parentCategory.id), eq(parentCategory.userId, userId)),
        )
        .where(aggWhere),
    );

    /** Last-12-months series (UTC monthly buckets). */
    const monthlyP = resilientQuery(() =>
      db
        .select({
          month: sql<string>`to_char(date_trunc('month', ${transactions.postedDate}::date), 'YYYY-MM')`,
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
          and(eq(leafCategory.parentId, parentCategory.id), eq(parentCategory.userId, userId)),
        )
        .where(
          and(
            baseWhere,
            sql`${transactions.postedDate}::date >= (date_trunc('month', ${trendAnchorSql}) - interval '11 months')`,
            sql`${transactions.postedDate}::date < (date_trunc('month', ${trendAnchorSql}) + interval '1 month')`,
          ),
        )
        .groupBy(sql`date_trunc('month', ${transactions.postedDate}::date)`),
    );

    /** Day-of-week distribution (always 7 buckets, padded). */
    const dowP = resilientQuery(() =>
      db
        .select({
          dow: sql<number>`EXTRACT(DOW FROM ${transactions.postedDate}::date)::int`,
          total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
        })
        .from(transactions)
        .leftJoin(
          leafCategory,
          and(eq(transactions.categoryId, leafCategory.id), eq(leafCategory.userId, userId)),
        )
        .leftJoin(
          parentCategory,
          and(eq(leafCategory.parentId, parentCategory.id), eq(parentCategory.userId, userId)),
        )
        .where(aggWhere)
        .groupBy(sql`EXTRACT(DOW FROM ${transactions.postedDate}::date)`),
    );

    /** Grand total of outflows (for share %). */
    const grandP = resilientQuery(() =>
      db
        .select({
          total: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.baseAmount} AS numeric))), 0)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
          ),
        ),
    );

    /** Top merchants within this slice (skip when entity is merchant itself). */
    const topMerchantsP =
      entity === "merchant"
        ? Promise.resolve([] as { name: string | null; total: string; count: number }[])
        : resilientQuery(() =>
            db
              .select({
                name: transactions.merchantName,
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
              .where(and(aggWhere, sql`${transactions.merchantName} IS NOT NULL`))
              .groupBy(transactions.merchantName)
              .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
              .limit(6),
          );

    /** Top rollup categories within this slice (skip for category entity itself). */
    const topCategoriesP =
      entity === "category"
        ? Promise.resolve([] as { name: string | null; total: string; count: number }[])
        : resilientQuery(() =>
            db
              .select({
                name: categoryRollupLabelSql,
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
              .where(aggWhere)
              .groupBy(categoryRollupLabelSql)
              .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
              .limit(6),
          );

    /** Top countries within this slice (skip for country entity itself). */
    const topCountriesP =
      entity === "country"
        ? Promise.resolve([] as { name: string | null; total: string; count: number }[])
        : resilientQuery(() =>
            db
              .select({
                name: transactions.countryIso,
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
              .where(and(aggWhere, sql`${transactions.countryIso} IS NOT NULL`))
              .groupBy(transactions.countryIso)
              .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
              .limit(6),
          );

    /** Top transactions by absolute amount within the slice. */
    const topTxnsP = resilientQuery(() =>
      db
        .select({
          date: sql<string>`${transactions.postedDate}::date::text`,
          description: sql<string>`COALESCE(${transactions.merchantName}, ${transactions.rawDescription})`,
          amount: sql<string>`ABS(CAST(${transactions.baseAmount} AS numeric))`,
          currency: transactions.baseCurrency,
        })
        .from(transactions)
        .leftJoin(
          leafCategory,
          and(eq(transactions.categoryId, leafCategory.id), eq(leafCategory.userId, userId)),
        )
        .leftJoin(
          parentCategory,
          and(eq(leafCategory.parentId, parentCategory.id), eq(parentCategory.userId, userId)),
        )
        .where(aggWhere)
        .orderBy(desc(sql`ABS(CAST(${transactions.baseAmount} AS numeric))`))
        .limit(5),
    );

    const [
      aggRows,
      monthlyRows,
      dowRows,
      grandRows,
      topMerchantsRows,
      topCategoriesRows,
      topCountriesRows,
      topTxnRows,
    ] = await Promise.all([
      aggP,
      monthlyP,
      dowP,
      grandP,
      topMerchantsP,
      topCategoriesP,
      topCountriesP,
      topTxnsP,
    ]);

    const headline = aggRows[0];
    const total = parseFloat(headline?.total ?? "0");
    const count = headline?.count ?? 0;

    const selectedMonth = monthFilterActive ? monthParam : null;

    if (total <= 0 && count === 0) {
      return NextResponse.json(
        emptyResp(entity, value, label, primaryCurrency, selectedMonth),
        { headers: NO_STORE },
      );
    }

    const grandTotal = parseFloat(grandRows[0]?.total ?? "0");
    const share = grandTotal > 0 ? (total / grandTotal) * 100 : 0;

    const monthly = padMonthly(
      monthlyRows.map((r) => ({
        month: r.month,
        total: parseFloat(r.total ?? "0"),
        count: r.count,
      })),
      trendAnchorDate,
    );

    const dowDistribution = [0, 0, 0, 0, 0, 0, 0];
    for (const r of dowRows) {
      const ui = pgDowToUiDow(r.dow);
      dowDistribution[ui] = parseFloat(r.total ?? "0");
    }

    const topMerchants: AnalyticsDetailRow[] = topMerchantsRows
      .filter((r) => r.name && String(r.name).length > 0)
      .map((r) => ({
        name: String(r.name),
        total: parseFloat(r.total ?? "0"),
        count: r.count,
      }));

    const topCategories: AnalyticsDetailRow[] = topCategoriesRows
      .filter((r) => r.name && String(r.name).length > 0)
      .map((r) => ({
        name: String(r.name),
        total: parseFloat(r.total ?? "0"),
        count: r.count,
      }));

    const topCountries: AnalyticsDetailRow[] = topCountriesRows
      .filter((r) => r.name && String(r.name).length > 0)
      .map((r) => ({
        name: String(r.name),
        total: parseFloat(r.total ?? "0"),
        count: r.count,
      }));

    const topTransactions: AnalyticsDetailTxn[] = topTxnRows.map((r) => ({
      date: r.date,
      description: String(r.description ?? ""),
      amount: parseFloat(r.amount ?? "0"),
      currency: r.currency,
    }));

    const monthlyTotals = monthly.map((m) => m.total);
    const nonZero = monthlyTotals.filter((v) => v > 0);
    const monthlyAvg = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
    const monthlyMedian = median(nonZero);

    let busiestMonth: { month: string; total: number } | null = null;
    for (const m of monthly) {
      if (!busiestMonth || m.total > busiestMonth.total) busiestMonth = { month: m.month, total: m.total };
    }
    if (busiestMonth && busiestMonth.total <= 0) busiestMonth = null;

    let busiestDow: number | null = null;
    let busiestDowVal = 0;
    for (let i = 0; i < 7; i++) {
      if (dowDistribution[i] > busiestDowVal) {
        busiestDowVal = dowDistribution[i];
        busiestDow = i;
      }
    }

    const payload: AnalyticsDetailResponse = {
      entity,
      value,
      label,
      primaryCurrency,
      total: Math.round(total * 100) / 100,
      count,
      share: Math.round(share * 100) / 100,
      avgPerTxn: count > 0 ? Math.round((total / count) * 100) / 100 : 0,
      uniqueDays: headline?.uniqueDays ?? 0,
      firstSeen: headline?.firstSeen ?? null,
      lastSeen: headline?.lastSeen ?? null,
      monthly,
      dowDistribution,
      topMerchants,
      topCategories,
      topCountries,
      topTransactions,
      monthlyAvg: Math.round(monthlyAvg * 100) / 100,
      monthlyMedian: Math.round(monthlyMedian * 100) / 100,
      busiestMonth: busiestMonth
        ? { month: busiestMonth.month, total: Math.round(busiestMonth.total * 100) / 100 }
        : null,
      busiestDow,
      selectedMonth,
    };

    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/analytics/detail", err);
    return NextResponse.json(
      { error: "Failed to load detail" },
      { status: 500, headers: NO_STORE },
    );
  }
}
