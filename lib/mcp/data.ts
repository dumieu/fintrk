import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db, resilientQuery } from "@/lib/db";
import {
  accounts,
  merchants,
  netWorthItems,
  netWorthSettings,
  recurringPatterns,
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
  excludeIgnoredSql,
  excludeRecurringIgnoredSql,
  spendingIntelligenceInflowSql,
  spendingIntelligenceOutflowSql,
} from "@/lib/db/excluded-transactions";
import { logMcpAccess } from "@/lib/mcp/audit";
import { df } from "@/lib/crypto/encryption";
import type { ToolMeta } from "@/lib/mcp/context";

export interface DateRangeOpts {
  from?: string;
  to?: string;
  months?: number;
}

function resolveDateRange(opts: DateRangeOpts): { from?: string; to?: string } {
  if (opts.from || opts.to) {
    return { from: opts.from, to: opts.to };
  }
  if (opts.months && opts.months > 0) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - (opts.months - 1));
    return { from: d.toISOString().slice(0, 10) };
  }
  return {};
}

async function audit(userId: string, meta: ToolMeta, tool: string) {
  await logMcpAccess(userId, meta, tool);
}

export async function getLatestTransactionDate(userId: string): Promise<string | null> {
  const [row] = await resilientQuery(() =>
    db
      .select({ d: sql<string>`MAX(${transactions.postedDate})` })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), excludeIgnoredSql())),
  );
  return row?.d ?? null;
}

export async function getProfile(userId: string, meta: ToolMeta) {
  await audit(userId, meta, "get_financial_profile");
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
    first_name: df(u.firstName),
    last_name: df(u.lastName),
    email: df(u.primaryEmail),
    main_currency: u.mainCurrency,
    detect_travel: u.detectTravel,
  };
}

export async function listAccounts(userId: string, meta: ToolMeta) {
  await audit(userId, meta, "list_accounts");
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
  const decrypted = rows.map((r) => ({
    ...r,
    institution_name: df(r.institution_name),
    account_name: df(r.account_name),
  }));
  return { count: decrypted.length, accounts: decrypted };
}

export async function listCategories(userId: string, meta: ToolMeta) {
  await audit(userId, meta, "list_categories");
  const rows = await resilientQuery(() =>
    db
      .select({
        id: userCategories.id,
        name: userCategories.name,
        slug: userCategories.slug,
        flow_type: userCategories.flowType,
        parent_id: userCategories.parentId,
        color: userCategories.color,
      })
      .from(userCategories)
      .where(eq(userCategories.userId, userId))
      .orderBy(asc(userCategories.sortOrder), asc(userCategories.name)),
  );
  const parents = new Map(rows.filter((r) => !r.parent_id).map((r) => [r.id, r.name]));
  return {
    count: rows.length,
    categories: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      flow_type: r.flow_type,
      parent_name: r.parent_id ? (parents.get(r.parent_id) ?? null) : null,
      color: r.color,
    })),
  };
}

export interface ListTransactionsOpts {
  limit?: number;
  search?: string;
  from?: string;
  to?: string;
  account_id?: string;
  category?: string;
  flow?: "inflow" | "outflow" | "all";
}

