import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import {
  transactions,
  accounts,
  userCategories,
  recurringPatterns,
} from "@/lib/db/schema";
import { excludeCardPaymentsSql, excludeRecurringCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { eq, and, sql, desc } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" } as const;

/* ────────────────────────────────────────────────────────────────────────── *
 * Money X-Ray API
 *
 * One server-side computation that powers the "Money X-Ray" page:
 *  - DNA: hierarchical (parent → subcategory → top-merchant) spend graph
 *    with monthly evolution rings.
 *  - Archetype: deterministic personality derived from real ratios
 *    (discretionary share, recurring drag, top-cat concentration, etc).
 *  - Leaks: actionable findings (subscriptions, FX bleed, runaway categories,
 *    fragmented merchants, late-night impulse cluster, etc.).
 *  - Simulator: 12-mo projection baseline + per-category mean monthly spend
 *    so the client can run instant what-ifs without a roundtrip.
 * ────────────────────────────────────────────────────────────────────────── */

interface MerchantNode { name: string; total: number; count: number }
interface SubcatNode {
  id: number;
  name: string;
  total: number;
  count: number;
  monthlyMean: number;
  topMerchants: MerchantNode[];
  flowType: string;
  discretionary: string | null;
}
interface ParentNode {
  id: number;
  name: string;
  color: string;
  total: number;
  count: number;
  share: number; // 0-1 of total outflow
  subcategories: SubcatNode[];
}
interface MonthlyMix {
  month: string; // YYYY-MM
  total: number;
  byParent: Record<string, number>;
}
interface Leak {
  id: string;
  kind:
    | "subscription"
    | "fx-bleed"
    | "category-runaway"
    | "merchant-fragmentation"
    | "late-night"
    | "weekend-binge"
    | "duplicate-subscription"
    | "tail-spend";
  title: string;
  body: string;
  monthlyImpact: number; // estimated monthly $ that could be reclaimed
  annualImpact: number;
  severity: "low" | "medium" | "high";
  evidence: Record<string, string | number>;
}
interface Archetype {
  code: string;
  name: string;
  blurb: string;
  scoreCard: { label: string; value: number; max: number; tone: string }[];
}

interface XRayResponse {
  currency: string;
  monthsCovered: number;
  totals: {
    inflow: number;
    outflow: number;
    netFlow: number;
    txCount: number;
    discretionaryShare: number;
    recurringShare: number;
  };
  dna: ParentNode[];
  monthly: MonthlyMix[];
  leaks: Leak[];
  archetype: Archetype;
  simulator: {
    baselineMonthlyOutflow: number;
    baselineMonthlySavings: number;
    parents: { id: number; name: string; color: string; monthly: number }[];
  };
  hourHeatmap: number[]; // 24 slots; outflow per hour-of-day (UTC)
}

const PARENT_PALETTE = [
  "#0BC18D", "#2CA2FF", "#AD74FF", "#ECAA0B", "#FF6F69",
  "#22D3EE", "#A3E635", "#F472B6", "#FB923C", "#34D399",
  "#818CF8", "#F87171", "#FACC15", "#60A5FA", "#C084FC",
];

function colorForIndex(i: number) {
  return PARENT_PALETTE[i % PARENT_PALETTE.length];
}

function pickArchetype(args: {
  discretionaryShare: number;
  recurringShare: number;
  topParentShare: number;
  topParentName: string;
  fxShare: number;
  weekendShare: number;
  netFlow: number;
  outflow: number;
  monthsCovered: number;
}): Archetype {
  const {
    discretionaryShare,
    recurringShare,
    topParentShare,
    topParentName,
    fxShare,
    weekendShare,
    netFlow,
    outflow,
    monthsCovered,
  } = args;

  const savingsRate = outflow > 0 ? Math.max(0, Math.min(1, netFlow / Math.max(1, netFlow + outflow))) : 0;

  let code = "balanced-explorer";
  let name = "The Balanced Explorer";
  let blurb =
    "Your spending is fluid and varied. You sample a wide range of categories without going overboard on any single one — a healthy footprint with room to optimise.";

  if (recurringShare > 0.45) {
    code = "subscription-captive";
    name = "The Subscription Captive";
    blurb = `Almost half of your outflow is on autopilot. Recurring charges are running your wallet — pruning even one or two could meaningfully change your monthly net.`;
  } else if (discretionaryShare > 0.55 && topParentShare > 0.25) {
    code = "comfort-spender";
    name = "The Comfort Spender";
    blurb = `You spend with intention to feel good now — ${topParentName} is your love language. The data says small redirects could fund a real goal without changing how you live.`;
  } else if (savingsRate > 0.25 && discretionaryShare < 0.35) {
    code = "stealth-saver";
    name = "The Stealth Saver";
    blurb = `You quietly out-save ${(savingsRate * 100).toFixed(0)}% of your inflow while keeping discretionary spend low. There's still leakage worth catching — see the leaks below.`;
  } else if (fxShare > 0.15) {
    code = "borderless-nomad";
    name = "The Borderless Nomad";
    blurb = `${(fxShare * 100).toFixed(0)}% of your spend crosses currencies. You live globally — but you're paying invisible FX tolls that compound.`;
  } else if (weekendShare > 0.45) {
    code = "weekend-warrior";
    name = "The Weekend Warrior";
    blurb = `Weekends carry ${(weekendShare * 100).toFixed(0)}% of your discretionary outflow. Mondays are kind to your wallet; the rest is a Saturday-night problem.`;
  } else if (topParentShare > 0.4) {
    code = "single-vertical";
    name = "The Single-Vertical Spender";
    blurb = `${topParentName} eats ${(topParentShare * 100).toFixed(0)}% of your outflow — more than the next two combined. Concentration is leverage, but it's also fragility.`;
  } else if (netFlow < 0 && monthsCovered >= 2) {
    code = "burner";
    name = "The Burner";
    blurb = `You've outspent inflows over the period. The leaks below point at the highest-leverage stops to flip the trajectory.`;
  }

  return {
    code,
    name,
    blurb,
    scoreCard: [
      { label: "Recurring grip", value: Math.round(recurringShare * 100), max: 100, tone: recurringShare > 0.4 ? "warn" : "ok" },
      { label: "Discretionary share", value: Math.round(discretionaryShare * 100), max: 100, tone: discretionaryShare > 0.55 ? "warn" : "ok" },
      { label: "Top-category dominance", value: Math.round(topParentShare * 100), max: 100, tone: topParentShare > 0.4 ? "warn" : "ok" },
      { label: "Savings rate", value: Math.round(savingsRate * 100), max: 100, tone: savingsRate > 0.2 ? "good" : savingsRate > 0.05 ? "ok" : "warn" },
    ],
  };
}

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const [
      txAgg,
      txByCat,
      monthly,
      monthlyByParent,
      hourly,
      runawayRows,
      merchantRows,
      catRows,
      recurringRows,
      acctRow,
      fxAgg,
      weekendAgg,
    ] = await Promise.all([
      resilientQuery(() =>
        db
          .select({
            inflow: sql<string>`COALESCE(SUM(CASE WHEN CAST(${transactions.baseAmount} AS numeric) > 0 THEN CAST(${transactions.baseAmount} AS numeric) ELSE 0 END), 0)`,
            outflow: sql<string>`COALESCE(SUM(CASE WHEN CAST(${transactions.baseAmount} AS numeric) < 0 THEN ABS(CAST(${transactions.baseAmount} AS numeric)) ELSE 0 END), 0)`,
            recurring: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.isRecurring} = true AND CAST(${transactions.baseAmount} AS numeric) < 0 THEN ABS(CAST(${transactions.baseAmount} AS numeric)) ELSE 0 END), 0)`,
            txCount: sql<number>`COUNT(*)::int`,
            firstDate: sql<string | null>`MIN(${transactions.postedDate})`,
            lastDate: sql<string | null>`MAX(${transactions.postedDate})`,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql())),
      ),

      resilientQuery(() =>
        db
          .select({
            categoryId: transactions.categoryId,
            total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), sql`CAST(${transactions.baseAmount} AS numeric) < 0`))
          .groupBy(transactions.categoryId),
      ),

      resilientQuery(() =>
        db
          .select({
            month: sql<string>`TO_CHAR(${transactions.postedDate}, 'YYYY-MM')`,
            total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), sql`CAST(${transactions.baseAmount} AS numeric) < 0`))
          .groupBy(sql`TO_CHAR(${transactions.postedDate}, 'YYYY-MM')`)
          .orderBy(sql`TO_CHAR(${transactions.postedDate}, 'YYYY-MM')`),
      ),

      resilientQuery(() =>
        db
          .select({
            month: sql<string>`TO_CHAR(${transactions.postedDate}, 'YYYY-MM')`,
            categoryId: transactions.categoryId,
            total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), sql`CAST(${transactions.baseAmount} AS numeric) < 0`))
          .groupBy(sql`TO_CHAR(${transactions.postedDate}, 'YYYY-MM')`, transactions.categoryId),
      ),

      resilientQuery(() =>
        db
          .select({
            hour: sql<number>`EXTRACT(HOUR FROM ${transactions.createdAt})::int`,
            total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), sql`CAST(${transactions.baseAmount} AS numeric) < 0`))
          .groupBy(sql`EXTRACT(HOUR FROM ${transactions.createdAt})`),
      ),

      // First/last 30-day spend per category for runaway detection
      resilientQuery(() =>
        db
          .select({
            categoryId: transactions.categoryId,
            recent: sql<string>`SUM(CASE WHEN ${transactions.postedDate} >= (CURRENT_DATE - INTERVAL '30 days') AND CAST(${transactions.baseAmount} AS numeric) < 0 THEN ABS(CAST(${transactions.baseAmount} AS numeric)) ELSE 0 END)`,
            prior: sql<string>`SUM(CASE WHEN ${transactions.postedDate} >= (CURRENT_DATE - INTERVAL '90 days') AND ${transactions.postedDate} < (CURRENT_DATE - INTERVAL '60 days') AND CAST(${transactions.baseAmount} AS numeric) < 0 THEN ABS(CAST(${transactions.baseAmount} AS numeric)) ELSE 0 END)`,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql()))
          .groupBy(transactions.categoryId),
      ),

      resilientQuery(() =>
        db
          .select({
            categoryId: transactions.categoryId,
            merchantName: transactions.merchantName,
            total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              excludeCardPaymentsSql(),
              sql`CAST(${transactions.baseAmount} AS numeric) < 0`,
              sql`${transactions.merchantName} IS NOT NULL`,
            ),
          )
          .groupBy(transactions.categoryId, transactions.merchantName)
          .orderBy(desc(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`)),
      ),

      resilientQuery(() =>
        db
          .select({
            id: userCategories.id,
            name: userCategories.name,
            parentId: userCategories.parentId,
            color: userCategories.color,
            flowType: userCategories.flowType,
            subcategoryType: userCategories.subcategoryType,
          })
          .from(userCategories)
          .where(eq(userCategories.userId, userId)),
      ),

      resilientQuery(() =>
        db
          .select({
            merchantName: recurringPatterns.merchantName,
            categoryId: recurringPatterns.categoryId,
            intervalDays: recurringPatterns.intervalDays,
            intervalLabel: recurringPatterns.intervalLabel,
            expectedAmount: recurringPatterns.expectedAmount,
            currency: recurringPatterns.currency,
            occurrenceCount: recurringPatterns.occurrenceCount,
            isActive: recurringPatterns.isActive,
            lastSeenDate: recurringPatterns.lastSeenDate,
          })
          .from(recurringPatterns)
          .where(
            and(
              eq(recurringPatterns.userId, userId),
              excludeRecurringCardPaymentsSql(),
              eq(recurringPatterns.isActive, true),
            ),
          ),
      ),

      resilientQuery(() =>
        db.select({ primaryCurrency: accounts.primaryCurrency }).from(accounts).where(eq(accounts.userId, userId)).limit(1),
      ),

      resilientQuery(() =>
        db
          .select({
            spreadBps: transactions.implicitFxSpreadBps,
            baseAmount: transactions.baseAmount,
            foreignCurrency: transactions.foreignCurrency,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), sql`${transactions.foreignCurrency} IS NOT NULL`)),
      ),

      resilientQuery(() =>
        db
          .select({
            isWeekend: sql<boolean>`(EXTRACT(DOW FROM ${transactions.postedDate})::int IN (0, 6))`,
            total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), sql`CAST(${transactions.baseAmount} AS numeric) < 0`))
          .groupBy(sql`(EXTRACT(DOW FROM ${transactions.postedDate})::int IN (0, 6))`),
      ),
    ]);

    const currency = acctRow[0]?.primaryCurrency ?? "USD";

    const inflow = parseFloat(txAgg[0]?.inflow ?? "0");
    const outflow = parseFloat(txAgg[0]?.outflow ?? "0");
    const recurringTotal = parseFloat(txAgg[0]?.recurring ?? "0");
    const txCount = txAgg[0]?.txCount ?? 0;
    const firstDate = txAgg[0]?.firstDate ? new Date(txAgg[0].firstDate) : null;
    const lastDate = txAgg[0]?.lastDate ? new Date(txAgg[0].lastDate) : null;

    const monthsCovered =
      firstDate && lastDate
        ? Math.max(
            1,
            Math.round(
              (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4375),
            ) + 1,
          )
        : 1;

    /* ─── Build category tree ────────────────────────────────────────── */
    const catById = new Map<number, typeof catRows[number]>();
    for (const c of catRows) catById.set(c.id, c);

    const totalsByCat = new Map<number, { total: number; count: number }>();
    for (const r of txByCat) {
      if (r.categoryId == null) continue;
      totalsByCat.set(r.categoryId, {
        total: parseFloat(r.total ?? "0"),
        count: r.count ?? 0,
      });
    }

    // Bubble subcategory totals up to parents in a tree.
    const parentMap = new Map<number, ParentNode>();
    let parentColorIdx = 0;
    function ensureParent(parentRow: typeof catRows[number]): ParentNode {
      const existing = parentMap.get(parentRow.id);
      if (existing) return existing;
      const node: ParentNode = {
        id: parentRow.id,
        name: parentRow.name,
        color: parentRow.color || colorForIndex(parentColorIdx++),
        total: 0,
        count: 0,
        share: 0,
        subcategories: [],
      };
      parentMap.set(parentRow.id, node);
      return node;
    }

    const merchantsByCat = new Map<number, MerchantNode[]>();
    for (const r of merchantRows) {
      if (r.categoryId == null || !r.merchantName) continue;
      const list = merchantsByCat.get(r.categoryId) ?? [];
      if (list.length < 5) list.push({ name: r.merchantName, total: parseFloat(r.total ?? "0"), count: r.count });
      merchantsByCat.set(r.categoryId, list);
    }

    for (const c of catRows) {
      const totals = totalsByCat.get(c.id);
      if (!totals || totals.total <= 0) continue;
      const parentRow = c.parentId ? catById.get(c.parentId) : null;
      const parent = ensureParent(parentRow ?? c); // categories without parents become their own parent
      const isLeaf = !!parentRow;
      const monthlyMean = totals.total / monthsCovered;

      if (isLeaf) {
        parent.subcategories.push({
          id: c.id,
          name: c.name,
          total: totals.total,
          count: totals.count,
          monthlyMean,
          topMerchants: merchantsByCat.get(c.id) ?? [],
          flowType: c.flowType ?? "outflow",
          discretionary: c.subcategoryType,
        });
      } else {
        // Top-level row that has its own outflow (no children present in this slice)
        parent.subcategories.push({
          id: c.id,
          name: c.name,
          total: totals.total,
          count: totals.count,
          monthlyMean,
          topMerchants: merchantsByCat.get(c.id) ?? [],
          flowType: c.flowType ?? "outflow",
          discretionary: c.subcategoryType,
        });
      }
      parent.total += totals.total;
      parent.count += totals.count;
    }

    const dna = Array.from(parentMap.values())
      .filter((p) => p.total > 0)
      .map((p) => ({
        ...p,
        share: outflow > 0 ? p.total / outflow : 0,
        subcategories: p.subcategories.sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);

    /* ─── Monthly mix ───────────────────────────────────────────────── */
    const parentIdByCat = new Map<number, number>();
    for (const c of catRows) {
      parentIdByCat.set(c.id, c.parentId ?? c.id);
    }
    const monthMap = new Map<string, MonthlyMix>();
    for (const m of monthly) {
      monthMap.set(m.month, {
        month: m.month,
        total: parseFloat(m.total ?? "0"),
        byParent: {},
      });
    }
    for (const r of monthlyByParent) {
      if (r.categoryId == null) continue;
      const pid = parentIdByCat.get(r.categoryId);
      if (pid == null) continue;
      const parent = parentMap.get(pid);
      if (!parent) continue;
      const slot = monthMap.get(r.month);
      if (!slot) continue;
      slot.byParent[parent.name] = (slot.byParent[parent.name] ?? 0) + parseFloat(r.total ?? "0");
    }
    const monthlyMix = Array.from(monthMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month),
    );

    /* ─── Hour heatmap ──────────────────────────────────────────────── */
    const hourHeatmap = new Array(24).fill(0);
    for (const r of hourly) {
      if (r.hour == null) continue;
      hourHeatmap[r.hour] = parseFloat(r.total ?? "0");
    }

    /* ─── FX bleed ─────────────────────────────────────────────────── */
    let fxBleed = 0;
    let fxOutflow = 0;
    let worstSpread = 0;
    for (const f of fxAgg) {
      const spread = parseFloat(f.spreadBps ?? "0");
      const amount = Math.abs(parseFloat(f.baseAmount));
      fxOutflow += amount;
      if (spread > 0) {
        fxBleed += amount * (spread / 10000);
        if (spread > worstSpread) worstSpread = spread;
      }
    }

    /* ─── Weekend share ─────────────────────────────────────────────── */
    let weekendOut = 0;
    let weekdayOut = 0;
    for (const w of weekendAgg) {
      const v = parseFloat(w.total ?? "0");
      if (w.isWeekend) weekendOut += v;
      else weekdayOut += v;
    }
    const weekendShare = weekendOut + weekdayOut > 0 ? weekendOut / (weekendOut + weekdayOut) : 0;

    /* ─── Discretionary share ───────────────────────────────────────── */
    let discretionaryOut = 0;
    let nonDiscretionaryOut = 0;
    for (const p of dna) {
      for (const s of p.subcategories) {
        if (s.discretionary === "discretionary") discretionaryOut += s.total;
        else if (s.discretionary === "non-discretionary") nonDiscretionaryOut += s.total;
      }
    }
    const discretionaryShare =
      discretionaryOut + nonDiscretionaryOut > 0
        ? discretionaryOut / (discretionaryOut + nonDiscretionaryOut)
        : 0;

    const recurringShare = outflow > 0 ? recurringTotal / outflow : 0;
    const topParent = dna[0];
    const topParentShare = topParent ? topParent.share : 0;
    const topParentName = topParent?.name ?? "—";
    const fxShare = outflow > 0 ? fxOutflow / outflow : 0;

    /* ─── Leak detection ────────────────────────────────────────────── */
    const leaks: Leak[] = [];

    // 1) Recurring patterns: low-occurrence-but-active subscriptions
    for (const r of recurringRows) {
      const monthly = parseFloat(r.expectedAmount ?? "0");
      if (monthly <= 0) continue;
      // Estimate annual outlay
      const perYear = (365 / Math.max(7, r.intervalDays)) * monthly;
      // Flag every active recurring as candidate, severity by absolute size & utility unknowns
      const sev: Leak["severity"] = perYear > 600 ? "high" : perYear > 200 ? "medium" : "low";
      leaks.push({
        id: `sub-${r.merchantName}-${r.intervalLabel}`,
        kind: "subscription",
        title: `${r.merchantName} — ${r.intervalLabel}`,
        body: `${currency} ${monthly.toFixed(2)} every ${r.intervalLabel.toLowerCase()}, last seen ${r.lastSeenDate ?? "recently"}. Cancelling reclaims ${currency} ${perYear.toFixed(0)} a year.`,
        monthlyImpact: perYear / 12,
        annualImpact: perYear,
        severity: sev,
        evidence: {
          merchant: r.merchantName,
          intervalDays: r.intervalDays,
          occurrences: r.occurrenceCount,
          lastSeen: r.lastSeenDate ?? "n/a",
        },
      });
    }

    // 2) FX bleed
    if (fxBleed > 5) {
      leaks.push({
        id: "fx-bleed",
        kind: "fx-bleed",
        title: "Foreign-exchange leak",
        body: `Hidden FX spread cost ${currency} ${fxBleed.toFixed(2)} on ${fxAgg.length} cross-currency charges (worst spread ${(worstSpread / 100).toFixed(2)}%). A multi-currency card eliminates most of this.`,
        monthlyImpact: fxBleed / Math.max(1, monthsCovered),
        annualImpact: (fxBleed / Math.max(1, monthsCovered)) * 12,
        severity: fxBleed > 200 ? "high" : "medium",
        evidence: { worstSpread, txCount: fxAgg.length },
      });
    }

    // 3) Category runaway (recent 30d > prior 30d window from -90 to -60)
    for (const r of runawayRows) {
      if (r.categoryId == null) continue;
      const recent = parseFloat(r.recent ?? "0");
      const prior = parseFloat(r.prior ?? "0");
      if (recent < 30 || prior < 30) continue;
      const ratio = recent / Math.max(1, prior);
      if (ratio < 1.5) continue;
      const cat = catById.get(r.categoryId);
      if (!cat) continue;
      const parentRow = cat.parentId ? catById.get(cat.parentId) : null;
      const parentName = parentRow?.name ?? cat.name;
      leaks.push({
        id: `runaway-${r.categoryId}`,
        kind: "category-runaway",
        title: `${cat.name} climbed ${Math.round((ratio - 1) * 100)}%`,
        body: `Spend on ${cat.name} jumped from ${currency} ${prior.toFixed(0)} (60-90 days ago) to ${currency} ${recent.toFixed(0)} in the last 30 days. Capping it back saves ~${currency} ${(recent - prior).toFixed(0)}/mo.`,
        monthlyImpact: recent - prior,
        annualImpact: (recent - prior) * 12,
        severity: ratio > 2.5 ? "high" : "medium",
        evidence: { category: cat.name, parent: parentName, ratio: ratio.toFixed(2) },
      });
    }

    // 4) Merchant fragmentation: same category, many small merchants
    const fragByCat = new Map<number, { merchants: number; total: number }>();
    for (const r of merchantRows) {
      if (r.categoryId == null) continue;
      const slot = fragByCat.get(r.categoryId) ?? { merchants: 0, total: 0 };
      slot.merchants += 1;
      slot.total += parseFloat(r.total ?? "0");
      fragByCat.set(r.categoryId, slot);
    }
    for (const [catId, slot] of fragByCat) {
      if (slot.merchants < 6) continue;
      const cat = catById.get(catId);
      if (!cat) continue;
      // Estimate 12% recovery if consolidated
      const monthlyImpact = (slot.total * 0.12) / Math.max(1, monthsCovered);
      if (monthlyImpact < 5) continue;
      leaks.push({
        id: `frag-${catId}`,
        kind: "merchant-fragmentation",
        title: `${cat.name}: ${slot.merchants} different merchants`,
        body: `You're spreading ${cat.name} across ${slot.merchants} merchants (${currency} ${slot.total.toFixed(0)} total). Consolidating to a primary saves loyalty/volume value worth ~${currency} ${monthlyImpact.toFixed(0)}/mo.`,
        monthlyImpact,
        annualImpact: monthlyImpact * 12,
        severity: slot.merchants > 12 ? "medium" : "low",
        evidence: { merchants: slot.merchants, total: slot.total },
      });
    }

    // 5) Late-night impulse cluster (22:00 → 03:00 contributions > 25%)
    const lateNightTotal = [22, 23, 0, 1, 2, 3].reduce((s, h) => s + (hourHeatmap[h] || 0), 0);
    const allHourTotal = hourHeatmap.reduce((s: number, v: number) => s + v, 0);
    if (allHourTotal > 0) {
      const lateShare = lateNightTotal / allHourTotal;
      if (lateShare > 0.25 && lateNightTotal > 50) {
        const monthlyImpact = (lateNightTotal * 0.4) / Math.max(1, monthsCovered);
        leaks.push({
          id: "late-night",
          kind: "late-night",
          title: "Late-night impulse cluster",
          body: `${(lateShare * 100).toFixed(0)}% of your charges land between 22:00 and 03:00 — classic impulse window. A 24-hour cool-off rule on those hours typically reclaims ~40%.`,
          monthlyImpact,
          annualImpact: monthlyImpact * 12,
          severity: lateShare > 0.4 ? "high" : "medium",
          evidence: { lateShare: lateShare.toFixed(2), lateNightTotal: Math.round(lateNightTotal) },
        });
      }
    }

    // 6) Weekend binge
    if (weekendShare > 0.45 && weekendOut > 100) {
      const monthlyImpact = ((weekendOut - weekdayOut * (2 / 5)) * 0.2) / Math.max(1, monthsCovered);
      if (monthlyImpact > 5) {
        leaks.push({
          id: "weekend-binge",
          kind: "weekend-binge",
          title: "Weekend skew",
          body: `${(weekendShare * 100).toFixed(0)}% of outflow happens on Saturday/Sunday. Pre-committing a weekend cap typically trims 20% off the binge.`,
          monthlyImpact,
          annualImpact: monthlyImpact * 12,
          severity: weekendShare > 0.55 ? "high" : "medium",
          evidence: { weekendShare: weekendShare.toFixed(2) },
        });
      }
    }

    // 7) Tail-spend: bottom-quartile merchants together
    const allMerchantTotals = merchantRows.map((r) => parseFloat(r.total ?? "0")).sort((a, b) => b - a);
    if (allMerchantTotals.length > 20) {
      const tail = allMerchantTotals.slice(Math.floor(allMerchantTotals.length * 0.75));
      const tailTotal = tail.reduce((s, v) => s + v, 0);
      const monthlyImpact = (tailTotal * 0.25) / Math.max(1, monthsCovered);
      if (monthlyImpact > 10) {
        leaks.push({
          id: "tail-spend",
          kind: "tail-spend",
          title: "Long-tail merchant drift",
          body: `${tail.length} merchants you visited rarely add up to ${currency} ${tailTotal.toFixed(0)}. A single "no new merchants" month cuts this 25%.`,
          monthlyImpact,
          annualImpact: monthlyImpact * 12,
          severity: "low",
          evidence: { merchants: tail.length, total: tailTotal },
        });
      }
    }

    // Sort leaks by impact, biggest first
    leaks.sort((a, b) => b.annualImpact - a.annualImpact);

    /* ─── Archetype ─────────────────────────────────────────────────── */
    const archetype = pickArchetype({
      discretionaryShare,
      recurringShare,
      topParentShare,
      topParentName,
      fxShare,
      weekendShare,
      netFlow: inflow - outflow,
      outflow,
      monthsCovered,
    });

    /* ─── Simulator baseline ────────────────────────────────────────── */
    const baselineMonthlyOutflow = outflow / monthsCovered;
    const baselineMonthlySavings = (inflow - outflow) / monthsCovered;
    const simulatorParents = dna.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      monthly: p.total / monthsCovered,
    }));

    const payload: XRayResponse = {
      currency,
      monthsCovered,
      totals: {
        inflow,
        outflow,
        netFlow: inflow - outflow,
        txCount,
        discretionaryShare,
        recurringShare,
      },
      dna,
      monthly: monthlyMix,
      leaks: leaks.slice(0, 12),
      archetype,
      simulator: {
        baselineMonthlyOutflow,
        baselineMonthlySavings,
        parents: simulatorParents,
      },
      hourHeatmap,
    };

    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/money-xray", err);
    return NextResponse.json({ error: "Failed to load X-Ray" }, { status: 500, headers: NO_STORE });
  }
}
