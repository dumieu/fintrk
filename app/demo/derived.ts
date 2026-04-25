/**
 * Pure computations over the in-memory DemoSnapshot.
 *
 * Every component reads through these functions so when the store mutates
 * (an "edit" the user makes in the demo), the derived KPIs / charts /
 * groupings recompute automatically without any backend call.
 */

import type {
  DemoCategory,
  DemoSnapshot,
  DemoTransaction,
} from "./demo-store";

export function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

export function ymdToDate(s: string): Date {
  // posted_date arrives either as 'YYYY-MM-DD' or as a full ISO timestamp.
  // Always read it as the calendar day in UTC.
  const ymd = s.length >= 10 ? s.slice(0, 10) : s;
  return new Date(ymd + "T00:00:00Z");
}

// ─── KPI builder ─────────────────────────────────────────────────────────────
export interface DemoKpis {
  netWorth: number;
  monthIncome: number;
  prevMonthIncome: number;
  monthExpenses: number;
  prevMonthExpenses: number;
  monthNet: number;
  monthSavingsRate: number;
  recurringMonthly: number;
  recurringCount: number;
  ytdIncome: number;
  ytdExpenses: number;
  ytdNet: number;
  txnCount: number;
}

export function computeKpis(snap: DemoSnapshot): DemoKpis {
  // We treat the most recent transaction date as "today" for stable KPIs.
  const lastDate = snap.transactions.length
    ? ymdToDate(snap.transactions[0]!.posted_date)
    : new Date();

  const yr = lastDate.getUTCFullYear();
  const mo = lastDate.getUTCMonth();
  const prevMo = mo === 0 ? 11 : mo - 1;
  const prevYr = mo === 0 ? yr - 1 : yr;

  let monthIncome = 0;
  let monthExpenses = 0;
  let prevMonthIncome = 0;
  let prevMonthExpenses = 0;
  let ytdIncome = 0;
  let ytdExpenses = 0;

  for (const t of snap.transactions) {
    const d = ymdToDate(t.posted_date);
    const a = num(t.base_amount);
    // Strict: income iff flow_type=inflow; expenses iff flow_type=outflow.
    // This excludes savings (529 / brokerage transfers) and misc (card payments).
    const isInflow = t.flow_type === "inflow";
    const isOutflow = t.flow_type === "outflow";
    const inMonth = d.getUTCFullYear() === yr && d.getUTCMonth() === mo;
    const inPrev = d.getUTCFullYear() === prevYr && d.getUTCMonth() === prevMo;
    const inYear = d.getUTCFullYear() === yr;
    if (inMonth) {
      if (isInflow) monthIncome += Math.abs(a);
      if (isOutflow) monthExpenses += Math.abs(a);
    }
    if (inPrev) {
      if (isInflow) prevMonthIncome += Math.abs(a);
      if (isOutflow) prevMonthExpenses += Math.abs(a);
    }
    if (inYear) {
      if (isInflow) ytdIncome += Math.abs(a);
      if (isOutflow) ytdExpenses += Math.abs(a);
    }
  }

  // Net worth = sum of all account balances (using same compute as accountBalances).
  let netWorth = 0;
  for (const ab of accountBalances(snap)) {
    if (ab.type === "credit") netWorth -= Math.abs(ab.balance); // outstanding debt
    else netWorth += ab.balance;
  }

  // Recurring KPI = active outflow subscriptions / bills only (not income).
  let recurringMonthly = 0;
  let recurringCount = 0;
  for (const r of snap.recurring) {
    if (!r.is_active) continue;
    const signed = num(r.expected_amount);
    if (signed >= 0) continue; // skip income/positive
    const amt = Math.abs(signed);
    const factor = r.interval_days <= 7 ? 4.34 : r.interval_days <= 14 ? 2.17 : r.interval_days <= 32 ? 1 : 1 / Math.max(1, r.interval_days / 30);
    recurringMonthly += amt * factor;
    recurringCount++;
  }

  return {
    netWorth,
    monthIncome,
    prevMonthIncome,
    monthExpenses,
    prevMonthExpenses,
    monthNet: monthIncome - monthExpenses,
    monthSavingsRate: monthIncome > 0 ? (monthIncome - monthExpenses) / monthIncome : 0,
    recurringMonthly,
    recurringCount,
    ytdIncome,
    ytdExpenses,
    ytdNet: ytdIncome - ytdExpenses,
    txnCount: snap.transactions.length,
  };
}

