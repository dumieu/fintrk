import "server-only";
import { and, asc, eq, gte, sql } from "drizzle-orm";

import { db, resilientQuery } from "@/lib/db";
import {
  accounts as accountsTable,
  budgets as budgetsTable,
  goals as goalsTable,
  merchants as merchantsTable,
  netWorthItems,
  netWorthSettings,
  recurringPatterns,
  transactionIgnores,
  transactions,
  userCategories,
  users,
} from "@/lib/db/schema";
import { leafCategory, parentCategory } from "@/lib/db/category-rollup";
import { excludeIgnoredSql, excludeRecurringIgnoredSql } from "@/lib/db/excluded-transactions";
import { df } from "@/lib/crypto/encryption";
import { FIN_AI_WINDOW_MONTHS } from "@/lib/fin-ai/constants";

/**
 * The user's financial record, rendered as a deterministic plain-text digest.
 *
 * READ-ONLY BY CONSTRUCTION. This module issues SELECTs and nothing else. It is
 * the only place the AI chat touches FinTRK financial data, so keeping it free
 * of insert/update/delete is what makes "the AI can never change my money data"
 * a structural property rather than a promise in a prompt.
 *
 * Cost design (the whole point):
 *  - ONE ledger query for the rolling window, then every aggregate (monthly
 *    cashflow, category matrix, merchants, movers, duplicates, concentration)
 *    is computed in JS. Eight round trips become one.
 *  - The output is byte-deterministic: same data in, identical bytes out. Sort
 *    order is pinned everywhere. That is what lets GPT-5.6 prompt caching bill
 *    the repeated prefix at the cached rate on every follow-up turn.
 *  - All arithmetic happens here, so the model spends output tokens on advice
 *    instead of doing sums out loud - and cannot get the sums wrong.
 *  - The ledger degrades through explicit compression tiers under a hard char
 *    budget, so a heavy user costs a predictable amount rather than an
 *    unbounded one.
 *
 * Classification mirrors lib/db/excluded-transactions.ts exactly so the numbers
 * the AI quotes match the numbers the app's charts show.
 */

/**
 * Total digest budget in characters (~4 chars/token, so roughly 22k tokens).
 * Sized against the cost model: at $0.20/M the first turn of a conversation
 * costs under a cent, and every turn after it rides the prompt cache at 10%.
 * Paying for fidelity here is what lets the advisor answer from the actual
 * ledger instead of guessing from summaries.
 */
const DIGEST_CHAR_BUDGET = 88_000;
/** The ledger never gets squeezed below this share of the budget. */
const LEDGER_MIN_SHARE = 0.45;
/** Hard row cap; protects the isolate from a pathological import. */
const MAX_LEDGER_ROWS = 14_000;

const TOP_CATEGORIES = 18;
const TOP_SUBCATEGORIES = 30;
const TOP_MERCHANTS = 45;
const TOP_RECURRING = 40;
const TOP_LARGEST = 14;
const TOP_MOVERS = 6;
const MAX_NOTE_CHARS = 70;

/* ── window ─────────────────────────────────────────────────────────────── */

export interface DigestWindow {
  /** First day of the month FIN_AI_WINDOW_MONTHS-1 months back (YYYY-MM-DD). */
  start: string;
  /** Month keys oldest to newest, e.g. ["2025-09", ... "2026-08"]. */
  months: string[];
}

/**
 * Rolling window anchored to month boundaries. Anchoring to the 1st (rather
 * than "365 days ago") means the window key only changes once a month, so the
 * cached digest is not invalidated by the clock ticking over midnight.
 */
export function resolveWindow(now: Date = new Date()): DigestWindow {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (FIN_AI_WINDOW_MONTHS - 1), 1),
  );
  const months: string[] = [];
  for (let i = 0; i < FIN_AI_WINDOW_MONTHS; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return { start: start.toISOString().slice(0, 10), months };
}

/* ── row shapes ─────────────────────────────────────────────────────────── */

interface LedgerRow {
  postedDate: string;
  rawDescription: string;
  merchantName: string | null;
  canonicalName: string | null;
  accountId: string;
  baseAmount: string;
  baseCurrency: string;
  foreignAmount: string | null;
  foreignCurrency: string | null;
  fxSpreadBps: string | null;
  countryIso: string | null;
  isRecurring: boolean;
  warningFlag: boolean;
  note: string | null;
  label: string | null;
  leafName: string | null;
  leafSlug: string | null;
  leafFlow: string | null;
  leafType: string | null;
  parentName: string | null;
  parentSlug: string | null;
  parentFlow: string | null;
}

type Flow = "inflow" | "outflow" | "savings" | "misc";

interface Txn {
  date: string;
  month: string;
  name: string;
  category: string;
  subcategory: string | null;
  costType: string | null;
  amount: number;
  currency: string;
  isPrimary: boolean;
  foreign: string | null;
  fxSpreadBps: number | null;
  country: string | null;
  warning: boolean;
  recurring: boolean;
  note: string | null;
  label: string | null;
  accountId: string;
  flow: Flow;
  isCardPayment: boolean;
  isInvestment: boolean;
  /** Counts toward Spending Intelligence expense totals. */
  siOutflow: boolean;
  /** Counts toward Spending Intelligence income totals. */
  siInflow: boolean;
}

/* ── formatting helpers (determinism lives here) ────────────────────────── */

function num(value: number, dp = 2): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(dp);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/** Whole units above 100, two decimals below - a plan never needs cents. */
function money(value: number): string {
  return Math.abs(value) >= 100 ? num(Math.round(value), 0) : num(value, 2);
}

