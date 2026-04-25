"use client";

import { useMemo, useState } from "react";
import { PieChart } from "lucide-react";
import { useDemoSnapshot } from "../demo-store";
import { donutSegments, topCategories } from "../derived";
import { formatCurrency } from "@/lib/format";

export function DemoCategoriesSection() {
  const snap = useDemoSnapshot();
  const [months, setMonths] = useState<1 | 3 | 12>(3);

  const buckets = useMemo(() => topCategories(snap, months), [snap, months]);
  const segments = useMemo(() => donutSegments(buckets, 7), [buckets]);
  const total = segments.reduce((s, x) => s + x.value, 0);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <PieChart className="h-4 w-4 text-[#ECAA0B]" />
            Where every dollar went
          </h2>
          <p className="text-[11px] text-white/55">
            Total expenses · {formatCurrency(total, snap.family.homeCurrency)}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          {[1, 3, 12].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonths(m as 1 | 3 | 12)}
              className={`px-3 py-1 text-[10px] font-medium transition ${
                months === m ? "rounded bg-white/15 text-white" : "text-white/55 hover:text-white/85"
              }`}
            >
              {m === 1 ? "1M" : m === 3 ? "3M" : "1Y"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-[200px_1fr] sm:items-center">
        <Donut segments={segments} total={total} currency={snap.family.homeCurrency} />
        <div className="flex flex-col gap-1.5">
          {segments.map((s) => {
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <div key={s.name} className="flex items-center gap-3">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
                <div className="flex flex-1 items-center justify-between gap-2 text-xs">
                  <span className="truncate text-white/85">{s.name}</span>
                  <span className="tabular-nums text-white/65">
                    {formatCurrency(s.value, snap.family.homeCurrency)}{" "}
                    <span className="text-white/40">· {pct.toFixed(1)}%</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Donut({
  segments,
  total,
  currency,
}: {
  segments: { name: string; value: number; color: string }[];
  total: number;
  currency: string;
}) {
  if (total <= 0) return <div className="h-44 w-44 rounded-full border border-white/10" />;
  const radius = 70;
  const innerRadius = 46;
  const cx = 100;
  const cy = 100;
  let acc = 0;
  const arcs = segments.map((s) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += s.value;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);
    const ix1 = cx + innerRadius * Math.cos(end);
    const iy1 = cy + innerRadius * Math.sin(end);
    const ix2 = cx + innerRadius * Math.cos(start);
    const iy2 = cy + innerRadius * Math.sin(start);
    const large = end - start > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${ix2} ${iy2} Z`;
    return <path key={s.name} d={d} fill={s.color} fillOpacity={0.92} />;
  });
  return (
    <div className="relative">
      <svg viewBox="0 0 200 200" className="h-44 w-44">
        {arcs}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[9px] font-medium uppercase tracking-wider text-white/45">Total</span>
        <span className="text-base font-bold text-white">{formatCurrency(total, currency)}</span>
      </div>
    </div>
  );
}
