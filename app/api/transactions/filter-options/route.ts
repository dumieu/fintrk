import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, categories } from "@/lib/db/schema";
import { eq, sql, isNotNull } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const [catRows, currRows, countryRows] = await Promise.all([
      resilientQuery(() =>
        db.selectDistinct({ id: categories.id, name: categories.name })
          .from(categories)
          .innerJoin(transactions, eq(transactions.categoryId, categories.id))
          .where(eq(transactions.userId, userId))
          .orderBy(categories.name),
      ),
      resilientQuery(() =>
        db.selectDistinct({ currency: transactions.baseCurrency })
          .from(transactions)
          .where(eq(transactions.userId, userId))
          .orderBy(transactions.baseCurrency),
      ),
      resilientQuery(() =>
        db.selectDistinct({ country: transactions.countryIso })
          .from(transactions)
          .where(eq(transactions.userId, userId))
          .orderBy(transactions.countryIso),
      ),
    ]);

    return NextResponse.json({
      categories: catRows.map((c) => ({ value: String(c.id), label: c.name })),
      currencies: currRows.map((c) => ({ value: c.currency, label: c.currency })),
      countries: countryRows
        .filter((c) => c.country)
        .map((c) => ({ value: c.country!, label: c.country! })),
    }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/transactions/filter-options", err);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: NO_STORE });
  }
}