// ─── Monthly cash flow series for chart ──────────────────────────────────────
export interface MonthSeries {
  month: string;          // 'YYYY-MM'
  label: string;          // e.g. "May '25"
  income: number;
  expenses: number;
  net: number;
}

export function monthlySeries(snap: DemoSnapshot, months = 18): MonthSeries[] {
  const buckets = new Map<string, MonthSeries>();
  for (const t of snap.transactions) {
    const key = t.posted_date.slice(0, 7);
    const cur = buckets.get(key) ?? {
      month: key,
      label: shortMonthLabel(key),
      income: 0,
      expenses: 0,
      net: 0,
    };
    const a = num(t.base_amount);
    if (t.flow_type === "inflow") cur.income += Math.abs(a);
    else if (t.flow_type === "outflow") cur.expenses += Math.abs(a);
    else continue; // ignore savings/misc transfers in the chart
    cur.net = cur.income - cur.expenses;
    buckets.set(key, cur);
  }
  const sorted = Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
  return sorted.slice(-months);
}

function shortMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return dt.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

// ─── Category aggregation ────────────────────────────────────────────────────
export interface CategoryBucket {
  categoryId: number;
  name: string;
  color: string;
  total: number;
  count: number;
  flowType: string;
}

export function topCategories(snap: DemoSnapshot, monthsBack = 1): CategoryBucket[] {
  const lastDate = snap.transactions.length ? ymdToDate(snap.transactions[0]!.posted_date) : new Date();
  const cutoff = new Date(lastDate);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - monthsBack);

  const cats = new Map<number, CategoryBucket>();
  // Roll up to PARENT category for chart legibility.
  const catById = new Map(snap.categories.map((c) => [c.id, c]));

  for (const t of snap.transactions) {
    if (!t.category_id) continue;
    const d = ymdToDate(t.posted_date);
    if (d < cutoff) continue;
    const a = num(t.base_amount);
    if (a >= 0) continue; // expenses only
    const cat = catById.get(t.category_id);
    if (!cat) continue;
    const parent = cat.parent_id ? catById.get(cat.parent_id) ?? cat : cat;
    const existing = cats.get(parent.id) ?? {
      categoryId: parent.id,
      name: parent.name,
      color: parent.color ?? "#888",
      total: 0,
      count: 0,
      flowType: parent.flow_type,
    };
    existing.total += Math.abs(a);
    existing.count += 1;
    cats.set(parent.id, existing);
  }
  return Array.from(cats.values()).sort((a, b) => b.total - a.total);
}

// ─── Account balances ────────────────────────────────────────────────────────
export interface AccountBalance {
  accountId: string;
  name: string;
  institution: string | null;
  type: string;
  cardNetwork: string | null;
  mask: string | null;
  currency: string;
  balance: number;
  txnCount: number;
  inflow30d: number;
  outflow30d: number;
}

// Realistic, fixed display balances for the demo.  Source of truth for the
// "Accounts" section so users see numbers a real upper-middle-class household
// would actually carry, not the cumulative sum of every demo transaction.
const FIXED_BALANCE_BY_ACCOUNT_NAME: Record<string, number> = {
  "Sterling Joint Checking": 18_412,
  "Emergency Fund Plus":     32_500,
  "Vanguard Brokerage":     184_300,
  "Ava — 529 College":       42_000,
  "Noah — 529 College":      24_500,
};

