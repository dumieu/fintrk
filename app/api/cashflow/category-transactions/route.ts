import { NextRequest, NextResponse } from "next/server";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requireAppAuth } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { accounts, statements, transactions, userCategories } from "@/lib/db/schema";
import {
  excludeCardPaymentsSql,
  excludeIgnoredSql,
  spendingIntelligenceInflowSql,
  spendingIntelligenceOutflowSql,
} from "@/lib/db/excluded-transactions";
import {
  amountRangeSqlParts,
  parseAmountRangeParam,
} from "@/lib/analytics/amount-range";
import {
  doubleChargeMerchantKey,
  findDoubleChargeSuspects,
  type DoubleChargeCandidate,
} from "@/lib/double-charge-suspects";
import { ensureDoubleChargeWatchlistTable } from "@/lib/ensure-double-charge-watchlist";
import { doubleChargeWatchlistExclusions } from "@/lib/db/schema";
import { logServerError } from "@/lib/safe-error";
import { df } from "@/lib/crypto/encryption";
import { parseDiscretionaryType } from "@/lib/discretionary-type";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Cap for non–Spend Intelligence drill-downs. SI segment popups must load every matching row. */
const DEFAULT_TXN_LIMIT = 200;
const SPENDING_INTELLIGENCE_TXN_LIMIT = 10_000;

type CategoryFlow = "inflow" | "outflow" | "savings";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;

    const category = request.nextUrl.searchParams.get("category")?.trim() ?? "";
    const merchant = request.nextUrl.searchParams.get("merchant")?.trim() ?? "";
    const selectionAll = request.nextUrl.searchParams.get("selection") === "all";
    const levelRaw = request.nextUrl.searchParams.get("level");
    const level =
      levelRaw === "category" ||
      levelRaw === "subcategory" ||
      levelRaw === "label" ||
      levelRaw === "discretionary"
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
    } else if (selectionAll) {
      if (!flow) {
        return NextResponse.json({ error: "Invalid flow selection" }, { status: 400, headers: NO_STORE });
      }
    } else if (!category || !level || !flow) {
      return NextResponse.json({ error: "Invalid category selection" }, { status: 400, headers: NO_STORE });
    }

    const dateFrom = request.nextUrl.searchParams.get("dateFrom") || undefined;
    const dateTo = request.nextUrl.searchParams.get("dateTo") || undefined;
    const currency = request.nextUrl.searchParams.get("currency")?.toUpperCase() || undefined;
    const scope = request.nextUrl.searchParams.get("scope")?.trim() ?? "";
    const spendingIntelligence = scope === "spending-intelligence";
    const amountRange = parseAmountRangeParam(
      request.nextUrl.searchParams.get("minAmount"),
      request.nextUrl.searchParams.get("maxAmount"),
    );
    const amountParts = amountRangeSqlParts(amountRange);
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
    const discType =
      !merchantMode && !selectionAll && level === "discretionary"
        ? parseDiscretionaryType(category)
        : null;
    if (!merchantMode && !selectionAll && level === "discretionary" && !discType) {
      return NextResponse.json(
        { error: "Invalid discretionary type" },
        { status: 400, headers: NO_STORE },
      );
    }

    const selectionFilter = merchantMode
      ? eq(transactions.merchantName, merchant)
      : selectionAll
        ? sql`true`
      : level === "category"
        ? eq(categoryLabel, category)
        : level === "subcategory"
          ? eq(leaf.name, category)
          : level === "discretionary"
            ? eq(leaf.subcategoryType, discType!)
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
    /** SI predicates already exclude investments; keep this only for cashflow drills. */
    const investmentExclusionFilter =
      !spendingIntelligence && (shouldExcludeInvestmentInflows || shouldExcludeInvestmentOutflows)
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

    /**
     * Spend Intelligence popups must use the same universe as the chart bars:
     * SI inflow/outflow SQL only (no extra flowExpr), plus optional amount range.
     * Cashflow drills keep the legacy flowExpr filter.
     */
    const whereClause = and(
      eq(transactions.userId, userId),
      excludeCardPaymentsSql(),
      excludeIgnoredSql(),
      selectionFilter,
      ...(spendingIntelligence
        ? [
            flow === "inflow"
              ? spendingIntelligenceInflowSql()
              : spendingIntelligenceOutflowSql(),
          ]
        : [
            eq(flowExpr, flow!),
            ...(flow === "inflow" ? [sql`${transactions.baseAmount}::numeric > 0`] : []),
          ]),
      ...(currency ? [eq(transactions.baseCurrency, currency)] : []),
      ...(dateFrom ? [gte(transactions.postedDate, dateFrom)] : []),
      ...(dateTo ? [lte(transactions.postedDate, dateTo)] : []),
      ...(investmentExclusionFilter ? [investmentExclusionFilter] : []),
      ...amountParts,
    );

    const rowLimit = spendingIntelligence
      ? SPENDING_INTELLIGENCE_TXN_LIMIT
      : DEFAULT_TXN_LIMIT;

    const [rows, sumRows] = await Promise.all([
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
          .leftJoin(accounts, and(eq(transactions.accountId, accounts.id), eq(accounts.userId, userId)))
          .leftJoin(statements, and(eq(transactions.statementId, statements.id), eq(statements.userId, userId)))
          .leftJoin(leaf, and(eq(transactions.categoryId, leaf.id), eq(leaf.userId, userId)))
          .leftJoin(parent, and(eq(leaf.parentId, parent.id), eq(parent.userId, userId)))
          .where(whereClause)
          .orderBy(desc(transactions.postedDate), desc(transactions.id))
          .limit(rowLimit),
      ),
      resilientQuery(() =>
        db
          .select({
            sumAbs: sql<string>`COALESCE(SUM(ABS(CAST(${transactions.baseAmount} AS numeric))), 0)`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(transactions)
          .leftJoin(leaf, and(eq(transactions.categoryId, leaf.id), eq(leaf.userId, userId)))
          .leftJoin(parent, and(eq(leaf.parentId, parent.id), eq(parent.userId, userId)))
          .where(whereClause),
      ),
    ]);

    const sumAbs = Number.parseFloat(sumRows[0]?.sumAbs ?? "0") || 0;
    const matchCount = sumRows[0]?.count ?? rows.length;

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

    return NextResponse.json(
      {
        data: enriched,
        total: enriched.length,
        matchCount,
        sumAbs,
        truncated: matchCount > enriched.length,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/cashflow/category-transactions", err);
    return NextResponse.json(
      {
        error: "Failed to load cashflow category transactions",
        data: [],
        total: 0,
        sumAbs: 0,
        matchCount: 0,
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
