"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { CalendarRange, CalendarDays, Maximize2, X } from "lucide-react";
import type {
  MonthlyStack,
  MonthlyStackSegment,
  MonthlyStacksResponse,
} from "@/app/api/analytics/monthly-stacks/route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { AnalyticsDetailTooltip, detailTipAnchorFromEvent } from "@/components/analytics-detail-tooltip";
import { useAnalyticsDetail } from "@/components/use-analytics-detail";
import { CategoryTransactionsModal } from "@/components/category-transactions-modal";
import { AnalyticsCategoryLegend } from "@/components/analytics-category-legend";
import {
  analyticsCategoryGradientId,
  analyticsCategoryGradientTop,
} from "@/lib/analytics-category-colors";
import { periodKeyToDateRange, formatPeriodKeyLabel } from "@/lib/month-date-range";
import {
  chartChipClass,
  chartIconBadgeClass,
  chartMutedClass,
  chartOverlayClass,
  chartOverlayPillClass,
  chartTitleClass,
} from "@/lib/chart-ui";
import { cn } from "@/lib/utils";

const REF_LINE_INCOME = "#39FF14";
const REF_LINE_SPEND = "#FF4444";
const REF_AVG_MONTHS = 12;
const DEFAULT_MONTHS = 72;
const CHART_HEIGHT = 660;
const CHART_HEIGHT_FULL_INIT = 900;
const CHART_HEIGHT_FULL_MIN = 540;
const DENSE_BAR_THRESHOLD = 20;
/** ~0.5mm gap between bars in dense mode (2px at standard density). */
const DENSE_BAR_GAP_PX = 2;
const GRANULARITY_STORAGE_KEY = "fintrk-monthly-stack-granularity";
const STACK_BY_STORAGE_KEY = "fintrk-monthly-stack-by";

export type ChartTimeGranularity = "month" | "year";
export type ChartStackBy = "value" | "category";

function readStoredGranularity(): ChartTimeGranularity {
  if (typeof window === "undefined") return "month";
  try {
    const v = window.localStorage.getItem(GRANULARITY_STORAGE_KEY);
    return v === "year" ? "year" : "month";
  } catch {
    return "month";
  }
}

