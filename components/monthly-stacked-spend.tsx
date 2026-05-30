"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
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

const REF_LINE_INCOME = "#39FF14";
const REF_LINE_SPEND = "#FF4444";
const DEFAULT_MONTHS = 21;
const CHART_HEIGHT = 660;
const CHART_HEIGHT_FULL_INIT = 900;
const CHART_HEIGHT_FULL_MIN = 540;

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

export function MonthlyStackedSpend({ months: monthsCount = DEFAULT_MONTHS }: { months?: number }) {
  const [data, setData] = useState<MonthlyStacksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [categoryModal, setCategoryModal] = useState<string | null>(null);

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
      <Card className="border-white/[0.10] bg-white/[0.04] text-white">
        <ChartCardHeader />
        <CardContent className="overflow-visible pt-0">
          <div className="flex h-[660px] items-center justify-center text-sm text-white/40">
            Loading monthly breakdown…
          </div>
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card className="border-white/[0.10] bg-white/[0.04] text-white">
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
      <Card className="border-white/[0.10] bg-white/[0.04] text-white">
        <ChartCardHeader legend={data} />
        <CardContent className="overflow-visible pt-0">
          <div className="flex h-[660px] items-center justify-center text-sm text-white/40">
            No spending in the selected window.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/[0.10] bg-white/[0.04] text-white">
      <ChartCardHeader legend={data} onExpand={() => setExpanded(true)} />
      <CardContent className="overflow-visible pt-0">
        <ChartView data={data} onCategoryClick={setCategoryModal} />
      </CardContent>
      {categoryModal &&
        typeof document !== "undefined" &&
        createPortal(
          <CategoryTransactionsModal
            filter={{ mode: "category", name: categoryModal, level: "category" }}
            currency={data.primaryCurrency}
            onClose={() => setCategoryModal(null)}
          />,
          document.body,
        )}
      {expanded &&
        typeof document !== "undefined" &&
        createPortal(
          <FullscreenChartModal
            data={data}
            onClose={() => setExpanded(false)}
            onCategoryClick={setCategoryModal}
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
      className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-[#121212]/80 text-white/45 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.10] hover:text-white/85"
      aria-label="Expand chart to full screen"
      title="Expand"
    >
      <Maximize2 className="h-3.5 w-3.5" />
    </button>
  );
}

function ChartCardHeader({
  legend,
  onExpand,
}: {
  legend?: MonthlyStacksResponse;
  onExpand?: () => void;
}) {
  return (
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white/85">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#0BC18D]/30 to-[#5DD3F3]/20 ring-1 ring-white/10">
          <CalendarRange className="h-4 w-4 text-[#0BC18D]" />
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span>Monthly Spend by Category</span>
          {legend ? (
            <LegendHelpButton
              categories={legend.categories}
              avgIncome={legend.avgMonthlyIncomeLast6}
              avgSpend={legend.avgMonthlySpendLast6}
            />
          ) : null}
        </span>
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
  onClose,
  onCategoryClick,
}: {
  data: MonthlyStacksResponse;
  onClose: () => void;
  onCategoryClick: (categoryName: string) => void;
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
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-3.5 sm:px-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#0BC18D]/30 to-[#5DD3F3]/20 ring-1 ring-white/10">
            <Maximize2 className="h-3.5 w-3.5 text-[#0BC18D]" />
          </span>
          <span className="flex items-center gap-1.5">
            Monthly Spend by Category
            <LegendHelpButton
              categories={data.categories}
              avgIncome={data.avgMonthlyIncomeLast6}
              avgSpend={data.avgMonthlySpendLast6}
            />
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-white/60 transition-colors hover:bg-white/[0.12] hover:text-white"
          aria-label="Close expanded chart"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-8 sm:py-6">
        <ChartView data={data} fullscreen onCategoryClick={onCategoryClick} />
      </div>
    </div>
  );
}

function ChartView({
  data,
  fullscreen = false,
  onCategoryClick,
}: {
  data: MonthlyStacksResponse;
  fullscreen?: boolean;
  onCategoryClick?: (categoryName: string) => void;
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

  const { months, primaryCurrency, avgMonthlyIncomeLast6, avgMonthlySpendLast6 } = data;

  /** Layout — legend now lives below the chart, so no left gutter for it. */
  const padL = fullscreen ? 64 : 56;
  const padR = 16;
  const padT = fullscreen ? 12 : 6;
  const padB = fullscreen ? 64 : 52;
  const innerW = size.w - padL - padR;
  const innerH = size.h - padT - padB;
  const slot = innerW / months.length;
  const barW = Math.max(18, Math.min(fullscreen ? 72 : 56, slot * 0.66));
  const axisFont = fullscreen ? 12 : 10;
  const monthFont = fullscreen ? 12 : 10;
  const monthYearFont = fullscreen ? 11 : 10;

  /** Scale to the tallest rendered bar or reference line — never API maxStack alone. */
  const yMaxRaw = useMemo(
    () =>
      Math.max(
        0,
        ...months.map((m) => m.total),
        avgMonthlyIncomeLast6 ?? 0,
        avgMonthlySpendLast6 ?? 0,
      ),
    [months, avgMonthlyIncomeLast6, avgMonthlySpendLast6],
  );
  const yScale = useMemo(() => tightYScale(yMaxRaw, innerH), [yMaxRaw, innerH]);
  const yToPx = (v: number) => padT + innerH - (v / yScale.top) * innerH;

  /** Income line spans only the rightmost 6 bars (or however many the API used). */
  const incomeBarsCount = Math.min(6, months.length);
  const incomeFirstIdx = months.length - incomeBarsCount;
  const incomeX1 = padL + slot * incomeFirstIdx + slot * 0.08;
  const incomeX2 = padL + slot * months.length - slot * 0.08;
  const incomeY = avgMonthlyIncomeLast6 != null ? yToPx(avgMonthlyIncomeLast6) : null;
  const spendY = avgMonthlySpendLast6 != null ? yToPx(avgMonthlySpendLast6) : null;

  return (
    <div
      ref={wrapRef}
      className={`relative w-full ${fullscreen ? "flex min-h-0 flex-1 flex-col" : ""}`}
    >
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
                    stroke="rgba(255,255,255,0.08)"
                    strokeDasharray={i === 0 ? undefined : "3 4"}
                    strokeWidth={1}
                  />
                  {!hideLabel && (
                    <text
                      x={padL - 8}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-white/45"
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
              const cx = padL + slot * i + slot / 2;
              const x = cx - barW / 2;
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
                  onCategoryClick={onCategoryClick}
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
              const cx = padL + slot * i + slot / 2;
              const lbl = monthLabel(m.month);
              return (
                <g key={`lbl-${m.month}`}>
                  <text
                    x={cx}
                    y={size.h - padB + 16}
                    textAnchor="middle"
                    className="fill-white/55"
                    style={{ fontSize: monthFont, fontWeight: 600 }}
                  >
                    {lbl.line1}
                  </text>
                  <text
                    x={cx}
                    y={size.h - padB + 30}
                    textAnchor="middle"
                    className="fill-white/35"
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
  onCategoryClick,
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
  onCategoryClick?: (categoryName: string) => void;
  segmentLabelMin?: number;
  barLabelFont?: number;
  totalFont?: number;
}) {
  if (month.total <= 0) {
    return (
      <text
        x={cx}
        y={yBottom - 4}
        textAnchor="middle"
        className="fill-white/25"
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
        const showLabel = h >= segmentLabelMin && barW >= 26;
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
              onCategoryClick?.(seg.name);
            }}
            style={{ cursor: onCategoryClick ? "pointer" : "default" }}
          >
            <rect
              x={x}
              y={rectY}
              width={barW}
              height={h}
              fill={seg.color}
              rx={isTop ? 4 : 0}
              ry={isTop ? 4 : 0}
            />
            {/* Inner highlight for depth */}
            <rect
              x={x}
              y={rectY}
              width={barW}
              height={Math.min(h, 8)}
              fill={`url(#msb-shine-${shineId})`}
              opacity={0.4}
              rx={isTop ? 4 : 0}
              ry={isTop ? 4 : 0}
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
      {(() => {
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
              fill: "rgba(255,255,255,0.92)",
              letterSpacing: "0.01em",
              textShadow: inside ? "0 1px 3px rgba(0,0,0,0.65)" : undefined,
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

function LegendHelpButton({
  categories,
  avgIncome,
  avgSpend,
}: {
  categories: MonthlyStacksResponse["categories"];
  avgIncome: number | null;
  avgSpend: number | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid h-4 w-4 place-items-center rounded-full border border-white/20 bg-white/[0.06] text-[10px] font-bold leading-none text-white/45 transition-colors hover:border-white/35 hover:bg-white/[0.10] hover:text-white/80"
        aria-label={open ? "Hide chart legend" : "Show chart legend"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        ?
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Chart legend"
          className="absolute left-0 top-[calc(100%+6px)] z-[120] w-[min(420px,calc(100vw-2rem))] rounded-xl border border-white/[0.12] bg-[#111111]/[0.98] p-3 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
        >
          <ChartLegendContent
            categories={categories}
            avgIncome={avgIncome}
            avgSpend={avgSpend}
          />
        </div>
      ) : null}
    </div>
  );
}

function ChartLegendContent({
  categories,
  avgIncome,
  avgSpend,
}: {
  categories: MonthlyStacksResponse["categories"];
  avgIncome: number | null;
  avgSpend: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {categories.map((c) => (
        <span
          key={c.name}
          className="inline-flex items-center gap-1.5 text-[11px] text-white/70"
        >
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/15"
            style={{ background: c.color }}
            aria-hidden
          />
          <span title={c.name}>{c.name.toLowerCase()}</span>
        </span>
      ))}
      {avgSpend != null && avgSpend > 0 && (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[#FFB4B4]">
          <span
            className="inline-block h-[2px] w-5 shrink-0 rounded-full"
            style={{
              background: "#FF4444",
              boxShadow: "0 0 6px rgba(255,68,68,0.7)",
            }}
            aria-hidden
          />
          avg spend (last 6 mo)
        </span>
      )}
      {avgIncome != null && avgIncome > 0 && (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9DFFB0]">
          <span
            className="inline-block h-[2px] w-5 shrink-0 rounded-full"
            style={{
              background: "#39FF14",
              boxShadow: "0 0 6px rgba(57,255,20,0.7)",
            }}
            aria-hidden
          />
          avg income (last 6 mo)
        </span>
      )}
    </div>
  );
}
