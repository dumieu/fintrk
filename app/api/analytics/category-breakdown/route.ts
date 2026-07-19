import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { requireAppAuth } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { analyticsCategoryColor } from "@/lib/analytics-category-colors";
import {
  categoryRollupLabelSql,
  insightsAmountSql,
  insightsBaseOutflowSql,
  insightsDateWindowSql,
  insightsLegendFilterSql,
  leafCategory,
  parentCategory,
  parseInsightsFilterQuery,
  resolveInsightsSpendWindow,
} from "@/lib/analytics/insights-filter";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Category breakdown aligned with Spend Analytics chart filters
 * (time window, amount range, legend solo/hide).
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;

    const filter = parseInsightsFilterQuery(request.nextUrl.searchParams);
    const window = await resolveInsightsSpendWindow(userId, filter);
    const base = insightsBaseOutflowSql(userId, window.primaryCurrency);
    const legendParts = insightsLegendFilterSql(userId, filter);
    const amountParts = insightsAmountSql(filter);

    const rows = await resilientQuery(() =>
      db
        .select({
          category: categoryRollupLabelSql,
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
            insightsDateWindowSql(window),
            ...amountParts,
            ...legendParts,
          ),
        )
        .groupBy(categoryRollupLabelSql)
        .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
        .limit(24),
    );

    return NextResponse.json(
      {
        categoryBreakdown: rows.map((c) => ({
          label: c.category ?? "Uncategorized",
          amount: parseFloat(c.total ?? "0"),
          color: analyticsCategoryColor(c.category ?? "Uncategorized"),
        })),
        primaryCurrency: window.primaryCurrency,
        dateRangeLabel: window.dateRangeLabel,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/analytics/category-breakdown", err);
    return NextResponse.json(
      { error: "Failed to load category breakdown" },
      { status: 500, headers: NO_STORE },
    );
  }
}
