import { NextResponse } from "next/server";
import { eq, isNotNull, and, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { userCategories, transactions } from "@/lib/db/schema";
import { logServerError } from "@/lib/safe-error";
import { flowThemeForCategoryNames, type CategoryFlowTheme } from "@/lib/category-flow-theme";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const FLOW_SORT_ORDER: Record<CategoryFlowTheme, number> = {
  inflow: 0,
  savings: 1,
  outflow: 2,
  unknown: 3,
};

export interface CategoryFilterOption {
  value: string;
  label: string;
  categoryName: string | null;
  subcategoryName: string | null;
  flowTheme: CategoryFlowTheme;
}

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const parent = alias(userCategories, "cat_parent");

    const [categoryRows, volumeRows] = await Promise.all([
      resilientQuery(() =>
        db
          .select({
            id: userCategories.id,
            name: userCategories.name,
            parentName: parent.name,
          })
          .from(userCategories)
          .leftJoin(parent, eq(userCategories.parentId, parent.id))
          .where(eq(userCategories.userId, userId)),
      ),
      resilientQuery(() =>
        db
          .select({
            categoryId: transactions.categoryId,
            totalAbs: sql<string>`coalesce(sum(abs(cast(${transactions.baseAmount} as numeric))), 0)::text`,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), isNotNull(transactions.categoryId)))
          .groupBy(transactions.categoryId),
      ),
    ]);

    const volumeByCategoryId = new Map<number, number>();
    for (const row of volumeRows) {
      if (row.categoryId == null) continue;
      volumeByCategoryId.set(row.categoryId, parseFloat(row.totalAbs ?? "0") || 0);
    }

    /** Slicer chips only for categories the user has actually used (non-zero total |amount| on assigned rows). */
    const categoryList: CategoryFilterOption[] = categoryRows
      .filter((row) => (volumeByCategoryId.get(row.id) ?? 0) > 0)
      .map((row) => {
        const isSub = row.parentName != null && row.parentName !== "";
        return {
          value: String(row.id),
          label: row.name,
          categoryName: isSub ? row.parentName! : row.name,
          subcategoryName: isSub ? row.name : null,
          flowTheme: flowThemeForCategoryNames(isSub ? row.parentName : null, row.name),
        };
      });

    categoryList.sort((a, b) => {
      const fa = FLOW_SORT_ORDER[a.flowTheme];
      const fb = FLOW_SORT_ORDER[b.flowTheme];
      if (fa !== fb) return fa - fb;
      const ta = volumeByCategoryId.get(Number(a.value)) ?? 0;
      const tb = volumeByCategoryId.get(Number(b.value)) ?? 0;
      if (tb !== ta) return tb - ta;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });

    const countryRows = await resilientQuery(() =>
      db
        .selectDistinct({ iso: transactions.countryIso })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), isNotNull(transactions.countryIso))),
    );

    const countries = countryRows
      .map((r) => r.iso)
      .filter((iso): iso is string => iso != null && iso !== "")
      .sort()
      .map((iso) => ({ value: iso, label: iso.toUpperCase() }));

    return NextResponse.json(
      { categories: categoryList, countries },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/transactions/filter-options/GET", err);
    return NextResponse.json(
      { error: "Failed to load filter options", categories: [], countries: [] },
      { status: 500, headers: NO_STORE },
    );
  }
}