export async function listTransactions(
  userId: string,
  meta: ToolMeta,
  opts: ListTransactionsOpts,
) {
  await audit(userId, meta, "list_transactions");
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const filters = [eq(transactions.userId, userId), excludeCardPaymentsSql(), excludeIgnoredSql()];
  if (opts.from) filters.push(gte(transactions.postedDate, opts.from));
  if (opts.to) filters.push(lte(transactions.postedDate, opts.to));
  if (opts.account_id) filters.push(eq(transactions.accountId, opts.account_id));
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    // note is encrypted at rest, so it is not substring-searchable in SQL.
    filters.push(
      or(
        ilike(transactions.rawDescription, q),
        ilike(transactions.merchantName, q),
      )!,
    );
  }
  if (opts.category?.trim()) {
    const cat = opts.category.trim();
    filters.push(
      sql`COALESCE(${parentCategory.name}, ${leafCategory.name}, 'Uncategorized') ILIKE ${cat}`,
    );
  }
  const flow = opts.flow ?? "all";
  if (flow === "inflow") filters.push(spendingIntelligenceInflowSql());
  else if (flow === "outflow") filters.push(spendingIntelligenceOutflowSql());

  const rows = await resilientQuery(() =>
    db
      .select({
        id: transactions.id,
        account_id: transactions.accountId,
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

export async function getCashflowSummary(userId: string, meta: ToolMeta, months = 12) {
  await audit(userId, meta, "get_cashflow_summary");
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
        .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), excludeIgnoredSql()))
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

export async function getSpendingBreakdown(
  userId: string,
  meta: ToolMeta,
  opts: DateRangeOpts = {},
) {
  await audit(userId, meta, "get_spending_breakdown");
  const { from, to } = resolveDateRange(opts);
  const filters = [
    eq(transactions.userId, userId),
    excludeCardPaymentsSql(), excludeIgnoredSql(),
    spendingIntelligenceOutflowSql(),
  ];
  if (from) filters.push(gte(transactions.postedDate, from));
  if (to) filters.push(lte(transactions.postedDate, to));

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
      .where(and(...filters))
      .groupBy(categoryRollupLabelSql)
      .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
      .limit(20),
  );

  const categories = rows.map((r) => ({
    category: r.category ?? "Uncategorized",
    total: Math.round((Number.parseFloat(r.total) || 0) * 100) / 100,
    transaction_count: r.count,
  }));
  const grandTotal = categories.reduce((s, c) => s + c.total, 0);

  return {
    date_from: from ?? null,
    date_to: to ?? null,
    grand_total: Math.round(grandTotal * 100) / 100,
    categories,
  };
}

