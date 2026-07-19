"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { CalendarRange, CalendarDays, Maximize2, RotateCcw, X } from "lucide-react";
import type {
  MonthlyStack,
  MonthlyStackSegment,
  MonthlyStacksResponse,
} from "@/app/api/analytics/monthly-stacks/route";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { CategoryTransactionsModal } from "@/components/category-transactions-modal";
import { AnalyticsCategoryLegend } from "@/components/analytics-category-legend";
import {
  analyticsCategoryGradientId,
  analyticsCategoryGradientTop,
} from "@/lib/analytics-category-colors";
import { periodKeyToDateRange, formatPeriodKeyLabel, monthKeyToDateRange } from "@/lib/month-date-range";
import {
  type AnalyticsChartFilters,
} from "@/lib/analytics/workspace-filters";
import {
  TransactionSizeSlider,
  TXN_SIZE_OPEN,
} from "@/components/transaction-size-slider";
import {
  chartControlClass,
  chartTooltipShellClass,
} from "@/lib/chart-ui";
import { cn } from "@/lib/utils";

const REF_LINE_INCOME = "#39FF14";
const REF_LINE_SPEND = "#FF4444";
const REF_AVG_MONTHS = 12;

/** Calendar range covering the rightmost N month bars (matches the avg reference-line span). */
function refLineMonthDateRange(
  months: { month: string }[],
  n: number = REF_AVG_MONTHS,
): { dateFrom: string; dateTo: string } | null {
  if (months.length === 0) return null;
  const slice = months.slice(-Math.min(n, months.length));
  const fromKey = slice[0]?.month;
  const toKey = slice[slice.length - 1]?.month;
  if (!fromKey || !toKey) return null;
  if (!/^\d{4}-\d{2}$/.test(fromKey) || !/^\d{4}-\d{2}$/.test(toKey)) return null;
  return {
    dateFrom: monthKeyToDateRange(fromKey).dateFrom,
    dateTo: monthKeyToDateRange(toKey).dateTo,
  };
}
const DEFAULT_MONTHS = 72;
const DAILY_WALK_DAYS = 60;
const CHART_HEIGHT = 660;
const CHART_HEIGHT_FULL_INIT = 900;
const CHART_HEIGHT_FULL_MIN = 540;
const DENSE_BAR_THRESHOLD = 20;
/** ~0.5mm gap between bars in dense mode (2px at standard density). */
const DENSE_BAR_GAP_PX = 2;
const GRANULARITY_STORAGE_KEY = "fintrk-monthly-stack-granularity";
const STACK_BY_STORAGE_KEY = "fintrk-monthly-stack-by";

export type ChartTimeGranularity = "day" | "month" | "year";
export type ChartStackBy = "category" | "discretionary";

const DISCRETIONARY_STACK_ORDER = [
  "Non-discretionary",
  "Semi-discretionary",
  "Discretionary",
] as const;