function writeStoredGranularity(value: ChartTimeGranularity) {
  try {
    window.localStorage.setItem(GRANULARITY_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function readStoredStackBy(): ChartStackBy {
  if (typeof window === "undefined") return "value";
  try {
    const v = window.localStorage.getItem(STACK_BY_STORAGE_KEY);
    return v === "category" ? "category" : "value";
  } catch {
    return "value";
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
  if (stackBy === "value") {
    return [...segments].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
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
  return granularity === "year" ? aggregateMonthsToYears(months) : months;
}

function monthLabelShort(mk: string): string {
  const [y, m] = mk.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function denseMonthShowsYear(mk: string, index: number, months: MonthlyStack[]): boolean {
  if (index === 0) return true;
  const prev = months[index - 1]?.month;
  return !prev || mk.slice(0, 4) !== prev.slice(0, 4);
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

export function MonthlyStackedSpend({ months: monthsCount = DEFAULT_MONTHS }: { months?: number }) {
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
    level: "category" | "subcategory";
    monthKey: string;
  } | null>(null);
  const [timeGranularity, setTimeGranularity] = useState<ChartTimeGranularity>("month");
  const [stackBy, setStackBy] = useState<ChartStackBy>("value");

  useEffect(() => {
    setTimeGranularity(readStoredGranularity());
    setStackBy(readStoredStackBy());
  }, []);

  const onTimeGranularityChange = useCallback((next: ChartTimeGranularity) => {
    setTimeGranularity(next);
    writeStoredGranularity(next);
  }, []);

  const onStackByChange = useCallback((next: ChartStackBy) => {
    setStackBy(next);
    writeStoredStackBy(next);
  }, []);

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

  const openSegmentModal = useCallback(
    (segment: { name: string; level: "category" | "subcategory"; monthKey: string }) => {
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
    fetch(
      `/api/analytics/monthly-stacks?months=${monthsCount}&category=${encodeURIComponent(soloCategory)}`,
    )
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
  }, [soloCategory, monthsCount]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/analytics/monthly-stacks?months=${monthsCount}`)
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
  }, [monthsCount]);

  const headerChartControls = {
    timeGranularity,
    onTimeGranularityChange,
    stackBy,
    onStackByChange,
  };

  if (loading && !data) {
    return (
      <Card className="border-chart-border bg-chart-surface text-card-foreground shadow-chart">
        <ChartCardHeader {...headerChartControls} />
        <CardContent className="overflow-visible pt-0">
          <div className="flex h-[660px] items-center justify-center text-sm text-muted-foreground">
            Loading monthly breakdown…
          </div>
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card className="border-chart-border bg-chart-surface text-card-foreground shadow-chart">
        <ChartCardHeader {...headerChartControls} />
        <CardContent className="overflow-visible pt-0">
          <div className="flex h-[660px] items-center justify-center text-sm text-rose-300/80">
            {error ?? "Failed to load monthly breakdown."}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (data.months.every((m) => m.total === 0)) {
    return (
      <Card className="border-chart-border bg-chart-surface text-card-foreground shadow-chart">
        <ChartCardHeader {...headerChartControls} />
        <CardContent className="overflow-visible pt-0">
          <div className="flex h-[660px] items-center justify-center text-sm text-muted-foreground">
            No spending in the selected window.
          </div>
          <AnalyticsCategoryLegend
            categories={data.categories}
            compact
            soloCategory={soloCategory}
            hiddenCategories={hiddenCategories}
            onToggleCategory={toggleCategory}
            onToggleVisibility={toggleCategoryVisibility}
            onShowAll={showAllCategories}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-chart-border bg-chart-surface text-card-foreground shadow-chart">
      <ChartCardHeader
        onExpand={() => setExpanded(true)}
        avgMonthlySpendLast12={soloCategory ? null : data.avgMonthlySpendLast12}
        avgMonthlyIncomeLast12={soloCategory ? null : data.avgMonthlyIncomeLast12}
        {...headerChartControls}
      />
      <CardContent className="overflow-visible pt-0">
        <ChartView
          data={data}
          soloCategory={soloCategory}
          hiddenCategories={hiddenCategories}
          drilldown={drilldown}
          drilldownLoading={drilldownLoading}
          timeGranularity={timeGranularity}
          stackBy={stackBy}
          onSegmentClick={openSegmentModal}
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
          onToggleCategory={toggleCategory}
          onToggleVisibility={toggleCategoryVisibility}
          onShowAll={showAllCategories}
        />
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
            onClose={() => setSegmentModal(null)}
          />,
          document.body,
        )}
      {expanded &&
        typeof document !== "undefined" &&
        createPortal(
          <FullscreenChartModal
            data={data}
            soloCategory={soloCategory}
            hiddenCategories={hiddenCategories}
            drilldown={drilldown}
            drilldownLoading={drilldownLoading}
            timeGranularity={timeGranularity}
            onTimeGranularityChange={onTimeGranularityChange}
            stackBy={stackBy}
            onStackByChange={onStackByChange}
            onToggleCategory={toggleCategory}
            onToggleVisibility={toggleCategoryVisibility}
            onShowAllCategories={showAllCategories}
            onClose={() => setExpanded(false)}
            onSegmentClick={openSegmentModal}
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
}: {
  avgMonthlySpendLast12: number | null | undefined;
  avgMonthlyIncomeLast12: number | null | undefined;
  timeGranularity?: ChartTimeGranularity;
}) {
  if (timeGranularity === "year") return null;

  const showSpend = avgMonthlySpendLast12 != null && avgMonthlySpendLast12 > 0;
  const showIncome = avgMonthlyIncomeLast12 != null && avgMonthlyIncomeLast12 > 0;
  if (!showSpend && !showIncome) return null;

  const spendLabel = "Avg spend · last 12 mo";
  const incomeLabel = "Avg income · last 12 mo";

  return (
    <div className="flex items-center gap-3" aria-hidden>
      {showSpend ? (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold leading-none text-[#FFB4B4]">
          <span
            className="inline-block h-[2px] w-4 shrink-0 rounded-full bg-[#FF4444]"
            style={{ boxShadow: "0 0 6px rgba(255,68,68,0.7)" }}
          />
          <span>{spendLabel}</span>
        </div>
      ) : null}
      {showIncome ? (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold leading-none text-[#9DFFB0]">
          <span
            className="inline-block h-[2px] w-4 shrink-0 rounded-full bg-[#39FF14]"
            style={{ boxShadow: "0 0 6px rgba(57,255,20,0.55)" }}
          />
          <span>{incomeLabel}</span>
        </div>
      ) : null}
    </div>
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
        "pointer-events-auto inline-flex rounded-lg border border-chart-border bg-chart-surface/92 p-0.5 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.55)] backdrop-blur-md ring-1 ring-white/[0.04]",
        className,
      )}
    >
      {(
        [
          { id: "month" as const, label: "Monthly", Icon: CalendarDays },
          { id: "year" as const, label: "Yearly", Icon: CalendarRange },
        ] as const
      ).map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            title={id === "year" ? "Stack by calendar year (current year = YTD)" : "One bar per month"}
            onClick={() => onChange(id)}
            className={cn(
              "relative inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-all duration-200",
              active
                ? "bg-[#0BC18D]/18 text-[#0BC18D] shadow-[0_0_16px_-6px_rgba(11,193,141,0.55)]"
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
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/80">
        Stack by
      </span>
      <div
        role="group"
        aria-label="Stack segments by"
        className="pointer-events-auto inline-flex rounded-lg border border-chart-border bg-chart-surface/92 p-0.5 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.55)] backdrop-blur-md ring-1 ring-white/[0.04]"
      >
        {(
          [
            { id: "value" as const, label: "Value" },
            { id: "category" as const, label: "Category" },
          ] as const
        ).map(({ id, label }) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              title={
                id === "category"
                  ? "Same category order in every bar (overall largest first)"
                  : "Largest segment at the bottom of each bar"
              }
              onClick={() => onChange(id)}
              className={cn(
                "relative inline-flex items-center rounded-md px-2 py-1 text-[10px] font-semibold transition-all duration-200",
                active
                  ? "bg-[#0BC18D]/18 text-[#0BC18D] shadow-[0_0_16px_-6px_rgba(11,193,141,0.55)]"
                  : "text-muted-foreground hover:bg-chart-hover hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExpandChartButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-lg border border-chart-border bg-chart-surface text-muted-foreground backdrop-blur-sm transition-colors hover:border-chart-border hover:bg-chart-hover hover:text-foreground"
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
  stackBy = "value",
  onStackByChange,
}: {
  onExpand?: () => void;
  avgMonthlySpendLast12?: number | null;
  avgMonthlyIncomeLast12?: number | null;
  timeGranularity?: ChartTimeGranularity;
  onTimeGranularityChange?: (next: ChartTimeGranularity) => void;
  stackBy?: ChartStackBy;
  onStackByChange?: (next: ChartStackBy) => void;
}) {
  return (
    <CardHeader className="relative flex min-h-[2.75rem] items-center justify-center pb-3 pt-0">
      <div className="absolute left-0 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2">
        {onTimeGranularityChange ? (
          <ChartTimeGranularityToggle
            value={timeGranularity}
            onChange={onTimeGranularityChange}
          />
        ) : null}
        {onStackByChange ? (
          <ChartStackByToggle value={stackBy} onChange={onStackByChange} />
        ) : null}
      </div>
      <CardTitle className="pointer-events-none text-center text-sm font-semibold text-foreground">
        <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#0BC18D]/30 to-[#5DD3F3]/20 ring-1 ring-chart-border">
            <CalendarRange className="h-4 w-4 text-[#0BC18D]" />
          </span>
          Spend by Category
        </span>
      </CardTitle>
      {onExpand ? (
        <div className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2.5">
          <ChartRefLineLegend
            avgMonthlySpendLast12={avgMonthlySpendLast12}
            avgMonthlyIncomeLast12={avgMonthlyIncomeLast12}
            timeGranularity={timeGranularity}
          />
          <ExpandChartButton onClick={onExpand} />
        </div>
      ) : null}
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
  onToggleCategory,
  onToggleVisibility,
  onShowAllCategories,
  onClose,
  onSegmentClick,
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
  onToggleCategory: (name: string) => void;
  onToggleVisibility: (name: string) => void;
  onShowAllCategories: () => void;
  onClose: () => void;
  onSegmentClick: (segment: { name: string; level: "category" | "subcategory"; monthKey: string }) => void;
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
      <div className="relative flex min-h-[3.25rem] shrink-0 items-center justify-center border-b border-chart-border px-5 py-3.5 sm:px-8">
        <div className="absolute left-5 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2 sm:left-8">
          <ChartTimeGranularityToggle
            value={timeGranularity}
            onChange={onTimeGranularityChange}
          />
          <ChartStackByToggle value={stackBy} onChange={onStackByChange} />
        </div>
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#0BC18D]/30 to-[#5DD3F3]/20 ring-1 ring-chart-border">
            <Maximize2 className="h-3.5 w-3.5 text-[#0BC18D]" />
          </span>
          Spend by Category
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg border border-chart-border bg-chart-muted text-muted-foreground transition-colors hover:bg-chart-hover hover:text-white sm:right-8"
          aria-label="Close expanded chart"
        >
          <X className="h-4 w-4" />
        </button>
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
          fullscreen
          onSegmentClick={onSegmentClick}
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
  stackBy = "value",
  fullscreen = false,
  onSegmentClick,
}: {
  data: MonthlyStacksResponse;
  soloCategory?: string | null;
  hiddenCategories?: ReadonlySet<string>;
  drilldown?: MonthlyStacksResponse | null;
  drilldownLoading?: boolean;
  timeGranularity?: ChartTimeGranularity;
  stackBy?: ChartStackBy;
  fullscreen?: boolean;
  onSegmentClick?: (segment: { name: string; level: "category" | "subcategory"; monthKey: string }) => void;
}) {
  const { tip, open, scheduleClose, clearLeave } = useAnalyticsDetail();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const shineId = useId().replace(/:/g, "");
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 1100,
    h: fullscreen ? CHART_HEIGHT_FULL_INIT : CHART_HEIGHT,
  });
  const [showRefLineLabels, setShowRefLineLabels] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const legendReserve = 0;
      const h = fullscreen
        ? Math.max(CHART_HEIGHT_FULL_MIN, r.height - legendReserve)
        : CHART_HEIGHT;
      setSize({ w: Math.max(640, r.width), h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen]);

  const { months: rawMonths, primaryCurrency, avgMonthlyIncomeLast12, avgMonthlySpendLast12, categories } = data;
  const hidden = hiddenCategories ?? new Set<string>();
  const categoryFilterActive = soloCategory != null;
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

  const segmentLevel: "category" | "subcategory" = usingSubcategoryStacks
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

  const denseBars = months.length > DENSE_BAR_THRESHOLD;
  const padL = fullscreen ? 64 : 56;
  const padR = 16;
  const padT = fullscreen ? 12 : 6;
  const padB = denseBars ? (fullscreen ? 40 : 36) : fullscreen ? 64 : 52;
  const innerW = size.w - padL - padR;
  const innerH = size.h - padT - padB;
  const barGeometries = useMemo(
    () => computeBarGeometries(months.length, padL, innerW, denseBars, fullscreen),
    [months.length, padL, innerW, denseBars, fullscreen],
  );
  const denseLabelStride =
    denseBars && (barGeometries[0]?.barW ?? 0) < 14
      ? 3
      : denseBars && (barGeometries[0]?.barW ?? 0) < 22
        ? 2
        : 1;
  const axisFont = fullscreen ? 12 : 10;
  const monthFont = denseBars ? (fullscreen ? 9 : 8) : fullscreen ? 12 : 10;
  const monthYearFont = fullscreen ? 11 : 10;

  /** Scale to filtered bar totals only when a category slicer is active. */
  const refSpendRaw = avgMonthlySpendLast12 ?? 0;
  const refIncomeRaw = avgMonthlyIncomeLast12 ?? 0;
  const refSpendValue = timeGranularity === "year" ? refSpendRaw * 12 : refSpendRaw;
  const refIncomeValue = timeGranularity === "year" ? refIncomeRaw * 12 : refIncomeRaw;

  const yMaxRaw = useMemo(() => {
    const barMax = Math.max(0, ...months.map((m) => m.total));
    if (categoryFilterActive || timeGranularity === "year") return barMax;
    return Math.max(barMax, refIncomeValue, refSpendValue);
  }, [months, refIncomeValue, refSpendValue, categoryFilterActive, timeGranularity]);
  const yScale = useMemo(() => tightYScale(yMaxRaw, innerH), [yMaxRaw, innerH]);
  const yToPx = (v: number) => padT + innerH - (v / yScale.top) * innerH;

  /** Reference lines span the rightmost REF_AVG_MONTHS bars (monthly) or latest year bar. */
  const refBarsCount = Math.min(REF_AVG_MONTHS, months.length);
  const refFirstIdx =
    timeGranularity === "year"
      ? Math.max(0, months.length - 1)
      : months.length - refBarsCount;
  const refX1 = barGeometries[refFirstIdx]?.x ?? padL;
  const refX2 =
    barGeometries[months.length - 1] != null
      ? barGeometries[months.length - 1].x + barGeometries[months.length - 1].barW
      : padL + innerW;
  const showRefLines = !categoryFilterActive && timeGranularity === "month";
  const incomeY = showRefLines && refIncomeValue > 0 ? yToPx(refIncomeValue) : null;
  const spendY = showRefLines && refSpendValue > 0 ? yToPx(refSpendValue) : null;

  return (
    <div
      ref={wrapRef}
      className={`relative w-full ${fullscreen ? "flex min-h-0 flex-1 flex-col" : ""}`}
    >
      {categoryFilterActive && drilldownLoading && !usingSubcategoryStacks ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-chart-overlay backdrop-blur-[1px]">
          <span className="rounded-lg border border-chart-border bg-chart-surface px-3 py-1.5 text-xs text-muted-foreground">
            Loading subcategory breakdown…
          </span>
        </div>
      ) : null}
      <div className={`relative w-full ${fullscreen ? "min-h-0 flex-1" : ""}`}>
        <svg
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          role="img"
          aria-label={
            timeGranularity === "year"
              ? "Yearly stacked spend by category"
              : "Monthly stacked spend by category"
          }
          className="block"
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
                  open={open}
                  scheduleClose={scheduleClose}
                  shineId={shineId}
                  segmentLevel={segmentLevel}
                  timeGranularity={timeGranularity}
                  onSegmentClick={onSegmentClick}
                  hideLabels={denseBars}
                  hideEmptyMarker={denseBars}
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
                  style={{ cursor: "default" }}
                  onMouseEnter={() => setShowRefLineLabels(true)}
                  onMouseLeave={() => setShowRefLineLabels(false)}
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
              if (denseBars) {
                if (i % denseLabelStride !== 0) return null;
                const short = monthLabelShort(m.month);
                const showYear = denseMonthShowsYear(m.month, i, months);
                const label = showYear
                  ? `${short} '${m.month.slice(2, 4)}`
                  : short;
                return (
                  <text
                    key={`lbl-${m.month}`}
                    x={cx}
                    y={size.h - padB + 14}
                    textAnchor="middle"
                    className="fill-chart-label-muted"
                    style={{ fontSize: monthFont, fontWeight: 600 }}
                  >
                    {label}
                  </text>
                );
              }
              const lbl = monthLabel(m.month);
              return (
                <g key={`lbl-${m.month}`}>
                  <text
                    x={cx}
                    y={size.h - padB + 16}
                    textAnchor="middle"
                    className="fill-chart-label"
                    style={{ fontSize: monthFont, fontWeight: 600 }}
                  >
                    {lbl.line1}
                  </text>
                  <text
                    x={cx}
                    y={size.h - padB + 30}
                    textAnchor="middle"
                    className="fill-chart-label-muted"
                    style={{ fontSize: monthYearFont }}
                  >
                    {lbl.line2}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>

      {typeof document !== "undefined" &&
        tip &&
        createPortal(
          <AnalyticsDetailTooltip
            rect={tip.rect}
            clientX={tip.clientX}
            clientY={tip.clientY}
            avoidRect={tip.avoidRect}
            entity={tip.entity}
            label={tip.label}
            accentColor={tip.accent}
            data={tip.data}
            loading={tip.loading}
            errorMessage={tip.error}
            onMouseEnter={clearLeave}
            onMouseLeave={scheduleClose}
          />,
          document.body,
        )}
    </div>
  );
}

/**
 * Renders one stacked month column. Each segment is hoverable and opens the rich
 * AnalyticsDetailTooltip scoped to (category × month).
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
  open,
  scheduleClose,
  shineId,
  segmentLevel = "category",
  timeGranularity = "month",
  onSegmentClick,
  hideLabels = false,
  barRadius = 4,
  hideEmptyMarker = false,
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
  open: ReturnType<typeof useAnalyticsDetail>["open"];
  scheduleClose: ReturnType<typeof useAnalyticsDetail>["scheduleClose"];
  shineId: string;
  segmentLevel?: "category" | "subcategory";
  timeGranularity?: ChartTimeGranularity;
  onSegmentClick?: (segment: { name: string; level: "category" | "subcategory"; monthKey: string }) => void;
  hideLabels?: boolean;
  barRadius?: number;
  hideEmptyMarker?: boolean;
  segmentLabelMin?: number;
  barLabelFont?: number;
  totalFont?: number;
}) {
  if (month.total <= 0) {
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
            onMouseEnter={(e) => {
              const periodLabel = formatPeriodKeyLabel(month.month);
              void open({
                ...detailTipAnchorFromEvent(e),
                entity: "category",
                value: seg.name,
                label: `${seg.name} · ${periodLabel}`,
                accent: seg.color,
                month: timeGranularity === "month" ? month.month : undefined,
              });
            }}
            onMouseLeave={scheduleClose}
            onClick={(e) => {
              e.stopPropagation();
              scheduleClose();
              onSegmentClick?.({ name: seg.name, level: segmentLevel, monthKey: month.month });
            }}
            style={{ cursor: onSegmentClick ? "pointer" : "default" }}
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
      {/* Hidden formatter usage to keep tree-shaking happy */}
      <title>{`${monthLabel(month.month).line1} ${monthLabel(month.month).line2} • ${formatCurrency(month.total, currency)}`}</title>
    </g>
  );
}