function clean(value: string | null | undefined, max: number): string {
  const t = (value ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Sort by numeric weight descending, then by label ascending, for stable bytes. */
function byWeightThenName<T>(weight: (x: T) => number, name: (x: T) => string) {
  return (a: T, b: T) => {
    const d = weight(b) - weight(a);
    if (d !== 0) return d;
    return name(a).localeCompare(name(b));
  };
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${num((part / whole) * 100, 1)}%`;
}

/* ── classification (mirrors lib/db/excluded-transactions.ts) ───────────── */

const INVESTMENT_NAMES = new Set(["investment", "investments"]);

function looksInvestment(value: string | null): boolean {
  const v = (value ?? "").toLowerCase();
  if (!v) return false;
  return (
    INVESTMENT_NAMES.has(v) || v.startsWith("investment-") || v.endsWith("-investment")
  );
}

function toFlow(value: string | null): Flow | null {
  return value === "inflow" || value === "outflow" || value === "savings" || value === "misc"
    ? value
    : null;
}

/**
 * Grouping key for a merchant. Banks emit the same shop in several casings and
 * with a reference number glued on ("ADOBE SYSTEMS PTE." vs "adobe systems pte.
 * l" vs "NETFLIX 8842193"), which would otherwise split one merchant into
 * several rows and waste both accuracy and tokens.
 */
function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d{6,}/g, "#")
    .replace(/[^a-z0-9#&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRow(r: LedgerRow, primaryCurrency: string): Txn {
  const amount = Number.parseFloat(r.baseAmount) || 0;
  const leafFlow = toFlow(r.leafFlow);
  const parentFlow = toFlow(r.parentFlow);
  const categorized = r.leafName != null;

  const isCardPayment = r.leafSlug === "card-payments" || r.parentSlug === "card-payments";
  const isInvestment =
    looksInvestment(r.leafName) ||
    looksInvestment(r.leafSlug) ||
    looksInvestment(r.parentName) ||
    looksInvestment(r.parentSlug);

  let flow: Flow = leafFlow ?? parentFlow ?? (amount > 0 ? "inflow" : "outflow");
  if (flow === "misc") flow = amount > 0 ? "inflow" : "outflow";

  // Spending Intelligence: inflow/outflow categories only, investments removed.
  const siEligible =
    (!categorized || leafFlow === "inflow" || leafFlow === "outflow") && !isInvestment;
  const siOutflow =
    siEligible &&
    !isCardPayment &&
    ((categorized && leafFlow === "outflow") || (!categorized && amount < 0));
  const siInflow =
    siEligible &&
    !isCardPayment &&
    ((categorized && leafFlow === "inflow" && amount > 0) || (!categorized && amount > 0));

  const fxSpread = r.fxSpreadBps != null ? Number.parseFloat(r.fxSpreadBps) : null;

  return {
    date: r.postedDate,
    month: r.postedDate.slice(0, 7),
    name: clean(r.canonicalName ?? r.merchantName ?? r.rawDescription, 44) || "Unknown",
    category: r.parentName ?? r.leafName ?? "Uncategorized",
    subcategory: r.parentName && r.leafName ? r.leafName : null,
    costType: r.leafType,
    amount,
    currency: r.baseCurrency,
    isPrimary: r.baseCurrency === primaryCurrency,
    foreign:
      r.foreignAmount && r.foreignCurrency && r.foreignCurrency !== r.baseCurrency
        ? `${num(Number.parseFloat(r.foreignAmount), 2)} ${r.foreignCurrency}`
        : null,
    fxSpreadBps: fxSpread != null && Number.isFinite(fxSpread) ? fxSpread : null,
    country: r.countryIso,
    warning: r.warningFlag,
    recurring: r.isRecurring,
    note: clean(df(r.note), MAX_NOTE_CHARS) || null,
    label: clean(r.label, 20) || null,
    accountId: r.accountId,
    flow,
    isCardPayment,
    isInvestment,
    siOutflow,
    siInflow,
  };
}

/* ── data load (one batched pass) ───────────────────────────────────────── */

export interface FinancialSnapshot {
  window: DigestWindow;
  primaryCurrency: string;
  profile: { name: string | null; mainCurrency: string | null; detectTravel: string } | null;
  accounts: Array<{
    id: string;
    /** Unique within the user's set; disambiguated when banks reuse a name. */
    label: string;
    name: string;
    institution: string | null;
    masked: string | null;
    type: string;
    currency: string;
    country: string | null;
    active: boolean;
  }>;
  txns: Txn[];
  history: { earliest: string | null; latest: string | null; total: number };
  ignoredCount: number;
  truncated: boolean;
  recurring: Array<{
    merchant: string;
    interval: string;
    intervalDays: number;
    amount: number;
    currency: string;
    next: string | null;
    last: string | null;
    occurrences: number;
    category: string | null;
  }>;
  netWorth: {
    currency: string;
    assets: Array<{ label: string; category: string; amount: number; rate: number | null }>;
    liabilities: Array<{ label: string; category: string; amount: number; rate: number | null }>;
    settings: {
      currentAge: number;
      retirementAge: number;
      monthlyContribution: number;
      defaultGrowthRate: number;
      inflationRate: number;
      annualDrawdown: number;
      postRetirementIncome: number;
      annualIncome: number | null;
    } | null;
  };
  budgets: Array<{
    name: string;
    category: string | null;
    amount: number;
    currency: string;
    period: string;
  }>;
  goals: Array<{
    name: string;
    target: number;
    current: number;
    currency: string;
    targetDate: string | null;
    completed: boolean;
  }>;
}

export async function loadFinancialSnapshot(
  userId: string,
  window: DigestWindow,
): Promise<FinancialSnapshot> {
  const [
    userRows,
    accountRows,
    ledgerRows,
    historyRows,
    ignoredRows,
    recurringRows,
    nwItemRows,
    nwSettingsRows,
    budgetRows,
    goalRows,
  ] = await Promise.all([
    resilientQuery(() =>
      db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          mainCurrency: users.mainCurrency,
          detectTravel: users.detectTravel,
        })
        .from(users)
        .where(eq(users.clerkUserId, userId))
        .limit(1),
    ),
    resilientQuery(() =>
      db
        .select({
          id: accountsTable.id,
          accountName: accountsTable.accountName,
          institutionName: accountsTable.institutionName,
          accountType: accountsTable.accountType,
          maskedNumber: accountsTable.maskedNumber,
          primaryCurrency: accountsTable.primaryCurrency,
          countryIso: accountsTable.countryIso,
          isActive: accountsTable.isActive,
        })
        .from(accountsTable)
        .where(eq(accountsTable.userId, userId))
        .orderBy(asc(accountsTable.createdAt), asc(accountsTable.id)),
    ),
    resilientQuery(() =>
      db
        .select({
          postedDate: transactions.postedDate,
          rawDescription: transactions.rawDescription,
          merchantName: transactions.merchantName,
          canonicalName: merchantsTable.canonicalName,
          accountId: transactions.accountId,
          baseAmount: transactions.baseAmount,
          baseCurrency: transactions.baseCurrency,
          foreignAmount: transactions.foreignAmount,
          foreignCurrency: transactions.foreignCurrency,
          fxSpreadBps: transactions.implicitFxSpreadBps,
          countryIso: transactions.countryIso,
          isRecurring: transactions.isRecurring,
          warningFlag: transactions.warningFlag,
          note: transactions.note,
          label: transactions.label,
          leafName: leafCategory.name,
          leafSlug: leafCategory.slug,
          leafFlow: leafCategory.flowType,
          leafType: leafCategory.subcategoryType,
          parentName: parentCategory.name,
          parentSlug: parentCategory.slug,
          parentFlow: parentCategory.flowType,
        })
        .from(transactions)
        .leftJoin(merchantsTable, eq(transactions.merchantId, merchantsTable.id))
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
            gte(transactions.postedDate, window.start),
            excludeIgnoredSql(),
          ),
        )
        .orderBy(
          asc(transactions.postedDate),
          asc(transactions.rawDescription),
          asc(transactions.baseAmount),
        )
        .limit(MAX_LEDGER_ROWS + 1),
    ),
    resilientQuery(() =>
      db
        .select({
          earliest: sql<string | null>`MIN(${transactions.postedDate})`,
          latest: sql<string | null>`MAX(${transactions.postedDate})`,
          total: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), excludeIgnoredSql())),
    ),
    resilientQuery(() =>
      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(transactionIgnores)
        .where(eq(transactionIgnores.userId, userId)),
    ),
    resilientQuery(() =>
      db
        .select({
          merchantName: recurringPatterns.merchantName,
          intervalLabel: recurringPatterns.intervalLabel,
          intervalDays: recurringPatterns.intervalDays,
          expectedAmount: recurringPatterns.expectedAmount,
          currency: recurringPatterns.currency,
          nextExpectedDate: recurringPatterns.nextExpectedDate,
          lastSeenDate: recurringPatterns.lastSeenDate,
          occurrenceCount: recurringPatterns.occurrenceCount,
          categoryName: userCategories.name,
        })
        .from(recurringPatterns)
        .leftJoin(
          userCategories,
          and(
            eq(recurringPatterns.categoryId, userCategories.id),
            eq(userCategories.userId, userId),
          ),
        )
        .where(
          and(
            eq(recurringPatterns.userId, userId),
            eq(recurringPatterns.isActive, true),
            excludeRecurringIgnoredSql(),
          ),
        )
        .orderBy(asc(recurringPatterns.merchantName), asc(recurringPatterns.intervalLabel)),
    ),
    resilientQuery(() =>
      db
        .select({
          kind: netWorthItems.kind,
          category: netWorthItems.category,
          label: netWorthItems.label,
          amount: netWorthItems.amount,
          currency: netWorthItems.currency,
          growthRate: netWorthItems.growthRate,
        })
        .from(netWorthItems)
        .where(and(eq(netWorthItems.userId, userId), eq(netWorthItems.isActive, true)))
        .orderBy(asc(netWorthItems.kind), asc(netWorthItems.displayOrder), asc(netWorthItems.id)),
    ),
    resilientQuery(() =>
      db.select().from(netWorthSettings).where(eq(netWorthSettings.userId, userId)).limit(1),
    ),
    resilientQuery(() =>
      db
        .select({
          name: budgetsTable.name,
          amount: budgetsTable.amount,
          currency: budgetsTable.currency,
          period: budgetsTable.period,
          categoryName: userCategories.name,
        })
        .from(budgetsTable)
        .leftJoin(
          userCategories,
          and(
            eq(budgetsTable.categoryId, userCategories.id),
            eq(userCategories.userId, userId),
          ),
        )
        .where(and(eq(budgetsTable.userId, userId), eq(budgetsTable.isActive, true)))
        .orderBy(asc(budgetsTable.name), asc(budgetsTable.id)),
    ),
    resilientQuery(() =>
      db
        .select({
          name: goalsTable.name,
          targetAmount: goalsTable.targetAmount,
          currentAmount: goalsTable.currentAmount,
          currency: goalsTable.currency,
          targetDate: goalsTable.targetDate,
          isCompleted: goalsTable.isCompleted,
        })
        .from(goalsTable)
        .where(eq(goalsTable.userId, userId))
        .orderBy(asc(goalsTable.name), asc(goalsTable.id)),
    ),
  ]);

  const truncated = ledgerRows.length > MAX_LEDGER_ROWS;
  const rows = (truncated ? ledgerRows.slice(-MAX_LEDGER_ROWS) : ledgerRows) as LedgerRow[];

  const u = userRows[0];
  // Banks frequently give several accounts the same display name. Per-account
  // spending is only useful if each one is separable, so build a unique label:
  // name, then card type, then the mask, then an ordinal as a last resort.
  const labelCounts = new Map<string, number>();
  const accountList = accountRows.map((a) => {
    const name = df(a.accountName) ?? "Account";
    const masked = a.maskedNumber?.trim() || null;
    let label = name;
    if ((accountRows.filter((x) => df(x.accountName) === name).length ?? 0) > 1) {
      label = `${name} ${a.accountType}`;
      if (masked) label = `${label} ${masked}`;
    }
    const seen = (labelCounts.get(label) ?? 0) + 1;
    labelCounts.set(label, seen);
    if (seen > 1) label = `${label} #${seen}`;
    return {
      id: a.id,
      label,
      name,
      institution: df(a.institutionName),
      masked,
      type: a.accountType,
      currency: a.primaryCurrency,
      country: a.countryIso,
      active: a.isActive,
    };
  });

  // Main currency: the user's declared choice, else the currency carrying the
  // most rows in the window, else the first account's. Never mix currencies.
  const currencyCounts = new Map<string, number>();
  for (const r of rows) {
    currencyCounts.set(r.baseCurrency, (currencyCounts.get(r.baseCurrency) ?? 0) + 1);
  }
  const dominant = [...currencyCounts.entries()].sort(
    byWeightThenName(
      (e) => e[1],
      (e) => e[0],
    ),
  )[0]?.[0];
  const primaryCurrency =
    u?.mainCurrency ?? dominant ?? accountList[0]?.currency ?? "USD";

  const settings = nwSettingsRows[0];
  const nwItems = nwItemRows.map((i) => ({
    label: df(i.label) ?? "Item",
    category: i.category,
    amount: Number.parseFloat(String(i.amount)) || 0,
    rate: i.growthRate != null ? Number.parseFloat(String(i.growthRate)) : null,
    kind: i.kind,
  }));

  const annualIncomeRaw = settings ? df(settings.annualIncome) : null;
  const annualIncome = annualIncomeRaw ? Number.parseFloat(annualIncomeRaw) : null;

  return {
    window,
    primaryCurrency,
    profile: u
      ? {
          name: [df(u.firstName), df(u.lastName)].filter(Boolean).join(" ") || null,
          mainCurrency: u.mainCurrency,
          detectTravel: u.detectTravel,
        }
      : null,
    accounts: accountList,
    txns: rows.map((r) => normalizeRow(r, primaryCurrency)),
    history: {
      earliest: historyRows[0]?.earliest ?? null,
      latest: historyRows[0]?.latest ?? null,
      total: historyRows[0]?.total ?? 0,
    },
    ignoredCount: ignoredRows[0]?.total ?? 0,
    truncated,
    recurring: recurringRows.map((r) => ({
      merchant: clean(r.merchantName, 44),
      interval: r.intervalLabel,
      intervalDays: r.intervalDays || 30,
      amount: Number.parseFloat(String(r.expectedAmount)) || 0,
      currency: r.currency,
      next: r.nextExpectedDate,
      last: r.lastSeenDate,
      occurrences: r.occurrenceCount,
      category: r.categoryName,
    })),
    netWorth: {
      currency: settings?.currency ?? primaryCurrency,
      assets: nwItems.filter((i) => i.kind === "asset"),
      liabilities: nwItems.filter((i) => i.kind === "liability"),
      settings: settings
        ? {
            currentAge: settings.currentAge,
            retirementAge: settings.retirementAge,
            monthlyContribution: Number.parseFloat(String(settings.monthlyContribution)) || 0,
            defaultGrowthRate: Number.parseFloat(String(settings.defaultGrowthRate)) || 0,
            inflationRate: Number.parseFloat(String(settings.inflationRate)) || 0,
            annualDrawdown: Number.parseFloat(String(settings.annualDrawdown)) || 0,
            postRetirementIncome:
              Number.parseFloat(String(settings.postRetirementIncome)) || 0,
            annualIncome: annualIncome != null && Number.isFinite(annualIncome) ? annualIncome : null,
          }
        : null,
    },
    budgets: budgetRows.map((b) => ({
      name: b.name,
      category: b.categoryName,
      amount: Number.parseFloat(String(b.amount)) || 0,
      currency: b.currency,
      period: b.period,
    })),
    goals: goalRows.map((g) => ({
      name: g.name,
      target: Number.parseFloat(String(g.targetAmount)) || 0,
      current: Number.parseFloat(String(g.currentAmount)) || 0,
      currency: g.currency,
      targetDate: g.targetDate,
      completed: g.isCompleted,
    })),
  };
}