function writeStoredGranularity(value: Exclude<ChartTimeGranularity, "day">) {
  try {
    window.localStorage.setItem(GRANULARITY_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function readStoredStackBy(): ChartStackBy {
  if (typeof window === "undefined") return "category";
  try {
    const v = window.localStorage.getItem(STACK_BY_STORAGE_KEY);
    if (v === "category" || v === "discretionary") return v;
    return "category";
  } catch {
    return "category";
  }
}

function writeStoredStackBy(value: ChartStackBy) {
  try {
    window.localStorage.setItem(STACK_BY_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

/** Overall segment ranking across all bars (biggest first). */
function globalCategoryStackOrder(months: MonthlyStack[]): string[] {
  const totals = new Map<string, number>();
  for (const m of months) {
    for (const s of m.segments) {
      totals.set(s.name, (totals.get(s.name) ?? 0) + s.amount);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

function orderStackSegments(
  segments: MonthlyStackSegment[],
  stackBy: ChartStackBy,
  categoryOrder: string[],
): MonthlyStackSegment[] {
  if (stackBy === "discretionary") {
    const rank = new Map(DISCRETIONARY_STACK_ORDER.map((name, i) => [name, i]));
    return [...segments].sort((a, b) => {
      const ra = rank.get(a.name as (typeof DISCRETIONARY_STACK_ORDER)[number]) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.name as (typeof DISCRETIONARY_STACK_ORDER)[number]) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.name.localeCompare(b.name);
    });
  }
  const rank = new Map(categoryOrder.map((name, i) => [name, i]));
  return [...segments].sort((a, b) => {
    const ra = rank.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || a.name.localeCompare(b.name);
  });
}

function applyStackBy(months: MonthlyStack[], stackBy: ChartStackBy): MonthlyStack[] {
  if (months.length === 0) return months;
  const categoryOrder = globalCategoryStackOrder(months);
  return months.map((m) => ({
    ...m,
    segments: orderStackSegments(m.segments, stackBy, categoryOrder),
  }));
}

function countDistinctYears(months: MonthlyStack[]): number {
  return new Set(months.map((m) => m.month.slice(0, 4))).size;
}

/** Roll monthly stacks into calendar-year columns (partial current year = YTD). */
function aggregateMonthsToYears(months: MonthlyStack[]): MonthlyStack[] {
  const byYear = new Map<string, Map<string, { amount: number; count: number; color: string }>>();
  for (const m of months) {
    const year = m.month.slice(0, 4);
    let segMap = byYear.get(year);
    if (!segMap) {
      segMap = new Map();
      byYear.set(year, segMap);
    }
    for (const s of m.segments) {
      const prev = segMap.get(s.name);
      if (prev) {
        prev.amount += s.amount;
        prev.count += s.count;
      } else {
        segMap.set(s.name, { amount: s.amount, count: s.count, color: s.color });
      }
    }
  }
  return [...byYear.keys()]
    .sort()
    .map((year) => {
      const segMap = byYear.get(year)!;
      const segments = [...segMap.entries()]
        .map(([name, v]) => ({
          name,
          color: v.color,
          amount: Math.round(v.amount * 100) / 100,
          count: v.count,
        }))
        .sort((a, b) => b.amount - a.amount);
      const total = Math.round(segments.reduce((a, s) => a + s.amount, 0) * 100) / 100;
      return { month: year, total, segments };
    });
}

function applyTimeGranularity(months: MonthlyStack[], granularity: ChartTimeGranularity): MonthlyStack[] {
  if (granularity === "year") return aggregateMonthsToYears(months);
  return months;
}

function dayLabelShort(dayKey: string): string {
  const day = parseInt(dayKey.slice(8, 10), 10);
  return Number.isFinite(day) ? String(day) : dayKey.slice(8);
}

function denseDayShowsMonth(dayKey: string, index: number, days: MonthlyStack[]): boolean {
  if (index === 0) return true;
  const prev = days[index - 1]?.month;
  return !prev || dayKey.slice(0, 7) !== prev.slice(0, 7);
}

function monthLabelFromDayKey(dayKey: string): string {
  const [y, m] = dayKey.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function monthLabelShort(mk: string): string {
  const [y, m] = mk.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

/** Year spans for x-axis year row + delimiters (monthly dense / sparse). */
function computeYearBands(
  months: MonthlyStack[],
  geometries: { cx: number; x: number; barW: number }[],
): { year: string; midX: number; startX: number; endX: number }[] {
  if (months.length === 0 || geometries.length === 0) return [];
  const bands: { year: string; midX: number; startX: number; endX: number }[] = [];
  let i = 0;
  while (i < months.length) {
    const year = months[i].month.slice(0, 4);
    const start = i;
    while (i < months.length && months[i].month.slice(0, 4) === year) i += 1;
    const end = i - 1;
    const g0 = geometries[start];
    const g1 = geometries[end];
    if (!g0 || !g1) continue;
    const startX = g0.x;
    const endX = g1.x + g1.barW;
    bands.push({
      year,
      midX: (startX + endX) / 2,
      startX,
      endX,
    });
  }
  return bands;
}

function computeBarGeometries(
  count: number,
  padL: number,
  innerW: number,
  dense: boolean,
  fullscreen: boolean,
): { cx: number; x: number; barW: number }[] {
  if (count <= 0) return [];
  if (!dense) {
    const slot = innerW / count;
    const maxBarW = fullscreen ? 72 : 56;
    return Array.from({ length: count }, (_, i) => {
      const barW = Math.max(18, Math.min(maxBarW, slot * 0.66));
      const cx = padL + slot * i + slot / 2;
      return { cx, x: cx - barW / 2, barW };
    });
  }
  const barW = Math.max(2, (innerW - DENSE_BAR_GAP_PX * (count - 1)) / count);
  return Array.from({ length: count }, (_, i) => {
    const x = padL + i * (barW + DENSE_BAR_GAP_PX);
    return { cx: x + barW / 2, x, barW };
  });
}

function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1_000).toFixed(a >= 10_000 ? 1 : 1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function monthLabel(mk: string): { line1: string; line2: string } {
  const [y, m] = mk.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1, 1));
  return {
    line1: d.toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
    line2: String(y),
  };
}

/**
 * Y-axis scale that fills the plot: domain top is derived from plot height so
 * the tallest value uses ~99% of vertical space. Gridlines only appear at
 * tick marks the data actually reaches.
 */
function tightYScale(
  maxVal: number,
  plotH: number,
): { top: number; tickValues: number[] } {
  if (maxVal <= 0) return { top: 100, tickValues: [0, 25, 50, 75, 100] };

  /** ~6px at top for the tallest bar's total label when it sits above the stack. */
  const labelReservePx = 6;
  const fillRatio = Math.min(0.995, (plotH - labelReservePx) / plotH);
  const top = maxVal / fillRatio;

  const rough = maxVal / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  let stepMult = 1;
  if (norm > 1.5) stepMult = 2;
  else if (norm > 3) stepMult = 5;
  else if (norm > 7) stepMult = 10;
  const step = stepMult * mag;

  const tickValues: number[] = [0];
  for (let v = step; v <= maxVal + step * 0.001; v += step) {
    tickValues.push(v);
  }

  return { top, tickValues };
}

function filterMonthsBySoloCategory(
  months: MonthlyStack[],
  soloCategory: string | null,
): MonthlyStack[] {
  if (!soloCategory) return months;
  return months.map((m) => {
    const segments = m.segments.filter((s) => s.name === soloCategory);
    const total = Math.round(segments.reduce((a, s) => a + s.amount, 0) * 100) / 100;
    return { ...m, segments, total };
  });
}

function filterMonthsByHiddenCategories(
  months: MonthlyStack[],
  hidden: ReadonlySet<string>,
): MonthlyStack[] {
  if (hidden.size === 0) return months;
  return months.map((m) => {
    const segments = m.segments.filter((s) => !hidden.has(s.name));
    const total = Math.round(segments.reduce((a, s) => a + s.amount, 0) * 100) / 100;
    return { ...m, segments, total };
  });
}

export function MonthlyStackedSpend({
  months: monthsCount = DEFAULT_MONTHS,
  /** Fill parent height/width; chart resizes with the container (no fixed 660px). */
  fill = false,
  /** Emits chart filters so Insights panel cards stay aligned. */
  onFiltersChange,
}: {
  months?: number;
  fill?: boolean;
  onFiltersChange?: (filters: AnalyticsChartFilters) => void;
}) {
  const [data, setData] = useState<MonthlyStacksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [soloCategory, setSoloCategory] = useState<string | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => new Set());
  const [drilldown, setDrilldown] = useState<MonthlyStacksResponse | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [segmentModal, setSegmentModal] = useState<{
    name: string;
    level: "category" | "subcategory" | "discretionary";
    monthKey: string;
  } | null>(null);
  const [incomeModalRange, setIncomeModalRange] = useState<{
    dateFrom: string;
    dateTo: string;
  } | null>(null);
  const [timeGranularity, setTimeGranularity] = useState<ChartTimeGranularity>("month");
  const [stackBy, setStackBy] = useState<ChartStackBy>("category");
  const stackByBeforeWalkRef = useRef<ChartStackBy>("category");
  const [sizeDraft, setSizeDraft] = useState<{ min: number; max: number }>({
    min: 0,
    max: TXN_SIZE_OPEN,
  });
  const [sizeApplied, setSizeApplied] = useState<{ min: number; max: number }>({
    min: 0,
    max: TXN_SIZE_OPEN,
  });
  const sizeReady = true;

  useEffect(() => {
    // Always land on Monthly; Daily Walk is an intentional mode, never the entry default.
    setStackBy(readStoredStackBy());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setSizeApplied(sizeDraft), 220);
    return () => window.clearTimeout(t);
  }, [sizeDraft]);

  useEffect(() => {
    if (!onFiltersChange) return;
    onFiltersChange({
      timeGranularity,
      months: monthsCount,
      days: DAILY_WALK_DAYS,
      minAmount: sizeApplied.min,
      maxAmount: sizeApplied.max,
      soloCategory: stackBy === "category" ? soloCategory : null,
      hiddenCategories: [...hiddenCategories],
      stackBy,
    });
  }, [
    onFiltersChange,
    timeGranularity,
    monthsCount,
    sizeApplied.min,
    sizeApplied.max,
    soloCategory,
    hiddenCategories,
    stackBy,
  ]);

  const onTimeGranularityChange = useCallback(
    (next: ChartTimeGranularity) => {
      setTimeGranularity((prev) => {
        if (next === "day" && prev !== "day") {
          stackByBeforeWalkRef.current = stackBy;
          setStackBy("discretionary");
          writeStoredStackBy("discretionary");
          setSoloCategory(null);
          setDrilldown(null);
          setHiddenCategories(new Set());
        } else if (prev === "day" && next !== "day") {
          const restore = stackByBeforeWalkRef.current;
          setStackBy(restore);
          writeStoredStackBy(restore);
        }
        if (next === "month" || next === "year") {
          writeStoredGranularity(next);
        }
        return next;
      });
    },
    [stackBy],
  );

  const onStackByChange = useCallback((next: ChartStackBy) => {
    setStackBy(next);
    writeStoredStackBy(next);
    setHiddenCategories(new Set());
    if (next === "discretionary") {
      setSoloCategory(null);
      setDrilldown(null);
    }
  }, []);

  const resetAllChartFilters = useCallback(() => {
    setTimeGranularity("month");
    writeStoredGranularity("month");
    setStackBy("category");
    writeStoredStackBy("category");
    stackByBeforeWalkRef.current = "category";
    setSizeDraft({ min: 0, max: TXN_SIZE_OPEN });
    setSizeApplied({ min: 0, max: TXN_SIZE_OPEN });
    setSoloCategory(null);
    setHiddenCategories(new Set());
    setDrilldown(null);
    setSegmentModal(null);
  }, []);

  const chartFiltersDirty =
    timeGranularity !== "month" ||
    stackBy !== "category" ||
    sizeDraft.min > 0 ||
    sizeDraft.max < TXN_SIZE_OPEN ||
    soloCategory != null ||
    hiddenCategories.size > 0;

  const toggleCategory = useCallback((name: string) => {
    setSoloCategory((prev) => (prev === name ? null : name));
  }, []);

  const toggleCategoryVisibility = useCallback((name: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        return next;
      }
      next.add(name);
      return next;
    });
    setSoloCategory((solo) => (solo === name ? null : solo));
  }, []);

  const showAllCategories = useCallback(() => {
    setSoloCategory(null);
    setHiddenCategories(new Set());
  }, []);

  const openIncomeModal = useCallback(() => {
    if (!data) return;
    const monthsForRange =
      stackBy === "discretionary"
        ? (data.discretionaryMonths ?? data.months)
        : data.months;
    const range = refLineMonthDateRange(monthsForRange);
    if (range) setIncomeModalRange(range);
  }, [data, stackBy]);

  const openSegmentModal = useCallback(
    (segment: {
      name: string;
      level: "category" | "subcategory" | "discretionary";
      monthKey: string;
    }) => {
      setSegmentModal(segment);
    },
    [],
  );

  useEffect(() => {
    if (!soloCategory) {
      setDrilldown(null);
      setDrilldownLoading(false);
      return;
    }
    let cancelled = false;
    setDrilldownLoading(true);
    const params = new URLSearchParams();
    if (timeGranularity === "day") {
      params.set("granularity", "day");
      params.set("days", String(DAILY_WALK_DAYS));
    } else {
      params.set("months", String(monthsCount));
    }
    params.set("category", soloCategory);
    if (sizeReady) {
      if (sizeApplied.min > 0) params.set("minAmount", String(sizeApplied.min));
      if (sizeApplied.max < TXN_SIZE_OPEN) params.set("maxAmount", String(sizeApplied.max));
    }
    fetch(`/api/analytics/monthly-stacks?${params}`)
      .then((r) => r.json())
      .then((j: MonthlyStacksResponse | { error: string }) => {
        if (cancelled) return;
        if ("error" in j) {
          setDrilldown(null);
        } else {
          setDrilldown(j);
        }
      })
      .catch(() => {
        if (!cancelled) setDrilldown(null);
      })
      .finally(() => {
        if (!cancelled) setDrilldownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [soloCategory, monthsCount, timeGranularity, sizeReady, sizeApplied]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    const params = new URLSearchParams();
    if (timeGranularity === "day") {
      params.set("granularity", "day");
      params.set("days", String(DAILY_WALK_DAYS));
    } else {
      params.set("months", String(monthsCount));
    }
    if (sizeReady) {
      if (sizeApplied.min > 0) params.set("minAmount", String(sizeApplied.min));
      if (sizeApplied.max < TXN_SIZE_OPEN) params.set("maxAmount", String(sizeApplied.max));
    }
    fetch(`/api/analytics/monthly-stacks?${params}`)
      .then((r) => r.json())
      .then((j: MonthlyStacksResponse | { error: string }) => {
        if (cancelled) return;
        if ("error" in j) {
          setError(j.error);
          setData(null);
        } else {
          setData(j);
          setError(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthsCount, timeGranularity, sizeReady, sizeApplied.min, sizeApplied.max]);

  const amountFilterActive =
    sizeReady && (sizeApplied.min > 0 || sizeApplied.max < TXN_SIZE_OPEN);

  const headerChartControls = {
    timeGranularity,
    onTimeGranularityChange,
    stackBy,
    onStackByChange,
    sizeMin: sizeDraft.min,
    sizeMax: sizeDraft.max,
    sizeCurrency: data?.primaryCurrency,
    onSizeRangeChange: (next: { min: number; max: number }) => setSizeDraft(next),
    sizeReady,
    onResetFilters: resetAllChartFilters,
    filtersDirty: chartFiltersDirty,
    onIncomeClick: openIncomeModal,
  };

  const shellClass = cn(
    "text-card-foreground",
    fill
      ? "flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden border-0 bg-transparent py-0 shadow-none ring-0"
      : "border-chart-border bg-chart-surface shadow-chart",
  );
  const contentClass = cn(
    "overflow-visible pt-0",
    fill && "flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0",
  );
  const placeholderClass = cn(
    "flex items-center justify-center text-sm text-muted-foreground",
    fill ? "min-h-0 flex-1" : "h-[660px]",
  );

  if (loading && !data) {
    return (
      <Card className={shellClass}>
        <ChartCardHeader {...headerChartControls} />
        <CardContent className={contentClass}>
          <div className={placeholderClass}>
            {timeGranularity === "day" ? "Loading your 60-day walk…" : "Loading monthly breakdown…"}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card className={shellClass}>
        <ChartCardHeader {...headerChartControls} />
        <CardContent className={contentClass}>
          <div className={cn(placeholderClass, "text-rose-300/80")}>
            {error ?? "Failed to load monthly breakdown."}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (data.months.every((m) => m.total === 0)) {
    return (
      <Card className={shellClass}>
        <ChartCardHeader {...headerChartControls} />
        <CardContent className={contentClass}>
          <div className={placeholderClass}>
            No spending in the selected window.
          </div>
          <AnalyticsCategoryLegend
            categories={
              stackBy === "discretionary"
                ? (data.discretionaryCategories ?? [])
                : data.categories
            }
            compact
            soloCategory={stackBy === "discretionary" ? null : soloCategory}
            hiddenCategories={hiddenCategories}
            onToggleCategory={stackBy === "discretionary" ? undefined : toggleCategory}
            onToggleVisibility={toggleCategoryVisibility}
            onShowAll={showAllCategories}
          />
        </CardContent>
      </Card>
    );
  }

  const chartData: MonthlyStacksResponse =
    stackBy === "discretionary"
      ? {
          ...data,
          months: data.discretionaryMonths ?? [],
          categories: data.discretionaryCategories ?? [],
        }
      : data;

  if (stackBy === "discretionary" && chartData.months.every((m) => m.total === 0)) {
    return (
      <Card className={shellClass}>
        <ChartCardHeader
          onExpand={() => setExpanded(true)}
          avgMonthlySpendLast12={data.avgMonthlySpendLast12}
          avgMonthlyIncomeLast12={data.avgMonthlyIncomeLast12}
          {...headerChartControls}
        />
        <CardContent className={contentClass}>
          <div className={cn(placeholderClass, "flex-col gap-2")}>
            <p>No discretionary-tagged spending in this window.</p>
            <p className="text-xs text-muted-foreground/80">
              Tag subcategories as Non-discretionary, Semi-discretionary, or Discretionary in Category Mapping.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={shellClass}>
      <ChartCardHeader
        onExpand={() => setExpanded(true)}
        avgMonthlySpendLast12={
          (soloCategory && stackBy !== "discretionary") ||
          hiddenCategories.size > 0 ||
          amountFilterActive
            ? null
            : data.avgMonthlySpendLast12
        }
        avgMonthlyIncomeLast12={
          (soloCategory && stackBy !== "discretionary") ||
          hiddenCategories.size > 0 ||
          amountFilterActive
            ? null
            : data.avgMonthlyIncomeLast12
        }
        {...headerChartControls}
      />
      <CardContent className={contentClass}>
        <ChartView
          data={chartData}
          soloCategory={stackBy === "discretionary" ? null : soloCategory}
          hiddenCategories={hiddenCategories}
          drilldown={stackBy === "discretionary" ? null : drilldown}
          drilldownLoading={stackBy === "discretionary" ? false : drilldownLoading}
          timeGranularity={timeGranularity}
          stackBy={stackBy}
          amountFilterActive={amountFilterActive}
          fill={fill}
          onSegmentClick={openSegmentModal}
          onIncomeLineClick={openIncomeModal}
        />
        <div className={cn(fill && "shrink-0")}>
          <AnalyticsCategoryLegend
            categories={chartData.categories}
            soloCategory={stackBy === "discretionary" ? null : soloCategory}
            hiddenCategories={hiddenCategories}
            subcategoryBreakdown={
              stackBy !== "discretionary" &&
              soloCategory &&
              drilldown?.parentCategory === soloCategory
                ? drilldown.categories
                : undefined
            }
            onToggleCategory={stackBy === "discretionary" ? undefined : toggleCategory}
            onToggleVisibility={toggleCategoryVisibility}
            onShowAll={showAllCategories}
          />
        </div>
      </CardContent>
      {segmentModal &&
        typeof document !== "undefined" &&
        createPortal(
          <CategoryTransactionsModal
            filter={{
              mode: "category",
              name: segmentModal.name,
              level: segmentModal.level,
              ...periodKeyToDateRange(segmentModal.monthKey),
            }}
            currency={data.primaryCurrency}
            minAmount={sizeApplied.min > 0 ? sizeApplied.min : undefined}
            maxAmount={sizeApplied.max < TXN_SIZE_OPEN ? sizeApplied.max : undefined}
            onClose={() => setSegmentModal(null)}
          />,
          document.body,
        )}
      {incomeModalRange &&
        typeof document !== "undefined" &&
        createPortal(
          <CategoryTransactionsModal
            filter={{
              mode: "flow",
              flow: "inflow",
              label: "Income",
              dateFrom: incomeModalRange.dateFrom,
              dateTo: incomeModalRange.dateTo,
            }}
            currency={data.primaryCurrency}
            minAmount={sizeApplied.min > 0 ? sizeApplied.min : undefined}
            maxAmount={sizeApplied.max < TXN_SIZE_OPEN ? sizeApplied.max : undefined}
            onClose={() => setIncomeModalRange(null)}
          />,
          document.body,
        )}
      {expanded &&
        typeof document !== "undefined" &&
        createPortal(
          <FullscreenChartModal
            data={chartData}
            soloCategory={stackBy === "discretionary" ? null : soloCategory}
            hiddenCategories={hiddenCategories}
            drilldown={stackBy === "discretionary" ? null : drilldown}
            drilldownLoading={stackBy === "discretionary" ? false : drilldownLoading}
            timeGranularity={timeGranularity}
            onTimeGranularityChange={onTimeGranularityChange}
            stackBy={stackBy}
            onStackByChange={onStackByChange}
            amountFilterActive={amountFilterActive}
            sizeMin={sizeDraft.min}
            sizeMax={sizeDraft.max}
            sizeCurrency={data.primaryCurrency}
            onSizeRangeChange={(next) => setSizeDraft(next)}
            sizeReady={sizeReady}
            onResetFilters={resetAllChartFilters}
            filtersDirty={chartFiltersDirty}
            onToggleCategory={stackBy === "discretionary" ? undefined : toggleCategory}
            onToggleVisibility={toggleCategoryVisibility}
            onShowAllCategories={showAllCategories}
            onClose={() => setExpanded(false)}
            onSegmentClick={openSegmentModal}
            onIncomeLineClick={openIncomeModal}
          />,
          document.body,
        )}
    </Card>
  );
}

function ChartRefLineLegend({
  avgMonthlySpendLast12,
  avgMonthlyIncomeLast12,
  timeGranularity = "month",
  onIncomeClick,
}: {
  avgMonthlySpendLast12: number | null | undefined;
  avgMonthlyIncomeLast12: number | null | undefined;
  timeGranularity?: ChartTimeGranularity;
  onIncomeClick?: () => void;
}) {
  if (timeGranularity === "year" || timeGranularity === "day") return null;

  const showSpend = avgMonthlySpendLast12 != null && avgMonthlySpendLast12 > 0;
  const showIncome = avgMonthlyIncomeLast12 != null && avgMonthlyIncomeLast12 > 0;
  if (!showSpend && !showIncome) return null;

  const spendLabel = "Avg spend · last 12 mo";
  const incomeLabel = "Avg income · last 12 mo";

  return (
    <div className="flex items-center gap-3">
      {showSpend ? (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold leading-none text-[#C43A3A] dark:text-[#FFB4B4]">
          <span
            className="inline-block h-[2px] w-4 shrink-0 rounded-full bg-[#FF4444]"
            style={{ boxShadow: "0 0 6px rgba(255,68,68,0.7)" }}
          />
          <span>{spendLabel}</span>
        </div>
      ) : null}
      {showIncome ? (
        onIncomeClick ? (
          <button
            type="button"
            onClick={onIncomeClick}
            title="Show income transactions for this period"
            aria-label="Show income transactions for the last 12 months"
            className="flex items-center gap-1.5 rounded-md text-[10px] font-semibold leading-none text-[#0A9A6E] transition-colors hover:bg-[#39FF14]/10 dark:text-[#9DFFB0]"
          >
            <span
              className="inline-block h-[2px] w-4 shrink-0 rounded-full bg-[#39FF14]"
              style={{ boxShadow: "0 0 6px rgba(57,255,20,0.55)" }}
            />
            <span className="underline decoration-[#39FF14]/35 underline-offset-2">
              {incomeLabel}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold leading-none text-[#0A9A6E] dark:text-[#9DFFB0]">
            <span
              className="inline-block h-[2px] w-4 shrink-0 rounded-full bg-[#39FF14]"
              style={{ boxShadow: "0 0 6px rgba(57,255,20,0.55)" }}
            />
            <span>{incomeLabel}</span>
          </div>
        )
      ) : null}
    </div>
  );
}

function ChartResetFiltersButton({
  onClick,
  dirty,
}: {
  onClick: () => void;
  dirty: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!dirty}
      className={cn(
        "pointer-events-auto grid w-7 shrink-0 place-items-center transition-colors",
        chartControlClass,
        dirty
          ? "hover:border-[#0BC18D]/40 hover:bg-chart-hover hover:text-[#0BC18D]"
          : "cursor-default opacity-35",
      )}
      aria-label="Reset all chart filters"
      title="Reset all"
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

function ChartTimeGranularityToggle({
  value,
  onChange,
  className,
}: {
  value: ChartTimeGranularity;
  onChange: (next: ChartTimeGranularity) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Chart time period"
      className={cn(
        "pointer-events-auto inline-flex shrink-0 items-center gap-0.5 p-0.5",
        chartControlClass,
        className,
      )}
    >
      {(
        [
          {
            id: "day" as const,
            label: "Daily",
            Icon: CalendarDays,
            title: "Last 60 days — one bar per day. Stack by Type opens automatically.",
          },
          {
            id: "month" as const,
            label: "Monthly",
            Icon: CalendarDays,
            title: "One bar per month",
          },
          {
            id: "year" as const,
            label: "Yearly",
            Icon: CalendarRange,
            title: "Stack by calendar year (current year = YTD)",
          },
        ] as const
      ).map(({ id, label, Icon, title }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            title={title}
            onClick={() => onChange(id)}
            className={cn(
              "relative inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-semibold leading-none transition-all duration-200",
              active
                ? "bg-[#0BC18D]/15 text-[#0BC18D] shadow-[0_0_12px_-4px_rgba(11,193,141,0.35)] dark:bg-[#0BC18D]/18 dark:shadow-[0_0_16px_-6px_rgba(11,193,141,0.55)]"
                : "text-muted-foreground hover:bg-chart-hover hover:text-foreground",
            )}
          >
            <Icon className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ChartStackByToggle({
  value,
  onChange,
}: {
  value: ChartStackBy;
  onChange: (next: ChartStackBy) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Stack segments by"
      className={cn(
        "pointer-events-auto inline-flex shrink-0 items-center gap-0.5 p-0.5",
        chartControlClass,
      )}
    >
      {(
        [
          { id: "category" as const, label: "Category" },
          { id: "discretionary" as const, label: "Type" },
        ] as const
      ).map(({ id, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            title={
              id === "discretionary"
                ? "Stack by Non-discretionary, Semi-discretionary, and Discretionary"
                : "Same category order in every bar (overall largest first)"
            }
            onClick={() => onChange(id)}
            className={cn(
              "relative inline-flex h-6 items-center rounded-md px-2 text-[10px] font-semibold leading-none transition-all duration-200",
              active
                ? "bg-[#0BC18D]/15 text-[#0BC18D] shadow-[0_0_12px_-4px_rgba(11,193,141,0.35)] dark:bg-[#0BC18D]/18 dark:shadow-[0_0_16px_-6px_rgba(11,193,141,0.55)]"
                : "text-muted-foreground hover:bg-chart-hover hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ExpandChartButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid w-7 shrink-0 place-items-center transition-colors hover:border-chart-border hover:bg-chart-hover hover:text-foreground",
        chartControlClass,
      )}
      aria-label="Expand chart to full screen"
      title="Expand"
    >
      <Maximize2 className="h-3.5 w-3.5" />
    </button>
  );
}

function ChartCardHeader({
  onExpand,
  avgMonthlySpendLast12,
  avgMonthlyIncomeLast12,
  timeGranularity = "month",
  onTimeGranularityChange,
  stackBy = "category",
  onStackByChange,
  sizeMin = 0,
  sizeMax = TXN_SIZE_OPEN,
  sizeCurrency,
  onSizeRangeChange,
  sizeReady = false,
  onResetFilters,
  filtersDirty = false,
  onIncomeClick,
}: {
  onExpand?: () => void;
  avgMonthlySpendLast12?: number | null;
  avgMonthlyIncomeLast12?: number | null;
  timeGranularity?: ChartTimeGranularity;
  onTimeGranularityChange?: (next: ChartTimeGranularity) => void;
  stackBy?: ChartStackBy;
  onStackByChange?: (next: ChartStackBy) => void;
  sizeMin?: number;
  sizeMax?: number;
  sizeCurrency?: string;
  onSizeRangeChange?: (next: { min: number; max: number }) => void;
  sizeReady?: boolean;
  onResetFilters?: () => void;
  filtersDirty?: boolean;
  onIncomeClick?: () => void;
}) {
  return (
    <CardHeader className="flex min-h-7 shrink-0 items-center justify-between gap-x-3 px-3 pb-2 pt-2">
      <div className="flex h-7 min-w-0 items-center justify-start gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {onTimeGranularityChange ? (
          <ChartTimeGranularityToggle
            value={timeGranularity}
            onChange={onTimeGranularityChange}
          />
        ) : null}
        {onStackByChange ? (
          <ChartStackByToggle value={stackBy} onChange={onStackByChange} />
        ) : null}
        {onSizeRangeChange && sizeReady ? (
          <TransactionSizeSlider
            min={sizeMin}
            max={sizeMax}
            currencyCode={sizeCurrency}
            onChange={onSizeRangeChange}
          />
        ) : null}
      </div>
      <div className="flex h-7 min-w-0 shrink-0 items-center justify-end gap-1.5">
        {onExpand ? (
          <ChartRefLineLegend
            avgMonthlySpendLast12={avgMonthlySpendLast12}
            avgMonthlyIncomeLast12={avgMonthlyIncomeLast12}
            timeGranularity={timeGranularity}
            onIncomeClick={onIncomeClick}
          />
        ) : null}
        {onExpand ? <ExpandChartButton onClick={onExpand} /> : null}
        {onResetFilters ? (
          <ChartResetFiltersButton onClick={onResetFilters} dirty={filtersDirty} />
        ) : null}
      </div>
    </CardHeader>
  );
}

function FullscreenChartModal({
  data,
  soloCategory,
  hiddenCategories,
  drilldown,
  drilldownLoading,
  timeGranularity,
  onTimeGranularityChange,
  stackBy,
  onStackByChange,
  amountFilterActive = false,
  sizeMin = 0,
  sizeMax = TXN_SIZE_OPEN,
  sizeCurrency,
  onSizeRangeChange,
  sizeReady = false,
  onResetFilters,
  filtersDirty = false,
  onToggleCategory,
  onToggleVisibility,
  onShowAllCategories,
  onClose,
  onSegmentClick,
  onIncomeLineClick,
}: {
  data: MonthlyStacksResponse;
  soloCategory: string | null;
  hiddenCategories: ReadonlySet<string>;
  drilldown: MonthlyStacksResponse | null;
  drilldownLoading: boolean;
  timeGranularity: ChartTimeGranularity;
  onTimeGranularityChange: (next: ChartTimeGranularity) => void;
  stackBy: ChartStackBy;
  onStackByChange: (next: ChartStackBy) => void;
  amountFilterActive?: boolean;
  sizeMin?: number;
  sizeMax?: number;
  sizeCurrency?: string;
  onSizeRangeChange?: (next: { min: number; max: number }) => void;
  sizeReady?: boolean;
  onResetFilters?: () => void;
  filtersDirty?: boolean;
  onToggleCategory?: (name: string) => void;
  onToggleVisibility: (name: string) => void;
  onShowAllCategories: () => void;
  onClose: () => void;
  onSegmentClick: (segment: {
    name: string;
    level: "category" | "subcategory" | "discretionary";
    monthKey: string;
  }) => void;
  onIncomeLineClick?: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-app-canvas"
      role="dialog"
      aria-modal="true"
      aria-label="Monthly Spend by Category — expanded"
    >
      <div className="flex min-h-7 shrink-0 items-center justify-between gap-x-3 border-b border-chart-border px-5 py-3 sm:px-8">
        <div className="flex h-7 min-w-0 items-center justify-start gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ChartTimeGranularityToggle
            value={timeGranularity}
            onChange={onTimeGranularityChange}
          />
          <ChartStackByToggle value={stackBy} onChange={onStackByChange} />
          {onSizeRangeChange && sizeReady ? (
            <TransactionSizeSlider
              min={sizeMin}
              max={sizeMax}
              currencyCode={sizeCurrency}
              onChange={onSizeRangeChange}
            />
          ) : null}
        </div>
        <div className="flex h-7 items-center justify-end gap-1.5">
          {onResetFilters ? (
            <ChartResetFiltersButton onClick={onResetFilters} dirty={filtersDirty} />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "grid shrink-0 place-items-center transition-colors hover:bg-chart-hover hover:text-foreground",
              chartControlClass,
              "h-8 w-8",
            )}
            aria-label="Close expanded chart"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
        <ChartView
          data={data}
          soloCategory={soloCategory}
          hiddenCategories={hiddenCategories}
          drilldown={drilldown}
          drilldownLoading={drilldownLoading}
          timeGranularity={timeGranularity}
          stackBy={stackBy}
          amountFilterActive={amountFilterActive}
          fullscreen
          onSegmentClick={onSegmentClick}
          onIncomeLineClick={onIncomeLineClick}
        />
        <AnalyticsCategoryLegend
          categories={data.categories}
          soloCategory={soloCategory}
          hiddenCategories={hiddenCategories}
          subcategoryBreakdown={
            soloCategory && drilldown?.parentCategory === soloCategory
              ? drilldown.categories
              : undefined
          }
          onToggleCategory={onToggleCategory}
          onToggleVisibility={onToggleVisibility}
          onShowAll={onShowAllCategories}
        />
      </div>
    </div>
  );
}

function ChartView({
  data,
  soloCategory,
  hiddenCategories,
  drilldown = null,
  drilldownLoading = false,
  timeGranularity = "month",
  stackBy = "category",
  amountFilterActive = false,
  fullscreen = false,
  fill = false,
  onSegmentClick,
  onIncomeLineClick,
}: {
  data: MonthlyStacksResponse;
  soloCategory?: string | null;
  hiddenCategories?: ReadonlySet<string>;
  drilldown?: MonthlyStacksResponse | null;
  drilldownLoading?: boolean;
  timeGranularity?: ChartTimeGranularity;
  stackBy?: ChartStackBy;
  amountFilterActive?: boolean;
  fullscreen?: boolean;
  /** Size SVG to parent box (analytics fill layout). */
  fill?: boolean;
  onSegmentClick?: (segment: {
    name: string;
    level: "category" | "subcategory" | "discretionary";
    monthKey: string;
  }) => void;
  onIncomeLineClick?: () => void;
}) {
  const sizeToParent = fill || fullscreen;
  const [barTip, setBarTip] = useState<{
    clientX: number;
    clientY: number;
    name: string;
    periodLabel: string;
    amount: number;
    pct: number;
    color: string;
    currency: string;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const shineId = useId().replace(/:/g, "");
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 1100,
    h: sizeToParent ? CHART_HEIGHT_FULL_INIT : CHART_HEIGHT,
  });
  const [showRefLineLabels, setShowRefLineLabels] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const h = sizeToParent
        ? Math.max(fill ? 220 : CHART_HEIGHT_FULL_MIN, Math.floor(r.height))
        : CHART_HEIGHT;
      setSize({ w: Math.max(fill ? 280 : 640, Math.floor(r.width)), h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sizeToParent, fill]);

  const { months: rawMonths, primaryCurrency, avgMonthlyIncomeLast12, avgMonthlySpendLast12, categories } = data;
  const hidden = hiddenCategories ?? new Set<string>();
  const categoryFilterActive = soloCategory != null;
  const visibilityFilterActive = hidden.size > 0;
  const usingSubcategoryStacks =
    categoryFilterActive &&
    soloCategory != null &&
    !hidden.has(soloCategory) &&
    drilldown?.parentCategory === soloCategory &&
    drilldown.months.length > 0;

  const monthsMonthly = useMemo(() => {
    const visibleBase = filterMonthsByHiddenCategories(rawMonths, hidden);
    if (usingSubcategoryStacks && drilldown) return drilldown.months;
    return filterMonthsBySoloCategory(visibleBase, soloCategory ?? null);
  }, [rawMonths, soloCategory, usingSubcategoryStacks, drilldown, hidden]);

  const monthsGranularity = useMemo(
    () => applyTimeGranularity(monthsMonthly, timeGranularity),
    [monthsMonthly, timeGranularity],
  );

  const months = useMemo(
    () => applyStackBy(monthsGranularity, stackBy),
    [monthsGranularity, stackBy],
  );

  const segmentLevel: "category" | "subcategory" | "discretionary" =
    stackBy === "discretionary"
      ? "discretionary"
      : usingSubcategoryStacks
        ? "subcategory"
        : "category";

  const legendCategories = usingSubcategoryStacks && drilldown
    ? drilldown.categories
    : categories;

  const gradientCategories = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of legendCategories) map.set(c.name, c.color);
    for (const m of months) {
      for (const s of m.segments) {
        if (!map.has(s.name)) map.set(s.name, s.color);
      }
    }
    return Array.from(map.entries()).map(([name, color]) => ({ name, color }));
  }, [legendCategories, months]);

  const denseBars = months.length > DENSE_BAR_THRESHOLD || timeGranularity === "day";
  const padL = fullscreen ? 64 : 56;
  const padR = 16;
  const padT = fullscreen ? 12 : 6;
  const padB =
    timeGranularity === "day"
      ? fullscreen
        ? 48
        : 44
      : timeGranularity === "year"
        ? fullscreen
          ? 40
          : 36
        : fullscreen
          ? 58
          : 52;
  const innerW = size.w - padL - padR;
  const innerH = size.h - padT - padB;
  const barGeometries = useMemo(
    () => computeBarGeometries(months.length, padL, innerW, denseBars, fullscreen),
    [months.length, padL, innerW, denseBars, fullscreen],
  );
  const denseLabelStride =
    timeGranularity === "day"
      ? (barGeometries[0]?.barW ?? 0) < 12
        ? 5
        : (barGeometries[0]?.barW ?? 0) < 18
          ? 3
          : 2
      : denseBars && (barGeometries[0]?.barW ?? 0) < 14
        ? 3
        : denseBars && (barGeometries[0]?.barW ?? 0) < 22
          ? 2
          : 1;
  const axisFont = fullscreen ? 12 : 10;
  const monthFont = denseBars ? (fullscreen ? 9 : 8) : fullscreen ? 11 : 10;
  const monthYearFont = fullscreen ? 11 : 10;
  const yearBands = useMemo(
    () =>
      timeGranularity === "month"
        ? computeYearBands(months, barGeometries)
        : [],
    [timeGranularity, months, barGeometries],
  );

  /** Scale to filtered bar totals only when a category slicer is active. */
  const refSpendRaw = avgMonthlySpendLast12 ?? 0;
  const refIncomeRaw = avgMonthlyIncomeLast12 ?? 0;
  const refSpendValue = timeGranularity === "year" ? refSpendRaw * 12 : refSpendRaw;
  const refIncomeValue = timeGranularity === "year" ? refIncomeRaw * 12 : refIncomeRaw;

  const yMaxRaw = useMemo(() => {
    const barMax = Math.max(0, ...months.map((m) => m.total));
    // Solo or legend-hide filters: scale only to visible stacks so the chart fills vertically.
    // Daily Walk / Yearly: always scale to bars only (no income/spend reference envelope).
    if (
      categoryFilterActive ||
      visibilityFilterActive ||
      amountFilterActive ||
      timeGranularity === "year" ||
      timeGranularity === "day"
    ) {
      return barMax;
    }
    return Math.max(barMax, refIncomeValue, refSpendValue);
  }, [
    months,
    refIncomeValue,
    refSpendValue,
    categoryFilterActive,
    visibilityFilterActive,
    amountFilterActive,
    timeGranularity,
  ]);
  const yScale = useMemo(() => tightYScale(yMaxRaw, innerH), [yMaxRaw, innerH]);
  const yToPx = (v: number) => padT + innerH - (v / yScale.top) * innerH;

  /** Reference lines: last 12 months (monthly) or last 14 days (daily walk). */
  const refBarsCount =
    timeGranularity === "day"
      ? Math.min(14, months.length)
      : Math.min(REF_AVG_MONTHS, months.length);
  const refFirstIdx =
    timeGranularity === "year"
      ? Math.max(0, months.length - 1)
      : months.length - refBarsCount;
  const refX1 = barGeometries[refFirstIdx]?.x ?? padL;
  const refX2 =
    barGeometries[months.length - 1] != null
      ? barGeometries[months.length - 1].x + barGeometries[months.length - 1].barW
      : padL + innerW;
  const showRefLines =
    !categoryFilterActive &&
    !visibilityFilterActive &&
    !amountFilterActive &&
    timeGranularity === "month";
  const incomeY = showRefLines && refIncomeValue > 0 ? yToPx(refIncomeValue) : null;
  const spendY = showRefLines && refSpendValue > 0 ? yToPx(refSpendValue) : null;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative w-full",
        sizeToParent && "flex min-h-0 flex-1 flex-col",
      )}
    >
      {categoryFilterActive && drilldownLoading && !usingSubcategoryStacks ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-chart-overlay backdrop-blur-[1px]">
          <span className="rounded-lg border border-chart-border bg-chart-surface px-3 py-1.5 text-xs text-muted-foreground">
            Loading subcategory breakdown…
          </span>
        </div>
      ) : null}
      <div className={cn("relative w-full", sizeToParent && "min-h-0 flex-1")}>
        <svg
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          role="img"
          aria-label={
            timeGranularity === "day"
              ? "Daily Walk — last 60 days stacked spend"
              : timeGranularity === "year"
                ? "Yearly stacked spend by category"
                : "Monthly stacked spend by category"
          }
          className={cn("block", fill && "h-full w-full max-h-full")}
        >
            <defs>
              <linearGradient id={`msb-shine-${shineId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
              {gradientCategories.map((c) => (
                <linearGradient
                  key={c.name}
                  id={analyticsCategoryGradientId(c.name)}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={analyticsCategoryGradientTop(c.color)} />
                  <stop offset="55%" stopColor={c.color} />
                  <stop offset="100%" stopColor={c.color} stopOpacity={0.88} />
                </linearGradient>
              ))}
            </defs>

            {/* Y-axis gridlines + labels — only at values the data reaches */}
            {yScale.tickValues.map((v, i) => {
              const y = yToPx(v);
              const hideLabel =
                showRefLineLabels &&
                ((spendY != null && Math.abs(y - spendY) < 10) ||
                  (incomeY != null && Math.abs(y - incomeY) < 10));
              return (
                <g key={`g-${v}`}>
                  <line
                    x1={padL}
                    x2={size.w - padR}
                    y1={y}
                    y2={y}
                    stroke="var(--chart-grid)"
                    strokeDasharray={i === 0 ? undefined : "3 4"}
                    strokeWidth={1}
                  />
                  {!hideLabel && (
                    <text
                      x={padL - 8}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-chart-axis"
                      style={{ fontSize: axisFont, fontWeight: 600 }}
                    >
                      {compact(v)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Income reference line — drawn BEHIND the bars so they sit on top.
             *  Spans the rightmost REF_AVG_MONTHS bars. Layered
             *  stroke (wide soft halo + crisp neon core) so it stays
             *  unmistakable even where bars cover most of its length. */}
            {spendY != null && refSpendValue > 0 && (
              <g pointerEvents="none">
                <line
                  x1={refX1}
                  x2={refX2}
                  y1={spendY}
                  y2={spendY}
                  stroke={REF_LINE_SPEND}
                  strokeWidth={10}
                  strokeLinecap="round"
                  opacity={0.18}
                />
                <line
                  x1={refX1}
                  x2={refX2}
                  y1={spendY}
                  y2={spendY}
                  stroke={REF_LINE_SPEND}
                  strokeWidth={5}
                  strokeLinecap="round"
                  opacity={0.45}
                />
                <line
                  x1={refX1}
                  x2={refX2}
                  y1={spendY}
                  y2={spendY}
                  stroke={REF_LINE_SPEND}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  opacity={1}
                />
              </g>
            )}

            {incomeY != null && refIncomeValue > 0 && (
              <g pointerEvents="none">
                {/* Outer soft halo */}
                <line
                  x1={refX1}
                  x2={refX2}
                  y1={incomeY}
                  y2={incomeY}
                  stroke={REF_LINE_INCOME}
                  strokeWidth={10}
                  strokeLinecap="round"
                  opacity={0.18}
                />
                {/* Mid halo */}
                <line
                  x1={refX1}
                  x2={refX2}
                  y1={incomeY}
                  y2={incomeY}
                  stroke={REF_LINE_INCOME}
                  strokeWidth={5}
                  strokeLinecap="round"
                  opacity={0.45}
                />
                {/* Crisp neon core */}
                <line
                  x1={refX1}
                  x2={refX2}
                  y1={incomeY}
                  y2={incomeY}
                  stroke={REF_LINE_INCOME}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  opacity={1}
                />
              </g>
            )}

            {/* Stacks */}
            {months.map((m, i) => {
              const { cx, x, barW } = barGeometries[i] ?? { cx: padL, x: padL, barW: 4 };
              return (
                <MonthBar
                  key={m.month}
                  month={m}
                  x={x}
                  cx={cx}
                  barW={barW}
                  yTop={padT}
                  yBottom={padT + innerH}
                  yToPx={yToPx}
                  currency={primaryCurrency}
                  shineId={shineId}
                  segmentLevel={segmentLevel}
                  timeGranularity={timeGranularity}
                  parentCategory={usingSubcategoryStacks ? (soloCategory ?? undefined) : undefined}
                  onSegmentOpen={(detail) => {
                    setBarTip(null);
                    onSegmentClick?.({
                      name: detail.value,
                      level: detail.level,
                      monthKey: detail.monthKey,
                    });
                  }}
                  onSegmentHover={(tip) => setBarTip(tip)}
                  onSegmentLeave={() => setBarTip(null)}
                  hideLabels={denseBars}
                  hideEmptyMarker={denseBars && timeGranularity !== "day"}
                  showWalkFootprint={timeGranularity === "day"}
                  barRadius={denseBars ? Math.min(2, barW / 3) : 4}
                  segmentLabelMin={fullscreen ? 12 : 14}
                  barLabelFont={fullscreen ? 11 : 9.5}
                  totalFont={fullscreen ? 12 : 10.5}
                />
              );
            })}

            {/* Reference-line hover targets (above bars) + colored Y-axis callouts */}
            {spendY != null && refSpendValue > 0 && (
              <g>
                <line
                  x1={refX1}
                  x2={refX2}
                  y1={spendY}
                  y2={spendY}
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: "default" }}
                  onMouseEnter={() => setShowRefLineLabels(true)}
                  onMouseLeave={() => setShowRefLineLabels(false)}
                />
                {showRefLineLabels && (
                  <text
                    x={padL - 8}
                    y={spendY + 3}
                    textAnchor="end"
                    fill={REF_LINE_SPEND}
                    style={{ fontSize: axisFont, fontWeight: 700 }}
                    pointerEvents="none"
                  >
                    {compact(refSpendValue)}
                  </text>
                )}
              </g>
            )}
            {incomeY != null && refIncomeValue > 0 && (
              <g>
                <line
                  x1={refX1}
                  x2={refX2}
                  y1={incomeY}
                  y2={incomeY}
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: onIncomeLineClick ? "pointer" : "default" }}
                  onMouseEnter={() => setShowRefLineLabels(true)}
                  onMouseLeave={() => setShowRefLineLabels(false)}
                  onClick={(e) => {
                    if (!onIncomeLineClick) return;
                    e.stopPropagation();
                    onIncomeLineClick();
                  }}
                />
                {showRefLineLabels && (
                  <text
                    x={padL - 8}
                    y={incomeY + 3}
                    textAnchor="end"
                    fill={REF_LINE_INCOME}
                    style={{ fontSize: axisFont, fontWeight: 700 }}
                    pointerEvents="none"
                  >
                    {compact(refIncomeValue)}
                  </text>
                )}
              </g>
            )}

            {/* X-axis period labels */}
            {months.map((m, i) => {
              const cx = barGeometries[i]?.cx ?? padL;
              if (timeGranularity === "year") {
                const label = formatPeriodKeyLabel(m.month);
                return (
                  <text
                    key={`lbl-${m.month}`}
                    x={cx}
                    y={size.h - padB + 18}
                    textAnchor="middle"
                    className="fill-chart-label"
                    style={{ fontSize: monthFont + 1, fontWeight: 700 }}
                  >
                    {label}
                  </text>
                );
              }
              if (timeGranularity === "day") {
                if (i % denseLabelStride !== 0) return null;
                const dayNum = dayLabelShort(m.month);
                const showMonth = denseDayShowsMonth(m.month, i, months);
                return (
                  <g key={`lbl-${m.month}`}>
                    <text
                      x={cx}
                      y={size.h - padB + 14}
                      textAnchor="middle"
                      className="fill-chart-label"
                      style={{ fontSize: monthFont, fontWeight: 700 }}
                    >
                      {dayNum}
                    </text>
                    {showMonth ? (
                      <text
                        x={cx}
                        y={size.h - padB + 26}
                        textAnchor="middle"
                        className="fill-[#5DD3F3]/80"
                        style={{ fontSize: Math.max(8, monthFont - 1), fontWeight: 600 }}
                      >
                        {monthLabelFromDayKey(m.month)}
                      </text>
                    ) : null}
                  </g>
                );
              }
              /* Monthly: month abbreviation on top; years rendered as bands below */
              if (denseBars && i % denseLabelStride !== 0) return null;
              const short = denseBars
                ? monthLabelShort(m.month)
                : monthLabel(m.month).line1.slice(0, 3);
              return (
                <text
                  key={`lbl-${m.month}`}
                  x={cx}
                  y={size.h - padB + 14}
                  textAnchor="middle"
                  className="fill-chart-label"
                  style={{ fontSize: monthFont, fontWeight: 600 }}
                >
                  {short}
                </text>
              );
            })}

            {/* Year row + year delimiters (monthly) */}
            {yearBands.map((band, bi) => {
              const yearY = size.h - padB + 30;
              const tickTop = size.h - padB + 4;
              const tickBot = size.h - padB + 36;
              return (
                <g key={`year-band-${band.year}`}>
                  {bi > 0 ? (
                    <line
                      x1={band.startX - DENSE_BAR_GAP_PX / 2}
                      x2={band.startX - DENSE_BAR_GAP_PX / 2}
                      y1={tickTop}
                      y2={tickBot}
                      className="stroke-chart-border"
                      strokeWidth={1}
                      strokeOpacity={0.85}
                      pointerEvents="none"
                    />
                  ) : null}
                  <text
                    x={band.midX}
                    y={yearY}
                    textAnchor="middle"
                    className="fill-[#5DD3F3]"
                    style={{ fontSize: monthYearFont, fontWeight: 700, letterSpacing: "0.04em" }}
                  >
                    {band.year}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>

      {typeof document !== "undefined" &&
        barTip &&
        createPortal(
          <div
            role="tooltip"
            className={cn(
              chartTooltipShellClass,
              "pointer-events-none fixed z-[90] min-w-[10.5rem] max-w-[16rem] rounded-xl border px-3 py-2",
            )}
            style={{
              left: Math.min(barTip.clientX + 14, window.innerWidth - 200),
              top: Math.max(8, barTip.clientY - 12),
              transform: "translateY(-100%)",
            }}
          >
            <div className="min-w-0">
                <p
                  className="truncate text-[12px] font-semibold capitalize leading-tight"
                  style={{ color: barTip.color }}
                >
                  {barTip.name}
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-[13px] font-extrabold tabular-nums text-foreground">
                    {formatCurrency(barTip.amount, barTip.currency)}
                  </span>
                  <span className="text-[11px] font-bold tabular-nums text-[#34E6B0]">
                    {barTip.pct < 0.1 && barTip.pct > 0
                      ? "<0.1%"
                      : `${barTip.pct < 10 ? barTip.pct.toFixed(1) : Math.round(barTip.pct)}%`}
                    <span className="ml-0.5 font-medium text-white">
                      of {barTip.periodLabel}
                    </span>
                  </span>
                </div>
              </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Renders one stacked month column. Segment click opens transactions for that category × period.
 */
function MonthBar({
  month,
  x,
  cx,
  barW,
  yTop,
  yBottom,
  yToPx,
  currency,
  shineId,
  segmentLevel = "category",
  timeGranularity = "month",
  parentCategory,
  onSegmentOpen,
  onSegmentHover,
  onSegmentLeave,
  hideLabels = false,
  barRadius = 4,
  hideEmptyMarker = false,
  showWalkFootprint = false,
  segmentLabelMin = 14,
  barLabelFont = 9.5,
  totalFont = 10.5,
}: {
  month: MonthlyStack;
  x: number;
  cx: number;
  barW: number;
  yTop: number;
  yBottom: number;
  yToPx: (v: number) => number;
  currency: string;
  onSegmentOpen: (detail: {
    entity: "category" | "discretionary";
    value: string;
    label: string;
    accent: string;
    currency: string;
    month?: string;
    year?: string;
    monthKey: string;
    level: "category" | "subcategory" | "discretionary";
    parentCategory?: string;
  }) => void;
  onSegmentHover?: (tip: {
    clientX: number;
    clientY: number;
    name: string;
    periodLabel: string;
    amount: number;
    pct: number;
    color: string;
    currency: string;
  }) => void;
  onSegmentLeave?: () => void;
  shineId: string;
  segmentLevel?: "category" | "subcategory" | "discretionary";
  timeGranularity?: ChartTimeGranularity;
  parentCategory?: string;
  hideLabels?: boolean;
  barRadius?: number;
  hideEmptyMarker?: boolean;
  showWalkFootprint?: boolean;
  segmentLabelMin?: number;
  barLabelFont?: number;
  totalFont?: number;
}) {
  if (month.total <= 0) {
    if (showWalkFootprint) {
      const rx = Math.max(1.6, Math.min(3.2, barW * 0.45));
      return (
        <g className="dw-footprint" opacity={0.55}>
          <ellipse
            cx={cx - rx * 0.35}
            cy={yBottom - 4}
            rx={rx}
            ry={rx * 0.55}
            fill="rgba(93,211,243,0.55)"
            transform={`rotate(-18 ${cx - rx * 0.35} ${yBottom - 4})`}
          />
          <ellipse
            cx={cx + rx * 0.4}
            cy={yBottom - 2.5}
            rx={rx * 0.85}
            ry={rx * 0.48}
            fill="rgba(242,201,76,0.4)"
            transform={`rotate(22 ${cx + rx * 0.4} ${yBottom - 2.5})`}
          />
        </g>
      );
    }
    if (hideEmptyMarker) return null;
    return (
      <text
        x={cx}
        y={yBottom - 4}
        textAnchor="middle"
        className="fill-chart-label-muted"
        style={{ fontSize: 9, fontStyle: "italic" }}
      >
        —
      </text>
    );
  }

  /** Stack from bottom up. Pre-compute pixel rects so labels can be placed accurately. */
  let cursorVal = 0;
  const stackRects = month.segments.map((s) => {
    const yStart = yToPx(cursorVal);
    cursorVal += s.amount;
    const yEnd = yToPx(cursorVal);
    return { seg: s, yEnd, yStart, h: Math.max(0, yStart - yEnd) };
  });

  /** Total label sits above the top segment. */
  const topY = yToPx(month.total);
  const periodLabel = formatPeriodKeyLabel(month.month);

  const emitHover = (
    e: ReactMouseEvent,
    seg: MonthlyStackSegment,
  ) => {
    if (!onSegmentHover) return;
    const pct = month.total > 0 ? (seg.amount / month.total) * 100 : 0;
    onSegmentHover({
      clientX: e.clientX,
      clientY: e.clientY,
      name: seg.name,
      periodLabel,
      amount: seg.amount,
      pct,
      color: seg.color,
      currency,
    });
  };

  return (
    <g>
      {/* Segments (bottom up) */}
      {stackRects.map(({ seg, yEnd, h }, idx) => {
        if (h < 0.5) return null;
        const rectY = yEnd; // y of the segment's TOP edge
        const isTop = idx === stackRects.length - 1;
        const showLabel = !hideLabels && h >= segmentLabelMin && barW >= 26;
        const labelText = compact(seg.amount);
        return (
          <g
            key={`${month.month}-${seg.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onSegmentOpen({
                entity: segmentLevel === "discretionary" ? "discretionary" : "category",
                value: seg.name,
                label: `${seg.name} · ${periodLabel}`,
                accent: seg.color,
                currency,
                month: timeGranularity === "year" ? undefined : month.month,
                year: timeGranularity === "year" ? month.month : undefined,
                monthKey: month.month,
                level: segmentLevel,
                parentCategory,
              });
            }}
            onMouseEnter={(e) => emitHover(e, seg)}
            onMouseMove={(e) => emitHover(e, seg)}
            onMouseLeave={() => onSegmentLeave?.()}
            style={{ cursor: "pointer" }}
          >
            <rect
              x={x}
              y={rectY}
              width={barW}
              height={h}
              fill={`url(#${analyticsCategoryGradientId(seg.name)})`}
              rx={isTop ? barRadius : 0}
              ry={isTop ? barRadius : 0}
            />
            {/* Inner highlight for depth */}
            <rect
              x={x}
              y={rectY}
              width={barW}
              height={Math.min(h, 8)}
              fill={`url(#msb-shine-${shineId})`}
              opacity={0.4}
              rx={isTop ? barRadius : 0}
              ry={isTop ? barRadius : 0}
              pointerEvents="none"
            />
            {showLabel && (
              <text
                x={x + barW / 2}
                y={rectY + h / 2 + 3}
                textAnchor="middle"
                pointerEvents="none"
                style={{
                  fontSize: barLabelFont,
                  fontWeight: 700,
                  fill: "white",
                  textShadow: "0 1px 2px rgba(0,0,0,0.55)",
                  letterSpacing: "0.01em",
                }}
              >
                {labelText}
              </text>
            )}
            {/* Tiny faded hairline between segments for separation */}
            {!isTop && (
              <line
                x1={x}
                x2={x + barW}
                y1={rectY}
                y2={rectY}
                stroke="rgba(0,0,0,0.32)"
                strokeWidth={0.6}
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}

      {/* Total — inside tall stacks; above short stacks */}
      {!hideLabels &&
        (() => {
          const barPx = yBottom - topY;
          const inside = barPx >= 28;
          return (
            <text
              x={cx}
              y={inside ? topY + totalFont + 2 : Math.max(yTop + totalFont + 2, topY - 4)}
              textAnchor="middle"
              style={{
                fontSize: totalFont,
                fontWeight: 800,
                fill: "var(--chart-label)",
                letterSpacing: "0.01em",
                paintOrder: "stroke",
                stroke: "var(--chart-surface)",
                strokeWidth: inside ? 3 : 2.5,
              }}
            >
              {compact(month.total)}
            </text>
          );
        })()}
    </g>
  );
}
