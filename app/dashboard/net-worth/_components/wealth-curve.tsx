"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCurrencyInteger } from "@/lib/format";
import {
  ASSET_CATEGORIES,
  findAssetCategory,
  type MonteCarloBandPoint,
  type NetWorthSettings,
  type YearPoint,
} from "@/lib/net-worth";

const CHART_W = 1200;
const CHART_H = 560;
const PADDING = { top: 14, right: 10, bottom: 28, left: 52 };
const RETIREMENT_BADGE_Y = PADDING.top + 8;
const DEBT_BAND_RATIO = 0.16;

export interface WealthCurveProps {
  series: YearPoint[];
  bands: MonteCarloBandPoint[] | null;
  settings: NetWorthSettings;
  currency: string;
  /** "real" deflates everything to today's dollars. */
  mode: "nominal" | "real";
  fiAge: number | null;
  depletionAge: number | null;
  showBands: boolean;
  showClasses: boolean;
  onRetirementAgeChange?: (age: number) => void;
}

export function WealthCurve({
  series,
  bands,
  settings,
  currency,
  mode,
  fiAge,
  depletionAge,
  showBands,
  showClasses,
  onRetirementAgeChange,
}: WealthCurveProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const view = useMemo(
    () => buildChart(series, bands, settings, currency, mode, showBands, showClasses, fiAge, depletionAge),
    [series, bands, settings, currency, mode, showBands, showClasses, fiAge, depletionAge],
  );

  const innerW = CHART_W - PADDING.left - PADDING.right;
  const horizonYears = Math.max(1, series[series.length - 1].year - series[0].year);
  const hoverPoint = hoverIdx != null ? series[Math.min(hoverIdx, series.length - 1)] : null;

  const clientXToAge = useCallback(
    (clientX: number): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * CHART_W;
      const ratio = (px - PADDING.left) / innerW;
      const age = Math.round(settings.currentAge + ratio * horizonYears);
      return Math.max(settings.currentAge, Math.min(settings.currentAge + horizonYears, age));
    },
    [innerW, settings.currentAge, horizonYears],
  );

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

  const val = (p: YearPoint) => (mode === "real" ? p.realNetWorth : p.netWorth);

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        overflow="visible"
        className="h-[460px] w-full select-none sm:h-[560px]"
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
            <stop offset="0%" stopColor="#2CA2FF" />
            <stop offset="50%" stopColor="#0BC18D" />
            <stop offset="100%" stopColor="#ECAA0B" />
          </linearGradient>
          <linearGradient id="nwBandOuter" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2CA2FF" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#0BC18D" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="nwBandInner" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0BC18D" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2CA2FF" stopOpacity="0.10" />
          </linearGradient>
          <filter id="nwGlow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="debtHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,111,105,0.18)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* grid + y labels */}
        {view.yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PADDING.left} y1={t.y} x2={CHART_W - PADDING.right} y2={t.y} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={PADDING.left - 8} y={t.y + 4} fontSize="11" textAnchor="end" fill="var(--chart-axis)">
              {t.label}
            </text>
          </g>
        ))}

        {/* drawdown phase tint */}
        {view.retirementX != null && (
          <rect
            x={view.retirementX}
            y={PADDING.top}
            width={Math.max(0, CHART_W - PADDING.right - view.retirementX)}
            height={view.topInnerH}
            fill="rgba(255,111,105,0.045)"
          />
        )}

        {/* depletion danger zone */}
        {view.depletionX != null && (
          <rect
            x={view.depletionX}
            y={PADDING.top}
            width={Math.max(0, CHART_W - PADDING.right - view.depletionX)}
            height={view.topInnerH}
            fill="rgba(239,68,68,0.07)"
          />
        )}

        {/* Monte Carlo fan */}
        {view.bandOuterPath && <path d={view.bandOuterPath} fill="url(#nwBandOuter)" />}
        {view.bandInnerPath && <path d={view.bandInnerPath} fill="url(#nwBandInner)" />}
        {view.medianLine && (
          <path d={view.medianLine} fill="none" stroke="rgba(44,162,255,0.55)" strokeWidth="1.4" strokeDasharray="5 5" />
        )}

        {/* stacked asset classes */}
        {view.assetLayers.map((layer) => (
          <path
            key={`asset-${layer.category}`}
            d={layer.path}
            fill={layer.color}
            fillOpacity="0.14"
            stroke={layer.color}
            strokeOpacity="0.3"
            strokeWidth="0.6"
          />
        ))}

        {/* deterministic net worth line */}
        <path d={view.netWorthLine} fill="none" stroke="url(#nwGradStroke)" strokeWidth="2.6" filter="url(#nwGlow)" />

        {/* zero line emphasis when curve can go negative */}
        {view.zeroY != null && (
          <line x1={PADDING.left} y1={view.zeroY} x2={CHART_W - PADDING.right} y2={view.zeroY} stroke="var(--chart-axis)" strokeWidth="1" strokeDasharray="2 4" opacity={0.5} />
        )}

        {/* today marker */}
        <circle cx={view.xToPx(0)} cy={view.yToPx(val(series[0]))} r="4" fill="#2CA2FF" stroke="var(--chart-surface)" strokeWidth="1.5" />

        {/* FI marker */}
        {view.fiX != null && (
          <g pointerEvents="none">
            <line x1={view.fiX} y1={PADDING.top} x2={view.fiX} y2={PADDING.top + view.topInnerH} stroke="rgba(11,193,141,0.6)" strokeWidth="1.4" strokeDasharray="6 4" />
            <g transform={`translate(${view.fiX}, ${PADDING.top + 22})`}>
              <rect x={4} y={-11} width={92} height={17} rx={8.5} fill="rgba(11,193,141,0.16)" stroke="rgba(11,193,141,0.5)" strokeWidth="0.75" />
              <text x={50} y={1.5} fontSize="9.5" textAnchor="middle" fill="#0BC18D" fontWeight="700" letterSpacing="0.04em">
                FREEDOM · {fiAge}
              </text>
            </g>
          </g>
        )}

        {/* depletion marker */}
        {view.depletionX != null && (
          <g pointerEvents="none">
            <line x1={view.depletionX} y1={PADDING.top} x2={view.depletionX} y2={PADDING.top + view.topInnerH} stroke="rgba(239,68,68,0.65)" strokeWidth="1.4" strokeDasharray="4 4" />
            <g transform={`translate(${view.depletionX}, ${PADDING.top + 44})`}>
              <rect x={-96} y={-11} width={92} height={17} rx={8.5} fill="rgba(239,68,68,0.14)" stroke="rgba(239,68,68,0.5)" strokeWidth="0.75" />
              <text x={-50} y={1.5} fontSize="9.5" textAnchor="middle" fill="#EF4444" fontWeight="700" letterSpacing="0.04em">
                DEPLETED · {depletionAge}
              </text>
            </g>
          </g>
        )}

        {/* retirement marker (draggable) */}
        {view.retirementX != null && (
          <g
            style={{ cursor: onRetirementAgeChange ? (dragging ? "grabbing" : "ew-resize") : "default" }}
            onPointerDown={(e) => {
              if (!onRetirementAgeChange) return;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDragging(true);
            }}
          >
            <rect x={view.retirementX - 14} y={PADDING.top} width="28" height={CHART_H - PADDING.top - PADDING.bottom} fill="transparent" />
            <line
              x1={view.retirementX}
              y1={PADDING.top}
              x2={view.retirementX}
              y2={CHART_H - PADDING.bottom}
              stroke={dragging ? "rgba(255,111,105,0.95)" : "rgba(255,111,105,0.55)"}
              strokeDasharray={dragging ? "0" : "4 4"}
              strokeWidth={dragging ? 2 : 1.5}
            />
            <g transform={`translate(${view.retirementX}, ${RETIREMENT_BADGE_Y})`}>
              <rect x={-30} y={-14} width={60} height={18} rx={9} fill="#FF6F69" fillOpacity={dragging ? 1 : 0.88} stroke="rgba(255,255,255,0.35)" strokeWidth="0.75" />
              <text x={0} y={-1} fontSize="10" fontWeight="700" textAnchor="middle" fill="white">
                retire {settings.retirementAge}
              </text>
              <circle cx={-16} cy={-5} r={1} fill="rgba(255,255,255,0.7)" />
              <circle cx={-16} cy={-1} r={1} fill="rgba(255,255,255,0.7)" />
              <circle cx={16} cy={-5} r={1} fill="rgba(255,255,255,0.7)" />
              <circle cx={16} cy={-1} r={1} fill="rgba(255,255,255,0.7)" />
            </g>
          </g>
        )}

        {/* debt band */}
        {view.debtBandHeight > 0 && (
          <>
            <rect x={PADDING.left} y={view.debtBandY} width={innerW} height={view.debtBandHeight} fill="url(#debtHatch)" />
            <path d={view.debtArea} fill="rgba(255,111,105,0.30)" stroke="rgba(255,111,105,0.55)" strokeWidth="1" />
            <text x={PADDING.left + 6} y={view.debtBandY + 11} fontSize="9.5" fill="rgba(255,111,105,0.8)" fontWeight="600" letterSpacing="0.06em">
              DEBT · {formatShort(view.debtMaxPrincipal, currency)} → {formatShort(view.debtFinal, currency)}
              {view.debtFreeX != null ? "" : ""}
            </text>
            {view.debtFreeX != null && (
              <g pointerEvents="none">
                <circle cx={view.debtFreeX} cy={view.debtBandY + view.debtBandHeight} r="3.5" fill="#0BC18D" stroke="var(--chart-surface)" strokeWidth="1.5" />
                <text x={view.debtFreeX + 6} y={view.debtBandY + view.debtBandHeight - 4} fontSize="9" fill="#0BC18D" fontWeight="700">
                  debt-free
                </text>
              </g>
            )}
          </>
        )}

        {/* x-axis age labels */}
        {Array.from({ length: Math.floor(horizonYears / 10) + 1 }, (_, i) => {
          const y = i * 10;
          const px = PADDING.left + (innerW * y) / horizonYears;
          const anchor = i === 0 ? "start" : y >= horizonYears - 1 ? "end" : "middle";
          return (
            <text key={y} x={px} y={CHART_H - PADDING.bottom + 18} fontSize="10" textAnchor={anchor} fill="var(--chart-axis)">
              age {settings.currentAge + y}
            </text>
          );
        })}

        {/* hover crosshair */}
        {hoverPoint && hoverIdx != null && (
          <line
            x1={view.xToPx(hoverPoint.year)}
            y1={PADDING.top}
            x2={view.xToPx(hoverPoint.year)}
            y2={CHART_H - PADDING.bottom}
            stroke="var(--chart-grid)"
            strokeWidth="1.2"
          />
        )}
        {hoverPoint && (
          <circle cx={view.xToPx(hoverPoint.year)} cy={view.yToPx(val(hoverPoint))} r="4.5" fill="#0BC18D" stroke="var(--chart-surface)" strokeWidth="2" />
        )}
      </svg>

      {/* legend */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px]">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="h-0.5 w-4 rounded-full" style={{ background: "linear-gradient(90deg,#2CA2FF,#0BC18D,#ECAA0B)" }} />
          Your plan
        </span>
        {showBands && bands && (
          <>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-4 rounded-sm" style={{ background: "rgba(11,193,141,0.18)" }} />
              Likely range (25-75%)
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-4 rounded-sm" style={{ background: "rgba(44,162,255,0.10)" }} />
              Possible range (10-90%)
            </span>
          </>
        )}
        {showClasses &&
          view.assetLayers.map((l) => (
            <span key={l.category} className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ background: l.color, opacity: 0.6 }} />
              {findAssetCategory(l.category).label}
            </span>
          ))}
        {view.debtBandHeight > 0 && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: "rgba(255,111,105,0.55)" }} />
            Debt amortising
          </span>
        )}
      </div>

      {/* hover tooltip */}
      {hoverPoint && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-[270px] rounded-xl border border-chart-border bg-card/95 px-3 py-2.5 text-xs text-foreground shadow-[var(--chart-tooltip-shadow)] backdrop-blur-md"
          style={{
            left: `${(hoverPoint.year / horizonYears) * 100}%`,
            transform: hoverPoint.year > horizonYears * 0.72 ? "translateX(-108%)" : "translateX(8%)",
          }}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Age {hoverPoint.age} · {new Date().getFullYear() + hoverPoint.year}
            </span>
            <span
              className="rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide"
              style={
                hoverPoint.phase === "drawdown"
                  ? { background: "rgba(255,111,105,0.15)", color: "#FF6F69" }
                  : { background: "rgba(11,193,141,0.15)", color: "#0BC18D" }
              }
            >
              {hoverPoint.phase === "drawdown" ? "Retired" : "Building"}
            </span>
          </div>
          <div className="mt-0.5 text-base font-bold tabular-nums">
            {formatCurrencyInteger(val(hoverPoint), currency)}
            {mode === "real" && <span className="ml-1 text-[10px] font-medium text-muted-foreground">today's $</span>}
          </div>

          {/* year flows */}
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-chart-border pt-1.5 text-[10px]">
            {hoverPoint.income > 0 && <FlowRow label="Income" value={hoverPoint.income} currency={currency} color="#2CA2FF" />}
            {hoverPoint.saved > 0 && <FlowRow label="Saved" value={hoverPoint.saved} currency={currency} color="#0BC18D" />}
            {hoverPoint.withdrawn > 0 && <FlowRow label="Withdrawn" value={-hoverPoint.withdrawn} currency={currency} color="#FF6F69" />}
            {hoverPoint.debtPayment > 0 && <FlowRow label="Debt paid" value={-hoverPoint.debtPayment} currency={currency} color="#FB923C" />}
          </div>

          <div className="mt-1.5 grid grid-cols-1 gap-0.5 border-t border-chart-border pt-1.5 text-[10px]">
            {Object.entries(hoverPoint.assetsByCategory)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([cat, v]) => {
                const meta = findAssetCategory(cat);
                const shown = mode === "real" ? v * hoverPoint.deflator : v;
                return (
                  <div key={cat} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-sm" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="tabular-nums text-foreground">{formatShort(shown, currency)}</span>
                  </div>
                );
              })}
            {hoverPoint.liabilities > 0 && (
              <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-chart-border pt-1 text-[#FF6F69]">
                <span>Debt remaining</span>
                <span className="tabular-nums">
                  −{formatShort(mode === "real" ? hoverPoint.liabilities * hoverPoint.deflator : hoverPoint.liabilities, currency)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FlowRow({ label, value, currency, color }: { label: string; value: number; currency: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums" style={{ color }}>
        {value < 0 ? "−" : "+"}
        {formatShort(Math.abs(value), currency)}/yr
      </span>
    </div>
  );
}

// ─── geometry ────────────────────────────────────────────────────────────────

function buildChart(
  series: YearPoint[],
  bands: MonteCarloBandPoint[] | null,
  settings: NetWorthSettings,
  currency: string,
  mode: "nominal" | "real",
  showBands: boolean,
  showClasses: boolean,
  fiAge: number | null,
  depletionAge: number | null,
) {
  const innerW = CHART_W - PADDING.left - PADDING.right;
  const fullInnerH = CHART_H - PADDING.top - PADDING.bottom;

  const v = (p: YearPoint) => (mode === "real" ? p.realNetWorth : p.netWorth);
  const deflate = (nominal: number, p: YearPoint) => (mode === "real" ? nominal * p.deflator : nominal);

  const debtMaxPrincipal = Math.max(0, ...series.map((p) => deflate(p.liabilities, p)));
  const debtFinal = deflate(series[series.length - 1].liabilities, series[series.length - 1]);
  const debtBandHeightAvail = debtMaxPrincipal > 0 ? fullInnerH * DEBT_BAND_RATIO : 0;
  const bandGap = debtBandHeightAvail > 0 ? 4 : 2;
  const topInnerH = fullInnerH - debtBandHeightAvail - bandGap;

  const xs = series.map((p) => p.year);
  const yearSpan = Math.max(1, xs[xs.length - 1] - xs[0]);
  const xToPx = (year: number) => PADDING.left + (innerW * (year - xs[0])) / yearSpan;

  // Y domain: deterministic series + (clamped) MC p90.
  const detMax = Math.max(1, ...series.map(v));
  const detMin = Math.min(0, ...series.map(v));
  let hi = detMax;
  let lo = detMin;
  if (showBands && bands) {
    const bandVal = (b: MonteCarloBandPoint, key: "p10" | "p90") => {
      const pt = series[Math.min(b.year, series.length - 1)];
      return deflate(b[key], pt);
    };
    const p90max = Math.max(...bands.map((b) => bandVal(b, "p90")));
    const p10min = Math.min(...bands.map((b) => bandVal(b, "p10")));
    hi = Math.max(detMax, Math.min(p90max, detMax * 2.4));
    lo = Math.min(detMin, Math.max(p10min, -detMax * 0.6), 0);
  }
  const span = Math.max(1, hi - lo);
  const yToPxRaw = (val: number) => PADDING.top + topInnerH - (topInnerH * (val - lo)) / span;
  const yToPx = (val: number) => Math.max(PADDING.top - 6, Math.min(PADDING.top + topInnerH + 6, yToPxRaw(val)));

  const yTicks: { y: number; label: string }[] = [];
  for (let i = 0; i <= 5; i++) {
    const valTick = lo + (span * i) / 5;
    yTicks.push({ y: yToPxRaw(valTick), label: formatShort(valTick, currency) });
  }
  const zeroY = lo < 0 ? yToPxRaw(0) : null;

  // stacked asset layers
  const layerPaths: { category: string; color: string; path: string }[] = [];
  if (showClasses) {
    const presentAssetCats: string[] = [];
    for (const c of ASSET_CATEGORIES) {
      if (series.some((p) => (p.assetsByCategory[c.id] ?? 0) > 0)) presentAssetCats.push(c.id);
    }
    const cumPrev = new Array(series.length).fill(0);
    for (const cat of presentAssetCats) {
      const meta = findAssetCategory(cat);
      const upperPts: string[] = [];
      const lowerPts: string[] = [];
      for (let i = 0; i < series.length; i++) {
        const raw = Math.max(0, series[i].assetsByCategory[cat] ?? 0);
        const valC = deflate(raw, series[i]);
        const lower = cumPrev[i];
        const upper = lower + valC;
        lowerPts.push(`${xToPx(series[i].year)},${yToPx(lower)}`);
        upperPts.push(`${xToPx(series[i].year)},${yToPx(upper)}`);
        cumPrev[i] = upper;
      }
      layerPaths.push({
        category: cat,
        color: meta.color,
        path: `M ${upperPts.join(" L ")} L ${lowerPts.reverse().join(" L ")} Z`,
      });
    }
  }

  // deterministic line
  const nwPts = series.map((p) => `${xToPx(p.year)},${yToPx(v(p))}`);
  const netWorthLine = `M ${nwPts.join(" L ")}`;

  // Monte Carlo fan paths
  let bandOuterPath: string | null = null;
  let bandInnerPath: string | null = null;
  let medianLine: string | null = null;
  if (showBands && bands && bands.length > 1) {
    const bandPt = (b: MonteCarloBandPoint, key: "p10" | "p25" | "p50" | "p75" | "p90") => {
      const pt = series[Math.min(b.year, series.length - 1)];
      return `${xToPx(b.year)},${yToPx(deflate(b[key], pt))}`;
    };
    const outerUpper = bands.map((b) => bandPt(b, "p90"));
    const outerLower = bands.map((b) => bandPt(b, "p10")).reverse();
    bandOuterPath = `M ${outerUpper.join(" L ")} L ${outerLower.join(" L ")} Z`;
    const innerUpper = bands.map((b) => bandPt(b, "p75"));
    const innerLower = bands.map((b) => bandPt(b, "p25")).reverse();
    bandInnerPath = `M ${innerUpper.join(" L ")} L ${innerLower.join(" L ")} Z`;
    medianLine = `M ${bands.map((b) => bandPt(b, "p50")).join(" L ")}`;
  }

  // markers
  const yearsToRetire = settings.retirementAge - settings.currentAge;
  const retirementX = yearsToRetire >= 0 && yearsToRetire <= yearSpan ? xToPx(yearsToRetire) : null;
  const fiYears = fiAge != null ? fiAge - settings.currentAge : null;
  const fiX = fiYears != null && fiYears >= 0 && fiYears <= yearSpan ? xToPx(fiYears) : null;
  const depYears = depletionAge != null ? depletionAge - settings.currentAge : null;
  const depletionX = depYears != null && depYears >= 0 && depYears <= yearSpan ? xToPx(depYears) : null;

  // debt band
  const debtBandY = PADDING.top + topInnerH + bandGap;
  const debtBandHeight = debtBandHeightAvail;
  const debtY = (valD: number) => debtBandY + debtBandHeight - (debtBandHeight * valD) / Math.max(1, debtMaxPrincipal);
  const debtTopPts = series.map((p) => `${xToPx(p.year)},${debtY(deflate(p.liabilities, p))}`);
  const debtArea =
    debtBandHeight > 0
      ? `M ${xToPx(series[0].year)},${debtBandY + debtBandHeight} L ${debtTopPts.join(" L ")} L ${xToPx(series[series.length - 1].year)},${debtBandY + debtBandHeight} Z`
      : "";
  const debtFreePoint = series.find((p, i) => i > 0 && p.liabilities <= 0.5 && series[i - 1].liabilities > 0.5);
  const debtFreeX = debtFreePoint ? xToPx(debtFreePoint.year) : null;

  return {
    topInnerH,
    yTicks,
    zeroY,
    assetLayers: layerPaths,
    netWorthLine,
    bandOuterPath,
    bandInnerPath,
    medianLine,
    retirementX,
    fiX,
    depletionX,
    debtBandY,
    debtBandHeight,
    debtArea,
    debtMaxPrincipal,
    debtFinal,
    debtFreeX,
    xToPx,
    yToPx,
    xToYear: (px: number) => {
      const ratio = (px - PADDING.left) / innerW;
      return Math.round(ratio * yearSpan);
    },
  };
}

function formatShort(v: number, currency: string): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  let s: string;
  if (abs >= 1_000_000_000) s = `${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
  else if (abs >= 1_000_000) s = `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
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
