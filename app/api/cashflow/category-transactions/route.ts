import { NextRequest, NextResponse } from "next/server";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { accounts, statements, transactions, userCategories } from "@/lib/db/schema";
import { excludeCardPaymentsSql, excludeIgnoredSql, spendingIntelligenceOutflowSql } from "@/lib/db/excluded-transactions";
import {
  doubleChargeMerchantKey,
  findDoubleChargeSuspects,
  type DoubleChargeCandidate,
} from "@/lib/double-charge-suspects";
import { ensureDoubleChargeWatchlistTable } from "@/lib/ensure-double-charge-watchlist";
import { doubleChargeWatchlistExclusions } from "@/lib/db/schema";
import { logServerError } from "@/lib/safe-error";
import { df } from "@/lib/crypto/encryption";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type CategoryFlow = "inflow" | "outflow" | "savings";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const category = request.nextUrl.searchParams.get("category")?.trim() ?? "";
    const merchant = request.nextUrl.searchParams.get("merchant")?.trim() ?? "";
    const levelRaw = request.nextUrl.searchParams.get("level");
    const level = levelRaw === "category" || levelRaw === "subcategory" || levelRaw === "label"
      ? levelRaw
      : null;
    const flowRaw = request.nextUrl.searchParams.get("flow");
    const flow = flowRaw === "inflow" || flowRaw === "outflow" || flowRaw === "savings"
      ? flowRaw
      : null;

    const merchantMode = merchant.length > 0;
    if (merchantMode) {
      if (!flow) {
        return NextResponse.json({ error: "Invalid merchant selection" }, { status: 400, headers: NO_STORE });
      }
    } else if (!category || !level || !flow) {
      return NextResponse.json({ error: "Invalid category selection" }, { status: 400, headers: NO_STORE });
    }

    const dateFrom = request.nextUrl.searchParams.get("dateFrom") || undefined;
    const dateTo = request.nextUrl.searchParams.get("dateTo") || undefined;
    const currency = request.nextUrl.searchParams.get("currency")?.toUpperCase() || undefined;
    const scope = request.nextUrl.searchParams.get("scope")?.trim() ?? "";
    const spendingIntelligence = scope === "spending-intelligence";
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
    const selectionFilter = merchantMode
      ? eq(transactions.merchantName, merchant)
      : level === "category"
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
            excludeCardPaymentsSql(), excludeIgnoredSql(),
            selectionFilter,
            eq(flowExpr, flow),
            ...(flow === "inflow" ? [sql`${transactions.baseAmount}::numeric > 0`] : []),
            ...(currency ? [eq(transactions.baseCurrency, currency)] : []),
            ...(dateFrom ? [gte(transactions.postedDate, dateFrom)] : []),
            ...(dateTo ? [lte(transactions.postedDate, dateTo)] : []),
            ...(investmentExclusionFilter ? [investmentExclusionFilter] : []),
            ...(spendingIntelligence ? [spendingIntelligenceOutflowSql()] : []),
          ),
        )
        .orderBy(desc(transactions.postedDate), desc(transactions.id))
        .limit(200),
    );

    const data = rows.map((row) => ({
      ...row,
      note: df(row.note),
      accountInstitutionName: df(row.accountInstitutionName),
      accountName: df(row.accountName),
    }));

    let enriched = data;
    if (data.length > 0) {
      await ensureDoubleChargeWatchlistTable();
      const exclusionRows = await resilientQuery(() =>
        db
          .select({ merchantKey: doubleChargeWatchlistExclusions.merchantKey })
          .from(doubleChargeWatchlistExclusions)
          .where(eq(doubleChargeWatchlistExclusions.userId, userId)),
      );
      const excludedMerchantKeys = new Set(exclusionRows.map((r) => r.merchantKey));
      const candidateRows = await resilientQuery(() =>
        db
          .select({
            id: transactions.id,
            postedDate: transactions.postedDate,
            merchantName: transactions.merchantName,
            rawDescription: transactions.rawDescription,
            baseAmount: transactions.baseAmount,
            accountId: transactions.accountId,
            referenceId: transactions.referenceId,
            isRecurring: transactions.isRecurring,
            statementId: transactions.statementId,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), excludeIgnoredSql())),
      );
      const candidates = candidateRows as DoubleChargeCandidate[];
      const doubleChargeById = findDoubleChargeSuspects(candidates, { excludedMerchantKeys });
      const candidatesById = new Map(candidates.map((r) => [r.id, r]));
      enriched = data.map((row) => {
        const suspect = doubleChargeById.get(row.id);
        if (!suspect) return row;
        const src = candidatesById.get(row.id);
        return {
          ...row,
          doubleChargeSuspect: {
            ...suspect,
            merchantKey: src
              ? doubleChargeMerchantKey(src.merchantName, src.rawDescription)
              : doubleChargeMerchantKey(row.merchantName, row.rawDescription),
            displayName:
              src?.merchantName?.trim() ||
              row.merchantName?.trim() ||
              src?.rawDescription?.trim().slice(0, 64) ||
              row.rawDescription.trim().slice(0, 64),
          },
        };
      });
    }

    return NextResponse.json({ data: enriched, total: enriched.length }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/cashflow/category-transactions", err);
    return NextResponse.json(
      { error: "Failed to load cashflow category transactions", data: [], total: 0 },
      { status: 500, headers: NO_STORE },
    );
  }
}
