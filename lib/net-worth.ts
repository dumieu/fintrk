/**
 * Pure projection math + category metadata for the Net Worth dashboard.
 *
 * Model:
 *   • Each asset compounds at its own annual rate (or the global default)
 *     and is tracked individually so we can render per-asset-class breakdown.
 *   • A monthly contribution is split into pre-retirement and post-retirement
 *     amounts. Pre-retirement contributions flow into growth-bearing assets
 *     proportionally to current size; post-retirement contributions do the
 *     same so users can model "still investing some social security" cases.
 *   • Annual drawdowns are also split: a pre-retirement drawdown (e.g. paying
 *     for kids' college) and the main post-retirement drawdown. Each is
 *     deducted from the largest asset first.
 *   • Liabilities amortise linearly toward zero over a category-specific
 *     payoff term so the chart shows debt visibly shrinking.
 *   • showInflationAdjusted=true subtracts inflation from each asset's growth
 *     so all projected values are in today's purchasing power.
 */

export type Kind = "asset" | "liability";

export interface NetWorthItem {
  id?: number;
  kind: Kind;
  category: string;
  label: string;
  amount: number;
  currency: string;
  growthRate: number | null;
  notes?: string | null;
  displayOrder?: number;
}

export interface NetWorthSettings {
  currency: string;
  defaultGrowthRate: number;
  /** Pre-retirement monthly contribution (currency / month). */
  monthlyContribution: number;
  /** Post-retirement monthly contribution (currency / month). */
  monthlyContributionPost: number;
  inflationRate: number;
  currentAge: number;
  retirementAge: number;
  /** DOB (month 1–12) — when present, currentAge is derived from it. */
  birthMonth: number | null;
  /** DOB year — when present together with birthMonth, drives currentAge. */
  birthYear: number | null;
  /** Pre-retirement annual drawdown (today's $). */
  annualDrawdownPre: number;
  /** Post-retirement annual drawdown (today's $). */
  annualDrawdown: number;
  showInflationAdjusted: boolean;
}

export interface YearPoint {
  year: number;
  age: number;
  assets: number;
  liabilities: number;
  netWorth: number;
  contribution: number;
  drawdown: number;
  phase: "growth" | "drawdown";
  /** Per-asset-category amount this year (sums to `assets`). */
  assetsByCategory: Record<string, number>;
  /** Per-liability-category amount this year (sums to `liabilities`). */
  liabilitiesByCategory: Record<string, number>;
}

export interface ProjectionResult {
  series: YearPoint[];
  today: { assets: number; liabilities: number; netWorth: number };
  milestones: { years: number; point: YearPoint | null }[];
  depletionAge: number | null;
  freedomNumber: number;
  yearsOfFreedom: number | null;
  totalContribution30y: number;
  effectiveAssetRate: number;
  /** Asset categories present in the input (in stable display order). */
  assetCategories: string[];
  /** Liability categories present in the input (in stable display order). */
  liabilityCategories: string[];
}

/** Hard cap on the wealth curve — projections stop at this age (inclusive of year 0 at `currentAge`). */
export const MAX_PROJECTION_AGE = 100;

/** Years of projection from today: from `currentAge` up to and including `MAX_PROJECTION_AGE`. */
export function horizonFor(currentAge: number): number {
  return Math.max(0, MAX_PROJECTION_AGE - currentAge);
}

/**
 * Derive current age from a month+year DOB. Birthday is assumed to land on
 * the 1st of the birth month for simplicity (the input only has month+year
 * granularity, and that's accurate enough for net-worth projections).
 * Returns null if either field is missing.
 */
export function ageFromDob(birthMonth: number | null, birthYear: number | null, ref: Date = new Date()): number | null {
  if (!birthMonth || !birthYear) return null;
  const refY = ref.getFullYear();
  const refM = ref.getMonth() + 1;
  let age = refY - birthYear;
  if (refM < birthMonth) age -= 1;
  return Math.max(0, Math.min(120, age));
}

export function totals(items: NetWorthItem[]) {
  let assets = 0;
  let liabilities = 0;
  for (const it of items) {
    if (!Number.isFinite(it.amount)) continue;
    if (it.kind === "asset") assets += it.amount;
    else liabilities += it.amount;
  }
  return { assets, liabilities, netWorth: assets - liabilities };
}

export function blendedAssetRate(items: NetWorthItem[], defaultRate: number): number {
  let weightedSum = 0;
  let weight = 0;
  for (const it of items) {
    if (it.kind !== "asset" || it.amount <= 0) continue;
    const r = it.growthRate ?? defaultRate;
    weightedSum += r * it.amount;
    weight += it.amount;
  }
  if (weight === 0) return defaultRate;
  return weightedSum / weight;
}

