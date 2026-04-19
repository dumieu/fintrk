"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";

interface ParentSlice {
  id: number;
  name: string;
  color: string;
  monthly: number;
}

interface Props {
  parents: ParentSlice[];
  baselineMonthlyOutflow: number;
  baselineMonthlyInflow: number;
  currency: string;
  externalReclaim: number; // dollars/month already "fixed" via leak cards
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Tomorrow Simulator
 *
 *  - Sliders for each top parent category (cut from -50% to +25%).
 *  - Live recompute of monthly outflow + 12-mo cumulative savings.
 *  - Animated forecast curve drawn on canvas: gray = current trajectory,
 *    gold = adjusted trajectory.
 *  - The "external reclaim" line (from leak cards the user toggles) feeds
 *    in here too — applying a leak instantly bends the gold curve upward.
 * ────────────────────────────────────────────────────────────────────────── */
export function TomorrowSimulator({
  parents,
  baselineMonthlyOutflow,
  baselineMonthlyInflow,
  currency,
  externalReclaim,
}: Props) {
  const top = useMemo(() => parents.slice(0, 6), [parents]);
  const [adj, setAdj] = useState<Record<number, number>>(() =>
    Object.fromEntries(top.map((p) => [p.id, 0])),
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 220 });
  const wrapRef = useRef<HTMLDivElement>(null);

