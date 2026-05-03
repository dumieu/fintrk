import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, accounts, userCategories } from "@/lib/db/schema";
import { excludeCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { eq, and, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const MAX_MONTHS = 60;
const DEFAULT_MONTHS = 12;

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
  /** Number of distinct calendar months in the window that actually had outflows */
  monthsCovered: number;
  total: number;
  buckets: DiscretionaryBucket[];
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

    /** Anchor at the user's most-recent outflow month so old datasets still render. */
    const anchorRows = await resilientQuery(() =>
      db
        .select({
          year: sql<number>`EXTRACT(YEAR FROM MAX(${transactions.postedDate}::date))::int`,
          month: sql<number>`EXTRACT(MONTH FROM MAX(${transactions.postedDate}::date))::int`,
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
    const anchorRow = anchorRows[0];
    const anchorYear = anchorRow?.year ?? new Date().getUTCFullYear();
    const anchorMonth = anchorRow?.month ?? new Date().getUTCMonth() + 1;

    /** Window: [anchor - (months-1) months, anchor + 1 month) */
    const startOffset = months - 1;
    const anchorStart = `${anchorYear}-${String(anchorMonth).padStart(2, "0")}-01`;
    const windowStart = sql`(${anchorStart}::date - (${startOffset} * INTERVAL '1 month'))::date`;
    const windowEnd = sql`(${anchorStart}::date + INTERVAL '1 month')::date`;

    /**
     * Per-leaf-category aggregates (joining transactions on `category_id` directly to
     * `user_categories` to read `subcategoryType`). We deliberately avoid the rollup
     * here because the discretionary classification lives on the leaf row.
     */
    const [leafRows, monthsRow, userAccounts] = await Promise.all([
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
          .where(
            and(
              eq(transactions.userId, userId),
              excludeCardPaymentsSql(),
              sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
              sql`${userCategories.subcategoryType} IS NOT NULL`,
              sql`${transactions.postedDate}::date >= ${windowStart}`,
              sql`${transactions.postedDate}::date < ${windowEnd}`,
            ),
          )
          .groupBy(userCategories.name, userCategories.subcategoryType),
      ),
      /** Distinct months touched in the window — used for averaging. */
      resilientQuery(() =>
        db
          .select({
            count: sql<number>`COUNT(DISTINCT date_trunc('month', ${transactions.postedDate}::date))::int`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              excludeCardPaymentsSql(),
              sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
              sql`${transactions.postedDate}::date >= ${windowStart}`,
              sql`${transactions.postedDate}::date < ${windowEnd}`,
            ),
          ),
      ),
      resilientQuery(() =>
        db
          .select({ primaryCurrency: accounts.primaryCurrency })
          .from(accounts)
          .where(eq(accounts.userId, userId))
          .limit(1),
      ),
    ]);

    const primaryCurrency = userAccounts[0]?.primaryCurrency ?? "USD";
    const monthsCovered = Math.max(1, monthsRow[0]?.count ?? 1);

    /** Group leaves by their discretionary type. */
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

    /** Build buckets in the canonical order and sort leaves by total desc. */
    const buckets: DiscretionaryBucket[] = TYPE_ORDER.map((t) => {
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

    const payload: DiscretionaryResponse = {
      primaryCurrency,
      monthsRequested: months,
      monthsCovered,
      total: Math.round(grand * 100) / 100,
      buckets,
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
