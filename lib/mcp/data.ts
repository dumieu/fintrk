import "server-only";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db, resilientQuery } from "@/lib/db";
import {
  accounts,
  merchants,
  transactions,
  userCategories,
  users,
} from "@/lib/db/schema";
import {
  categoryRollupLabelSql,
  leafCategory,
  parentCategory,
} from "@/lib/db/category-rollup";
import {
  excludeCardPaymentsSql,
  spendingIntelligenceInflowSql,
  spendingIntelligenceOutflowSql,
} from "@/lib/db/excluded-transactions";

interface AccessMeta {
  ipAddress: string;
  userAgent: string;
}

export async function getProfile(userId: string, _meta: AccessMeta) {
  const [u] = await resilientQuery(() =>
    db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        primaryEmail: users.primaryEmail,
        mainCurrency: users.mainCurrency,
        detectTravel: users.detectTravel,
      })
      .from(users)
      .where(eq(users.clerkUserId, userId))
      .limit(1),
  );
  if (!u) return { found: false as const };
  return {
    found: true as const,
    first_name: u.firstName,
    last_name: u.lastName,
    email: u.primaryEmail,
    main_currency: u.mainCurrency,
    detect_travel: u.detectTravel,
  };
}

export async function listAccounts(userId: string, _meta: AccessMeta) {
  const rows = await resilientQuery(() =>
    db
      .select({
        id: accounts.id,
        institution_name: accounts.institutionName,
        account_name: accounts.accountName,
        account_type: accounts.accountType,
        primary_currency: accounts.primaryCurrency,
        country_iso: accounts.countryIso,
        is_active: accounts.isActive,
      })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .orderBy(accounts.createdAt),
  );
  return { count: rows.length, accounts: rows };
}

export async function listTransactions(
  userId: string,
  _meta: AccessMeta,
  opts: { limit?: number; search?: string; from?: string; to?: string },
) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const filters = [eq(transactions.userId, userId), excludeCardPaymentsSql()];
  if (opts.from) filters.push(gte(transactions.postedDate, opts.from));
  if (opts.to) filters.push(lte(transactions.postedDate, opts.to));
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    filters.push(
      or(
        ilike(transactions.rawDescription, q),
        ilike(transactions.merchantName, q),
        ilike(transactions.note, q),
      )!,
    );
  }

  const rows = await resilientQuery(() =>
    db
      .select({
        id: transactions.id,
        posted_date: transactions.postedDate,
        description: transactions.rawDescription,
        merchant: transactions.merchantName,
        amount: transactions.baseAmount,
        currency: transactions.baseCurrency,
        category: categoryRollupLabelSql,
        country_iso: transactions.countryIso,
        label: transactions.label,
      })
      .from(transactions)
      .leftJoin(
        leafCategory,
        and(eq(transactions.categoryId, leafCategory.id), eq(leafCategory.userId, userId)),
      )
      .leftJoin(
        parentCategory,
        and(eq(leafCategory.parentId, parentCategory.id), eq(parentCategory.userId, userId)),
      )
      .where(and(...filters))
      .orderBy(desc(transactions.postedDate))
      .limit(limit),
  );

  return { count: rows.length, transactions: rows };
}

export async function getCashflowSummary(userId: string, _meta: AccessMeta, months = 12) {
  const maxMonths = Math.min(Math.max(months, 1), 24);
  const [userAccounts, monthlyRows] = await Promise.all([
    resilientQuery(() =>
      db
        .select({ primaryCurrency: accounts.primaryCurrency })
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .limit(1),
    ),
    resilientQuery(() =>
      db
        .select({
          month: sql<string>`to_char(date_trunc('month', ${transactions.postedDate}::date), 'YYYY-MM')`,
          income: sql<string>`COALESCE(SUM(CASE WHEN ${spendingIntelligenceInflowSql()} THEN CAST(${transactions.baseAmount} AS numeric) END), 0)`,
          expenses: sql<string>`COALESCE(SUM(CASE WHEN ${spendingIntelligenceOutflowSql()} THEN -CAST(${transactions.baseAmount} AS numeric) END), 0)`,
        })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql()))
        .groupBy(sql`date_trunc('month', ${transactions.postedDate}::date)`)
        .orderBy(desc(sql`date_trunc('month', ${transactions.postedDate}::date)`))
        .limit(maxMonths),
    ),
  ]);

  const primaryCurrency = userAccounts[0]?.primaryCurrency ?? "USD";
  const LOW = 0.2;
  let surviving = monthlyRows.map((r) => ({
    month: r.month,
    income: Number.parseFloat(r.income) || 0,
    expenses: Number.parseFloat(r.expenses) || 0,
  }));

  for (let i = 0; i < 12 && surviving.length > 1; i++) {
    const avgExp =
      surviving.reduce((s, m) => s + m.expenses, 0) / Math.max(surviving.length, 1);
    const next = surviving.filter((m) => m.expenses >= avgExp * LOW);
    if (next.length === surviving.length) break;
    surviving = next;
  }

  const monthsUsed = surviving.length;
  const avgIncome =
    monthsUsed > 0 ? surviving.reduce((s, m) => s + m.income, 0) / monthsUsed : 0;
  const avgExpenses =
    monthsUsed > 0 ? surviving.reduce((s, m) => s + m.expenses, 0) / monthsUsed : 0;

  return {
    primary_currency: primaryCurrency,
    avg_monthly_income: Math.round(avgIncome * 100) / 100,
    avg_monthly_expenses: Math.round(avgExpenses * 100) / 100,
    gap: Math.round((avgIncome - avgExpenses) * 100) / 100,
    months_used: monthsUsed,
    max_months_considered: maxMonths,
    monthly_detail: surviving,
  };
}

export async function getSpendingBreakdown(userId: string, _meta: AccessMeta) {
  const rows = await resilientQuery(() =>
    db
      .select({
        category: categoryRollupLabelSql,
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
        and(eq(leafCategory.parentId, parentCategory.id), eq(parentCategory.userId, userId)),
      )
      .where(
        and(eq(transactions.userId, userId), excludeCardPaymentsSql(), spendingIntelligenceOutflowSql()),
      )
      .groupBy(categoryRollupLabelSql)
      .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
      .limit(15),
  );

  return {
    categories: rows.map((r) => ({
      category: r.category ?? "Uncategorized",
      total: Number.parseFloat(r.total) || 0,
      transaction_count: r.count,
    })),
  };
}

export async function getTopMerchants(userId: string, _meta: AccessMeta, limit = 20) {
  const cap = Math.min(Math.max(limit, 1), 50);
  const rows = await resilientQuery(() =>
    db
      .select({
        merchant: sql<string>`COALESCE(${merchants.canonicalName}, ${transactions.merchantName}, 'Unknown')`,
        total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(
        and(eq(transactions.userId, userId), excludeCardPaymentsSql(), spendingIntelligenceOutflowSql()),
      )
      .groupBy(sql`COALESCE(${merchants.canonicalName}, ${transactions.merchantName}, 'Unknown')`)
      .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
      .limit(cap),
  );

  return {
    merchants: rows.map((r) => ({
      merchant: r.merchant,
      total: Number.parseFloat(r.total) || 0,
      transaction_count: r.count,
    })),
  };
}
