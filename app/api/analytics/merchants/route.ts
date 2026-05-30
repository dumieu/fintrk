import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import {
  leafCategory,
  parentCategory,
} from "@/lib/db/category-rollup";
import {
  excludeCardPaymentsSql,
  spendingIntelligenceOutflowSql,
} from "@/lib/db/excluded-transactions";
import { eq, and, or, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function formatMonthYearLabel(ymd: string): string {
  const [y, m] = ymd.slice(0, 10).split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1, 1));
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const yy = String(y).slice(-2);
  return `${mon}-${yy}`;
}

const merchantOutflowWhere = (userId: string) =>
  and(
    eq(transactions.userId, userId),
    excludeCardPaymentsSql(),
    spendingIntelligenceOutflowSql(),
    sql`${transactions.merchantName} IS NOT NULL`,
  );

/** Leaf subcategory when present; otherwise the top-level category name. */
const merchantCategoryLabelSql = sql<string>`COALESCE(${leafCategory.name}, 'Uncategorized')`;

function merchantPairKey(name: string, currency: string) {
  return `${name}\0${currency}`;
}

async function dominantCategoriesForMerchants(
  userId: string,
  pairs: { name: string; currency: string }[],
) {
  if (pairs.length === 0) return new Map<string, { subcategory: string; color: string | null }>();

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
        subcategory: merchantCategoryLabelSql,
        color: sql<string | null>`COALESCE(${leafCategory.color}, ${parentCategory.color})`,
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
          eq(transactions.userId, userId),
          excludeCardPaymentsSql(),
          spendingIntelligenceOutflowSql(),
          sql`${transactions.merchantName} IS NOT NULL`,
          sql`${leafCategory.name} IS NOT NULL`,
          pairFilter,
        ),
      )
      .groupBy(
        transactions.merchantName,
        transactions.baseCurrency,
        merchantCategoryLabelSql,
        sql`COALESCE(${leafCategory.color}, ${parentCategory.color})`,
      ),
  );

  const best = new Map<string, { subcategory: string; color: string | null; total: number }>();
  for (const row of rows) {
    const name = row.name ?? "";
    const currency = row.currency ?? "";
    const key = merchantPairKey(name, currency);
    const total = parseFloat(row.total ?? "0");
    const cur = best.get(key);
    if (!cur || total > cur.total) {
      best.set(key, {
        subcategory: row.subcategory,
        color: row.color,
        total,
      });
    }
  }

  const out = new Map<string, { subcategory: string; color: string | null }>();
  for (const [key, v] of best) {
    out.set(key, { subcategory: v.subcategory, color: v.color });
  }
  return out;
}

/**
 * Merchants ranked by total spend (absolute outflow), paginated for infinite scroll.
 * Grouped by merchant name + base currency (same as legacy analytics aggregate).
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rawOffset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);
    const rawLimit = parseInt(request.nextUrl.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_LIMIT),
    );

    const fetchLimit = limit + 1;

    const [rows, rangeRows] = await Promise.all([
      resilientQuery(() =>
        db
          .select({
            name: transactions.merchantName,
            total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
            count: sql<number>`COUNT(*)::int`,
            currency: transactions.baseCurrency,
          })
          .from(transactions)
          .where(merchantOutflowWhere(userId))
          .groupBy(transactions.merchantName, transactions.baseCurrency)
          .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
          .limit(fetchLimit)
          .offset(offset),
      ),
      resilientQuery(() =>
        db
          .select({
            minDate: sql<string | null>`MIN(${transactions.postedDate})::text`,
            maxDate: sql<string | null>`MAX(${transactions.postedDate})::text`,
          })
          .from(transactions)
          .where(merchantOutflowWhere(userId)),
      ),
    ]);

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;

    const categoryByMerchant = await dominantCategoriesForMerchants(
      userId,
      slice
        .filter((m) => m.name)
        .map((m) => ({ name: m.name!, currency: m.currency })),
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
        subcategoryColor: meta?.color ?? null,
      };
    });

    const range = rangeRows[0];
    const dateRangeLabel =
      range?.minDate && range?.maxDate
        ? `${formatMonthYearLabel(range.minDate)} : ${formatMonthYearLabel(range.maxDate)}`
        : null;

    return NextResponse.json(
      {
        merchants,
        offset,
        nextOffset: offset + merchants.length,
        hasMore,
        dateRangeLabel,
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
