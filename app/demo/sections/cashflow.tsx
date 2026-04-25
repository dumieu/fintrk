"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import { useDemoSnapshot } from "../demo-store";
import { monthlySeries } from "../derived";
import { formatCurrency } from "@/lib/format";

export function DemoCashflowSection() {
  const snap = useDemoSnapshot();
  const data = useMemo(() => monthlySeries(snap, 24), [snap]);

  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expenses)));
  const avgIncome = data.reduce((s, d) => s + d.income, 0) / Math.max(1, data.length);
  const avgExpenses = data.reduce((s, d) => s + d.expenses, 0) / Math.max(1, data.length);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Activity className="h-4 w-4 text-[#2CA2FF]" />
            24-month cashflow
          </h2>
          <p className="text-[11px] text-white/55">
            Income vs expenses for every month — full Sterling-family history.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px]">
          <Legend color="#0BC18D" label={`Avg income · ${formatCurrency(avgIncome, snap.family.homeCurrency)}`} />
          <Legend color="#FF6F69" label={`Avg expenses · ${formatCurrency(avgExpenses, snap.family.homeCurrency)}`} />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto pb-1">
        <div className="grid items-end gap-1 sm:gap-1.5" style={{ minHeight: 240, gridTemplateColumns: `repeat(${data.length}, minmax(36px, 1fr))` }}>
          {data.map((d) => {
            const incH = (d.income / max) * 200;
            const expH = (d.expenses / max) * 200;
            const positive = d.net >= 0;
            return (
              <div key={d.month} className="flex flex-col items-center gap-1">
                <div className="relative flex h-[210px] w-full items-end justify-center gap-0.5">
                  <div
                    className="w-[45%] rounded-t-md"
                    style={{
                      height: `${Math.max(2, incH)}px`,
                      background: "linear-gradient(to top, rgba(11,193,141,0.55), rgba(11,193,141,1))",
                    }}
                    title={`Income: ${formatCurrency(d.income, snap.family.homeCurrency)}`}
                  />
                  <div
                    className="w-[45%] rounded-t-md"
                    style={{
                      height: `${Math.max(2, expH)}px`,
                      background: "linear-gradient(to top, rgba(255,111,105,0.55), rgba(255,111,105,1))",
                    }}
                    title={`Expenses: ${formatCurrency(d.expenses, snap.family.homeCurrency)}`}
                  />
                  <span
                    className="absolute -top-4 text-[8px] font-bold tabular-nums"
                    style={{ color: positive ? "#0BC18D" : "#FF6F69" }}
                  >
                    {positive ? "+" : ""}{Math.round(d.net / 1000)}k
                  </span>
                </div>
                <span className="text-[8px] whitespace-nowrap text-white/45 sm:text-[9px]">{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-white/65">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
