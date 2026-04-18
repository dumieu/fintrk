"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  MonthlyStack,
  MonthlyStacksResponse,
} from "@/app/api/analytics/monthly-stacks/route";
import { formatCurrency } from "@/lib/format";
import { AnalyticsDetailTooltip } from "@/components/analytics-detail-tooltip";
import { useAnalyticsDetail } from "@/components/use-analytics-detail";

const DEFAULT_MONTHS = 21;

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
 * Pretty round numbers up the y-axis so gridlines land on $0K, $20K, $40K, …
 * Returns the ceiling and the count of intervals.
 */
function niceYScale(maxVal: number, target: number = 4): { top: number; step: number; count: number } {
  if (maxVal <= 0) return { top: 100, step: 25, count: 4 };
  const rough = maxVal / target;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  let step: number;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3) step = 2 * mag;
  else if (norm < 7) step = 5 * mag;
  else step = 10 * mag;
  const top = Math.ceil(maxVal / step) * step;
  return { top, step, count: Math.round(top / step) };
}

export function MonthlyStackedSpend({ months: monthsCount = DEFAULT_MONTHS }: { months?: number }) {
  const [data, setData] = useState<MonthlyStacksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex h-[440px] items-center justify-center text-sm text-white/40">
        Loading monthly breakdown…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex h-[440px] items-center justify-center text-sm text-rose-300/80">
        {error ?? "Failed to load monthly breakdown."}
      </div>
    );
  }
  if (data.months.every((m) => m.total === 0)) {
    return (
      <div className="flex h-[440px] items-center justify-center text-sm text-white/40">
        No spending in the selected window.
      </div>
    );
  }

  return <Chart data={data} />;
}

function Chart({ data }: { data: MonthlyStacksResponse }) {
  const { tip, open, scheduleClose, clearLeave } = useAnalyticsDetail();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1100, h: 440 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setSize({ w: Math.max(640, r.width), h: 440 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { months, categories, primaryCurrency, avgMonthlyIncomeLast6 } = data;

  /** Layout — legend now lives below the chart, so no left gutter for it. */
  const padL = 56; // y-axis label gutter
  const padR = 16;
  const padT = 16;
  const padB = 56; // x-axis tick labels
  const innerW = size.w - padL - padR;
  const innerH = size.h - padT - padB;
  const slot = innerW / months.length;
  const barW = Math.max(18, Math.min(56, slot * 0.66));

  /** Y-axis must accommodate both the tallest stack AND the income line so
   *  the latter never gets clipped. */
  const yMaxRaw = Math.max(data.maxStack, avgMonthlyIncomeLast6 ?? 0);
  const yScale = useMemo(() => niceYScale(yMaxRaw, 4), [yMaxRaw]);
  const yToPx = (v: number) => padT + innerH - (v / yScale.top) * innerH;

  /** Income line spans only the rightmost 6 bars (or however many the API used). */
  const incomeBarsCount = Math.min(6, months.length);
  const incomeFirstIdx = months.length - incomeBarsCount;
  const incomeX1 = padL + slot * incomeFirstIdx + slot * 0.08;
  const incomeX2 = padL + slot * months.length - slot * 0.08;
  const incomeY = avgMonthlyIncomeLast6 != null ? yToPx(avgMonthlyIncomeLast6) : null;

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative w-full">
        <svg
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          role="img"
          aria-label="Monthly stacked spend by category"
          className="block"
        >
            <defs>
              <linearGradient id="msb-shine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>

            {/* Y-axis gridlines + labels */}
            {Array.from({ length: yScale.count + 1 }, (_, i) => {
              const v = yScale.step * i;
              const y = yToPx(v);
              return (
                <g key={`g-${i}`}>
                  <line
                    x1={padL}
                    x2={size.w - padR}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.08)"
                    strokeDasharray={i === 0 ? undefined : "3 4"}
                    strokeWidth={1}
                  />
                  <text
                    x={padL - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-white/45"
                    style={{ fontSize: 10, fontWeight: 600 }}
                  >
                    {compact(v)}
                  </text>
                </g>
              );
            })}

            {/* Income reference line — drawn BEHIND the bars so they sit on top.
             *  Spans only the rightmost 6 bars per the user's spec. Layered
             *  stroke (wide soft halo + crisp neon core) so it stays
             *  unmistakable even where bars cover most of its length. */}
            {incomeY != null && avgMonthlyIncomeLast6! > 0 && (
              <g pointerEvents="none">
                {/* Outer soft halo */}
                <line
                  x1={incomeX1}
                  x2={incomeX2}
                  y1={incomeY}
                  y2={incomeY}
                  stroke="#39FF14"
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
                  stroke="#39FF14"
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
                  stroke="#39FF14"
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
                />
              );
            })}

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
                    style={{ fontSize: 10, fontWeight: 600 }}
                  >
                    {lbl.line1}
                  </text>
                  <text
                    x={cx}
                    y={size.h - padB + 30}
                    textAnchor="middle"
                    className="fill-white/35"
                    style={{ fontSize: 10 }}
                  >
                    {lbl.line2}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>

      {/* Bottom legend — single horizontal row, wraps on narrow widths. */}
      <BottomLegend categories={categories} avgIncome={avgMonthlyIncomeLast6} />

      {typeof document !== "undefined" &&
        tip &&
        createPortal(
          <AnalyticsDetailTooltip
            rect={tip.rect}
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
        const showLabel = h >= 14 && barW >= 26;
        const labelText = compact(seg.amount);
        return (
          <g
            key={`${month.month}-${seg.name}`}
            onMouseEnter={(e) => {
              const r = (e.currentTarget as SVGGElement).getBoundingClientRect();
              void open({
                rect: r,
                entity: "category",
                value: seg.name,
                label: `${seg.name} · ${monthLabel(month.month).line1} ${monthLabel(month.month).line2}`,
                accent: seg.color,
                month: month.month,
              });
            }}
            onMouseLeave={scheduleClose}
            style={{ cursor: "pointer" }}
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
              fill="url(#msb-shine)"
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
                  fontSize: 9.5,
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

      {/* Total above the stack */}
      <text
        x={cx}
        y={Math.max(yTop + 10, topY - 6)}
        textAnchor="middle"
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          fill: "rgba(255,255,255,0.92)",
          letterSpacing: "0.01em",
        }}
      >
        {compact(month.total)}
      </text>
      {/* Hidden formatter usage to keep tree-shaking happy */}
      <title>{`${monthLabel(month.month).line1} ${monthLabel(month.month).line2} • ${formatCurrency(month.total, currency)}`}</title>
    </g>
  );
}

/** Single-row legend below the chart. Wraps to the next line on narrow widths.
 *  Includes the income reference-line indicator at the end when available. */
function BottomLegend({
  categories,
  avgIncome,
}: {
  categories: MonthlyStacksResponse["categories"];
  avgIncome: number | null;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-2">
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
      {avgIncome != null && (
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
