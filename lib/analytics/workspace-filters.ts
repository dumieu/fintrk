/**
 * Chart → Insights panel filter alignment.
 * Mirrors MonthlyStackedSpend fetch + client legend filters.
 */

export type AnalyticsTimeGranularity = "day" | "month" | "year";
export type AnalyticsStackBy = "category" | "discretionary";

/** Open-ended max on the transaction-size slider (matches TXN_SIZE_OPEN). */
export const ANALYTICS_TXN_SIZE_OPEN = 10_000;

export type AnalyticsChartFilters = {
  timeGranularity: AnalyticsTimeGranularity;
  /** Rolling months window for month/year modes (chart default 72). */
  months: number;
  /** Rolling days window for Daily Walk (chart default 60). */
  days: number;
  minAmount: number;
  maxAmount: number;
  soloCategory: string | null;
  hiddenCategories: string[];
  stackBy: AnalyticsStackBy;
};

export const DEFAULT_ANALYTICS_CHART_FILTERS: AnalyticsChartFilters = {
  timeGranularity: "month",
  months: 72,
  days: 60,
  minAmount: 0,
  maxAmount: ANALYTICS_TXN_SIZE_OPEN,
  soloCategory: null,
  hiddenCategories: [],
  stackBy: "category",
};

/** Build query string for Insights panel API calls. */
export function analyticsChartFiltersToSearchParams(
  f: AnalyticsChartFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (f.timeGranularity === "day") {
    params.set("granularity", "day");
    params.set("days", String(f.days));
  } else {
    params.set("granularity", "month");
    params.set("months", String(f.months));
  }
  if (f.minAmount > 0) params.set("minAmount", String(f.minAmount));
  if (f.maxAmount < ANALYTICS_TXN_SIZE_OPEN) {
    params.set("maxAmount", String(f.maxAmount));
  }
  params.set("stackBy", f.stackBy);
  if (f.soloCategory) params.set("category", f.soloCategory);
  for (const name of f.hiddenCategories) {
    if (name.trim()) params.append("exclude", name.trim());
  }
  return params;
}

export function analyticsChartFiltersEqual(
  a: AnalyticsChartFilters,
  b: AnalyticsChartFilters,
): boolean {
  if (a.timeGranularity !== b.timeGranularity) return false;
  if (a.months !== b.months) return false;
  if (a.days !== b.days) return false;
  if (a.minAmount !== b.minAmount) return false;
  if (a.maxAmount !== b.maxAmount) return false;
  if (a.soloCategory !== b.soloCategory) return false;
  if (a.stackBy !== b.stackBy) return false;
  if (a.hiddenCategories.length !== b.hiddenCategories.length) return false;
  const as = [...a.hiddenCategories].sort();
  const bs = [...b.hiddenCategories].sort();
  return as.every((v, i) => v === bs[i]);
}