  const fmt = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }),
    [currency],
  );

  // Reset adj if parents change shape
  useEffect(() => {
    setAdj(Object.fromEntries(top.map((p) => [p.id, 0])));
  }, [top]);

  // Total monthly delta from sliders (positive = saved)
  const sliderReclaim = useMemo(() => {
    let saved = 0;
    for (const p of top) {
      const pct = adj[p.id] ?? 0; // -50..+25
      saved += -p.monthly * (pct / 100); // negative pct → save money (positive saved)
    }
    return saved;
  }, [adj, top]);

  const totalReclaim = sliderReclaim + externalReclaim;
  const adjustedMonthlyOutflow = baselineMonthlyOutflow - totalReclaim;
  const adjustedMonthlyNet = baselineMonthlyInflow - adjustedMonthlyOutflow;
  const annualSaving = totalReclaim * 12;
  const tenYear = totalReclaim * 12 * 10; // straight-line, no compounding

  /* ─── Resize observer for responsive canvas ─────────────────────── */
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setSize({ w: Math.max(280, w), h: 220 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ─── Canvas render ─────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let destroyed = false;
    const start = performance.now();

    function frame(now: number) {
      if (destroyed || !ctx) return;
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, size.w, size.h);

      const padL = 44;
      const padR = 16;
      const padT = 18;
      const padB = 28;
      const innerW = size.w - padL - padR;
      const innerH = size.h - padT - padB;
      const months = 12;

      // Series: cumulative savings under current vs adjusted
      const baselineSeries: number[] = [];
      const adjustedSeries: number[] = [];
      for (let i = 0; i <= months; i++) {
        baselineSeries.push((baselineMonthlyInflow - baselineMonthlyOutflow) * i);
        adjustedSeries.push(adjustedMonthlyNet * i);
      }

      const allMax = Math.max(
        Math.abs(Math.min(...baselineSeries, ...adjustedSeries)),
        Math.abs(Math.max(...baselineSeries, ...adjustedSeries)),
        1,
      );

      // Y axis baseline (zero line)
      const zeroY = padT + innerH / 2;
      const yScale = (innerH / 2) / allMax;

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const y = padT + (innerH * g) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(size.w - padR, y);
        ctx.stroke();
      }

      // Zero line
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(padL, zeroY);
      ctx.lineTo(size.w - padR, zeroY);
      ctx.stroke();

      // Month labels
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "10px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let i = 0; i <= months; i += 2) {
        const x = padL + (innerW * i) / months;
        ctx.fillText(`+${i}m`, x, size.h - padB + 6);
      }

      // Y labels
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let g = 0; g <= 4; g++) {
        const y = padT + (innerH * g) / 4;
        const v = allMax - (g / 4) * allMax * 2;
        ctx.fillText(formatCompact(v, currency), padL - 6, y);
      }

      // Baseline curve
      drawSeries(ctx, baselineSeries, padL, padT, innerW, innerH, zeroY, yScale, "rgba(255,255,255,0.32)", false);

      // Adjusted curve with gold gradient + subtle pulse
      const pulse = 0.85 + Math.sin(t * 2.4) * 0.08;
      drawSeries(
        ctx,
        adjustedSeries,
        padL,
        padT,
        innerW,
        innerH,
        zeroY,
        yScale,
        "rgba(11,193,141,0.95)",
        true,
        pulse,
      );

      // End-of-curve label
      const endX = padL + innerW;
      const endY = clamp(zeroY - adjustedSeries[months] * yScale, padT + 6, padT + innerH - 6);
      ctx.fillStyle = "#0BC18D";
      ctx.beginPath();
      ctx.arc(endX - 2, endY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "700 11px ui-sans-serif, system-ui";
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(
        `12-mo: ${fmt.format(Math.round(adjustedSeries[months]))}`,
        endX - 8,
        endY - 8,
      );

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
    };
  }, [size, baselineMonthlyInflow, baselineMonthlyOutflow, adjustedMonthlyNet, currency, fmt]);

  function reset() {
    setAdj(Object.fromEntries(top.map((p) => [p.id, 0])));
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-950/80 to-black/80 p-5 shadow-2xl backdrop-blur-md">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">
            <Sparkles className="h-3.5 w-3.5" />
            Tomorrow Simulator
          </div>
          <h3 className="mt-1 text-xl font-bold text-white">
            What if you adjusted these levers?
          </h3>
          <p className="mt-1 text-xs text-white/55">
            Move a slider — watch the green curve project the next 12 months in real time.
            Anything you "Plug" up top stacks on top.
          </p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      {/* Live counters */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Counter label="Reclaimed / mo" value={fmt.format(Math.round(totalReclaim))} accent="#0BC18D" />
        <Counter label="Reclaimed / yr" value={fmt.format(Math.round(annualSaving))} accent="#22D3EE" />
        <Counter label="New monthly net" value={fmt.format(Math.round(adjustedMonthlyNet))} accent={adjustedMonthlyNet >= 0 ? "#A3E635" : "#F87171"} />
        <Counter label="10-year delta" value={fmt.format(Math.round(tenYear))} accent="#FACC15" />
      </div>

      {/* Forecast canvas */}
      <div ref={wrapRef} className="mt-4 rounded-2xl border border-white/5 bg-black/30 p-2">
        <canvas ref={canvasRef} className="block w-full" />
      </div>

      {/* Sliders */}
      <div className="mt-5 space-y-3">
        {top.map((p) => {
          const pct = adj[p.id] ?? 0;
          const newMonthly = p.monthly * (1 + pct / 100);
          return (
            <div key={p.id} className="grid grid-cols-[110px_1fr_120px] items-center gap-3 text-xs">
              <div className="flex items-center gap-2 truncate">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="truncate font-semibold text-white">{p.name}</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min={-50}
                  max={25}
                  step={1}
                  value={pct}
                  onChange={(e) => setAdj((a) => ({ ...a, [p.id]: parseInt(e.target.value, 10) }))}
                  className="w-full accent-emerald-400"
                  style={{ accentColor: p.color }}
                />
                <div className="mt-0.5 flex justify-between text-[9px] text-white/30">
                  <span>-50%</span>
                  <span>baseline</span>
                  <span>+25%</span>
                </div>
              </div>
              <div className="text-right">
                <div className={`font-bold ${pct < 0 ? "text-emerald-300" : pct > 0 ? "text-rose-300" : "text-white/80"}`}>
                  {pct > 0 ? "+" : ""}{pct}%
                </div>
                <div className="text-[10px] text-white/45">
                  {fmt.format(Math.round(newMonthly))} / mo
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Counter({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-0.5 text-xl font-extrabold tabular-nums" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function drawSeries(
  ctx: CanvasRenderingContext2D,
  series: number[],
  padL: number,
  padT: number,
  innerW: number,
  innerH: number,
  zeroY: number,
  yScale: number,
  color: string,
  fill: boolean,
  pulse: number = 1,
) {
  const months = series.length - 1;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;

  if (fill) {
    const grad = ctx.createLinearGradient(0, padT, 0, padT + innerH);
    grad.addColorStop(0, `rgba(11,193,141,${0.35 * pulse})`);
    grad.addColorStop(1, `rgba(11,193,141,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    for (let i = 0; i <= months; i++) {
      const x = padL + (innerW * i) / months;
      const y = clamp(zeroY - series[i] * yScale, padT, padT + innerH);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + innerW, zeroY);
    ctx.closePath();
    ctx.fill();
  }

  ctx.beginPath();
  for (let i = 0; i <= months; i++) {
    const x = padL + (innerW * i) / months;
    const y = clamp(zeroY - series[i] * yScale, padT, padT + innerH);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function formatCompact(v: number, currency: string) {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${Math.round(abs)}`;
  // currency symbol omitted in tight axis labels — header carries the unit.
  void currency;
}
