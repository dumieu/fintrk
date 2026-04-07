import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, categories, accounts } from "@/lib/db/schema";
import { eq, and, gte, lte, ilike, or, desc, asc, sql, count } from "drizzle-orm";
import { transactionFiltersSchema, updateCategorySchema } from "@/lib/validations/transaction";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = transactionFiltersSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid filters" }, { status: 400, headers: NO_STORE });
    }

    const f = parsed.data;
    const conditions = [eq(transactions.userId, userId)];

    if (f.accountId) conditions.push(eq(transactions.accountId, f.accountId));
    if (f.categoryId) conditions.push(eq(transactions.categoryId, f.categoryId));
    if (f.dateFrom) conditions.push(gte(transactions.postedDate, f.dateFrom));
    if (f.dateTo) conditions.push(lte(transactions.postedDate, f.dateTo));
    if (f.currency) conditions.push(eq(transactions.baseCurrency, f.currency));
    if (f.countryIso) conditions.push(eq(transactions.countryIso, f.countryIso));
    if (f.isRecurring !== undefined) conditions.push(eq(transactions.isRecurring, f.isRecurring === "true"));
    if (f.search) {
      conditions.push(
        or(
          ilike(transactions.cleanDescription, `%${f.search}%`),
          ilike(transactions.merchantName, `%${f.search}%`),
        )!,
      );
    }

    const where = and(...conditions);

    const sortCol = {
      posted_date: transactions.postedDate,
      base_amount: transactions.baseAmount,
      merchant_name: transactions.merchantName,
      category: transactions.categorySuggestion,
    }[f.sortBy] ?? transactions.postedDate;

    const orderFn = f.sortDir === "asc" ? asc : desc;
    const offset = (f.page - 1) * f.limit;

    const [data, totalResult] = await Promise.all([
      resilientQuery(() =>
        db
          .select({
            id: transactions.id,
            postedDate: transactions.postedDate,
            cleanDescription: transactions.cleanDescription,
            merchantName: transactions.merchantName,
            baseAmount: transactions.baseAmount,
            baseCurrency: transactions.baseCurrency,
            foreignAmount: transactions.foreignAmount,
            foreignCurrency: transactions.foreignCurrency,
            implicitFxSpreadBps: transactions.implicitFxSpreadBps,
            categoryId: transactions.categoryId,
            categorySuggestion: transactions.categorySuggestion,
            countryIso: transactions.countryIso,
            isRecurring: transactions.isRecurring,
            aiConfidence: transactions.aiConfidence,
            accountId: transactions.accountId,
          })
          .from(transactions)
          .where(where)
          .orderBy(orderFn(sortCol))
          .limit(f.limit)
          .offset(offset),
      ),
      resilientQuery(() =>
        db.select({ total: count() }).from(transactions).where(where),
      ),
    ]);

    const total = totalResult[0]?.total ?? 0;

    return NextResponse.json(
      {
        data,
        total,
        page: f.page,
        pages: Math.ceil(total / f.limit),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/transactions/GET", err);
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = updateCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
    }

    let updated = 0;
    for (const txnId of parsed.data.transactionIds) {
      const result = await resilientQuery(() =>
        db.update(transactions)
          .set({ categoryId: parsed.data.categoryId, updatedAt: new Date() })
          .where(and(eq(transactions.id, txnId), eq(transactions.userId, userId))),
      );
      updated++;
    }

    return NextResponse.json({ updated }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/transactions/PUT", err);
    return NextResponse.json({ error: "Failed to update transactions" }, { status: 500, headers: NO_STORE });
  }
}