/* ── rendering ──────────────────────────────────────────────────────────── */

interface MonthAgg {
  month: string;
  income: number;
  expenses: number;
  savings: number;
  count: number;
}

interface Bucket {
  key: string;
  total: number;
  count: number;
  extra?: string;
}

/**
 * Collapse spelling variants of the same merchant onto the single most common
 * spelling, so totals are right and the name appears once in the prompt.
 */
function unifyMerchantNames(txns: Txn[]): Txn[] {
  const variants = new Map<string, Map<string, number>>();
  for (const t of txns) {
    const key = merchantKey(t.name);
    if (!key) continue;
    const counts = variants.get(key) ?? new Map<string, number>();
    counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
    variants.set(key, counts);
  }
  const display = new Map<string, string>();
  for (const [key, counts] of variants) {
    const best = [...counts.entries()].sort(
      byWeightThenName(
        (e) => e[1],
        (e) => e[0],
      ),
    )[0][0];
    display.set(key, best);
  }
  return txns.map((t) => {
    const key = merchantKey(t.name);
    const name = key ? (display.get(key) ?? t.name) : t.name;
    return name === t.name ? t : { ...t, name };
  });
}

function sumBy(map: Map<string, Bucket>, key: string, amount: number, extra?: string) {
  const b = map.get(key) ?? { key, total: 0, count: 0, extra };
  b.total += amount;
  b.count += 1;
  map.set(key, b);
}

