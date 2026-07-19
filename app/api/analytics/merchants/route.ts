import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";
import { analyticsSubcategoryColor } from "@/lib/analytics-category-colors";
import {
  insightsAmountSql,
  insightsBaseOutflowSql,
  insightsDateWindowSql,
  insightsLegendFilterSql,
  leafCategory,
  parentCategory,
  parseInsightsFilterQuery,
  resolveInsightsSpendWindow,
} from "@/lib/analytics/insights-filter";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

const merchantCategoryLabelSql = sql<string>`COALESCE(${leafCategory.name}, 'Uncategorized')`;

function merchantPairKey(name: string, currency: string) {
  return `${name}\0${currency}`;
}

async function dominantCategoriesForMerchants(
  userId: string,
  pairs: { name: string; currency: string }[],
  windowSql: ReturnType<typeof insightsDateWindowSql>,
  amountParts: ReturnType<typeof insightsAmountSql>,
  legendParts: ReturnType<typeof insightsLegendFilterSql>,
  base: ReturnType<typeof insightsBaseOutflowSql>,
) {
  if (pairs.length === 0) {
    return new Map<string, { category: string | null; subcategory: string; color: string | null }>();
  }

  const pairFilter = or(
    ...pairs.map((p) =>
      and(eq(transactions.merchantName, p.name), eq(transactions.baseCurrency, p.currency)),
    ),
  );

  const rows = await resilientQuery(() =>
    db
      .select({
        name: transactions.merchantName,
        currency: transactions.baseCurrency,
        category: sql<string | null>`${parentCategory.name}`,
        subcategory: merchantCategoryLabelSql,
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
      .where(
        and(
          base,
          windowSql,
          ...amountParts,
          ...legendParts,
          sql`${transactions.merchantName} IS NOT NULL`,
          sql`${leafCategory.name} IS NOT NULL`,
          pairFilter,
        ),
      )
      .groupBy(
        transactions.merchantName,
        transactions.baseCurrency,
        sql`${parentCategory.name}`,
        merchantCategoryLabelSql,
      ),
  );

  const best = new Map<
    string,
    { category: string | null; subcategory: string; color: string | null; total: number }
  >();
  for (const row of rows) {
    const name = row.name ?? "";
    const currency = row.currency ?? "";
    const key = merchantPairKey(name, currency);
    const total = parseFloat(row.total ?? "0");
    const cur = best.get(key);
    if (!cur || total > cur.total) {
      best.set(key, {
        category: row.category,
        subcategory: row.subcategory,
        color: analyticsSubcategoryColor(row.category, row.subcategory),
        total,
      });
    }
  }

  const out = new Map<string, { category: string | null; subcategory: string; color: string | null }>();
  for (const [key, v] of best) {
    out.set(key, { category: v.category, subcategory: v.subcategory, color: v.color });
  }
  return out;
}

/**
 * Merchants ranked by spend, scoped to the same filters as the Spend Analytics chart.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;

    const rawOffset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);
    const rawLimit = parseInt(
      request.nextUrl.searchParams.get("limit") ?? String(DEFAULT_LIMIT),
      10,
    );
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_LIMIT),
    );
    const fetchLimit = limit + 1;

    const filter = parseInsightsFilterQuery(request.nextUrl.searchParams);
    const window = await resolveInsightsSpendWindow(userId, filter);
    const base = insightsBaseOutflowSql(userId, window.primaryCurrency);
    const windowSql = insightsDateWindowSql(window);
    const amountParts = insightsAmountSql(filter);
    const legendParts = insightsLegendFilterSql(userId, filter);

    const rows = await resilientQuery(() =>
      db
        .select({
          name: transactions.merchantName,
          total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
          count: sql<number>`COUNT(*)::int`,
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
        .where(
          and(
            base,
            windowSql,
            ...amountParts,
            ...legendParts,
            sql`${transactions.merchantName} IS NOT NULL`,
          ),
        )
        .groupBy(transactions.merchantName, transactions.baseCurrency)
        .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
        .limit(fetchLimit)
        .offset(offset),
    );

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;

    const categoryByMerchant = await dominantCategoriesForMerchants(
      userId,
      slice.filter((m) => m.name).map((m) => ({ name: m.name!, currency: m.currency })),
      windowSql,
      amountParts,
      legendParts,
      base,
    );

    const merchants = slice.map((m) => {
      const name = m.name ?? "Unknown";
      const meta = categoryByMerchant.get(merchantPairKey(name, m.currency));
      return {
        name,
        total: parseFloat(m.total ?? "0"),
        count: m.count,
        currency: m.currency,
        subcategory: meta?.subcategory ?? null,
        category: meta?.category ?? null,
        subcategoryColor: meta?.color ?? null,
      };
    });

    return NextResponse.json(
      {
        merchants,
        offset,
        nextOffset: offset + merchants.length,
        hasMore,
        dateRangeLabel: window.dateRangeLabel,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/analytics/merchants", err);
    return NextResponse.json(
      { error: "Failed to load merchants" },
      { status: 500, headers: NO_STORE },
    );
  }
}
