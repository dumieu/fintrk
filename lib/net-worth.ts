/**
 * Net Worth Atlas projection engine.
 *
 * A monthly-resolution lifetime cashflow simulator:
 *   • Earning curve: take-home income grows with annual raises; contributions
 *     are indexed to income growth so the savings habit keeps pace with pay.
 *   • Every asset compounds at its own annual rate (or the global default).
 *     Contributions flow only into growth-bearing liquid classes.
 *   • Liabilities carry real APRs and amortise with a fixed payment computed
 *     from their standard term, so interest cost and debt-free age are real.
 *   • Inflation always matters: retirement spending, pensions, and pre-
 *     retirement withdrawals are entered in today's dollars and indexed up
 *     every month. The real (deflated) series is carried alongside nominal.
 *   • Post-retirement, pension/Social-Security income offsets spending; any
 *     surplus is reinvested, any deficit is withdrawn (liquid pots first).
 *   • Monte Carlo: per-asset-class volatility produces percentile bands and
 *     a plan success probability (funds last to age 95).
 *
 * Everything is pure and synchronous so the UI can re-run it on every
 * keystroke and stay perfectly in sync.
 */

export type Kind = "asset" | "liability";

export interface NetWorthItem {
  id?: number;
  kind: Kind;
  category: string;
  label: string;
  amount: number;
  currency: string;
  /** Assets: annual growth override. Liabilities: APR override. */
  growthRate: number | null;
  notes?: string | null;
  displayOrder?: number;
}

export interface NetWorthSettings {
  currency: string;
  defaultGrowthRate: number;
  /** Pre-retirement monthly contribution (currency / month). */
  monthlyContribution: number;
  /** Post-retirement monthly inflow, e.g. part-time work (currency / month, today's $). */
  monthlyContributionPost: number;
  inflationRate: number;
  currentAge: number;
  retirementAge: number;
  birthMonth: number | null;
  birthYear: number | null;
  /** Pre-retirement annual drawdown (today's $). */
  annualDrawdownPre: number;
  /** Post-retirement annual spending (today's $). */
  annualDrawdown: number;
  showInflationAdjusted: boolean;
  /** Take-home annual income today (today's $). 0 = not provided. */
  annualIncome: number;
  /** Annual raises (nominal). Contributions are indexed to this when income is set. */
  incomeGrowthRate: number;
  /** Pension / Social Security, annual, today's $. */
  postRetirementIncome: number;
  /** Age the pension/SS starts paying. */
  postRetirementIncomeStartAge: number;
}

export interface YearPoint {
  year: number;
  age: number;
  assets: number;
  liabilities: number;
  netWorth: number;
  /** Net worth deflated to today's purchasing power. */
  realNetWorth: number;
  /** Multiply any nominal value this year by this to get today's $. */
  deflator: number;
  /** Cumulative contributions to date (nominal). */
  contribution: number;
  /** Cumulative withdrawals to date (nominal). */
  drawdown: number;
  /** This year's flows (nominal). */
  income: number;
  saved: number;
  withdrawn: number;
  debtPayment: number;
  interestPaid: number;
  phase: "growth" | "drawdown";
  assetsByCategory: Record<string, number>;
  liabilitiesByCategory: Record<string, number>;
}

export interface WealthCrossing {
  label: string;
  amount: number;
  age: number;
}

export interface ProjectionResult {
  series: YearPoint[];
  today: { assets: number; liabilities: number; netWorth: number };
  milestones: { years: number; point: YearPoint | null }[];
  depletionAge: number | null;
  /** Spending × 25 (4% rule), today's $. */
  freedomNumber: number;
  yearsOfFreedom: number | null;
  totalContribution30y: number;
  effectiveAssetRate: number;
  assetCategories: string[];
  liabilityCategories: string[];
  /** Age financial independence is reached (real liquid ≥ freedom number). */
  fiAge: number | null;
  /** Liquid amount needed today to coast to FI by retirement with zero new savings. */
  coastFiNumber: number;
  coastFiAchieved: boolean;
  /** contribution × 12 / income, when income provided. */
  savingsRate: number | null;
  liquidToday: number;
  totalInterestPaid: number;
  debtFreeAge: number | null;
  peakNetWorth: { age: number; value: number };
  /** First nominal crossings of headline amounts above today's net worth. */
  crossings: WealthCrossing[];
  /** Net worth at retirement age (nominal + real). */
  atRetirement: { nominal: number; real: number } | null;
}

