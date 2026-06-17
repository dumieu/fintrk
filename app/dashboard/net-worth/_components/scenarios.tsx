"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import {
  monteCarlo,
  project,
  type NetWorthItem,
  type NetWorthSettings,
} from "@/lib/net-worth";

const SCENARIOS = [
  { id: "cautious",   label: "Cautious",   shift: -0.03, color: "#2CA2FF", note: "all returns −3%" },
  { id: "expected",   label: "Your plan",  shift: 0,     color: "#0BC18D", note: "current assumptions" },
  { id: "optimistic", label: "Optimistic", shift: 0.03,  color: "#ECAA0B", note: "all returns +3%" },
];

/**
 * Three full worlds, side by side. The shift applies to every asset's return
 * (including per-item overrides), so the comparison is honest even when the
 * balance sheet uses custom rates. Each row runs the deterministic engine
 * plus a Monte Carlo pass.
 */
export function ScenarioMatrix({
  items,
  settings,
}: {
  items: NetWorthItem[];
  settings: NetWorthSettings;
}) {
  const rows = useMemo(
    () =>
      SCENARIOS.map((s) => {
        const shiftedItems = items.map((it) =>
          it.kind === "asset"
            ? { ...it, growthRate: (it.growthRate ?? settings.defaultGrowthRate) + s.shift }
            : it,
        );
        const shiftedSettings = {
          ...settings,
          defaultGrowthRate: settings.defaultGrowthRate + s.shift,
        };
        const proj = project(shiftedItems, shiftedSettings);
        const mc = monteCarlo(shiftedItems, shiftedSettings, { runs: 150, seed: 7 });
        return {
          ...s,
          fiAge: proj.fiAge,
          atRetirement: proj.atRetirement?.nominal ?? 0,
          at30: proj.milestones.find((m) => m.years === 30)?.point?.netWorth ?? 0,
          lastsTo: proj.depletionAge,
          success: mc.successProbability,
        };
      }),
    [items, settings],
  );

  return (
    <div className="rounded-3xl border border-chart-border bg-chart-muted/40 p-5 backdrop-blur-sm sm:p-7">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-[#2CA2FF]" />
        <h2 className="text-lg font-bold text-foreground sm:text-xl">Three futures</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Your exact plan run through colder and hotter markets - every asset&rsquo;s return shifted, full simulation each.
      </p>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[1.2fr_repeat(5,1fr)] gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Scenario</span>
            <span className="text-right">Freedom age</span>
            <span className="text-right">At retirement</span>
            <span className="text-right">+30y</span>
            <span className="text-right">Lasts to</span>
            <span className="text-right">Success</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[1.2fr_repeat(5,1fr)] items-center gap-2 rounded-xl border bg-chart-muted/60 px-2 py-2.5 text-sm text-foreground"
              style={{ borderColor: `${r.color}28` }}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                <div>
                  <div className="text-sm font-bold">{r.label}</div>
                  <div className="text-[10px] text-muted-foreground">{r.note}</div>
                </div>
              </div>
              <Cell text={r.fiAge != null ? `${r.fiAge}` : "—"} />
              <Cell text={money(r.atRetirement, settings.currency)} />
              <Cell text={money(r.at30, settings.currency)} />
              <Cell
                text={r.lastsTo != null ? `${r.lastsTo}` : "100+"}
                color={r.lastsTo != null ? "#FF6F69" : "#0BC18D"}
              />
              <Cell
                text={`${Math.round(r.success * 100)}%`}
                color={r.success >= 0.8 ? "#0BC18D" : r.success >= 0.6 ? "#ECAA0B" : "#FF6F69"}
                bold
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cell({ text, color, bold }: { text: string; color?: string; bold?: boolean }) {
  return (
    <span
      className={`text-right tabular-nums ${bold ? "text-base font-black" : "font-semibold"}`}
      style={color ? { color } : undefined}
    >
      {text}
    </span>
  );
}

function money(v: number, currency: string): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  let s: string;
  if (abs >= 1_000_000_000) s = `${(abs / 1_000_000_000).toFixed(1)}B`;
  else if (abs >= 1_000_000) s = `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
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