export interface BuiltDigest {
  text: string;
  charCount: number;
  /** 0 = full ledger; higher = more aggressive compression was needed. */
  tier: number;
}

export function buildDigest(snap: FinancialSnapshot): BuiltDigest {
  const cur = snap.primaryCurrency;
  const { months } = snap.window;
  const monthSet = new Set(months);

  // Primary-currency, non-ignored rows drive every aggregate. Foreign-currency
  // rows are summarised separately so nothing is ever added across currencies.
  const inWindow = unifyMerchantNames(snap.txns.filter((t) => monthSet.has(t.month)));
  const primary = inWindow.filter((t) => t.isPrimary);
  const foreign = inWindow.filter((t) => !t.isPrimary);
  const cardPayments = inWindow.filter((t) => t.isCardPayment);
  const spendable = primary.filter((t) => !t.isCardPayment);

  /* monthly cashflow */
  const monthAgg = new Map<string, MonthAgg>(
    months.map((m) => [m, { month: m, income: 0, expenses: 0, savings: 0, count: 0 }]),
  );
  for (const t of spendable) {
    const m = monthAgg.get(t.month);
    if (!m) continue;
    m.count += 1;
    if (t.siInflow) m.income += t.amount;
    else if (t.siOutflow) m.expenses += Math.abs(t.amount);
    else if (t.flow === "savings" || t.isInvestment) m.savings += Math.abs(t.amount);
  }
  const monthly = months.map((m) => monthAgg.get(m)!);

  // Months with almost no activity distort averages (partial imports, gaps).
  // Same 20%-of-average filter the app's cashflow summary uses.
  let representative = monthly.filter((m) => m.count > 0);
  for (let i = 0; i < 12 && representative.length > 1; i++) {
    const avg =
      representative.reduce((s, m) => s + m.expenses, 0) / Math.max(representative.length, 1);
    const next = representative.filter((m) => m.expenses >= avg * 0.2);
    if (next.length === representative.length) break;
    representative = next;
  }
  const repCount = Math.max(representative.length, 1);
  const avgIncome = representative.reduce((s, m) => s + m.income, 0) / repCount;
  const avgExpenses = representative.reduce((s, m) => s + m.expenses, 0) / repCount;
  const avgSavings = representative.reduce((s, m) => s + m.savings, 0) / repCount;

  /* categories */
  const catTotals = new Map<string, Bucket>();
  const subTotals = new Map<string, Bucket>();
  const costTypeTotals = new Map<string, number>();
  const catByMonth = new Map<string, Map<string, number>>();
  let outflowTotal = 0;

  for (const t of spendable) {
    if (!t.siOutflow) continue;
    const amt = Math.abs(t.amount);
    outflowTotal += amt;
    sumBy(catTotals, t.category, amt);
    if (t.subcategory) sumBy(subTotals, `${t.category} > ${t.subcategory}`, amt, t.costType ?? "");
    costTypeTotals.set(
      t.costType ?? "unclassified",
      (costTypeTotals.get(t.costType ?? "unclassified") ?? 0) + amt,
    );
    const row = catByMonth.get(t.category) ?? new Map<string, number>();
    row.set(t.month, (row.get(t.month) ?? 0) + amt);
    catByMonth.set(t.category, row);
  }

  const categories = [...catTotals.values()].sort(
    byWeightThenName(
      (b) => b.total,
      (b) => b.key,
    ),
  );
  const subcategories = [...subTotals.values()].sort(
    byWeightThenName(
      (b) => b.total,
      (b) => b.key,
    ),
  );

  /* income sources */
  const incomeSources = new Map<string, Bucket>();
  for (const t of spendable) {
    if (t.siInflow) sumBy(incomeSources, t.name, t.amount);
  }
  const incomeList = [...incomeSources.values()].sort(
    byWeightThenName(
      (b) => b.total,
      (b) => b.key,
    ),
  );

  /* merchants */
  interface MerchantAgg extends Bucket {
    first: string;
    last: string;
    category: string;
  }
  const merchantAgg = new Map<string, MerchantAgg>();
  for (const t of spendable) {
    if (!t.siOutflow) continue;
    const amt = Math.abs(t.amount);
    const m = merchantAgg.get(t.name) ?? {
      key: t.name,
      total: 0,
      count: 0,
      first: t.date,
      last: t.date,
      category: t.category,
    };
    m.total += amt;
    m.count += 1;
    if (t.date < m.first) m.first = t.date;
    if (t.date > m.last) m.last = t.date;
    merchantAgg.set(t.name, m);
  }
  const merchantList = [...merchantAgg.values()].sort(
    byWeightThenName(
      (m) => m.total,
      (m) => m.key,
    ),
  );

  /* accounts, countries, currencies */
  const accountName = new Map(snap.accounts.map((a) => [a.id, a.label]));
  const byAccount = new Map<string, Bucket>();
  const byCountry = new Map<string, Bucket>();
  for (const t of spendable) {
    if (!t.siOutflow) continue;
    sumBy(byAccount, accountName.get(t.accountId) ?? "Unknown account", Math.abs(t.amount));
    if (t.country) sumBy(byCountry, t.country, Math.abs(t.amount));
  }
  const byForeignCurrency = new Map<string, Bucket>();
  for (const t of foreign) {
    if (t.amount < 0) sumBy(byForeignCurrency, t.currency, Math.abs(t.amount));
  }

  /* net worth */
  const totalAssets = snap.netWorth.assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = snap.netWorth.liabilities.reduce((s, l) => s + l.amount, 0);
  const liquidAssets = snap.netWorth.assets
    .filter((a) => a.category === "cash")
    .reduce((s, a) => s + a.amount, 0);

  /* derived advisor metrics */
  const essential = costTypeTotals.get("non-discretionary") ?? 0;
  const semiEssential = costTypeTotals.get("semi-discretionary") ?? 0;
  const discretionary = costTypeTotals.get("discretionary") ?? 0;
  const monthsSpan = Math.max(representative.length, 1);
  const essentialMonthly = essential / monthsSpan;

  // The recurring detector emits income patterns and patterns that stopped
  // years ago alongside live subscriptions. Only live OUTFLOWS are a
  // commitment; counting the rest produced figures larger than total spend.
  const liveCutoff = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 90);
    return d.toISOString().slice(0, 10);
  })();
  const recurringWithMonthly = snap.recurring.map((r) => ({
    ...r,
    monthly: (r.amount * 30) / Math.max(r.intervalDays, 1),
    live: r.last != null && r.last >= liveCutoff,
  }));
  const liveCommitments = recurringWithMonthly.filter((r) => r.monthly < 0 && r.live);
  const recurringMonthly = liveCommitments.reduce((s, r) => s + Math.abs(r.monthly), 0);

  // Movers: last complete month vs the average of the three before it.
  const completeMonths = monthly.filter((m) => m.count > 0).map((m) => m.month);
  const lastComplete = completeMonths.length >= 2 ? completeMonths[completeMonths.length - 2] : null;
  const baselineMonths = lastComplete
    ? completeMonths.slice(Math.max(0, completeMonths.indexOf(lastComplete) - 3), completeMonths.indexOf(lastComplete))
    : [];
  const movers: Array<{ category: string; latest: number; baseline: number; delta: number }> = [];
  if (lastComplete && baselineMonths.length > 0) {
    for (const [category, row] of catByMonth) {
      const latest = row.get(lastComplete) ?? 0;
      const baseline =
        baselineMonths.reduce((s, m) => s + (row.get(m) ?? 0), 0) / baselineMonths.length;
      const delta = latest - baseline;
      if (Math.abs(delta) >= 1) movers.push({ category, latest, baseline, delta });
    }
    movers.sort(
      byWeightThenName(
        (m) => Math.abs(m.delta),
        (m) => m.category,
      ),
    );
  }

  // Lifestyle trend: newest third of active months vs oldest third.
  const activeMonths = monthly.filter((m) => m.count > 0);
  const third = Math.max(1, Math.floor(activeMonths.length / 3));
  const earlyAvg =
    activeMonths.slice(0, third).reduce((s, m) => s + m.expenses, 0) / Math.max(third, 1);
  const lateAvg =
    activeMonths.slice(-third).reduce((s, m) => s + m.expenses, 0) / Math.max(third, 1);

  const top5MerchantShare = merchantList.slice(0, 5).reduce((s, m) => s + m.total, 0);

  const largest = spendable
    .filter((t) => t.siOutflow)
    .slice()
    .sort(
      byWeightThenName(
        (t) => Math.abs(t.amount),
        (t) => `${t.date}${t.name}`,
      ),
    )
    .slice(0, TOP_LARGEST);

  // Possible duplicates: identical merchant and amount on the SAME day. Wider
  // windows sweep up ordinary repeat visits (two cinema trips in a week at the
  // same ticket price) and the false positives drown the real signal.
  const DUPE_MIN_AMOUNT = 15;
  const DUPE_MAX_VISITS = 8;
  const dupes: Array<{ name: string; amount: number; dates: string[] }> = [];
  const dupeIndex = new Map<string, string[]>();
  for (const t of spendable) {
    if (!t.siOutflow || t.recurring) continue;
    const amount = Math.abs(t.amount);
    if (amount < DUPE_MIN_AMOUNT) continue;
    if ((merchantAgg.get(t.name)?.count ?? 0) > DUPE_MAX_VISITS) continue;
    const key = `${t.name}|${amount.toFixed(2)}`;
    const list = dupeIndex.get(key) ?? [];
    list.push(t.date);
    dupeIndex.set(key, list);
  }
  for (const [key, dates] of [...dupeIndex.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (dates.length < 2) continue;
    const sorted = dates.slice().sort();
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1]) {
        const sep = key.lastIndexOf("|");
        dupes.push({
          name: key.slice(0, sep),
          amount: Number.parseFloat(key.slice(sep + 1)),
          dates: [sorted[i - 1], sorted[i]],
        });
        break;
      }
    }
  }

  // Short-interval subscriptions the detector still calls active but that have
  // not been charged recently - either cancelled and never cleaned up, or a
  // renewal that quietly failed.
  const staleRecurring = recurringWithMonthly.filter(
    (r) => !r.live && r.monthly < 0 && r.intervalDays <= 45 && r.last != null,
  );

  // FX spread is recorded on transactions billed in the account's own currency
  // but originally priced in another - so these mostly live in `primary`, not
  // in the `foreign` (different base currency) bucket.
  const fxRows = inWindow.filter((t) => t.fxSpreadBps != null);
  const avgFxSpread =
    fxRows.length > 0
      ? fxRows.reduce((s, t) => s + (t.fxSpreadBps ?? 0), 0) / fxRows.length
      : null;

  /* budgets vs actual for the newest month in the window */
  const currentMonth = months[months.length - 1];
  const currentMonthByCategory = new Map<string, number>();
  for (const t of spendable) {
    if (t.siOutflow && t.month === currentMonth) {
      currentMonthByCategory.set(
        t.category,
        (currentMonthByCategory.get(t.category) ?? 0) + Math.abs(t.amount),
      );
    }
  }

  /* ── assemble the fixed (non-ledger) sections ── */

  const L: string[] = [];
  L.push("<financial_record>");
  L.push(
    `[window] ${snap.window.start} onward · ${months.length} months (${months[0]} to ${currentMonth}) · main currency ${cur}`,
  );
  L.push(
    `[coverage] ${inWindow.length} transactions in window · ${snap.history.total} in full history` +
      (snap.history.earliest ? ` from ${snap.history.earliest}` : "") +
      (snap.history.latest ? ` · latest ${snap.history.latest}` : "") +
      (snap.ignoredCount > 0
        ? ` · ${snap.ignoredCount} ignore rule(s) active, matching rows excluded everywhere`
        : "") +
      (snap.truncated ? " · window truncated to the most recent rows" : ""),
  );
  L.push(
    "[conventions] negative = money out, positive = money in. Totals below cover the main currency only and exclude card-balance payments (own-account transfers).",
  );

  L.push(
    `[profile] ${snap.profile?.name ?? "(name not set)"} · main currency ${snap.profile?.mainCurrency ?? cur} · travel detection ${snap.profile?.detectTravel ?? "Yes"}`,
  );

  L.push(`[accounts] ${snap.accounts.length}`);
  for (const a of snap.accounts) {
    const bank =
      a.institution && a.institution.toLowerCase() !== a.name.toLowerCase()
        ? ` (${a.institution})`
        : "";
    L.push(
      `- ${a.label}${bank} · ${a.type} · ${a.currency}${a.country ? ` · ${a.country}` : ""}${a.active ? "" : " · inactive"}`,
    );
  }

  L.push("[monthly] month | income | expenses | savings+invest | net | txns");
  for (const m of monthly) {
    L.push(
      `${m.month} | ${money(m.income)} | ${money(m.expenses)} | ${money(m.savings)} | ${money(m.income - m.expenses - m.savings)} | ${m.count}`,
    );
  }
  L.push(
    `[monthly_averages] over ${representative.length} representative month(s): income ${money(avgIncome)} | expenses ${money(avgExpenses)} | savings+invest ${money(avgSavings)} | gap ${money(avgIncome - avgExpenses - avgSavings)}`,
  );

  L.push(`[income_sources_12m] ${incomeList.length} · source | total | txns`);
  for (const s of incomeList.slice(0, 12)) {
    L.push(`${s.key} | ${money(s.total)} | ${s.count}`);
  }

  L.push(
    `[categories_12m] outflow total ${money(outflowTotal)} ${cur} · category | total | share | txns | avg/mo`,
  );
  for (const c of categories.slice(0, TOP_CATEGORIES)) {
    L.push(
      `${c.key} | ${money(c.total)} | ${pct(c.total, outflowTotal)} | ${c.count} | ${money(c.total / monthsSpan)}`,
    );
  }
  if (categories.length > TOP_CATEGORIES) {
    const rest = categories.slice(TOP_CATEGORIES);
    L.push(
      `other ${rest.length} categories | ${money(rest.reduce((s, c) => s + c.total, 0))} | ${pct(rest.reduce((s, c) => s + c.total, 0), outflowTotal)} | ${rest.reduce((s, c) => s + c.count, 0)} | -`,
    );
  }

  L.push(`[category_by_month] monthly outflow, oldest to newest: ${months.join(",")}`);
  for (const c of categories.slice(0, TOP_CATEGORIES)) {
    const row = catByMonth.get(c.key);
    L.push(`${c.key}: ${months.map((m) => money(row?.get(m) ?? 0)).join(",")}`);
  }

  L.push("[subcategories_12m] parent > subcategory | total | txns | cost type");
  for (const s of subcategories.slice(0, TOP_SUBCATEGORIES)) {
    L.push(`${s.key} | ${money(s.total)} | ${s.count} | ${s.extra || "unclassified"}`);
  }

  L.push("[cost_structure_12m] type | total | share of outflow | avg/mo");
  for (const type of ["non-discretionary", "semi-discretionary", "discretionary", "unclassified"]) {
    const total = costTypeTotals.get(type) ?? 0;
    if (total <= 0) continue;
    L.push(`${type} | ${money(total)} | ${pct(total, outflowTotal)} | ${money(total / monthsSpan)}`);
  }

  L.push(`[merchants_12m] merchant | total | txns | avg | first | last | category`);
  for (const m of merchantList.slice(0, TOP_MERCHANTS)) {
    L.push(
      `${m.key} | ${money(m.total)} | ${m.count} | ${money(m.total / m.count)} | ${m.first} | ${m.last} | ${m.category}`,
    );
  }

  if (byAccount.size > 1) {
    L.push("[outflow_by_account] account | total | txns");
    for (const a of [...byAccount.values()].sort(
      byWeightThenName(
        (b) => b.total,
        (b) => b.key,
      ),
    )) {
      L.push(`${a.key} | ${money(a.total)} | ${a.count}`);
    }
  }

  if (byCountry.size > 0) {
    L.push("[outflow_by_country] country | total | txns");
    for (const c of [...byCountry.values()]
      .sort(
        byWeightThenName(
          (b) => b.total,
          (b) => b.key,
        ),
      )
      .slice(0, 12)) {
      L.push(`${c.key} | ${money(c.total)} | ${c.count}`);
    }
  }

  if (foreign.length > 0) {
    L.push(
      `[other_currencies] ${foreign.length} transaction(s) not in ${cur}. Never add these to the totals above.`,
    );
    for (const f of [...byForeignCurrency.values()].sort(
      byWeightThenName(
        (b) => b.total,
        (b) => b.key,
      ),
    )) {
      L.push(`${f.key} | outflow ${money(f.total)} ${f.key} | ${f.count} txns`);
    }
  }
  if (avgFxSpread != null) {
    L.push(
      `[fx_spread] purchases priced in another currency: avg ${num(avgFxSpread, 1)} bps over ${fxRows.length} txns (100 bps = 1% above the market mid rate)`,
    );
  }

  // Split by status. Presenting stopped patterns next to a monthly-equivalent
  // figure invited the model to total them up as "savings available", which is
  // wrong: a charge that stopped is already saving that money. Only live
  // outflows are cancellable, so only they get a monthly-equivalent.
  const byMonthlySize = byWeightThenName<(typeof recurringWithMonthly)[number]>(
    (r) => Math.abs(r.monthly),
    (r) => r.merchant,
  );
  const liveRanked = liveCommitments.slice().sort(byMonthlySize);
  const stoppedRanked = recurringWithMonthly
    .filter((r) => r.monthly < 0 && !r.live)
    .sort(byMonthlySize);

  L.push(
    `[recurring_live] ${liveRanked.length} ongoing commitments worth ${money(recurringMonthly)} ${cur}/month. These are the only recurring charges that can be cancelled for a saving. merchant | every | amount | monthly-equiv | next due | last seen | times | category`,
  );
  for (const r of liveRanked.slice(0, TOP_RECURRING)) {
    L.push(
      `${r.merchant} | ${r.interval} | ${money(Math.abs(r.amount))} ${r.currency} | ${money(Math.abs(r.monthly))} | ${r.next ?? "-"} | ${r.last ?? "-"} | ${r.occurrences}x${r.category ? ` | ${r.category}` : ""}`,
    );
  }
  if (liveRanked.length > TOP_RECURRING) {
    const tail = liveRanked.slice(TOP_RECURRING);
    L.push(
      `plus ${tail.length} smaller live commitments totalling ${money(tail.reduce((s2, r) => s2 + Math.abs(r.monthly), 0))} ${cur}/month`,
    );
  }

  if (stoppedRanked.length > 0) {
    L.push(
      `[recurring_stopped] ${stoppedRanked.length} patterns that have NOT been charged since ${liveCutoff}. The money is already not going out, so cancelling them saves nothing and you must not present them as savings. They are listed only so you can spot a subscription the user may believe is still running, or a bill that unexpectedly stopped arriving. merchant | typical amount | last charged`,
    );
    for (const r of stoppedRanked.slice(0, 20)) {
      L.push(`${r.merchant} | ${money(Math.abs(r.amount))} ${r.currency} | ${r.last ?? "unknown"}`);
    }
    if (stoppedRanked.length > 20) {
      L.push(`plus ${stoppedRanked.length - 20} more stopped patterns`);
    }
  }

  const recurringIncome = recurringWithMonthly.filter((r) => r.monthly > 0 && r.live);
  if (recurringIncome.length > 0) {
    L.push(
      `[recurring_income] regular money coming IN, detected from repeat deposits. Never treat these as costs. ` +
        recurringIncome
          .slice()
          .sort(byMonthlySize)
          .slice(0, 10)
          .map((r) => `${r.merchant} ${money(r.amount)} ${r.currency} ${r.interval} (last ${r.last ?? "-"})`)
          .join("; "),
    );
  }

  if (staleRecurring.length > 0) {
    L.push(
      `[recurring_check] short-interval subscriptions among the stopped list - the most likely to be a cancelled service the user forgot, or a renewal that silently failed: ${staleRecurring
        .slice(0, 12)
        .map((r) => `${r.merchant} (${money(Math.abs(r.amount))} ${r.currency}, last ${r.last})`)
        .join("; ")}`,
    );
  }

  L.push(
    `[budgets] ${snap.budgets.length}${snap.budgets.length ? ` · name | category | limit | period | ${currentMonth} actual` : " (none set)"}`,
  );
  for (const b of snap.budgets) {
    const actual = b.category ? (currentMonthByCategory.get(b.category) ?? 0) : null;
    L.push(
      `${b.name} | ${b.category ?? "all"} | ${money(b.amount)} ${b.currency} | ${b.period} | ${actual == null ? "-" : `${money(actual)} (${pct(actual, b.amount)} of limit)`}`,
    );
  }

  L.push(`[goals] ${snap.goals.length || "none"}`);
  for (const g of snap.goals) {
    L.push(
      `${g.name} | target ${money(g.target)} ${g.currency} | saved ${money(g.current)} (${pct(g.current, g.target)})${g.targetDate ? ` | by ${g.targetDate}` : ""}${g.completed ? " | completed" : ""}`,
    );
  }

  L.push(
    `[net_worth] currency ${snap.netWorth.currency} · assets ${money(totalAssets)} · liabilities ${money(totalLiabilities)} · net ${money(totalAssets - totalLiabilities)}`,
  );
  for (const a of snap.netWorth.assets) {
    L.push(
      `asset: ${a.label} | ${a.category} | ${money(a.amount)}${a.rate != null ? ` | growth ${num(a.rate * 100, 2)}%` : ""}`,
    );
  }
  for (const l of snap.netWorth.liabilities) {
    L.push(
      `liability: ${l.label} | ${l.category} | ${money(l.amount)}${l.rate != null ? ` | rate ${num(l.rate * 100, 2)}%` : ""}`,
    );
  }
  const s = snap.netWorth.settings;
  if (s) {
    L.push(
      `[projection_settings] age ${s.currentAge} · retire at ${s.retirementAge} · monthly contribution ${money(s.monthlyContribution)} · default growth ${num(s.defaultGrowthRate * 100, 2)}% · inflation ${num(s.inflationRate * 100, 2)}% · annual drawdown ${money(s.annualDrawdown)} · post-retirement income ${money(s.postRetirementIncome)}${s.annualIncome != null ? ` · stated annual take-home ${money(s.annualIncome)}` : ""}`,
    );
  }

  L.push("[derived]");
  L.push(
    `savings rate (income minus expenses, before savings/investment transfers): ${avgIncome > 0 ? pct(avgIncome - avgExpenses, avgIncome) : "n/a - no income recorded"} · after those transfers the average month ${avgIncome - avgExpenses - avgSavings >= 0 ? "ends up" : "falls short by"} ${money(Math.abs(avgIncome - avgExpenses - avgSavings))} ${cur}`,
  );
  L.push(
    `essential (non-discretionary) spend: ${money(essentialMonthly)}/mo · semi-discretionary ${money(semiEssential / monthsSpan)}/mo · discretionary ${money(discretionary / monthsSpan)}/mo`,
  );
  L.push(
    `live recurring commitments: ${money(recurringMonthly)}/mo, ${avgExpenses > 0 ? pct(recurringMonthly, avgExpenses) : "0%"} of average monthly expenses`,
  );
  const balanceSheetComparable = snap.netWorth.currency === cur;
  if (totalAssets === 0 && totalLiabilities === 0) {
    L.push(
      "emergency runway and debt ratios: not computable - the user has no assets or liabilities recorded in Net Worth Atlas (/dashboard/net-worth). Cash balances are not derivable from the transaction ledger alone.",
    );
  } else if (!balanceSheetComparable) {
    L.push(
      `emergency runway and debt-to-income ratios: not computed. The balance sheet is kept in ${snap.netWorth.currency} while spending is in ${cur}, and no conversion rate is available here. Say so rather than comparing the two, or ask the user for the rate they want used.`,
    );
  } else {
    L.push(
      `emergency runway on cash assets: ${liquidAssets > 0 && essentialMonthly > 0 ? `${num(liquidAssets / essentialMonthly, 1)} months of essential spend` : "n/a - no cash assets recorded"}${liquidAssets > 0 && avgExpenses > 0 ? ` · on total expenses: ${num(liquidAssets / avgExpenses, 1)} months` : ""} (cash assets ${money(liquidAssets)})`,
    );
    L.push(
      `debt load: liabilities ${money(totalLiabilities)} are ${totalAssets > 0 ? pct(totalLiabilities, totalAssets) : "n/a"} of assets${avgIncome > 0 ? ` · ${num(totalLiabilities / (avgIncome * 12), 2)}x annual recorded income` : ""}`,
    );
  }
  L.push(
    `spend concentration: top 5 merchants are ${pct(top5MerchantShare, outflowTotal)} of all outflow`,
  );
  L.push(
    `expense trend: earliest ${third} active month(s) averaged ${money(earlyAvg)}, most recent ${third} averaged ${money(lateAvg)} (${earlyAvg > 0 ? `${lateAvg >= earlyAvg ? "+" : ""}${num(((lateAvg - earlyAvg) / earlyAvg) * 100, 1)}%` : "n/a"})`,
  );
  if (movers.length > 0 && lastComplete) {
    L.push(
      `biggest movers in ${lastComplete} vs prior ${baselineMonths.length}-month average: ` +
        movers
          .slice(0, TOP_MOVERS)
          .map(
            (m) =>
              `${m.category} ${m.delta >= 0 ? "+" : ""}${money(m.delta)} (${money(m.latest)} vs ${money(m.baseline)})`,
          )
          .join("; "),
    );
  }
  if (dupes.length > 0) {
    L.push(
      "possible duplicate charges (identical merchant and amount, same day - worth the user checking, but some will be legitimate): " +
        dupes
          .slice(0, 10)
          .map((d) => `${d.name} ${money(d.amount)} x2 on ${d.dates[0]}`)
          .join("; "),
    );
  }

  L.push("[largest_outflows_12m] date | merchant | amount | category");
  for (const t of largest) {
    L.push(`${t.date} | ${t.name} | ${money(Math.abs(t.amount))} | ${t.category}`);
  }

  if (cardPayments.length > 0) {
    const cpTotal = cardPayments.reduce((s2, t) => s2 + Math.abs(t.amount), 0);
    L.push(
      `[card_payments] ${cardPayments.length} own-account card-balance payments totalling ${money(cpTotal)} ${cur}. Deliberately excluded from every total above; they move money between the user's own accounts and are not spending.`,
    );
  }

  const fixedText = L.join("\n");
  // The summaries are useful but the ledger is the irreplaceable part, so it
  // keeps a guaranteed floor even when a user has a very wide balance sheet.
  const ledgerBudget = Math.max(
    Math.round(DIGEST_CHAR_BUDGET * LEDGER_MIN_SHARE),
    DIGEST_CHAR_BUDGET - fixedText.length - 200,
  );

  let tier = 0;
  let ledger = renderLedger(inWindow, months, tier);
  while (ledger.length > ledgerBudget && tier < 4) {
    tier += 1;
    ledger = renderLedger(inWindow, months, tier);
  }
  if (ledger.length > ledgerBudget) {
    ledger = `${ledger.slice(0, ledgerBudget)}\n(ledger truncated)`;
  }

  const text = `${fixedText}\n${ledger}\n</financial_record>`;
  return { text, charCount: text.length, tier };
}

