import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, userCategories, users } from "@/lib/db/schema";
import { excludeCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { alias } from "drizzle-orm/pg-core";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type Flow = "inflow" | "outflow" | "savings";

interface LeafBucket {
  name: string;
  value: number;
  count: number;
}

interface SubBucket {
  name: string;
  value: number;
  count: number;
  /** label → leaf */
  leaves: Map<string, LeafBucket>;
}

interface CategoryBucket {
  name: string;
  color: string | null;
  value: number;
  count: number;
  subs: Map<string, SubBucket>;
}

interface FlowBucket {
  flow: Flow;
  value: number;
  count: number;
  cats: Map<string, CategoryBucket>;
}

const UNCATEGORIZED = "Uncategorized";
const UNLABELED = "Unlabeled";
const NO_SUB = "Direct";

function emptyFlowBuckets(): Record<Flow, FlowBucket> {
  return {
    inflow: { flow: "inflow", value: 0, count: 0, cats: new Map() },
    outflow: { flow: "outflow", value: 0, count: 0, cats: new Map() },
    savings: { flow: "savings", value: 0, count: 0, cats: new Map() },
  };
}

function serializeFlow(b: FlowBucket) {
  const cats = Array.from(b.cats.values()).map((c) => ({
    name: c.name,
    color: c.color,
    value: Math.round(c.value * 100) / 100,
    count: c.count,
    subs: Array.from(c.subs.values()).map((s) => ({
      name: s.name,
      value: Math.round(s.value * 100) / 100,
      count: s.count,
      leaves: Array.from(s.leaves.values())
        .map((l) => ({
          name: l.name,
          value: Math.round(l.value * 100) / 100,
          count: l.count,
        }))
        .sort((x, y) => y.value - x.value),
    })).sort((x, y) => y.value - x.value),
  })).sort((x, y) => y.value - x.value);

  return {
    flow: b.flow,
    value: Math.round(b.value * 100) / 100,
    count: b.count,
    categories: cats,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const dateFrom = request.nextUrl.searchParams.get("dateFrom") || undefined;
    const dateTo = request.nextUrl.searchParams.get("dateTo") || undefined;
    const currencyOverride = request.nextUrl.searchParams.get("currency")?.toUpperCase() || undefined;
    const includeInvestmentInflows =
      request.nextUrl.searchParams.get("includeInvestmentInflows") === "true";
    const includeInvestmentOutflows =
      request.nextUrl.searchParams.get("includeInvestmentOutflows") === "true";

    const [userRow] = await resilientQuery(() =>
      db.select({ mainCurrency: users.mainCurrency })
        .from(users)
        .where(eq(users.clerkUserId, userId))
        .limit(1),
    );

    const parent = alias(userCategories, "uc_parent");
    const leaf = alias(userCategories, "uc_leaf");
    const investmentCategoryFilter = sql`
      (
        lower(coalesce(${leaf.name}, '')) = 'investment'
        OR lower(coalesce(${leaf.name}, '')) = 'investments'
        OR lower(coalesce(${leaf.slug}, '')) = 'investment'
        OR lower(coalesce(${leaf.slug}, '')) = 'investments'
        OR lower(coalesce(${leaf.slug}, '')) LIKE 'investment-%'
        OR lower(coalesce(${leaf.slug}, '')) LIKE '%-investment'
        OR lower(coalesce(${parent.name}, '')) = 'investment'
        OR lower(coalesce(${parent.name}, '')) = 'investments'
        OR lower(coalesce(${parent.slug}, '')) = 'investment'
        OR lower(coalesce(${parent.slug}, '')) = 'investments'
        OR lower(coalesce(${parent.slug}, '')) LIKE 'investment-%'
        OR lower(coalesce(${parent.slug}, '')) LIKE '%-investment'
      )
    `;
    const shouldExcludeInvestmentInflows = !includeInvestmentInflows;
    const shouldExcludeInvestmentOutflows = !includeInvestmentOutflows;
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

    const currencyTotals = await resilientQuery(() =>
      db
        .select({
          currency: transactions.baseCurrency,
          n: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .leftJoin(leaf, eq(transactions.categoryId, leaf.id))
        .leftJoin(parent, eq(leaf.parentId, parent.id))
        .where(
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(),
            ...(dateFrom ? [gte(transactions.postedDate, dateFrom)] : []),
            ...(dateTo ? [lte(transactions.postedDate, dateTo)] : []),
            ...(investmentExclusionFilter ? [investmentExclusionFilter] : []),
          ),
        )
        .groupBy(transactions.baseCurrency)
        .orderBy(sql`COUNT(*) DESC`),
    );

    const availableCurrencies = currencyTotals.map((c) => c.currency);
    const primaryCurrency =
      currencyOverride && availableCurrencies.includes(currencyOverride)
        ? currencyOverride
        : userRow?.mainCurrency && availableCurrencies.includes(userRow.mainCurrency)
          ? userRow.mainCurrency
          : availableCurrencies[0] ?? "USD";

    const rows = await resilientQuery(() =>
      db
        .select({
          baseAmount: transactions.baseAmount,
          label: transactions.label,
          merchantName: transactions.merchantName,
          leafName: leaf.name,
          leafFlow: leaf.flowType,
          leafColor: leaf.color,
          parentName: parent.name,
          parentColor: parent.color,
          parentFlow: parent.flowType,
        })
        .from(transactions)
        .leftJoin(leaf, eq(transactions.categoryId, leaf.id))
        .leftJoin(parent, eq(leaf.parentId, parent.id))
        .where(
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(),
            eq(transactions.baseCurrency, primaryCurrency),
            ...(dateFrom ? [gte(transactions.postedDate, dateFrom)] : []),
            ...(dateTo ? [lte(transactions.postedDate, dateTo)] : []),
            ...(investmentExclusionFilter ? [investmentExclusionFilter] : []),
          ),
        ),
    );

    const buckets = emptyFlowBuckets();

    for (const r of rows) {
      const amt = parseFloat(r.baseAmount);
      if (!isFinite(amt) || amt === 0) continue;

      // Determine flow type and category/subcategory
      let flow: Flow;
      let topName: string;
      let topColor: string | null;
      let subName: string;

      if (r.leafFlow && r.leafFlow !== "misc") {
        flow = r.leafFlow as Flow;
        if (r.parentName) {
          topName = r.parentName;
          topColor = r.parentColor;
          subName = r.leafName ?? NO_SUB;
        } else {
          // Leaf is itself top-level
          topName = r.leafName ?? UNCATEGORIZED;
          topColor = r.leafColor;
          subName = NO_SUB;
        }
      } else {
        // Uncategorized — fall back to amount sign for inflow vs outflow
        flow = amt > 0 ? "inflow" : "outflow";
        topName = UNCATEGORIZED;
        topColor = null;
        subName = NO_SUB;
      }

      if (flow === "inflow" && amt <= 0) continue;

      const value = Math.abs(amt);
      const labelRaw = r.label?.trim() || "";

      const fb = buckets[flow];
      fb.value += value;
      fb.count += 1;

      let cb = fb.cats.get(topName);
      if (!cb) {
        cb = { name: topName, color: topColor, value: 0, count: 0, subs: new Map() };
        fb.cats.set(topName, cb);
      }
      cb.value += value;
      cb.count += 1;

      let sb = cb.subs.get(subName);
      if (!sb) {
        sb = { name: subName, value: 0, count: 0, leaves: new Map() };
        cb.subs.set(subName, sb);
      }
      sb.value += value;
      sb.count += 1;

      const leafName = labelRaw || (flow === "inflow" ? "" : UNLABELED);
      if (leafName) {
        let lb = sb.leaves.get(leafName);
        if (!lb) {
          lb = { name: leafName, value: 0, count: 0 };
          sb.leaves.set(leafName, lb);
        }
        lb.value += value;
        lb.count += 1;
      }
    }

    /* ───────── ALL-TIME MONTHLY STATS (ignore date filter) ─────────
       Returns a `Record<statsKey, { months, total, count }>` for every
       meaningful node in the sankey so the hover tooltip can show
       avg/month, avg/year, and a sparkline that's stable regardless of
       the currently-selected time range. */
    const allTimeRows = await resilientQuery(() =>
      db
        .select({
          ym: sql<string>`TO_CHAR(${transactions.postedDate}::date, 'YYYY-MM')`,
          leafName: leaf.name,
          leafFlow: leaf.flowType,
          parentName: parent.name,
          parentFlow: parent.flowType,
          total: sql<string>`SUM(ABS(${transactions.baseAmount}::numeric))`,
          positiveTotal: sql<string>`SUM(CASE WHEN ${transactions.baseAmount}::numeric > 0 THEN ${transactions.baseAmount}::numeric ELSE 0 END)`,
          cnt: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .leftJoin(leaf, eq(transactions.categoryId, leaf.id))
        .leftJoin(parent, eq(leaf.parentId, parent.id))
        .where(
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(),
            eq(transactions.baseCurrency, primaryCurrency),
            ...(investmentExclusionFilter ? [investmentExclusionFilter] : []),
          ),
        )
        .groupBy(
          sql`TO_CHAR(${transactions.postedDate}::date, 'YYYY-MM')`,
          leaf.name,
          leaf.flowType,
          parent.name,
          parent.flowType,
        ),
    );

    type StatsAcc = {
      months: Map<string, number>;
      /** Calendar year (YYYY) → sum of ABS amounts in that year (actual, never extrapolated). */
      years: Map<string, number>;
      total: number;
      count: number;
    };
    const statsMap = new Map<string, StatsAcc>();
    const bumpStats = (key: string, ym: string, value: number, cnt: number) => {
      let s = statsMap.get(key);
      if (!s) {
        s = { months: new Map(), years: new Map(), total: 0, count: 0 };
        statsMap.set(key, s);
      }
      s.months.set(ym, (s.months.get(ym) ?? 0) + value);
      const yKey = ym.slice(0, 4);
      s.years.set(yKey, (s.years.get(yKey) ?? 0) + value);
      s.total += value;
      s.count += cnt;
    };

    for (const r of allTimeRows) {
      if (!r.leafFlow || r.leafFlow === "misc") continue; // skip uncategorized
      const flow = r.leafFlow as Flow;
      const value = flow === "inflow"
        ? parseFloat(r.positiveTotal ?? "0")
        : parseFloat(r.total ?? "0");
      if (!isFinite(value) || value === 0) continue;
      const topName = r.parentName ?? r.leafName ?? UNCATEGORIZED;
      const subName = r.parentName ? (r.leafName ?? NO_SUB) : NO_SUB;
      const cnt = r.cnt ?? 0;
      const ym = r.ym;
      bumpStats(`cat:${flow}:${topName}`, ym, value, cnt);
      bumpStats(`sub:${flow}:${topName}:${subName}`, ym, value, cnt);
      // Roll-ups
      if (flow === "inflow") bumpStats("income:trunk", ym, value, cnt);
      else if (flow === "outflow") bumpStats("alloc:outflow", ym, value, cnt);
      else if (flow === "savings") bumpStats("alloc:savings", ym, value, cnt);
    }

    /** Walk every month inclusively between two `YYYY-MM` strings. */
    function fillMonths(s: StatsAcc): { ym: string; value: number }[] {
      const yms = [...s.months.keys()].sort();
      if (yms.length === 0) return [];
      const out: { ym: string; value: number }[] = [];
      const [fyStr, fmStr] = yms[0].split("-");
      const [tyStr, tmStr] = yms[yms.length - 1].split("-");
      let y = Number(fyStr);
      let m = Number(fmStr);
      const ty = Number(tyStr);
      const tm = Number(tmStr);
      while (y < ty || (y === ty && m <= tm)) {
        const ym = `${y}-${String(m).padStart(2, "0")}`;
        const v = s.months.get(ym) ?? 0;
        out.push({ ym, value: Math.round(v * 100) / 100 });
        m += 1;
        if (m > 12) { m = 1; y += 1; }
      }
      return out;
    }

    const allTimeStats: Record<string, {
      months: { ym: string; value: number }[];
      total: number;
      count: number;
      monthsSpan: number;
      firstYm: string | null;
      lastYm: string | null;
      /** Mean of each calendar year’s actual total (never monthly × 12). */
      avgPerYear: number | null;
      yearsSpan: number;
    }> = {};
    for (const [key, s] of statsMap.entries()) {
      const months = fillMonths(s);
      if (months.length === 0) continue;
      const yearEntries = [...s.years.entries()].sort(([a], [b]) => a.localeCompare(b));
      const yearSum = yearEntries.reduce((acc, [, v]) => acc + v, 0);
      const yearsSpan = yearEntries.length;
      const avgPerYear =
        yearsSpan > 0 ? Math.round((yearSum / yearsSpan) * 100) / 100 : null;
      allTimeStats[key] = {
        months,
        total: Math.round(s.total * 100) / 100,
        count: s.count,
        monthsSpan: months.length,
        firstYm: months[0].ym,
        lastYm: months[months.length - 1].ym,
        avgPerYear,
        yearsSpan,
      };
    }

    return NextResponse.json(
      {
        currency: primaryCurrency,
        availableCurrencies,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        inflow: serializeFlow(buckets.inflow),
        outflow: serializeFlow(buckets.outflow),
        savings: serializeFlow(buckets.savings),
        allTimeStats,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/cashflow/sankey", err);
    return NextResponse.json(
      { error: "Failed to compute cash flow sankey" },
      { status: 500, headers: NO_STORE },
    );
  }
}
