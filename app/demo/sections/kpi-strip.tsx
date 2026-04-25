"use client";

import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Calendar,
  Repeat,
} from "lucide-react";
import { useDemoSnapshot } from "../demo-store";
import { computeKpis } from "../derived";
import { formatCurrency } from "@/lib/format";

export function DemoKpiStrip() {
  const snap = useDemoSnapshot();
  const k = computeKpis(snap);

  const cards = [
    {
      label: "This month · Income",
      value: formatCurrency(k.monthIncome, snap.family.homeCurrency),
      delta: deltaPct(k.monthIncome, k.prevMonthIncome),
      icon: TrendingUp,
      accent: "#0BC18D",
    },
    {
      label: "This month · Expenses",
      value: formatCurrency(k.monthExpenses, snap.family.homeCurrency),
      delta: deltaPct(k.monthExpenses, k.prevMonthExpenses, true),
      icon: TrendingDown,
      accent: "#2CA2FF",
    },
    {
      label: "Net this month",
      value: formatCurrency(k.monthNet, snap.family.homeCurrency),
      delta: `Savings rate ${(k.monthSavingsRate * 100).toFixed(1)}%`,
      icon: PiggyBank,
      accent: k.monthNet >= 0 ? "#0BC18D" : "#FF6F69",
    },
    {
      label: "Net worth (est.)",
      value: formatCurrency(k.netWorth, snap.family.homeCurrency),
      delta: `${snap.accounts.length} accounts`,
      icon: Wallet,
      accent: "#AD74FF",
    },
    {
      label: "YTD net",
      value: formatCurrency(k.ytdNet, snap.family.homeCurrency),
      delta: `Income ${formatCurrency(k.ytdIncome, snap.family.homeCurrency)}`,
      icon: Calendar,
      accent: "#ECAA0B",
    },
    {
      label: "Recurring / month",
      value: formatCurrency(k.recurringMonthly, snap.family.homeCurrency),
      delta: `${k.recurringCount} active`,
      icon: Repeat,
      accent: "#FF6F69",
    },
  ];

  return (
    <section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div
            key={c.label}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.06]"
            style={{ boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.04)` }}
          >
            <div
              aria-hidden
              className="absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-20 blur-2xl transition group-hover:opacity-40"
              style={{ background: c.accent }}
            />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/55">
                  {c.label}
                </p>
                <p className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">
                  {c.value}
                </p>
                <p className="mt-0.5 text-[10px] text-white/55">{c.delta}</p>
              </div>
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${c.accent}20`, color: c.accent }}
              >
                <c.icon className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function deltaPct(now: number, prev: number, lowerIsBetter = false): string {
  if (prev === 0) return "—";
  const pct = ((now - prev) / Math.abs(prev)) * 100;
  const sign = pct > 0 ? "+" : "";
  const _ = lowerIsBetter; void _;
  return `${sign}${pct.toFixed(1)}% vs last month`;
}