export async function getSpendingByMonth(
  userId: string,
  meta: ToolMeta,
  months = 12,
) {
  await audit(userId, meta, "get_spending_by_month");
  const cap = Math.min(Math.max(months, 1), 72);
  const rows = await resilientQuery(() =>
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${transactions.postedDate}::date), 'YYYY-MM')`,
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
        and(
          eq(transactions.userId, userId),
          excludeCardPaymentsSql(), excludeIgnoredSql(),
          spendingIntelligenceOutflowSql(),
        ),
      )
      .groupBy(
        sql`date_trunc('month', ${transactions.postedDate}::date)`,
        categoryRollupLabelSql,
      )
      .orderBy(
        desc(sql`date_trunc('month', ${transactions.postedDate}::date)`),
        sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`,
      ),
  );

  const byMonth = new Map<
    string,
    { month: string; total: number; categories: Array<{ category: string; total: number; count: number }> }
  >();
  for (const r of rows) {
    const month = r.month;
    const bucket = byMonth.get(month) ?? { month, total: 0, categories: [] };
    const amt = Number.parseFloat(r.total) || 0;
    bucket.total += amt;
    bucket.categories.push({
      category: r.category ?? "Uncategorized",
      total: Math.round(amt * 100) / 100,
      count: r.count,
    });
    byMonth.set(month, bucket);
  }

  const monthly = Array.from(byMonth.values())
    .map((m) => ({
      ...m,
      total: Math.round(m.total * 100) / 100,
      categories: m.categories.slice(0, 8),
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, cap);

  return { months_returned: monthly.length, months: monthly };
}

export async function getTopMerchants(
  userId: string,
  meta: ToolMeta,
  limit = 20,
  opts: DateRangeOpts = {},
) {
  await audit(userId, meta, "get_top_merchants");
  const cap = Math.min(Math.max(limit, 1), 50);
  const { from, to } = resolveDateRange(opts);
  const filters = [
    eq(transactions.userId, userId),
    excludeCardPaymentsSql(), excludeIgnoredSql(),
    spendingIntelligenceOutflowSql(),
  ];
  if (from) filters.push(gte(transactions.postedDate, from));
  if (to) filters.push(lte(transactions.postedDate, to));

  const rows = await resilientQuery(() =>
    db
      .select({
        merchant: sql<string>`COALESCE(${merchants.canonicalName}, ${transactions.merchantName}, 'Unknown')`,
        total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(and(...filters))
      .groupBy(sql`COALESCE(${merchants.canonicalName}, ${transactions.merchantName}, 'Unknown')`)
      .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
      .limit(cap),
  );

  return {
    date_from: from ?? null,
    date_to: to ?? null,
    merchants: rows.map((r) => ({
      merchant: r.merchant,
      total: Math.round((Number.parseFloat(r.total) || 0) * 100) / 100,
      transaction_count: r.count,
    })),
  };
}

export async function listRecurringCharges(userId: string, meta: ToolMeta, activeOnly = true) {
  await audit(userId, meta, "list_recurring_charges");
  const filters = [eq(recurringPatterns.userId, userId), excludeRecurringIgnoredSql()];
  if (activeOnly) filters.push(eq(recurringPatterns.isActive, true));

  const rows = await resilientQuery(() =>
    db
      .select({
        id: recurringPatterns.id,
        merchant_name: recurringPatterns.merchantName,
        interval_label: recurringPatterns.intervalLabel,
        interval_days: recurringPatterns.intervalDays,
        expected_amount: recurringPatterns.expectedAmount,
        currency: recurringPatterns.currency,
        next_expected_date: recurringPatterns.nextExpectedDate,
        last_seen_date: recurringPatterns.lastSeenDate,
        occurrence_count: recurringPatterns.occurrenceCount,
        is_active: recurringPatterns.isActive,
        category: categoryRollupLabelSql,
      })
      .from(recurringPatterns)
      .leftJoin(
        leafCategory,
        and(
          eq(recurringPatterns.categoryId, leafCategory.id),
          eq(leafCategory.userId, userId),
        ),
      )
      .leftJoin(
        parentCategory,
        and(eq(leafCategory.parentId, parentCategory.id), eq(parentCategory.userId, userId)),
      )
      .where(and(...filters))
      .orderBy(desc(recurringPatterns.expectedAmount)),
  );

  const charges = rows.map((r) => ({
    id: r.id,
    merchant_name: r.merchant_name,
    category: r.category ?? null,
    interval_label: r.interval_label,
    interval_days: r.interval_days,
    expected_amount: Number.parseFloat(String(r.expected_amount)) || 0,
    currency: r.currency,
    next_expected_date: r.next_expected_date,
    last_seen_date: r.last_seen_date,
    occurrence_count: r.occurrence_count,
    is_active: r.is_active,
  }));

  const monthlyEstimate = charges.reduce((s, c) => {
    const days = c.interval_days || 30;
    return s + (c.expected_amount * 30) / days;
  }, 0);

  return {
    count: charges.length,
    estimated_monthly_total: Math.round(monthlyEstimate * 100) / 100,
    charges,
  };
}

export async function getNetWorthSummary(userId: string, meta: ToolMeta) {
  await audit(userId, meta, "get_net_worth_summary");
  const [items, settingsRow] = await Promise.all([
    resilientQuery(() =>
      db
        .select({
          id: netWorthItems.id,
          kind: netWorthItems.kind,
          category: netWorthItems.category,
          label: netWorthItems.label,
          amount: netWorthItems.amount,
          currency: netWorthItems.currency,
        })
        .from(netWorthItems)
        .where(and(eq(netWorthItems.userId, userId), eq(netWorthItems.isActive, true)))
        .orderBy(asc(netWorthItems.kind), asc(netWorthItems.displayOrder)),
    ),
    resilientQuery(() =>
      db.select().from(netWorthSettings).where(eq(netWorthSettings.userId, userId)).limit(1),
    ),
  ]);

  const assets = items.filter((i) => i.kind === "asset");
  const liabilities = items.filter((i) => i.kind === "liability");
  const sum = (rows: typeof items) =>
    rows.reduce((s, r) => s + (Number.parseFloat(String(r.amount)) || 0), 0);

  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const settings = settingsRow[0];

  return {
    currency: settings?.currency ?? "USD",
    total_assets: Math.round(totalAssets * 100) / 100,
    total_liabilities: Math.round(totalLiabilities * 100) / 100,
    net_worth: Math.round((totalAssets - totalLiabilities) * 100) / 100,
    asset_count: assets.length,
    liability_count: liabilities.length,
    projection_settings: settings
      ? {
          current_age: settings.currentAge,
          retirement_age: settings.retirementAge,
          monthly_contribution: Number.parseFloat(String(settings.monthlyContribution)) || 0,
          default_growth_rate: Number.parseFloat(String(settings.defaultGrowthRate)) || 0,
        }
      : null,
    top_assets: assets
      .map((a) => ({
        label: df(a.label),
        category: a.category,
        amount: Number.parseFloat(String(a.amount)) || 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    top_liabilities: liabilities
      .map((l) => ({
        label: df(l.label),
        category: l.category,
        amount: Number.parseFloat(String(l.amount)) || 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
  };
}

type FlowKind = "inflow" | "outflow" | "savings";

export async function getCashflowSankeySummary(
  userId: string,
  meta: ToolMeta,
  opts: DateRangeOpts = {},
) {
  await audit(userId, meta, "get_cashflow_sankey");
  const { from, to } = resolveDateRange({ ...opts, months: opts.months ?? 12 });
  const leaf = alias(userCategories, "sankey_leaf");
  const parent = alias(userCategories, "sankey_parent");

  const filters = [
    eq(transactions.userId, userId),
    excludeCardPaymentsSql(), excludeIgnoredSql(),
  ];
  if (from) filters.push(gte(transactions.postedDate, from));
  if (to) filters.push(lte(transactions.postedDate, to));

  const rows = await resilientQuery(() =>
    db
      .select({
        amount: transactions.baseAmount,
        leafFlow: leaf.flowType,
        parentFlow: parent.flowType,
        parentName: parent.name,
        leafName: leaf.name,
      })
      .from(transactions)
      .leftJoin(leaf, eq(transactions.categoryId, leaf.id))
      .leftJoin(parent, eq(leaf.parentId, parent.id))
      .where(and(...filters)),
  );

  const flows: Record<FlowKind, { total: number; count: number; categories: Map<string, number> }> = {
    inflow: { total: 0, count: 0, categories: new Map() },
    outflow: { total: 0, count: 0, categories: new Map() },
    savings: { total: 0, count: 0, categories: new Map() },
  };

  for (const r of rows) {
    const amt = Number.parseFloat(String(r.amount)) || 0;
    if (amt === 0) continue;
    let flow: FlowKind =
      (r.leafFlow as FlowKind) ?? (r.parentFlow as FlowKind) ?? (amt > 0 ? "inflow" : "outflow");
    if (flow !== "inflow" && flow !== "outflow" && flow !== "savings") {
      flow = amt > 0 ? "inflow" : "outflow";
    }
    const cat = r.parentName ?? r.leafName ?? "Uncategorized";
    const bucket = flows[flow];
    bucket.total += Math.abs(amt);
    bucket.count += 1;
    bucket.categories.set(cat, (bucket.categories.get(cat) ?? 0) + Math.abs(amt));
  }

  const serialize = (f: FlowKind) => {
    const b = flows[f];
    const categories = Array.from(b.categories.entries())
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    return {
      flow: f,
      total: Math.round(b.total * 100) / 100,
      transaction_count: b.count,
      top_categories: categories,
    };
  };

  return {
    date_from: from ?? null,
    date_to: to ?? null,
    inflow: serialize("inflow"),
    outflow: serialize("outflow"),
    savings: serialize("savings"),
    net: Math.round((flows.inflow.total - flows.outflow.total - flows.savings.total) * 100) / 100,
  };
}

export async function getContextBrief(userId: string, meta: ToolMeta) {
  await audit(userId, meta, "get_context_brief");

  const threeMonthsAgo = (() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 2);
    return d.toISOString().slice(0, 10);
  })();

  const [
    userRow,
    accountRows,
    txBounds,
    monthlyRows,
    topSpendRows,
    recurringRows,
    nwItems,
    nwSettings,
  ] = await Promise.all([
    resilientQuery(() =>
      db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          mainCurrency: users.mainCurrency,
        })
        .from(users)
        .where(eq(users.clerkUserId, userId))
        .limit(1),
    ),
    resilientQuery(() =>
      db
        .select({ is_active: accounts.isActive })
        .from(accounts)
        .where(eq(accounts.userId, userId)),
    ),
    resilientQuery(() =>
      db
        .select({
          earliest: sql<string>`MIN(${transactions.postedDate})`,
          latest: sql<string>`MAX(${transactions.postedDate})`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), excludeIgnoredSql())),
    ),
    resilientQuery(() =>
      db
        .select({
          month: sql<string>`to_char(date_trunc('month', ${transactions.postedDate}::date), 'YYYY-MM')`,
          income: sql<string>`COALESCE(SUM(CASE WHEN ${spendingIntelligenceInflowSql()} THEN CAST(${transactions.baseAmount} AS numeric) END), 0)`,
          expenses: sql<string>`COALESCE(SUM(CASE WHEN ${spendingIntelligenceOutflowSql()} THEN -CAST(${transactions.baseAmount} AS numeric) END), 0)`,
        })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), excludeIgnoredSql()))
        .groupBy(sql`date_trunc('month', ${transactions.postedDate}::date)`)
        .orderBy(desc(sql`date_trunc('month', ${transactions.postedDate}::date)`))
        .limit(12),
    ),
    resilientQuery(() =>
      db
        .select({
          category: categoryRollupLabelSql,
          total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
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
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(), excludeIgnoredSql(),
            spendingIntelligenceOutflowSql(),
            gte(transactions.postedDate, threeMonthsAgo),
          ),
        )
        .groupBy(categoryRollupLabelSql)
        .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
        .limit(1),
    ),
    resilientQuery(() =>
      db
        .select({
          expected_amount: recurringPatterns.expectedAmount,
          interval_days: recurringPatterns.intervalDays,
        })
        .from(recurringPatterns)
        .where(and(eq(recurringPatterns.userId, userId), eq(recurringPatterns.isActive, true), excludeRecurringIgnoredSql())),
    ),
    resilientQuery(() =>
      db
        .select({ kind: netWorthItems.kind, amount: netWorthItems.amount })
        .from(netWorthItems)
        .where(and(eq(netWorthItems.userId, userId), eq(netWorthItems.isActive, true))),
    ),
    resilientQuery(() =>
      db.select({ currency: netWorthSettings.currency }).from(netWorthSettings).where(eq(netWorthSettings.userId, userId)).limit(1),
    ),
  ]);

  const u = userRow[0];
  const bounds = txBounds[0];
  const activeAccounts = accountRows.filter((a) => a.is_active).length;

  let surviving = monthlyRows.map((r) => ({
    income: Number.parseFloat(r.income) || 0,
    expenses: Number.parseFloat(r.expenses) || 0,
  }));
  for (let i = 0; i < 12 && surviving.length > 1; i++) {
    const avgExp =
      surviving.reduce((s, m) => s + m.expenses, 0) / Math.max(surviving.length, 1);
    const next = surviving.filter((m) => m.expenses >= avgExp * 0.2);
    if (next.length === surviving.length) break;
    surviving = next;
  }
  const monthsUsed = surviving.length;
  const avgIncome =
    monthsUsed > 0 ? surviving.reduce((s, m) => s + m.income, 0) / monthsUsed : 0;
  const avgExpenses =
    monthsUsed > 0 ? surviving.reduce((s, m) => s + m.expenses, 0) / monthsUsed : 0;

  const assets = nwItems.filter((i) => i.kind === "asset");
  const liabilities = nwItems.filter((i) => i.kind === "liability");
  const sumAmt = (rows: typeof nwItems) =>
    rows.reduce((s, r) => s + (Number.parseFloat(String(r.amount)) || 0), 0);
  const totalAssets = sumAmt(assets);
  const totalLiabilities = sumAmt(liabilities);

  const recurringMonthly = recurringRows.reduce((s, c) => {
    const days = c.interval_days || 30;
    return s + ((Number.parseFloat(String(c.expected_amount)) || 0) * 30) / days;
  }, 0);

  const topSpend = topSpendRows[0];

  return {
    profile_summary: u
      ? {
          name: [df(u.firstName), df(u.lastName)].filter(Boolean).join(" ") || null,
          main_currency: u.mainCurrency,
        }
      : null,
    accounts: { total: accountRows.length, active: activeAccounts },
    transactions: {
      count: bounds?.count ?? 0,
      earliest_date: bounds?.earliest ?? null,
      latest_date: bounds?.latest ?? null,
    },
    cashflow: {
      primary_currency: u?.mainCurrency ?? "USD",
      avg_monthly_income: Math.round(avgIncome * 100) / 100,
      avg_monthly_expenses: Math.round(avgExpenses * 100) / 100,
      monthly_gap: Math.round((avgIncome - avgExpenses) * 100) / 100,
      months_used: monthsUsed,
    },
    spending_last_3_months: {
      top_category: topSpend?.category ?? null,
      top_category_total: Math.round((Number.parseFloat(topSpend?.total ?? "0") || 0) * 100) / 100,
    },
    net_worth: {
      currency: nwSettings[0]?.currency ?? "USD",
      net_worth: Math.round((totalAssets - totalLiabilities) * 100) / 100,
      total_assets: Math.round(totalAssets * 100) / 100,
      total_liabilities: Math.round(totalLiabilities * 100) / 100,
    },
    recurring: {
      active_count: recurringRows.length,
      estimated_monthly_total: Math.round(recurringMonthly * 100) / 100,
    },
    tools_available: [
      "get_financial_profile",
      "list_accounts",
      "list_categories",
      "list_transactions",
      "get_cashflow_summary",
      "get_cashflow_sankey",
      "get_spending_breakdown",
      "get_spending_by_month",
      "get_top_merchants",
      "list_recurring_charges",
      "get_net_worth_summary",
    ],
  };
}
