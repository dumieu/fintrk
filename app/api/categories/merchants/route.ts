import { NextResponse } from "next/server";
import { and, sql, eq } from "drizzle-orm";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, userCategories } from "@/lib/db/schema";
import { excludeCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Returns distinct merchant names grouped by their leaf category name.
 * Shape: { merchants: Record<string, string[]> }
 * Key = lowercase category/subcategory name, Value = sorted merchant names.
 */
export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rows = await resilientQuery(() =>
      db
        .select({
          categoryName: userCategories.name,
          merchantName: transactions.merchantName,
        })
        .from(transactions)
        .innerJoin(userCategories, eq(transactions.categoryId, userCategories.id))
        .where(
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(),
            sql`${transactions.merchantName} IS NOT NULL`,
            sql`TRIM(${transactions.merchantName}) != ''`,
          ),
        )
        .groupBy(userCategories.name, transactions.merchantName),
    );

    const result: Record<string, string[]> = {};
    for (const r of rows) {
      const cat = (r.categoryName ?? "").trim().toLowerCase();
      const merchant = (r.merchantName ?? "").trim();
      if (!cat || !merchant) continue;
      (result[cat] ??= []).push(merchant);
    }

    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }

    return NextResponse.json({ merchants: result }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/categories/merchants", err);
    return NextResponse.json(
      { error: "Failed to load merchants", merchants: {} },
      { status: 500, headers: NO_STORE },
    );
  }
}