/* ── ledger rendering with compression tiers ────────────────────────────── */

const LEDGER_HEADERS = [
  "[ledger] every transaction in the window, grouped by month then merchant. Lines read: merchant|category: DD amount; DD amount. Amounts are in the account's currency (code shown when it is not the main currency). ! marks a transaction the user flagged.",
  "[ledger] every transaction in the window, grouped by month then merchant. Lines read: merchant|category: DD amount; DD amount. Notes and labels omitted to save space.",
  "[ledger] recent months are transaction-level; older months are collapsed to merchant totals (total ×count).",
  "[ledger] collapsed to merchant totals per month (total ×count) to fit the size budget.",
  "[ledger] collapsed to the largest merchant totals per month; smaller merchants are pooled into an 'other' line.",
];

/** Months kept at transaction level in tier 2. */
const TIER2_DETAILED_MONTHS = 6;
/** Merchant groups kept per month in tier 4. */
const TIER4_TOP_GROUPS = 35;

interface Group {
  key: string;
  label: string;
  txns: Txn[];
  total: number;
}

function groupMonth(txns: Txn[]): Group[] {
  const groups = new Map<string, Group>();
  for (const t of txns) {
    const key = `${t.name}|${t.category}`;
    const g = groups.get(key) ?? { key, label: key, txns: [], total: 0 };
    g.txns.push(t);
    g.total += t.amount;
    groups.set(key, g);
  }
  // Largest absolute movement first, then alphabetical: stable across rebuilds.
  return [...groups.values()].sort(
    byWeightThenName(
      (g) => Math.abs(g.total),
      (g) => g.key,
    ),
  );
}

