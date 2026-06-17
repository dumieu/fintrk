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
import { CalendarRange, Maximize2, X } from "lucide-react";
import type {
  MonthlyStack,
  MonthlyStacksResponse,
} from "@/app/api/analytics/monthly-stacks/route";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { AnalyticsDetailTooltip, detailTipAnchorFromEvent } from "@/components/analytics-detail-tooltip";
import { useAnalyticsDetail } from "@/components/use-analytics-detail";
import { CategoryTransactionsModal } from "@/components/category-transactions-modal";
import { AnalyticsCategoryLegend } from "@/components/analytics-category-legend";
import {
  analyticsCategoryGradientId,
  analyticsCategoryGradientTop,
} from "@/lib/analytics-category-colors";
import { monthKeyToDateRange } from "@/lib/month-date-range";
import {
  chartChipClass,
  chartIconBadgeClass,
  chartMutedClass,
  chartOverlayClass,
  chartOverlayPillClass,
  chartTitleClass,
} from "@/lib/chart-ui";

const REF_LINE_INCOME = "#39FF14";
const REF_LINE_SPEND = "#FF4444";
const DEFAULT_MONTHS = 72;
const CHART_HEIGHT = 660;
const CHART_HEIGHT_FULL_INIT = 900;
const CHART_HEIGHT_FULL_MIN = 540;
const DENSE_BAR_THRESHOLD = 20;
/** ~0.5mm gap between bars in dense mode (2px at standard density). */
const DENSE_BAR_GAP_PX = 2;

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

