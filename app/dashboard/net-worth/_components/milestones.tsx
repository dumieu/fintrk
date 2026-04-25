"use client";

import { motion } from "framer-motion";
import { formatCurrencyInteger } from "@/lib/format";
import { Sparkles, Crown, Mountain, Flame } from "lucide-react";
import type { YearPoint } from "@/lib/net-worth";

const ACCENT_BY_YEAR: Record<number, { color: string; icon: React.ReactNode; label: string; subtitle: string }> = {
  5:  { color: "#2CA2FF", icon: <Sparkles className="h-4 w-4" />, label: "5-year",  subtitle: "Foundation" },
  10: { color: "#0BC18D", icon: <Mountain className="h-4 w-4" />, label: "10-year", subtitle: "Momentum" },
  20: { color: "#AD74FF", icon: <Flame className="h-4 w-4" />,    label: "20-year", subtitle: "Compounding" },
  30: { color: "#ECAA0B", icon: <Crown className="h-4 w-4" />,    label: "30-year", subtitle: "Wealth horizon" },
};

export function MilestoneCards({
  milestones,
  today,
  currency,
}: {
  milestones: { years: number; point: YearPoint | null }[];
  today: { netWorth: number };
  currency: string;
}) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {milestones.map(({ years, point }, idx) => {
        const meta = ACCENT_BY_YEAR[years];
        const value = point?.netWorth ?? 0;
        const delta = value - today.netWorth;
        const multiplier = today.netWorth > 0 ? value / today.netWorth : 0;
        return (
          <motion.div
            key={years}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + idx * 0.06 }}
            className="group relative overflow-hidden rounded-2xl border p-4 sm:p-5 backdrop-blur-sm transition hover:scale-[1.015]"
            style={{
              borderColor: `${meta.color}33`,
              background: `linear-gradient(160deg, ${meta.color}12 0%, transparent 70%)`,
            }}
          >
            <div
              aria-hidden
              className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30 blur-2xl"
              style={{ background: meta.color }}
            />
            <div className="flex items-center justify-between">
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ borderColor: `${meta.color}55`, color: meta.color, background: `${meta.color}10` }}
              >
                {meta.icon}
                {meta.label}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-white/40">{meta.subtitle}</span>
            </div>
            <div className="mt-3 text-xl font-black tracking-tight text-white sm:text-2xl">
              {formatCurrencyInteger(value, currency)}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2 text-[11px] sm:text-xs">
              <span className="rounded-md px-1.5 py-0.5 font-bold" style={{ background: `${meta.color}22`, color: meta.color }}>
                {multiplier > 0 ? `${Math.round(multiplier)}×` : "—"}
              </span>
              <span className="text-white/55">
                {delta >= 0 ? "+" : ""}
                {formatCurrencyInteger(delta, currency)} vs today
              </span>
            </div>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, multiplier * 18)}%` }}
                transition={{ delay: 0.3 + idx * 0.08, duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${meta.color}, #fff8)` }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
