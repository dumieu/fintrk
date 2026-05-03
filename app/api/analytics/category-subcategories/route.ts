import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
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

const MAX_NAME = 128;

/**
 * Breakdown of **leaf** category rows (subcategories) whose rollup parent matches `category`.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const raw = request.nextUrl.searchParams.get("category")?.trim() ?? "";
    if (!raw || raw.length > MAX_NAME) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400, headers: NO_STORE },
      );
    }

    const rows = await resilientQuery(() =>
      db
        .select({
          leafName: leafCategory.name,
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
            sql`${categoryRollupLabelSql} = ${raw}`,
          ),
        )
        .groupBy(leafCategory.id, leafCategory.name)
        .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`),
    );

    const subcategories = rows
      .filter((r) => r.leafName != null && String(r.leafName).length > 0)
      .map((r) => ({
        name: r.leafName as string,
        total: parseFloat(r.total ?? "0"),
        count: r.count,
      }));

    const rollupTotal = subcategories.reduce((s, x) => s + x.total, 0);

    return NextResponse.json(
      {
        category: raw,
        rollupTotal: Math.round(rollupTotal * 100) / 100,
        subcategories,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/analytics/category-subcategories", err);
    return NextResponse.json(
      { error: "Failed to load subcategories" },
      { status: 500, headers: NO_STORE },
    );
  }
}
