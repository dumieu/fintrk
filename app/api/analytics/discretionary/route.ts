import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, userCategories } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";
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

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type DiscretionaryType = "non-discretionary" | "semi-discretionary" | "discretionary";

const TYPE_ORDER: DiscretionaryType[] = [
  "non-discretionary",
  "semi-discretionary",
  "discretionary",
];

const TYPE_LABEL: Record<DiscretionaryType, string> = {
  "non-discretionary": "Non-discretionary",
  "semi-discretionary": "Semi-discretionary",
  discretionary: "Discretionary",
};

const TYPE_ACCENT: Record<DiscretionaryType, string> = {
  "non-discretionary": "#FF6F69",
  "semi-discretionary": "#F2C94C",
  discretionary: "#5DD3F3",
};

const TYPE_BG: Record<DiscretionaryType, string> = {
  "non-discretionary": "rgba(255,111,105,0.10)",
  "semi-discretionary": "rgba(242,201,76,0.10)",
  discretionary: "rgba(93,211,243,0.10)",
};

export interface DiscretionaryLeaf {
  name: string;
  total: number;
  count: number;
  monthlyAvg: number;
}

export interface DiscretionaryBucket {
  type: DiscretionaryType;
  label: string;
  accent: string;
  bg: string;
  total: number;
  share: number;
  monthlyAvg: number;
  leaves: DiscretionaryLeaf[];
}

export interface DiscretionaryResponse {
  primaryCurrency: string;
  monthsRequested: number;
  monthsCovered: number;
  total: number;
  buckets: DiscretionaryBucket[];
  dateRangeLabel?: string;
}

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

    const [leafRows, monthsRow] = await Promise.all([
      resilientQuery(() =>
        db
          .select({
            name: userCategories.name,
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
              sql`${userCategories.subcategoryType} IS NOT NULL`,
              ...amountParts,
              ...legendParts,
            ),
          )
          .groupBy(userCategories.name, userCategories.subcategoryType),
      ),
      resilientQuery(() =>
        db
          .select({
            count: sql<number>`COUNT(DISTINCT date_trunc('month', ${transactions.postedDate}::date))::int`,
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
          ),
      ),
    ]);

    const monthsCovered = Math.max(1, monthsRow[0]?.count ?? 1);

    const byType = new Map<DiscretionaryType, DiscretionaryLeaf[]>();
    let grand = 0;
    for (const r of leafRows) {
      const t = r.type as DiscretionaryType | null;
      if (!t || !TYPE_ORDER.includes(t)) continue;
      const total = parseFloat(r.total ?? "0");
      grand += total;
      const leaf: DiscretionaryLeaf = {
        name: r.name,
        total: Math.round(total * 100) / 100,
        count: r.count,
        monthlyAvg: Math.round((total / monthsCovered) * 100) / 100,
      };
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(leaf);
    }

    /** When stackBy is discretionary + legend hide, drop hidden buckets entirely. */
    const hiddenTypeLabels = new Set(
      filter.stackBy === "discretionary" ? filter.excludeNames : [],
    );

    const buckets: DiscretionaryBucket[] = TYPE_ORDER.filter(
      (t) => !hiddenTypeLabels.has(TYPE_LABEL[t]),
    ).map((t) => {
      const leaves = (byType.get(t) ?? []).sort((a, b) => b.total - a.total);
      const total = leaves.reduce((a, b) => a + b.total, 0);
      const share = grand > 0 ? Math.round((total / grand) * 1000) / 10 : 0;
      const monthlyAvg = Math.round((total / monthsCovered) * 100) / 100;
      return {
        type: t,
        label: TYPE_LABEL[t],
        accent: TYPE_ACCENT[t],
        bg: TYPE_BG[t],
        total: Math.round(total * 100) / 100,
        share,
        monthlyAvg,
        leaves,
      };
    });

    /** Recompute shares against visible grand when types were hidden client-side only. */
    const visibleGrand = buckets.reduce((s, b) => s + b.total, 0);
    const normalized =
      filter.stackBy === "discretionary" && hiddenTypeLabels.size > 0
        ? buckets.map((b) => ({
            ...b,
            share:
              visibleGrand > 0 ? Math.round((b.total / visibleGrand) * 1000) / 10 : 0,
          }))
        : buckets;

    const payload: DiscretionaryResponse = {
      primaryCurrency: window.primaryCurrency,
      monthsRequested: filter.granularity === "day" ? filter.days : filter.months,
      monthsCovered,
      total: Math.round((visibleGrand || grand) * 100) / 100,
      buckets: normalized,
      dateRangeLabel: window.dateRangeLabel,
    };

    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/analytics/discretionary", err);
    return NextResponse.json(
      { error: "Failed to load discretionary breakdown" },
      { status: 500, headers: NO_STORE },
    );
  }
}