export function project(items: NetWorthItem[], settings: NetWorthSettings): ProjectionResult {
  const t = totals(items);
  const today = { ...t };
  const inflationAdj = settings.showInflationAdjusted ? settings.inflationRate : 0;

  // ── Asset positions (one entry per item so per-item growth + per-category aggregation work) ──
  type AssetPos = { amount: number; rate: number; category: string };
  const assetPositions: AssetPos[] = items
    .filter((it) => it.kind === "asset" && it.amount > 0)
    .map((it) => ({
      amount: it.amount,
      rate: Math.max(-1, (it.growthRate ?? settings.defaultGrowthRate) - inflationAdj),
      category: it.category,
    }));

  // ── Liability positions with linear amortisation per category term ─────────
  type LiabPos = {
    amount: number;
    annualPayoff: number;
    category: string;
  };
  const liabPositions: LiabPos[] = items
    .filter((it) => it.kind === "liability" && it.amount > 0)
    .map((it) => {
      const term = LIABILITY_PAYOFF_YEARS[it.category] ?? 10;
      return {
        amount: it.amount,
        annualPayoff: it.amount / term,
        category: it.category,
      };
    });

  // Stable display order for categories present in the input.
  const seen = (kind: Kind, cats: typeof ASSET_CATEGORIES) => {
    const present = new Set(items.filter((it) => it.kind === kind).map((it) => it.category));
    return cats.map((c) => c.id).filter((id) => present.has(id));
  };
  const assetCategories = seen("asset", ASSET_CATEGORIES);
  const liabilityCategories = seen("liability", LIABILITY_CATEGORIES);

  // Helper to bucket positions by category.
  const bucketAssets = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const c of assetCategories) out[c] = 0;
    for (const p of assetPositions) {
      out[p.category] = (out[p.category] ?? 0) + Math.max(0, p.amount);
    }
    return out;
  };
  const bucketLiabs = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const c of liabilityCategories) out[c] = 0;
    for (const p of liabPositions) {
      out[p.category] = (out[p.category] ?? 0) + Math.max(0, p.amount);
    }
    return out;
  };

  let cumContribution = 0;
  let cumDrawdown = 0;
  let depletionAge: number | null = null;

  const series: YearPoint[] = [];
  // ── Year 0 snapshot ──
  series.push({
    year: 0,
    age: settings.currentAge,
    assets: assetPositions.reduce((s, p) => s + p.amount, 0),
    liabilities: liabPositions.reduce((s, p) => s + p.amount, 0),
    netWorth:
      assetPositions.reduce((s, p) => s + p.amount, 0) -
      liabPositions.reduce((s, p) => s + p.amount, 0),
    contribution: 0,
    drawdown: 0,
    phase: settings.currentAge >= settings.retirementAge ? "drawdown" : "growth",
    assetsByCategory: bucketAssets(),
    liabilitiesByCategory: bucketLiabs(),
  });

  const HORIZON = horizonFor(settings.currentAge);
  for (let y = 1; y <= HORIZON; y++) {
    const age = settings.currentAge + y;
    const isPostRetirement = age > settings.retirementAge;
    const isCrossover = age === settings.retirementAge + 1;
    const phase: "growth" | "drawdown" = isPostRetirement ? "drawdown" : "growth";

    // 1) Compound each asset position one year.
    for (const p of assetPositions) {
      p.amount = p.amount * (1 + p.rate);
    }

    // 2) Amortise liabilities (linear payoff toward 0).
    for (const p of liabPositions) {
      p.amount = Math.max(0, p.amount - p.annualPayoff);
    }

    // 3) Apply contribution for the current phase.
    const monthlyContrib = isPostRetirement
      ? settings.monthlyContributionPost
      : settings.monthlyContribution;
    if (monthlyContrib > 0) {
      const annual = monthlyContrib * 12;
      cumContribution += annual;
      const totalAssets = assetPositions.reduce((s, p) => s + Math.max(0, p.amount), 0);
      if (totalAssets > 0) {
        for (const p of assetPositions) {
          const share = Math.max(0, p.amount) / totalAssets;
          p.amount += annual * share;
        }
      } else {
        // Seed an investment bucket so future contributions still grow.
        assetPositions.push({
          amount: annual,
          rate: Math.max(-1, settings.defaultGrowthRate - inflationAdj),
          category: "investments",
        });
        if (!assetCategories.includes("investments")) assetCategories.push("investments");
      }
    }

    // 4) Apply drawdown for the current phase (largest pot first).
    const drawdown = isPostRetirement ? settings.annualDrawdown : settings.annualDrawdownPre;
    if (drawdown > 0) {
      let needed = drawdown;
      cumDrawdown += needed;
      assetPositions.sort((a, b) => b.amount - a.amount);
      for (const p of assetPositions) {
        if (needed <= 0) break;
        const take = Math.min(p.amount, needed);
        p.amount -= take;
        needed -= take;
      }
      const remaining = assetPositions.reduce((s, p) => s + Math.max(0, p.amount), 0);
      if (remaining <= 0 && depletionAge == null) depletionAge = age;
    }

    // (Crossover year just exists so future-self can hook visual cues; nothing
    // to do mathematically — the contribution/drawdown branches above already
    // switched on the new phase.)
    void isCrossover;

    const assets = assetPositions.reduce((s, p) => s + Math.max(0, p.amount), 0);
    const liabilities = liabPositions.reduce((s, p) => s + Math.max(0, p.amount), 0);
    series.push({
      year: y,
      age,
      assets,
      liabilities,
      netWorth: assets - liabilities,
      contribution: cumContribution,
      drawdown: cumDrawdown,
      phase,
      assetsByCategory: bucketAssets(),
      liabilitiesByCategory: bucketLiabs(),
    });
  }

  const milestones = [5, 10, 20, 30].map((years) => ({
    years,
    point: series.find((p) => p.year === years) ?? null,
  }));

  const effectiveAssetRate = blendedAssetRate(items, settings.defaultGrowthRate);
  const realRate =
    effectiveAssetRate - (settings.showInflationAdjusted ? 0 : settings.inflationRate);
  const freedomNumber =
    settings.annualDrawdown > 0 && realRate > 0 ? settings.annualDrawdown / realRate : 0;

  const yearsOfFreedom =
    settings.annualDrawdown > 0
      ? depletionAge != null
        ? depletionAge - settings.retirementAge
        : HORIZON - (settings.retirementAge - settings.currentAge)
      : null;

  const totalContribution30y =
    settings.monthlyContribution *
    12 *
    Math.max(0, Math.min(30, settings.retirementAge - settings.currentAge));

  return {
    series,
    today,
    milestones,
    depletionAge,
    freedomNumber,
    yearsOfFreedom,
    totalContribution30y,
    effectiveAssetRate,
    assetCategories,
    liabilityCategories,
  };
}

