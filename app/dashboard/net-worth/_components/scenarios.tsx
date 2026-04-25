"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { project, type NetWorthItem, type NetWorthSettings } from "@/lib/net-worth";
import { formatCurrencyInteger } from "@/lib/format";

const SCENARIOS = [
  { id: "conservative", label: "Conservative", rate: 0.06, color: "#2CA2FF" },
  { id: "expected",     label: "Expected",     rate: 0.10, color: "#0BC18D" },
  { id: "aggressive",   label: "Aggressive",   rate: 0.13, color: "#ECAA0B" },
];

/**
 * Quick A/B/C side-by-side: how much does the 30-year outcome change if
 * you nudge the default growth rate? Powerful narrative tool that pairs
 * with the slider above — answers "what if I'm wrong about returns?"
 */
export function ScenarioStrip({
  items,
  settings,
}: {
  items: NetWorthItem[];
  settings: NetWorthSettings;
}) {
  const rows = useMemo(
    () =>
      SCENARIOS.map((s) => {
        const proj = project(items, { ...settings, defaultGrowthRate: s.rate });
        return {
          ...s,
          at5:  proj.milestones.find((m) => m.years === 5)?.point?.netWorth ?? 0,
          at10: proj.milestones.find((m) => m.years === 10)?.point?.netWorth ?? 0,
          at20: proj.milestones.find((m) => m.years === 20)?.point?.netWorth ?? 0,
          at30: proj.milestones.find((m) => m.years === 30)?.point?.netWorth ?? 0,
        };
      }),
    [items, settings],
  );

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 backdrop-blur-sm sm:p-7">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-[#2CA2FF]" />
        <h2 className="text-lg font-bold text-white sm:text-xl">Scenario compare</h2>
      </div>
      <p className="mt-1 text-xs text-white/55">
        Same balance sheet, three different growth assumptions. The gap tells you how much your
        retirement depends on returns vs. contributions.
      </p>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[1fr_repeat(4,1fr)] gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/45">
            <span>Scenario</span>
            <span className="text-right">+5y</span>
            <span className="text-right">+10y</span>
            <span className="text-right">+20y</span>
            <span className="text-right">+30y</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_repeat(4,1fr)] items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-2.5 text-sm text-white"
              style={{ borderColor: `${r.color}25` }}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                <div>
                  <div className="text-sm font-bold">{r.label}</div>
                  <div className="text-[10px] text-white/45">{Math.round(r.rate * 100)}% / yr</div>
                </div>
              </div>
              <Cell value={r.at5}  currency={settings.currency} />
              <Cell value={r.at10} currency={settings.currency} />
              <Cell value={r.at20} currency={settings.currency} />
              <Cell value={r.at30} currency={settings.currency} accent={r.color} bold />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cell({
  value, currency, accent, bold,
}: {
  value: number;
  currency: string;
  accent?: string;
  bold?: boolean;
}) {
  return (
    <span
      className={`text-right tabular-nums ${bold ? "text-base font-black" : "font-semibold text-white/85"}`}
      style={accent ? { color: accent } : undefined}
    >
      {formatCurrencyInteger(value, currency)}
    </span>
  );
}
