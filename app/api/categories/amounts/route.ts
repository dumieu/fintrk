import { NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, categories } from "@/lib/db/schema";
import { logServerError } from "@/lib/safe-error";
import {
  rollupInflowLabel,
  rollupOutflowLabel,
  rollupSavingsLabel,
  shouldExcludePositiveCredit,
} from "@/lib/mind-map-amount-rollup";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * All-time volumes rolled up to mind-map parent category names (match default-categories `name`).
 * Expenses (negative amounts) → Outflow parents; income (positive) → Inflow / Savings parents.
 */
export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const labelExpr =
      sql<string>`COALESCE(${categories.name}, NULLIF(TRIM(${transactions.categorySuggestion}), ''))`;

    const rows = await resilientQuery(() =>
      db
        .select({
          label: labelExpr,
          expenseVol: sql<string>`COALESCE(SUM(CASE WHEN CAST(${transactions.baseAmount} AS numeric) < 0 THEN ABS(CAST(${transactions.baseAmount} AS numeric)) ELSE 0 END), 0)::text`,
          incomeVol: sql<string>`COALESCE(SUM(CASE WHEN CAST(${transactions.baseAmount} AS numeric) > 0 THEN CAST(${transactions.baseAmount} AS numeric) ELSE 0 END), 0)::text`,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(eq(transactions.userId, userId))
        .groupBy(labelExpr),
    );

    const amounts: Record<string, number> = {};

    for (const r of rows) {
      const raw = (r.label ?? "").trim();
      if (!raw) continue;

      const exp = parseFloat(r.expenseVol ?? "0") || 0;
      const inc = parseFloat(r.incomeVol ?? "0") || 0;

      if (exp > 0) {
        const parent = rollupOutflowLabel(raw);
        if (parent) amounts[parent] = (amounts[parent] ?? 0) + exp;
      }

      if (inc > 0 && !shouldExcludePositiveCredit(raw)) {
        const inflow = rollupInflowLabel(raw);
        if (inflow) {
          amounts[inflow] = (amounts[inflow] ?? 0) + inc;
        } else {
          const sav = rollupSavingsLabel(raw);
          if (sav) amounts[sav] = (amounts[sav] ?? 0) + inc;
        }
      }
    }

    return NextResponse.json({ amounts }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/categories/amounts", err);
    return NextResponse.json(
      { error: "Failed to load category amounts", amounts: {} },
      { status: 500, headers: NO_STORE },
    );
  }
}
