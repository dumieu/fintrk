"use client";

import { useMemo } from "react";

interface MonthlyMix {
  month: string;
  total: number;
  byParent: Record<string, number>;
}
interface ParentSlice {
  name: string;
  color: string;
}

interface Props {
  monthly: MonthlyMix[];
  parents: ParentSlice[];
  currency: string;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Lifeline — a horizontal "spending chromatogram":
 *  Each month is a vertical column; categories are stacked vertically
 *  proportional to their share of that month. The result is a flowing
 *  spectrum of how the user's spending mix evolved over time.
 *
 *  This is intentionally pure CSS (flex + percentage heights). No canvas.
 * ────────────────────────────────────────────────────────────────────────── */
export function Lifeline({ monthly, parents, currency }: Props) {
  const palette = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of parents) map[p.name] = p.color;
    return map;
  }, [parents]);

  const fmt = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }),
    [currency],
  );

  const maxTotal = Math.max(1, ...monthly.map((m) => m.total));

  if (monthly.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-sm text-white/50">
        Not enough months of history to draw a lifeline yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-950/80 to-black/80 p-5 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300/80">
            Lifeline — Spending Chromatogram
          </div>
          <h3 className="text-xl font-bold text-white">Every month, side by side</h3>
        </div>
        <div className="text-[11px] text-white/45">
          column height = monthly outflow • bands = category mix
        </div>
      </div>

      <div className="flex h-56 items-end gap-1 rounded-2xl bg-black/30 p-3">
        {monthly.map((m) => {
          const heightPct = (m.total / maxTotal) * 100;
          const sorted = Object.entries(m.byParent)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);
          const monthSum = sorted.reduce((s, [, v]) => s + v, 0) || 1;
          return (
            <div
              key={m.month}
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${m.month} • ${fmt.format(Math.round(m.total))}`}
            >
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-md transition-all group-hover:ring-2 group-hover:ring-white/30"
                style={{ height: `${heightPct}%` }}
              >
                {sorted.map(([name, v]) => (
                  <div
                    key={name}
                    style={{
                      height: `${(v / monthSum) * 100}%`,
                      backgroundColor: palette[name] || "#888",
                    }}
                  />
                ))}
              </div>

              {/* Hover popover */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-xs text-white shadow-xl backdrop-blur group-hover:block">
                <div className="font-semibold">{m.month}</div>
                <div className="text-white/60">{fmt.format(Math.round(m.total))} total</div>
                <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                  {sorted.slice(0, 6).map(([name, v]) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette[name] || "#888" }} />
                      <span className="flex-1">{name}</span>
                      <span className="text-white/70">{fmt.format(Math.round(v))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Month labels (sparse) */}
      <div className="mt-2 flex gap-1 px-3 text-[10px] text-white/40">
        {monthly.map((m, i) => {
          const showLabel = monthly.length <= 12 || i % Math.ceil(monthly.length / 12) === 0;
          return (
            <div key={m.month} className="flex-1 text-center tabular-nums">
              {showLabel ? m.month.slice(2) : ""}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/70">
        {parents.slice(0, 10).map((p) => (
          <div key={p.name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