export function MonthlyStackedSpend({ months: monthsCount = DEFAULT_MONTHS }: { months?: number }) {
  const [data, setData] = useState<MonthlyStacksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [soloCategory, setSoloCategory] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<MonthlyStacksResponse | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [segmentModal, setSegmentModal] = useState<{
    name: string;
    level: "category" | "subcategory";
    monthKey: string;
  } | null>(null);

  const toggleCategory = useCallback((name: string) => {
    setSoloCategory((prev) => (prev === name ? null : name));
  }, []);

  const showAllCategories = useCallback(() => {
    setSoloCategory(null);
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

  if (loading && !data) {
    return (
      <Card className="border-chart-border bg-chart-surface text-card-foreground shadow-chart">
        <ChartCardHeader />
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
        <ChartCardHeader />
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
        <ChartCardHeader />
        <CardContent className="overflow-visible pt-0">
          <div className="flex h-[660px] items-center justify-center text-sm text-muted-foreground">
            No spending in the selected window.
          </div>
          <AnalyticsCategoryLegend
            categories={data.categories}
            compact
            soloCategory={soloCategory}
            onToggleCategory={toggleCategory}
            onShowAll={showAllCategories}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-chart-border bg-chart-surface text-card-foreground shadow-chart">
      <ChartCardHeader onExpand={() => setExpanded(true)} />
      <CardContent className="overflow-visible pt-0">
        <ChartView
          data={data}
          soloCategory={soloCategory}
          drilldown={drilldown}
          drilldownLoading={drilldownLoading}
          onSegmentClick={openSegmentModal}
        />
        <AnalyticsCategoryLegend
          categories={data.categories}
          avgSpend={data.avgMonthlySpendLast6}
          avgIncome={data.avgMonthlyIncomeLast6}
          soloCategory={soloCategory}
          subcategoryBreakdown={
            soloCategory && drilldown?.parentCategory === soloCategory
              ? drilldown.categories
              : undefined
          }
          onToggleCategory={toggleCategory}
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
              ...monthKeyToDateRange(segmentModal.monthKey),
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
            drilldown={drilldown}
            drilldownLoading={drilldownLoading}
            onToggleCategory={toggleCategory}
            onShowAllCategories={showAllCategories}
            onClose={() => setExpanded(false)}
            onSegmentClick={openSegmentModal}
          />,
          document.body,
        )}
    </Card>
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

function ChartCardHeader({ onExpand }: { onExpand?: () => void }) {
  return (
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#0BC18D]/30 to-[#5DD3F3]/20 ring-1 ring-chart-border">
          <CalendarRange className="h-4 w-4 text-[#0BC18D]" />
        </span>
        <span>Monthly Spend by Category</span>
      </CardTitle>
      {onExpand ? (
        <CardAction>
          <ExpandChartButton onClick={onExpand} />
        </CardAction>
      ) : null}
    </CardHeader>
  );
}

function FullscreenChartModal({
  data,
  soloCategory,
  drilldown,
  drilldownLoading,
  onToggleCategory,
  onShowAllCategories,
  onClose,
  onSegmentClick,
}: {
  data: MonthlyStacksResponse;
  soloCategory: string | null;
  drilldown: MonthlyStacksResponse | null;
  drilldownLoading: boolean;
  onToggleCategory: (name: string) => void;
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
      <div className="flex shrink-0 items-center justify-between border-b border-chart-border px-5 py-3.5 sm:px-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#0BC18D]/30 to-[#5DD3F3]/20 ring-1 ring-chart-border">
            <Maximize2 className="h-3.5 w-3.5 text-[#0BC18D]" />
          </span>
          Monthly Spend by Category
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-lg border border-chart-border bg-chart-muted text-muted-foreground transition-colors hover:bg-chart-hover hover:text-white"
          aria-label="Close expanded chart"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
        <ChartView
          data={data}
          soloCategory={soloCategory}
          drilldown={drilldown}
          drilldownLoading={drilldownLoading}
          fullscreen
          onSegmentClick={onSegmentClick}
        />
        <AnalyticsCategoryLegend
          categories={data.categories}
          avgSpend={data.avgMonthlySpendLast6}
          avgIncome={data.avgMonthlyIncomeLast6}
          soloCategory={soloCategory}
          subcategoryBreakdown={
            soloCategory && drilldown?.parentCategory === soloCategory
              ? drilldown.categories
              : undefined
          }
          onToggleCategory={onToggleCategory}
          onShowAll={onShowAllCategories}
        />
      </div>
    </div>
  );
}

function ChartView({
  data,
  soloCategory,
  drilldown = null,
  drilldownLoading = false,
  fullscreen = false,
  onSegmentClick,
}: {
  data: MonthlyStacksResponse;
  soloCategory?: string | null;
  drilldown?: MonthlyStacksResponse | null;
  drilldownLoading?: boolean;
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

  const { months: rawMonths, primaryCurrency, avgMonthlyIncomeLast6, avgMonthlySpendLast6, categories } = data;
  const categoryFilterActive = soloCategory != null;
  const usingSubcategoryStacks =
    categoryFilterActive &&
    drilldown?.parentCategory === soloCategory &&
    drilldown.months.length > 0;

  const months = useMemo(() => {
    if (usingSubcategoryStacks && drilldown) return drilldown.months;
    return filterMonthsBySoloCategory(rawMonths, soloCategory ?? null);
  }, [rawMonths, soloCategory, usingSubcategoryStacks, drilldown]);

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
  const yMaxRaw = useMemo(() => {
    const barMax = Math.max(0, ...months.map((m) => m.total));
    if (categoryFilterActive) return barMax;
    return Math.max(
      barMax,
      avgMonthlyIncomeLast6 ?? 0,
      avgMonthlySpendLast6 ?? 0,
    );
  }, [months, avgMonthlyIncomeLast6, avgMonthlySpendLast6, categoryFilterActive]);
  const yScale = useMemo(() => tightYScale(yMaxRaw, innerH), [yMaxRaw, innerH]);
  const yToPx = (v: number) => padT + innerH - (v / yScale.top) * innerH;

  /** Income line spans only the rightmost 6 bars (or however many the API used). */
  const incomeBarsCount = Math.min(6, months.length);
  const incomeFirstIdx = months.length - incomeBarsCount;
  const incomeX1 = barGeometries[incomeFirstIdx]?.x ?? padL;
  const incomeX2 =
    barGeometries[months.length - 1] != null
      ? barGeometries[months.length - 1].x + barGeometries[months.length - 1].barW
      : padL + innerW;
  const showRefLines = !categoryFilterActive;
  const incomeY =
    showRefLines && avgMonthlyIncomeLast6 != null ? yToPx(avgMonthlyIncomeLast6) : null;
  const spendY =
    showRefLines && avgMonthlySpendLast6 != null ? yToPx(avgMonthlySpendLast6) : null;

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
          aria-label="Monthly stacked spend by category"
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
             *  Spans only the rightmost 6 bars per the user's spec. Layered
             *  stroke (wide soft halo + crisp neon core) so it stays
             *  unmistakable even where bars cover most of its length. */}
            {spendY != null && avgMonthlySpendLast6! > 0 && (
              <g pointerEvents="none">
                <line
                  x1={incomeX1}
                  x2={incomeX2}
                  y1={spendY}
                  y2={spendY}
                  stroke={REF_LINE_SPEND}
                  strokeWidth={10}
                  strokeLinecap="round"
                  opacity={0.18}
                />
                <line
                  x1={incomeX1}
                  x2={incomeX2}
                  y1={spendY}
                  y2={spendY}
                  stroke={REF_LINE_SPEND}
                  strokeWidth={5}
                  strokeLinecap="round"
                  opacity={0.45}
                />
                <line
                  x1={incomeX1}
                  x2={incomeX2}
                  y1={spendY}
                  y2={spendY}
                  stroke={REF_LINE_SPEND}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  opacity={1}
                />
              </g>
            )}

            {incomeY != null && avgMonthlyIncomeLast6! > 0 && (
              <g pointerEvents="none">
                {/* Outer soft halo */}
                <line
                  x1={incomeX1}
                  x2={incomeX2}
                  y1={incomeY}
                  y2={incomeY}
                  stroke={REF_LINE_INCOME}
                  strokeWidth={10}
                  strokeLinecap="round"
                  opacity={0.18}
                />
                {/* Mid halo */}
                <line
                  x1={incomeX1}
                  x2={incomeX2}
                  y1={incomeY}
                  y2={incomeY}
                  stroke={REF_LINE_INCOME}
                  strokeWidth={5}
                  strokeLinecap="round"
                  opacity={0.45}
                />
                {/* Crisp neon core */}
                <line
                  x1={incomeX1}
                  x2={incomeX2}
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
            {spendY != null && avgMonthlySpendLast6! > 0 && (
              <g>
                <line
                  x1={incomeX1}
                  x2={incomeX2}
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
                    {compact(avgMonthlySpendLast6!)}
                  </text>
                )}
              </g>
            )}
            {incomeY != null && avgMonthlyIncomeLast6! > 0 && (
              <g>
                <line
                  x1={incomeX1}
                  x2={incomeX2}
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
                    {compact(avgMonthlyIncomeLast6!)}
                  </text>
                )}
              </g>
            )}

            {/* X-axis month labels */}
            {months.map((m, i) => {
              const cx = barGeometries[i]?.cx ?? padL;
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
              void open({
                ...detailTipAnchorFromEvent(e),
                entity: "category",
                value: seg.name,
                label: `${seg.name} · ${monthLabel(month.month).line1} ${monthLabel(month.month).line2}`,
                accent: seg.color,
                month: month.month,
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
