"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCurrencyInteger } from "@/lib/format";
import {
  ASSET_CATEGORIES,
  LIABILITY_CATEGORIES,
  findAssetCategory,
  findLiabilityCategory,
  type NetWorthSettings,
  type YearPoint,
} from "@/lib/net-worth";

const CHART_W = 1200;
const CHART_H = 570; // ~50% taller than before so the curve gets the full canvas it deserves
const PADDING = { top: 10, right: 8, bottom: 26, left: 48 };
/** Y position (svg coords) for retirement badge group origin so the pill stays inside the viewBox. */
const RETIREMENT_BADGE_ANCHOR_Y = PADDING.top + 6;
const DEBT_BAND_RATIO = 0.18; // 18% of chart height reserved for the debt band

/**
 * Wealth curve with subtle per-asset-class breakdown.
 *
 * Top region (82% of height) is a stacked-area chart: each asset category gets
 * its own translucent band rising over time. The bold gradient line on top of
 * the stack is the net-worth trajectory. The bottom 18% reserves a "debt
 * band" — a thin red area showing total liabilities shrinking to zero as
 * they amortise, plus a hatched ghost showing the original principal so users
 * see the payoff visually.
 */
export function WealthCurve({
  series,
  settings,
  currency,
  onRetirementAgeChange,
}: {
  series: YearPoint[];
  settings: NetWorthSettings;
  currency: string;
  /** Called continuously while user drags the retirement marker. */
  onRetirementAgeChange?: (age: number) => void;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const view = useMemo(() => buildChart(series, settings, currency), [series, settings, currency]);
  const innerW = CHART_W - PADDING.left - PADDING.right;

  // Total span the chart covers (years), driven by the projection itself so
  // it scales from "now" up to MAX_PROJECTION_AGE (wealth curve cap).
  const horizonYears = Math.max(1, series[series.length - 1].year - series[0].year);

  const hoverPoint = hoverIdx != null ? series[hoverIdx] : null;

  // Convert a clientX (in CSS pixels) to a candidate retirement age.
  const clientXToAge = useCallback((clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * CHART_W;
    const ratio = (px - PADDING.left) / innerW;
    const yearOffset = ratio * horizonYears;
    const age = Math.round(settings.currentAge + yearOffset);
    return Math.max(settings.currentAge, Math.min(settings.currentAge + horizonYears, age));
  }, [innerW, settings.currentAge, horizonYears]);

  // Pointer move while dragging.
  useEffect(() => {
    if (!dragging || !onRetirementAgeChange) return;
    const onMove = (e: PointerEvent) => {
      const age = clientXToAge(e.clientX);
      if (age != null && age !== settings.retirementAge) onRetirementAgeChange(age);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, onRetirementAgeChange, clientXToAge, settings.retirementAge]);

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        overflow="visible"
        className="h-[480px] w-full select-none sm:h-[570px]"
        onMouseMove={(e) => {
          if (dragging) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * CHART_W;
          const year = Math.max(0, Math.min(series.length - 1, view.xToYear(px)));
          setHoverIdx(year);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="nwGradStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="#2CA2FF" />
            <stop offset="50%" stopColor="#0BC18D" />
            <stop offset="100%" stopColor="#ECAA0B" />
          </linearGradient>
          <filter id="nwGlow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="debtHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,111,105,0.18)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* horizontal grid + y labels (top region only) */}
        {view.yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              y1={t.y}
              x2={CHART_W - PADDING.right}
              y2={t.y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
            <text x={PADDING.left - 8} y={t.y + 4} fontSize="11" textAnchor="end" fill="rgba(255,255,255,0.4)">
              {t.label}
            </text>
          </g>
        ))}

        {/* drawdown shaded region */}
        {view.drawdownStart != null && (
          <rect
            x={view.drawdownStart}
            y={PADDING.top}
            width={Math.max(0, CHART_W - PADDING.right - view.drawdownStart)}
            height={view.topInnerH}
            fill="rgba(255,111,105,0.04)"
          />
        )}

        {/* retirement vertical line — drag to move */}
        {view.retirementX != null && (
          <g
            style={{ cursor: onRetirementAgeChange ? (dragging ? "grabbing" : "ew-resize") : "default" }}
            onPointerDown={(e) => {
              if (!onRetirementAgeChange) return;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDragging(true);
            }}
          >
            {/* wide invisible hit area so it's easy to grab */}
            <rect
              x={view.retirementX - 14}
              y={PADDING.top}
              width="28"
              height={CHART_H - PADDING.top - PADDING.bottom}
              fill="transparent"
            />
            <line
              x1={view.retirementX}
              y1={PADDING.top}
              x2={view.retirementX}
              y2={CHART_H - PADDING.bottom}
              stroke={dragging ? "rgba(255,111,105,0.95)" : "rgba(255,111,105,0.55)"}
              strokeDasharray={dragging ? "0" : "4 4"}
              strokeWidth={dragging ? 2 : 1.5}
            />
            {/* draggable handle — anchor below viewBox top so the pill is not clipped */}
            <g transform={`translate(${view.retirementX}, ${RETIREMENT_BADGE_ANCHOR_Y})`}>
              <rect
                x={-26}
                y={-14}
                width={52}
                height={18}
                rx={9}
                fill="#FF6F69"
                fillOpacity={dragging ? 1 : 0.85}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="0.75"
              />
              <text
                x={0}
                y={-1}
                fontSize="10"
                fontWeight="700"
                textAnchor="middle"
                fill="white"
              >
                age {settings.retirementAge}
              </text>
              {/* grip dots */}
              <circle cx={-12} cy={-5} r={1} fill="rgba(255,255,255,0.7)" />
              <circle cx={-12} cy={-1} r={1} fill="rgba(255,255,255,0.7)" />
              <circle cx={12}  cy={-5} r={1} fill="rgba(255,255,255,0.7)" />
              <circle cx={12}  cy={-1} r={1} fill="rgba(255,255,255,0.7)" />
            </g>
            <text
              x={view.retirementX + 8}
              y={PADDING.top + 26}
              fontSize="9.5"
              fill="rgba(255,111,105,0.7)"
              fontWeight="600"
              letterSpacing="0.04em"
            >
              {onRetirementAgeChange ? "drag to move" : "Retirement"}
            </text>
          </g>
        )}

        {/* stacked asset-class areas (subtle) */}
        {view.assetLayers.map((layer) => (
          <path
            key={`asset-${layer.category}`}
            d={layer.path}
            fill={layer.color}
            fillOpacity="0.16"
            stroke={layer.color}
            strokeOpacity="0.35"
            strokeWidth="0.6"
          />
        ))}

        {/* bold net-worth trajectory line */}
        <path d={view.netWorthLine} fill="none" stroke="url(#nwGradStroke)" strokeWidth="2.5" filter="url(#nwGlow)" />

        {/* debt band — original principal ghost (hatched) */}
        {view.debtBandHeight > 0 && (
          <>
            <rect
              x={PADDING.left}
              y={view.debtBandY}
              width={innerW}
              height={view.debtBandHeight}
              fill="url(#debtHatch)"
            />
            {/* live (amortising) debt area on top of the ghost */}
            <path d={view.debtArea} fill="rgba(255,111,105,0.32)" stroke="rgba(255,111,105,0.55)" strokeWidth="1" />
            <text
              x={PADDING.left + 6}
              y={view.debtBandY + 11}
              fontSize="9.5"
              fill="rgba(255,111,105,0.8)"
              fontWeight="600"
              letterSpacing="0.06em"
            >
              DEBT · {formatShort(view.debtMaxPrincipal, currency)} → {formatShort(view.debtFinal, currency)}
            </text>
          </>
        )}

        {/* milestone markers on the net-worth line */}
        {view.milestoneXs.map((m) => (
          <g key={m.year}>
            <circle cx={m.x} cy={m.y} r="4.5" fill="#0BC18D" stroke="#0e0822" strokeWidth="2" />
            <rect x={m.x - 22} y={m.y - 26} rx="6" width="44" height="16" fill="rgba(11,193,141,0.18)" stroke="rgba(11,193,141,0.5)" strokeWidth="0.75" />
            <text x={m.x} y={m.y - 14} fontSize="10" textAnchor="middle" fill="#fff" fontWeight="600">
              +{m.year}y
            </text>
          </g>
        ))}

        {/* x-axis age labels — dynamic ticks every 10 years across the horizon */}
        {Array.from({ length: Math.floor(horizonYears / 10) + 1 }, (_, i) => {
          const y = i * 10;
          const px = PADDING.left + (innerW * y) / horizonYears;
          const isFirst = i === 0;
          const isLast = y >= horizonYears - 1;
          const anchor = isFirst ? "start" : isLast ? "end" : "middle";
          return (
            <text
              key={y}
              x={px}
              y={CHART_H - PADDING.bottom + 18}
              fontSize="10"
              textAnchor={anchor}
              fill="rgba(255,255,255,0.4)"
            >
              age {settings.currentAge + y}
            </text>
          );
        })}

        {/* hover crosshair */}
        {hoverPoint && hoverIdx != null && (
          <line
            x1={PADDING.left + (innerW * hoverIdx) / Math.max(1, series.length - 1)}
            y1={PADDING.top}
            x2={PADDING.left + (innerW * hoverIdx) / Math.max(1, series.length - 1)}
            y2={CHART_H - PADDING.bottom}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1"
          />
        )}
      </svg>

      {/* legend */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px]">
        {view.assetLayers.map((l) => (
          <span key={l.category} className="inline-flex items-center gap-1.5 text-white/55">
            <span className="h-2 w-2 rounded-sm" style={{ background: l.color, opacity: 0.6 }} />
            {findAssetCategory(l.category).label}
          </span>
        ))}
        {view.debtBandHeight > 0 && (
          <span className="inline-flex items-center gap-1.5 text-white/55">
            <span className="h-2 w-2 rounded-sm" style={{ background: "rgba(255,111,105,0.55)" }} />
            Debt amortising
          </span>
        )}
      </div>

      {/* hover tooltip */}
      {hoverPoint && (
        <div
          className="pointer-events-none absolute top-2 z-10 max-w-[260px] rounded-xl border border-white/15 bg-[#0e0822]/90 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md"
          style={{
            left: `${(hoverPoint.year / horizonYears) * 100}%`,
            transform: hoverPoint.year > horizonYears * 0.75 ? "translateX(-110%)" : "translateX(10%)",
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-white/55">
            Age {hoverPoint.age} ({new Date().getFullYear() + hoverPoint.year}) · year +{hoverPoint.year}
          </div>
          <div className="mt-0.5 text-base font-bold">{formatCurrencyInteger(hoverPoint.netWorth, currency)}</div>
          <div className="mt-1.5 grid grid-cols-1 gap-0.5 text-[10px]">
            {Object.entries(hoverPoint.assetsByCategory)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([cat, v]) => {
                const meta = findAssetCategory(cat);
                return (
                  <div key={cat} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1 text-white/65">
                      <span className="h-1.5 w-1.5 rounded-sm" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="tabular-nums text-white/85">{formatShort(v, currency)}</span>
                  </div>
                );
              })}
            {hoverPoint.liabilities > 0 && (
              <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-white/10 pt-1 text-[#FF6F69]">
                <span>Debt remaining</span>
                <span className="tabular-nums">−{formatShort(hoverPoint.liabilities, currency)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Geometry / path building
// ────────────────────────────────────────────────────────────────────────────

function buildChart(series: YearPoint[], settings: NetWorthSettings, currency: string) {
  const innerW = CHART_W - PADDING.left - PADDING.right;
  const fullInnerH = CHART_H - PADDING.top - PADDING.bottom;

  const debtMaxPrincipal = Math.max(0, ...series.map((p) => p.liabilities));
  const debtFinal = series[series.length - 1].liabilities;
  // Only carve out the debt strip when there is debt — otherwise the same slice
  // sat empty and left a large gap between the $0 baseline and the age labels.
  const debtBandHeightAvail = debtMaxPrincipal > 0 ? fullInnerH * DEBT_BAND_RATIO : 0;
  const bandGap = debtBandHeightAvail > 0 ? 4 : 2;
  const topInnerH = fullInnerH - debtBandHeightAvail - bandGap;

  const xs = series.map((p) => p.year);
  const yearSpan = Math.max(1, xs[xs.length - 1] - xs[0]);
  const xToPx = (year: number) => PADDING.left + (innerW * (year - xs[0])) / yearSpan;

  // ── TOP REGION (assets + net worth) ─────────────────────────────────────
  const maxNw = Math.max(1, ...series.map((p) => p.netWorth));
  const minNw = Math.min(0, ...series.map((p) => p.netWorth));
  const span = Math.max(1, maxNw - minNw);
  const yToPx = (val: number) => PADDING.top + topInnerH - (topInnerH * (val - minNw)) / span;

  const yTicks: { y: number; label: string }[] = [];
  for (let i = 0; i <= 5; i++) {
    const v = minNw + (span * i) / 5;
    yTicks.push({ y: yToPx(v), label: formatShort(v, currency) });
  }

  // Stable category list sourced from ASSET_CATEGORIES order so colors stay consistent.
  const presentAssetCats: string[] = [];
  for (const c of ASSET_CATEGORIES) {
    if (series.some((p) => (p.assetsByCategory[c.id] ?? 0) > 0)) presentAssetCats.push(c.id);
  }

  // Build stacked layers from bottom (0) to top.
  // For each year we accumulate categories so each layer's path = polygon
  // between its lower and upper boundary.
  const layerPaths: { category: string; color: string; path: string }[] = [];
  const cumPrev = new Array(series.length).fill(0);
  for (const cat of presentAssetCats) {
    const meta = findAssetCategory(cat);
    const upperPts: string[] = [];
    const lowerPts: string[] = [];
    for (let i = 0; i < series.length; i++) {
      const v = Math.max(0, series[i].assetsByCategory[cat] ?? 0);
      const lower = cumPrev[i];
      const upper = lower + v;
      lowerPts.push(`${xToPx(series[i].year)},${yToPx(lower)}`);
      upperPts.push(`${xToPx(series[i].year)},${yToPx(upper)}`);
      cumPrev[i] = upper;
    }
    const path = `M ${upperPts.join(" L ")} L ${lowerPts.reverse().join(" L ")} Z`;
    layerPaths.push({ category: cat, color: meta.color, path });
  }

  // Net-worth bold line.
  const nwPts = series.map((p) => `${xToPx(p.year)},${yToPx(p.netWorth)}`);
  const netWorthLine = `M ${nwPts.join(" L ")}`;

  // Milestone markers on the net-worth line.
  const milestoneXs = [5, 10, 20, 30].map((y) => {
    const pt = series.find((s) => s.year === y);
    return { year: y, x: xToPx(y), y: yToPx(pt?.netWorth ?? 0) };
  });

  // Retirement marker / drawdown shading — allowed anywhere inside the horizon.
  const yearsToRetire = settings.retirementAge - settings.currentAge;
  const horizonYears = yearSpan;
  const retirementX =
    yearsToRetire >= 0 && yearsToRetire <= horizonYears ? xToPx(yearsToRetire) : null;
  const drawdownStart = retirementX != null && settings.annualDrawdown > 0 ? retirementX : null;

  // ── BOTTOM REGION (debt amortisation) ──────────────────────────────────
  const debtBandY = PADDING.top + topInnerH + bandGap;
  const debtBandHeight = debtBandHeightAvail;
  const debtY = (val: number) =>
    debtBandY + debtBandHeight - (debtBandHeight * val) / Math.max(1, debtMaxPrincipal);

  const debtTopPts = series.map((p) => `${xToPx(p.year)},${debtY(p.liabilities)}`);
  const debtArea =
    debtBandHeight > 0
      ? `M ${xToPx(series[0].year)},${debtBandY + debtBandHeight} L ${debtTopPts.join(" L ")} L ${xToPx(series[series.length - 1].year)},${debtBandY + debtBandHeight} Z`
      : "";

  return {
    topInnerH,
    yTicks,
    assetLayers: layerPaths,
    netWorthLine,
    milestoneXs,
    retirementX,
    drawdownStart,
    debtBandY,
    debtBandHeight,
    debtArea,
    debtMaxPrincipal,
    debtFinal,
    xToYear: (px: number) => {
      const ratio = (px - PADDING.left) / innerW;
      return Math.round(ratio * yearSpan);
    },
  };
}

// (legend uses LIABILITY_CATEGORIES indirectly via tooltip — keep import alive)
void LIABILITY_CATEGORIES;
void findLiabilityCategory;

function formatShort(v: number, currency: string): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  let s: string;
  if (abs >= 1_000_000_000) s = `${Math.round(abs / 1_000_000_000)}B`;
  else if (abs >= 1_000_000) s = `${Math.round(abs / 1_000_000)}M`;
  else if (abs >= 1_000) s = `${Math.round(abs / 1_000)}K`;
  else s = String(Math.round(abs));
  try {
    const sym =
      new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? "$";
    return `${sign}${sym}${s}`;
  } catch {
    return `${sign}$${s}`;
  }
}