export interface MonteCarloBandPoint {
  year: number;
  age: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface MonteCarloResult {
  bands: MonteCarloBandPoint[];
  /** Fraction of runs whose assets survive to age 95 (or horizon end). */
  successProbability: number;
  runs: number;
}

/** Hard cap on the wealth curve. */
export const MAX_PROJECTION_AGE = 100;
/** Age used for the Monte Carlo success test. */
export const SUCCESS_TEST_AGE = 95;

export function horizonFor(currentAge: number): number {
  return Math.max(0, MAX_PROJECTION_AGE - currentAge);
}

export function ageFromDob(
  birthMonth: number | null,
  birthYear: number | null,
  ref: Date = new Date(),
): number | null {
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

/** Asset classes that receive contributions / are counted as investable. */
const CONTRIBUTABLE = new Set([
  "savings",
  "investments",
  "retirement",
  "business",
  "crypto",
  "other",
]);

/** Withdrawal order when funding spending: most liquid first. */
const WITHDRAW_ORDER = [
  "cash",
  "savings",
  "investments",
  "crypto",
  "other",
  "retirement",
  "business",
  "real_estate",
  "vehicles",
];

/** Classes counted as "liquid / investable" for FI math (home + cars excluded). */
const LIQUID = new Set([
  "cash",
  "savings",
  "investments",
  "retirement",
  "business",
  "crypto",
  "other",
]);

function withdrawOrderIndex(cat: string): number {
  const i = WITHDRAW_ORDER.indexOf(cat);
  return i === -1 ? WITHDRAW_ORDER.length : i;
}

/** Fixed monthly payment for principal P at APR over n months (0 APR safe). */
function amortizedMonthlyPayment(principal: number, apr: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const i = apr / 12;
  if (i <= 0) return principal / months;
  const f = Math.pow(1 + i, months);
  return (principal * i * f) / (f - 1);
}

interface SimPositionAsset {
  amount: number;
  annualRate: number;
  category: string;
}

interface SimPositionLiab {
  amount: number;
  apr: number;
  monthlyPayment: number;
  category: string;
}

function buildPositions(items: NetWorthItem[], settings: NetWorthSettings) {
  const assets: SimPositionAsset[] = items
    .filter((it) => it.kind === "asset" && it.amount > 0)
    .map((it) => ({
      amount: it.amount,
      annualRate: it.growthRate ?? settings.defaultGrowthRate,
      category: it.category,
    }));
  const liabs: SimPositionLiab[] = items
    .filter((it) => it.kind === "liability" && it.amount > 0)
    .map((it) => {
      const termYears = LIABILITY_PAYOFF_YEARS[it.category] ?? 10;
      const apr = Math.max(0, it.growthRate ?? findLiabilityCategory(it.category).defaultRate);
      return {
        amount: it.amount,
        apr,
        monthlyPayment: amortizedMonthlyPayment(it.amount, apr, termYears * 12),
        category: it.category,
      };
    });
  return { assets, liabs };
}

function bucket(positions: { amount: number; category: string }[], cats: string[]) {
  const out: Record<string, number> = {};
  for (const c of cats) out[c] = 0;
  for (const p of positions) out[p.category] = (out[p.category] ?? 0) + Math.max(0, p.amount);
  return out;
}

/**
 * Deterministic monthly lifetime simulation. Every lever in settings feeds
 * this directly, so the UI is always internally consistent.
 */
export function project(items: NetWorthItem[], settings: NetWorthSettings): ProjectionResult {
  const today = totals(items);
  const { assets: assetPositions, liabs: liabPositions } = buildPositions(items, settings);

  const seenCats = (kind: Kind, cats: { id: string }[]) => {
    const present = new Set(items.filter((it) => it.kind === kind).map((it) => it.category));
    return cats.map((c) => c.id).filter((id) => present.has(id));
  };
  const assetCategories = seenCats("asset", ASSET_CATEGORIES);
  const liabilityCategories = seenCats("liability", LIABILITY_CATEGORIES);

  const HORIZON = horizonFor(settings.currentAge);
  const months = HORIZON * 12;

  const liquidNow = assetPositions
    .filter((p) => LIQUID.has(p.category))
    .reduce((s, p) => s + p.amount, 0);

  // Monthly compounding factors.
  const inflMonthly = Math.pow(1 + Math.max(-0.99, settings.inflationRate), 1 / 12);
  const incomeGrowthMonthly = Math.pow(1 + Math.max(-0.99, settings.incomeGrowthRate), 1 / 12);
  const contribGrowthMonthly = settings.annualIncome > 0 ? incomeGrowthMonthly : inflMonthly;
  const monthlyAssetRate = (annual: number) => Math.pow(1 + Math.max(-0.99, annual), 1 / 12) - 1;

  let infIdx = 1;
  let incomeIdx = 1;
  let contribIdx = 1;
  let cumContribution = 0;
  let cumDrawdown = 0;
  let totalInterestPaid = 0;
  let depletionAge: number | null = null;
  let debtFreeAge: number | null = liabPositions.length === 0 ? settings.currentAge : null;

  // Year-flow accumulators (reset every 12 months).
  let yIncome = 0;
  let ySaved = 0;
  let yWithdrawn = 0;
  let yDebtPayment = 0;
  let yInterest = 0;

  const sumAssets = () => assetPositions.reduce((s, p) => s + Math.max(0, p.amount), 0);
  const sumLiabs = () => liabPositions.reduce((s, p) => s + Math.max(0, p.amount), 0);

  const invest = (amount: number) => {
    if (amount <= 0) return;
    const pool = assetPositions.filter((p) => CONTRIBUTABLE.has(p.category) && p.amount > 0);
    const poolTotal = pool.reduce((s, p) => s + p.amount, 0);
    if (poolTotal > 0) {
      for (const p of pool) p.amount += amount * (p.amount / poolTotal);
    } else {
      const existing = assetPositions.find((p) => p.category === "investments");
      if (existing) existing.amount += amount;
      else {
        assetPositions.push({
          amount,
          annualRate: settings.defaultGrowthRate,
          category: "investments",
        });
        if (!assetCategories.includes("investments")) assetCategories.push("investments");
      }
    }
  };

  const withdraw = (amount: number): number => {
    let needed = amount;
    if (needed <= 0) return 0;
    assetPositions.sort(
      (a, b) =>
        withdrawOrderIndex(a.category) - withdrawOrderIndex(b.category) || b.amount - a.amount,
    );
    for (const p of assetPositions) {
      if (needed <= 0) break;
      const take = Math.min(Math.max(0, p.amount), needed);
      p.amount -= take;
      needed -= take;
    }
    return amount - needed; // actually withdrawn
  };

  const series: YearPoint[] = [];
  const pushYear = (year: number) => {
    const assets = sumAssets();
    const liabilities = sumLiabs();
    const age = settings.currentAge + year;
    const deflator = 1 / infIdx;
    series.push({
      year,
      age,
      assets,
      liabilities,
      netWorth: assets - liabilities,
      realNetWorth: (assets - liabilities) * deflator,
      deflator,
      contribution: cumContribution,
      drawdown: cumDrawdown,
      income: yIncome,
      saved: ySaved,
      withdrawn: yWithdrawn,
      debtPayment: yDebtPayment,
      interestPaid: yInterest,
      phase: age >= settings.retirementAge ? "drawdown" : "growth",
      assetsByCategory: bucket(assetPositions, assetCategories),
      liabilitiesByCategory: bucket(liabPositions, liabilityCategories),
    });
    yIncome = 0;
    ySaved = 0;
    yWithdrawn = 0;
    yDebtPayment = 0;
    yInterest = 0;
  };

  pushYear(0);

  let fiAge: number | null = null;
  const freedomNumber = settings.annualDrawdown > 0 ? settings.annualDrawdown * 25 : 0;

  // FI check at the start (already there?).
  if (freedomNumber > 0 && liquidNow >= freedomNumber) fiAge = settings.currentAge;

  for (let m = 1; m <= months; m++) {
    const monthAge = settings.currentAge + m / 12;
    const isPost = monthAge > settings.retirementAge;

    infIdx *= inflMonthly;
    incomeIdx *= incomeGrowthMonthly;
    contribIdx *= contribGrowthMonthly;

    // 1) Asset growth.
    for (const p of assetPositions) {
      if (p.amount > 0) p.amount *= 1 + monthlyAssetRate(p.annualRate);
    }

    // 2) Debt: accrue interest, make payment.
    for (const p of liabPositions) {
      if (p.amount <= 0) continue;
      const interest = p.amount * (p.apr / 12);
      p.amount += interest;
      totalInterestPaid += interest;
      yInterest += interest;
      const pay = Math.min(p.amount, p.monthlyPayment);
      p.amount -= pay;
      yDebtPayment += pay;
    }
    if (debtFreeAge == null && sumLiabs() <= 0.5) {
      debtFreeAge = Math.ceil(monthAge);
    }

    // 3) Cashflows.
    if (!isPost) {
      const monthlyIncome = (settings.annualIncome / 12) * incomeIdx;
      yIncome += monthlyIncome;

      const contrib = settings.monthlyContribution * contribIdx;
      if (contrib > 0) {
        invest(contrib);
        cumContribution += contrib;
        ySaved += contrib;
      }
      const drawPre = (settings.annualDrawdownPre / 12) * infIdx;
      if (drawPre > 0) {
        const got = withdraw(drawPre);
        cumDrawdown += got;
        yWithdrawn += got;
      }
    } else {
      const pensionActive = monthAge >= settings.postRetirementIncomeStartAge;
      const pension = pensionActive ? (settings.postRetirementIncome / 12) * infIdx : 0;
      const sideIncome = settings.monthlyContributionPost * infIdx;
      const spending = (settings.annualDrawdown / 12) * infIdx;
      yIncome += pension + sideIncome;

      const net = pension + sideIncome - spending;
      if (net >= 0) {
        invest(net);
        cumContribution += net;
        ySaved += net;
      } else {
        const need = -net;
        const got = withdraw(need);
        cumDrawdown += got;
        yWithdrawn += got;
        if (got < need - 0.01 && depletionAge == null) {
          depletionAge = Math.floor(monthAge);
        }
      }
    }

    // FI detection: real liquid wealth ≥ freedom number.
    if (fiAge == null && freedomNumber > 0) {
      const liquid = assetPositions
        .filter((p) => LIQUID.has(p.category))
        .reduce((s, p) => s + Math.max(0, p.amount), 0);
      if (liquid / infIdx >= freedomNumber) fiAge = Math.ceil(monthAge);
    }

    if (m % 12 === 0) pushYear(m / 12);
  }

  const milestones = [5, 10, 20, 30].map((years) => ({
    years,
    point: series.find((p) => p.year === years) ?? null,
  }));

  const effectiveAssetRate = blendedAssetRate(items, settings.defaultGrowthRate);
  const realRate = effectiveAssetRate - settings.inflationRate;

  const yearsOfFreedom =
    settings.annualDrawdown > 0
      ? depletionAge != null
        ? Math.max(0, depletionAge - settings.retirementAge)
        : HORIZON - Math.max(0, settings.retirementAge - settings.currentAge)
      : null;

  const totalContribution30y =
    settings.monthlyContribution *
    12 *
    Math.max(0, Math.min(30, settings.retirementAge - settings.currentAge));

  const yearsToRetire = Math.max(0, settings.retirementAge - settings.currentAge);
  const coastGrowth = Math.max(0.0001, 1 + realRate);
  const coastFiNumber =
    freedomNumber > 0 ? freedomNumber / Math.pow(coastGrowth, yearsToRetire) : 0;
  const coastFiAchieved = coastFiNumber > 0 && liquidNow >= coastFiNumber;

  const savingsRate =
    settings.annualIncome > 0
      ? (settings.monthlyContribution * 12) / settings.annualIncome
      : null;

  let peak = { age: series[0].age, value: series[0].netWorth };
  for (const p of series) {
    if (p.netWorth > peak.value) peak = { age: p.age, value: p.netWorth };
  }

  const THRESHOLDS: [number, string][] = [
    [100_000, "$100K"],
    [250_000, "$250K"],
    [500_000, "$500K"],
    [1_000_000, "$1M"],
    [2_000_000, "$2M"],
    [5_000_000, "$5M"],
    [10_000_000, "$10M"],
  ];
  const crossings: WealthCrossing[] = [];
  for (const [amount, label] of THRESHOLDS) {
    if (today.netWorth >= amount) continue;
    const hit = series.find((p) => p.netWorth >= amount);
    if (hit) crossings.push({ label, amount, age: hit.age });
  }

  const retirementPoint =
    series.find((p) => p.age === settings.retirementAge) ?? null;

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
    fiAge,
    coastFiNumber,
    coastFiAchieved,
    savingsRate,
    liquidToday: liquidNow,
    totalInterestPaid,
    debtFreeAge,
    peakNetWorth: peak,
    crossings,
    atRetirement: retirementPoint
      ? { nominal: retirementPoint.netWorth, real: retirementPoint.realNetWorth }
      : null,
  };
}

// ─── Monte Carlo ─────────────────────────────────────────────────────────────

/** Annual return volatility per asset class. */
export const ASSET_VOLATILITY: Record<string, number> = {
  cash: 0.002,
  savings: 0.005,
  investments: 0.15,
  retirement: 0.14,
  real_estate: 0.08,
  vehicles: 0.03,
  business: 0.3,
  crypto: 0.7,
  other: 0.1,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianPair(rng: () => number): [number, number] {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const mag = Math.sqrt(-2 * Math.log(u));
  return [mag * Math.cos(2 * Math.PI * v), mag * Math.sin(2 * Math.PI * v)];
}

/**
 * Annual-step Monte Carlo with the same cashflow rules as `project`.
 * Returns nominal percentile bands aligned to the deterministic series.
 */
export function monteCarlo(
  items: NetWorthItem[],
  settings: NetWorthSettings,
  opts: { runs?: number; seed?: number } = {},
): MonteCarloResult {
  const runs = Math.max(50, Math.min(1000, opts.runs ?? 400));
  const seed = opts.seed ?? 1337;
  const HORIZON = horizonFor(settings.currentAge);

  const base = buildPositions(items, settings);
  const nwByYear: number[][] = Array.from({ length: HORIZON + 1 }, () => []);
  let successes = 0;

  const successAge = Math.min(SUCCESS_TEST_AGE, MAX_PROJECTION_AGE);
  const rng = mulberry32(seed);
  let spare: number | null = null;
  const nextGaussian = () => {
    if (spare != null) {
      const v = spare;
      spare = null;
      return v;
    }
    const [a, b] = gaussianPair(rng);
    spare = b;
    return a;
  };

  for (let run = 0; run < runs; run++) {
    const assets = base.assets.map((p) => ({ ...p }));
    const liabs = base.liabs.map((p) => ({ ...p }));
    let infIdx = 1;
    let incomeIdx = 1;
    let contribIdx = 1;
    let depleted = false;
    let depletedBeforeSuccessAge = false;

    nwByYear[0].push(
      assets.reduce((s, p) => s + p.amount, 0) - liabs.reduce((s, p) => s + p.amount, 0),
    );

    for (let y = 1; y <= HORIZON; y++) {
      const age = settings.currentAge + y;
      const isPost = age > settings.retirementAge;

      infIdx *= 1 + settings.inflationRate;
      incomeIdx *= 1 + settings.incomeGrowthRate;
      contribIdx *= 1 + (settings.annualIncome > 0 ? settings.incomeGrowthRate : settings.inflationRate);

      for (const p of assets) {
        if (p.amount <= 0) continue;
        const vol = ASSET_VOLATILITY[p.category] ?? 0.1;
        const r = p.annualRate + vol * nextGaussian();
        p.amount *= Math.max(0.05, 1 + r);
      }

      for (const p of liabs) {
        if (p.amount <= 0) continue;
        const interest = p.amount * p.apr;
        p.amount = Math.max(0, p.amount + interest - p.monthlyPayment * 12);
      }

      const investPool = () => assets.filter((p) => CONTRIBUTABLE.has(p.category) && p.amount > 0);
      const invest = (amt: number) => {
        if (amt <= 0) return;
        const pool = investPool();
        const tot = pool.reduce((s, p) => s + p.amount, 0);
        if (tot > 0) for (const p of pool) p.amount += amt * (p.amount / tot);
        else {
          const inv = assets.find((p) => p.category === "investments");
          if (inv) inv.amount += amt;
          else assets.push({ amount: amt, annualRate: settings.defaultGrowthRate, category: "investments" });
        }
      };
      const withdraw = (amt: number): number => {
        let needed = amt;
        assets.sort(
          (a, b) =>
            withdrawOrderIndex(a.category) - withdrawOrderIndex(b.category) ||
            b.amount - a.amount,
        );
        for (const p of assets) {
          if (needed <= 0) break;
          const take = Math.min(Math.max(0, p.amount), needed);
          p.amount -= take;
          needed -= take;
        }
        return amt - needed;
      };

      if (!isPost) {
        invest(settings.monthlyContribution * 12 * contribIdx);
        if (settings.annualDrawdownPre > 0) withdraw(settings.annualDrawdownPre * infIdx);
      } else {
        const pension =
          age >= settings.postRetirementIncomeStartAge
            ? settings.postRetirementIncome * infIdx
            : 0;
        const side = settings.monthlyContributionPost * 12 * infIdx;
        const spend = settings.annualDrawdown * infIdx;
        const net = pension + side - spend;
        if (net >= 0) invest(net);
        else {
          const got = withdraw(-net);
          if (got < -net - 0.01 && !depleted) {
            depleted = true;
            if (age <= successAge) depletedBeforeSuccessAge = true;
          }
        }
      }

      const nw =
        assets.reduce((s, p) => s + Math.max(0, p.amount), 0) -
        liabs.reduce((s, p) => s + Math.max(0, p.amount), 0);
      nwByYear[y].push(nw);
    }

    if (!depletedBeforeSuccessAge) successes += 1;
  }

  const pct = (sorted: number[], q: number) => {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
    return sorted[idx];
  };

  const bands: MonteCarloBandPoint[] = nwByYear.map((vals, y) => {
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      year: y,
      age: settings.currentAge + y,
      p10: pct(sorted, 0.1),
      p25: pct(sorted, 0.25),
      p50: pct(sorted, 0.5),
      p75: pct(sorted, 0.75),
      p90: pct(sorted, 0.9),
    };
  });

  return { bands, successProbability: successes / runs, runs };
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

/** Years over which each liability type amortises to zero. */
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

/** True when a category counts toward FI liquid wealth. */
export function isLiquidCategory(id: string): boolean {
  return LIQUID.has(id);
}
