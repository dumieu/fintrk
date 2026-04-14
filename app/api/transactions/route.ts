import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, accounts, statements, userCategories } from "@/lib/db/schema";
import { eq, and, gte, lte, ilike, or, desc, asc, sql, count, isNull, isNotNull, ne, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { transactionFiltersSchema, updateCategorySchema, deleteTransactionsSchema, patchTransactionSchema } from "@/lib/validations/transaction";
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

    if (f.flowTheme) {
      const catRows = await resilientQuery(() =>
        db
          .select({ id: userCategories.id })
          .from(userCategories)
          .where(and(
            eq(userCategories.userId, userId),
            eq(userCategories.flowType, f.flowTheme as "inflow" | "outflow" | "savings" | "misc"),
          )),
      );
      const allowedIds = catRows.map((r) => r.id);
      if (allowedIds.length === 0) {
        conditions.push(sql`1 = 0`);
      } else {
        conditions.push(inArray(transactions.categoryId, allowedIds));
      }
    }

    if (f.accountId) conditions.push(eq(transactions.accountId, f.accountId));
    if (f.categoryId) conditions.push(eq(transactions.categoryId, f.categoryId));
    if (f.dateFrom) conditions.push(gte(transactions.postedDate, f.dateFrom));
    if (f.dateTo) conditions.push(lte(transactions.postedDate, f.dateTo));
    if (f.countryIso) conditions.push(eq(transactions.countryIso, f.countryIso));

    if (f.accountKind === "credit_card") {
      conditions.push(eq(accounts.accountType, "credit"));
    } else if (f.accountKind === "debit_card") {
      conditions.push(
        and(
          eq(accounts.accountType, "checking"),
          isNotNull(accounts.cardNetwork),
          ne(accounts.cardNetwork, "unknown"),
          ne(accounts.cardNetwork, ""),
          sql`trim(both from ${accounts.cardNetwork}) <> ''`,
        )!,
      );
    } else if (f.accountKind === "checking") {
      conditions.push(
        and(
          eq(accounts.accountType, "checking"),
          or(
            isNull(accounts.cardNetwork),
            eq(accounts.cardNetwork, "unknown"),
            eq(accounts.cardNetwork, ""),
            sql`trim(both from ${accounts.cardNetwork}) = ''`,
          ),
        )!,
      );
    }

    const acctDigits = f.accountNumber?.replace(/\D/g, "") ?? "";
    if (acctDigits.length > 0) {
      conditions.push(ilike(accounts.maskedNumber, `%${acctDigits}%`));
    }
    if (f.amountMin !== undefined) conditions.push(gte(transactions.baseAmount, f.amountMin.toString()));
    if (f.amountMax !== undefined) conditions.push(lte(transactions.baseAmount, f.amountMax.toString()));
    if (f.isRecurring !== undefined) conditions.push(eq(transactions.isRecurring, f.isRecurring === "true"));
    if (f.search) {
      conditions.push(
        or(
          ilike(transactions.rawDescription, `%${f.search}%`),
          ilike(transactions.merchantName, `%${f.search}%`),
          ilike(transactions.referenceId, `%${f.search}%`),
          ilike(transactions.note, `%${f.search}%`),
          ilike(transactions.label, `%${f.search}%`),
        )!,
      );
    }

    const where = and(...conditions);
    const needsAccountJoin = Boolean(f.accountKind || acctDigits.length > 0);

    const txnCategory = alias(userCategories, "txn_category");
    const parentCategory = alias(userCategories, "parent_category");

    const sortCol = {
      posted_date: transactions.postedDate,
      base_amount: transactions.baseAmount,
      merchant_name: transactions.merchantName,
      category: txnCategory.name,
    }[f.sortBy] ?? transactions.postedDate;

    const orderFn = f.sortDir === "asc" ? asc : desc;
    const offset = (f.page - 1) * f.limit;

    const amountAggQuery = () =>
      (needsAccountJoin
        ? db
          .select({
            currency: transactions.baseCurrency,
            creditSum: sql<string>`coalesce(sum(case when cast(${transactions.baseAmount} as numeric) < 0 then cast(${transactions.baseAmount} as numeric) else 0 end), 0)::text`,
            debitSum: sql<string>`coalesce(sum(case when cast(${transactions.baseAmount} as numeric) > 0 then cast(${transactions.baseAmount} as numeric) else 0 end), 0)::text`,
          })
          .from(transactions)
          .leftJoin(accounts, eq(transactions.accountId, accounts.id))
          .where(where)
          .groupBy(transactions.baseCurrency)
        : db
          .select({
            currency: transactions.baseCurrency,
            creditSum: sql<string>`coalesce(sum(case when cast(${transactions.baseAmount} as numeric) < 0 then cast(${transactions.baseAmount} as numeric) else 0 end), 0)::text`,
            debitSum: sql<string>`coalesce(sum(case when cast(${transactions.baseAmount} as numeric) > 0 then cast(${transactions.baseAmount} as numeric) else 0 end), 0)::text`,
          })
          .from(transactions)
          .where(where)
          .groupBy(transactions.baseCurrency));

    const statementCountQuery = () =>
      needsAccountJoin
        ? db
            .select({
              statementCount: sql<number>`coalesce(count(distinct ${transactions.statementId}), 0)::int`,
            })
            .from(transactions)
            .leftJoin(accounts, eq(transactions.accountId, accounts.id))
            .where(where)
        : db
            .select({
              statementCount: sql<number>`coalesce(count(distinct ${transactions.statementId}), 0)::int`,
            })
            .from(transactions)
            .where(where);

    const [data, totalResult, amountTotals, statementCountResult] = await Promise.all([
      resilientQuery(() =>
        db
          .select({
            id: transactions.id,
            postedDate: transactions.postedDate,
            rawDescription: transactions.rawDescription,
            referenceId: transactions.referenceId,
            merchantName: transactions.merchantName,
            baseAmount: transactions.baseAmount,
            baseCurrency: transactions.baseCurrency,
            foreignAmount: transactions.foreignAmount,
            foreignCurrency: transactions.foreignCurrency,
            implicitFxRate: transactions.implicitFxRate,
            implicitFxSpreadBps: transactions.implicitFxSpreadBps,
            categoryId: transactions.categoryId,
            categoryConfidence: transactions.categoryConfidence,
            categoryName: sql<string | null>`
              COALESCE(
                CASE WHEN ${parentCategory.id} IS NOT NULL THEN ${parentCategory.name} END,
                ${txnCategory.name}
              )
            `.as("categoryName"),
            subcategoryName: sql<string | null>`
              CASE WHEN ${parentCategory.id} IS NOT NULL THEN ${txnCategory.name} ELSE NULL END
            `.as("subcategoryName"),
            countryIso: transactions.countryIso,
            isRecurring: transactions.isRecurring,
            aiConfidence: transactions.aiConfidence,
            balanceAfter: transactions.balanceAfter,
            note: transactions.note,
            label: transactions.label,
            accountId: transactions.accountId,
            statementId: transactions.statementId,
            accountType: accounts.accountType,
            accountCardNetwork: accounts.cardNetwork,
            accountMaskedNumber: accounts.maskedNumber,
            accountInstitutionName: accounts.institutionName,
            accountName: accounts.accountName,
            statementFileName: statements.fileName,
            statementPeriodStart: statements.periodStart,
            statementPeriodEnd: statements.periodEnd,
          })
          .from(transactions)
          .leftJoin(accounts, eq(transactions.accountId, accounts.id))
          .leftJoin(statements, eq(transactions.statementId, statements.id))
          .leftJoin(txnCategory, eq(transactions.categoryId, txnCategory.id))
          .leftJoin(parentCategory, eq(txnCategory.parentId, parentCategory.id))
          .where(where)
          .orderBy(orderFn(sortCol), orderFn(transactions.id))
          .limit(f.limit)
          .offset(offset),
      ),
      resilientQuery(() =>
        needsAccountJoin
          ? db
            .select({ total: count() })
            .from(transactions)
            .leftJoin(accounts, eq(transactions.accountId, accounts.id))
            .where(where)
          : db.select({ total: count() }).from(transactions).where(where),
      ),
      resilientQuery(amountAggQuery),
      resilientQuery(statementCountQuery),
    ]);

    const total = totalResult[0]?.total ?? 0;
    const statementCount = Number(statementCountResult[0]?.statementCount ?? 0);

    return NextResponse.json(
      {
        data,
        total,
        statementCount,
        page: f.page,
        pages: Math.ceil(total / f.limit),
        amountTotals: amountTotals.map((row) => ({
          currency: row.currency,
          creditSum: row.creditSum,
          debitSum: row.debitSum,
        })),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/transactions/GET", err);
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500, headers: NO_STORE });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = patchTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
    }

    const setPayload: { updatedAt: Date; note?: string | null; label?: string | null; merchantName?: string | null } = { updatedAt: new Date() };
    let bulkNoteCount = 0;
    let bulkLabelCount = 0;

    if (parsed.data.note !== undefined) {
      const t = parsed.data.note.trim();
      setPayload.note = t === "" ? null : t;

      if (parsed.data.noteApplyScope === "merchant" && parsed.data.noteMerchantName) {
        const mName = parsed.data.noteMerchantName.trim().toLowerCase();
        if (mName) {
          const bulkResult = await resilientQuery(() =>
            db.update(transactions)
              .set({ note: setPayload.note, updatedAt: new Date() })
              .where(and(
                eq(transactions.userId, userId),
                sql`LOWER(TRIM(${transactions.merchantName})) = ${mName}`,
              ))
              .returning({ id: transactions.id }),
          );
          bulkNoteCount = bulkResult.length;
        }
      }
    }
    if (parsed.data.label !== undefined) {
      const t = parsed.data.label.trim().slice(0, 20);
      setPayload.label = t === "" ? null : t;

      if (parsed.data.labelApplyScope === "merchant" && parsed.data.labelMerchantName) {
        const mName = parsed.data.labelMerchantName.trim().toLowerCase();
        if (mName) {
          const bulkResult = await resilientQuery(() =>
            db.update(transactions)
              .set({ label: setPayload.label, updatedAt: new Date() })
              .where(and(
                eq(transactions.userId, userId),
                sql`LOWER(TRIM(${transactions.merchantName})) = ${mName}`,
              ))
              .returning({ id: transactions.id }),
          );
          bulkLabelCount = bulkResult.length;
        }
      }
    }

    let bulkMerchantCount = 0;

    if (parsed.data.merchantName !== undefined) {
      const newName = parsed.data.merchantName.trim().toLowerCase() || null;
      setPayload.merchantName = newName;

      if (parsed.data.applyToAllMerchants && parsed.data.oldMerchantName) {
        const oldName = parsed.data.oldMerchantName.trim().toLowerCase();
        if (oldName && newName && oldName !== newName) {
          const bulkResult = await resilientQuery(() =>
            db.update(transactions)
              .set({ merchantName: newName, updatedAt: new Date() })
              .where(and(
                eq(transactions.userId, userId),
                sql`LOWER(TRIM(${transactions.merchantName})) = ${oldName}`,
              ))
              .returning({ id: transactions.id }),
          );
          bulkMerchantCount = bulkResult.length;
        }
      }
    }

    let bulkCategoryCount = 0;

    if (parsed.data.categoryId !== undefined) {
      (setPayload as Record<string, unknown>).categoryId = parsed.data.categoryId;
      const scope = parsed.data.categoryApplyScope ?? "this";

      if (scope === "merchant" && parsed.data.categoryMerchantName) {
        const mName = parsed.data.categoryMerchantName.trim().toLowerCase();
        if (mName) {
          const bulkResult = await resilientQuery(() =>
            db.update(transactions)
              .set({ categoryId: parsed.data.categoryId!, updatedAt: new Date() })
              .where(and(
                eq(transactions.userId, userId),
                sql`LOWER(TRIM(${transactions.merchantName})) = ${mName}`,
              ))
              .returning({ id: transactions.id }),
          );
          bulkCategoryCount = bulkResult.length;
        }
      } else if (scope === "label" && parsed.data.categoryLabel) {
        const lbl = parsed.data.categoryLabel.trim();
        if (lbl) {
          const bulkResult = await resilientQuery(() =>
            db.update(transactions)
              .set({ categoryId: parsed.data.categoryId!, updatedAt: new Date() })
              .where(and(
                eq(transactions.userId, userId),
                eq(transactions.label, lbl),
              ))
              .returning({ id: transactions.id }),
          );
          bulkCategoryCount = bulkResult.length;
        }
      }
    }

    const updated = await resilientQuery(() =>
      db.update(transactions)
        .set(setPayload)
        .where(and(eq(transactions.id, parsed.data.transactionId), eq(transactions.userId, userId)))
        .returning({ id: transactions.id }),
    );

    if (updated.length === 0) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404, headers: NO_STORE });
    }

    return NextResponse.json(
      {
        success: true,
        ...(parsed.data.note !== undefined ? { note: setPayload.note ?? null, bulkNoteCount } : {}),
        ...(parsed.data.label !== undefined ? { label: setPayload.label ?? null, bulkLabelCount } : {}),
        ...(parsed.data.merchantName !== undefined ? { merchantName: setPayload.merchantName ?? null, bulkMerchantCount } : {}),
        ...(parsed.data.categoryId !== undefined ? { categoryId: parsed.data.categoryId, bulkCategoryCount } : {}),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/transactions/PATCH", err);
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500, headers: NO_STORE });
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

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = deleteTransactionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
    }

    const removed = await resilientQuery(() =>
      db.delete(transactions)
        .where(and(eq(transactions.userId, userId), inArray(transactions.id, parsed.data.transactionIds)))
        .returning({ id: transactions.id }),
    );

    return NextResponse.json({ deleted: removed.length }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/transactions/DELETE", err);
    return NextResponse.json({ error: "Failed to delete transactions" }, { status: 500, headers: NO_STORE });
  }
}
