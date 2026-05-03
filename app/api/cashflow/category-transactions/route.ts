import { NextRequest, NextResponse } from "next/server";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { accounts, statements, transactions, userCategories } from "@/lib/db/schema";
import { excludeCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type CategoryFlow = "inflow" | "outflow" | "savings";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const category = request.nextUrl.searchParams.get("category")?.trim() ?? "";
    const levelRaw = request.nextUrl.searchParams.get("level");
    const level = levelRaw === "category" || levelRaw === "subcategory" || levelRaw === "label"
      ? levelRaw
      : null;
    const flowRaw = request.nextUrl.searchParams.get("flow");
    const flow = flowRaw === "inflow" || flowRaw === "outflow" || flowRaw === "savings"
      ? flowRaw
      : null;

    if (!category || !level || !flow) {
      return NextResponse.json({ error: "Invalid category selection" }, { status: 400, headers: NO_STORE });
    }

    const dateFrom = request.nextUrl.searchParams.get("dateFrom") || undefined;
    const dateTo = request.nextUrl.searchParams.get("dateTo") || undefined;
    const currency = request.nextUrl.searchParams.get("currency")?.toUpperCase() || undefined;
    const includeInvestmentInflows =
      request.nextUrl.searchParams.get("includeInvestmentInflows") === "true";
    const includeInvestmentOutflows =
      request.nextUrl.searchParams.get("includeInvestmentOutflows") === "true";

    const leaf = alias(userCategories, "cashflow_txn_leaf");
    const parent = alias(userCategories, "cashflow_txn_parent");
    const categoryLabel = sql<string>`COALESCE(${parent.name}, ${leaf.name}, 'Uncategorized')`;
    const flowExpr = sql<CategoryFlow>`
      CASE
        WHEN ${leaf.flowType} IS NOT NULL AND ${leaf.flowType} <> 'misc' THEN ${leaf.flowType}
        WHEN ${transactions.baseAmount}::numeric > 0 THEN 'inflow'
        ELSE 'outflow'
      END
    `;
    const selectionFilter = level === "category"
      ? eq(categoryLabel, category)
      : level === "subcategory"
        ? eq(leaf.name, category)
        : sql`trim(coalesce(${transactions.label}, '')) = ${category}`;

    const shouldExcludeInvestmentInflows = !includeInvestmentInflows;
    const shouldExcludeInvestmentOutflows = !includeInvestmentOutflows;
    const investmentCategoryFilter = sql`
      (
        lower(coalesce(${leaf.name}, '')) IN ('investment', 'investments')
        OR lower(coalesce(${leaf.slug}, '')) IN ('investment', 'investments')
        OR lower(coalesce(${leaf.slug}, '')) LIKE 'investment-%'
        OR lower(coalesce(${leaf.slug}, '')) LIKE '%-investment'
        OR lower(coalesce(${parent.name}, '')) IN ('investment', 'investments')
        OR lower(coalesce(${parent.slug}, '')) IN ('investment', 'investments')
        OR lower(coalesce(${parent.slug}, '')) LIKE 'investment-%'
        OR lower(coalesce(${parent.slug}, '')) LIKE '%-investment'
      )
    `;
    const investmentExclusionFilter = shouldExcludeInvestmentInflows || shouldExcludeInvestmentOutflows
      ? sql`
          NOT (
            ${investmentCategoryFilter}
            AND (
              ${
                shouldExcludeInvestmentInflows
                  ? sql`(${transactions.baseAmount}::numeric > 0 OR coalesce(${leaf.flowType}, ${parent.flowType}) = 'inflow')`
                  : sql`false`
              }
              OR ${
                shouldExcludeInvestmentOutflows
                  ? sql`(${transactions.baseAmount}::numeric < 0 OR coalesce(${leaf.flowType}, ${parent.flowType}) IN ('outflow', 'savings'))`
                  : sql`false`
              }
            )
          )
        `
      : undefined;

    const rows = await resilientQuery(() =>
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
              CASE WHEN ${parent.id} IS NOT NULL THEN ${parent.name} END,
              ${leaf.name}
            )
          `.as("categoryName"),
          subcategoryName: sql<string | null>`
            CASE WHEN ${parent.id} IS NOT NULL THEN ${leaf.name} ELSE NULL END
          `.as("subcategoryName"),
          countryIso: transactions.countryIso,
          isRecurring: transactions.isRecurring,
          warningFlag: transactions.warningFlag,
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
        .leftJoin(leaf, eq(transactions.categoryId, leaf.id))
        .leftJoin(parent, eq(leaf.parentId, parent.id))
        .where(
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(),
            selectionFilter,
            eq(flowExpr, flow),
            ...(flow === "inflow" ? [sql`${transactions.baseAmount}::numeric > 0`] : []),
            ...(currency ? [eq(transactions.baseCurrency, currency)] : []),
            ...(dateFrom ? [gte(transactions.postedDate, dateFrom)] : []),
            ...(dateTo ? [lte(transactions.postedDate, dateTo)] : []),
            ...(investmentExclusionFilter ? [investmentExclusionFilter] : []),
          ),
        )
        .orderBy(desc(transactions.postedDate), desc(transactions.id))
        .limit(200),
    );

    return NextResponse.json({ data: rows, total: rows.length }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/cashflow/category-transactions", err);
    return NextResponse.json(
      { error: "Failed to load cashflow category transactions", data: [], total: 0 },
      { status: 500, headers: NO_STORE },
    );
  }
}