export function accountBalances(snap: DemoSnapshot): AccountBalance[] {
  const lastDate = snap.transactions.length ? ymdToDate(snap.transactions[0]!.posted_date) : new Date();
  const cutoff = new Date(lastDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);

  const map = new Map<string, AccountBalance>();
  for (const a of snap.accounts) {
    map.set(a.id, {
      accountId: a.id,
      name: a.account_name,
      institution: a.institution_name,
      type: a.account_type,
      cardNetwork: a.card_network,
      mask: a.masked_number,
      currency: a.primary_currency,
      // Use a fixed anchor when defined; otherwise start from 0 and accumulate
      // (true for credit cards, which we sum over the current cycle below).
      balance: FIXED_BALANCE_BY_ACCOUNT_NAME[a.account_name] ?? 0,
      txnCount: 0,
      inflow30d: 0,
      outflow30d: 0,
    });
  }

  // Walk transactions only to compute 30-day in/out for every account, AND to
  // compute the running statement balance for credit cards.
  for (const t of snap.transactions) {
    const ab = map.get(t.account_id);
    if (!ab) continue;
    const a = num(t.base_amount);
    const d = ymdToDate(t.posted_date);
    ab.txnCount++;

    if (d >= cutoff) {
      if (a > 0) ab.inflow30d += a;
      else ab.outflow30d += Math.abs(a);
    }

    // Credit cards: balance = current cycle charges (signed, so it's negative).
    // Everything else uses the fixed anchor we set above.
    if (ab.type === "credit" && d >= cutoff) {
      ab.balance += a;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.balance - a.balance);
}

// ─── Search / filter helpers for the txn table ───────────────────────────────
export function filterTransactions(
  snap: DemoSnapshot,
  opts: { q?: string; categoryId?: number | null; accountId?: string | null; flow?: "all" | "in" | "out" },
): DemoTransaction[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  return snap.transactions.filter((t) => {
    if (opts.categoryId != null && t.category_id !== opts.categoryId) return false;
    if (opts.accountId && t.account_id !== opts.accountId) return false;
    const a = num(t.base_amount);
    if (opts.flow === "in" && !(t.flow_type === "inflow" || a > 0)) return false;
    if (opts.flow === "out" && !(t.flow_type === "outflow" || (a < 0 && t.flow_type !== "inflow"))) return false;
    if (q) {
      const hay = `${t.merchant_name ?? ""} ${t.raw_description} ${t.category_name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ─── Convenience: flat list of subcategories for picker ──────────────────────
export interface PickerCategory {
  id: number;
  name: string;
  parentName: string;
  color: string;
}

export function categoryPicker(snap: DemoSnapshot): PickerCategory[] {
  const byId = new Map(snap.categories.map((c) => [c.id, c]));
  return snap.categories
    .filter((c) => c.parent_id != null)
    .map<PickerCategory>((c) => {
      const parent = byId.get(c.parent_id!);
      return {
        id: c.id,
        name: c.name,
        parentName: parent?.name ?? "Other",
        color: c.color ?? parent?.color ?? "#888",
      };
    })
    .sort((a, b) => a.parentName.localeCompare(b.parentName) || a.name.localeCompare(b.name));
}

// ─── For donut: ratio split ──────────────────────────────────────────────────
export function donutSegments(buckets: CategoryBucket[], maxSegments = 7): { name: string; value: number; color: string }[] {
  if (buckets.length === 0) return [];
  const top = buckets.slice(0, maxSegments);
  const restTotal = buckets.slice(maxSegments).reduce((s, b) => s + b.total, 0);
  const segments = top.map((b) => ({ name: b.name, value: b.total, color: b.color }));
  if (restTotal > 0) segments.push({ name: "Other", value: restTotal, color: "#7F8C9F" });
  return segments;
}

// ─── Mapping helper: category id → DemoCategory record ───────────────────────
export function categoryById(snap: DemoSnapshot): Map<number, DemoCategory> {
  return new Map(snap.categories.map((c) => [c.id, c]));
}

// ─── Account name lookup ─────────────────────────────────────────────────────
export function accountById(snap: DemoSnapshot): Map<string, DemoSnapshot["accounts"][0]> {
  return new Map(snap.accounts.map((a) => [a.id, a]));
}