function renderTxn(t: Txn, withNotes: boolean): string {
  const day = t.date.slice(8, 10);
  const amount = num(t.amount, 2);
  const currency = t.isPrimary ? "" : ` ${t.currency}`;
  // Originally priced abroad: show what was actually charged in the shop.
  const foreign = t.foreign ? ` (${t.foreign})` : "";
  const flag = t.warning ? " !" : "";
  const extra = withNotes
    ? [t.label ? `#${t.label}` : "", t.note ? `"${t.note}"` : ""].filter(Boolean).join(" ")
    : "";
  return `${day} ${amount}${currency}${foreign}${flag}${extra ? ` ${extra}` : ""}`;
}

function renderLedger(txns: Txn[], months: string[], tier: number): string {
  const out: string[] = [LEDGER_HEADERS[Math.min(tier, LEDGER_HEADERS.length - 1)]];
  const byMonth = new Map<string, Txn[]>(months.map((m) => [m, []]));
  for (const t of txns) byMonth.get(t.month)?.push(t);

  const detailedFrom =
    tier === 2 ? months.length - TIER2_DETAILED_MONTHS : tier >= 3 ? months.length : 0;

  months.forEach((month, index) => {
    const rows = byMonth.get(month) ?? [];
    if (rows.length === 0) return;
    out.push(month);
    const groups = groupMonth(rows);
    const detailed = index >= detailedFrom;
    const withNotes = tier === 0;

    const visible = tier >= 4 ? groups.slice(0, TIER4_TOP_GROUPS) : groups;

    for (const g of visible) {
      if (detailed) {
        out.push(`${g.label}: ${g.txns.map((t) => renderTxn(t, withNotes)).join("; ")}`);
      } else {
        out.push(`${g.label}: ${num(g.total, 2)} ×${g.txns.length}`);
      }
    }

    if (tier >= 4 && groups.length > TIER4_TOP_GROUPS) {
      const rest = groups.slice(TIER4_TOP_GROUPS);
      const restTotal = rest.reduce((s, g) => s + g.total, 0);
      const restCount = rest.reduce((s, g) => s + g.txns.length, 0);
      out.push(`other ${rest.length} merchants: ${num(restTotal, 2)} ×${restCount}`);
    }
  });

  return out.join("\n");
}