// ─── Category dictionaries ──────────────────────────────────────────────────

export const ASSET_CATEGORIES: {
  id: string;
  label: string;
  icon: string;
  defaultRate: number;
  color: string;
}[] = [
  { id: "cash",        label: "Cash & checking",   icon: "💵",  defaultRate: 0.005, color: "#5DD3F3" },
  { id: "savings",     label: "Savings & HYSA",    icon: "🏦",  defaultRate: 0.045, color: "#2CA2FF" },
  { id: "investments", label: "Brokerage / stocks", icon: "📈", defaultRate: 0.10,  color: "#0BC18D" },
  { id: "retirement",  label: "Retirement (401k / IRA)", icon: "🪺", defaultRate: 0.10, color: "#34D399" },
  { id: "real_estate", label: "Real estate",       icon: "🏠",  defaultRate: 0.04,  color: "#ECAA0B" },
  { id: "vehicles",    label: "Vehicles",          icon: "🚗",  defaultRate: -0.07, color: "#FB923C" },
  { id: "business",    label: "Business / equity", icon: "🚀",  defaultRate: 0.12,  color: "#AD74FF" },
  { id: "crypto",      label: "Crypto",            icon: "₿",   defaultRate: 0.20,  color: "#F59E0B" },
  { id: "other",       label: "Other asset",       icon: "✨",  defaultRate: 0.05,  color: "#94A3B8" },
];

export const LIABILITY_CATEGORIES: {
  id: string;
  label: string;
  icon: string;
  defaultRate: number;
  color: string;
}[] = [
  { id: "mortgage",      label: "Mortgage",         icon: "🏠",  defaultRate: 0.065, color: "#FF6F69" },
  { id: "credit_card",   label: "Credit cards",     icon: "💳",  defaultRate: 0.22,  color: "#EF4444" },
  { id: "student_loan",  label: "Student loans",    icon: "🎓",  defaultRate: 0.06,  color: "#F87171" },
  { id: "auto_loan",     label: "Auto loan",        icon: "🚗",  defaultRate: 0.07,  color: "#FCA5A5" },
  { id: "personal_loan", label: "Personal loan",    icon: "💼",  defaultRate: 0.10,  color: "#FDBA74" },
  { id: "other",         label: "Other liability",  icon: "📑",  defaultRate: 0.05,  color: "#94A3B8" },
];

/** Years over which each liability type is amortised to zero in the chart. */
export const LIABILITY_PAYOFF_YEARS: Record<string, number> = {
  mortgage: 30,
  credit_card: 5,
  student_loan: 10,
  auto_loan: 5,
  personal_loan: 4,
  other: 10,
};

export function findAssetCategory(id: string) {
  return ASSET_CATEGORIES.find((c) => c.id === id) ?? ASSET_CATEGORIES[ASSET_CATEGORIES.length - 1];
}
export function findLiabilityCategory(id: string) {
  return LIABILITY_CATEGORIES.find((c) => c.id === id) ?? LIABILITY_CATEGORIES[LIABILITY_CATEGORIES.length - 1];
}
