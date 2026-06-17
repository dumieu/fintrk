"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Crown, Flag, Milestone, ShieldCheck, Sparkles, Sunrise } from "lucide-react";
import { formatCurrencyInteger } from "@/lib/format";
import type { NetWorthSettings, ProjectionResult } from "@/lib/net-worth";

interface TimelineEvent {
  id: string;
  age: number;
  label: string;
  sub: string;
  color: string;
  icon: React.ReactNode;
}

/**
 * The life timeline: every meaningful crossing on one strip - wealth
 * thresholds, debt-free day, Coast FI, freedom age, retirement, peak wealth.
 * Recomputed from the same projection as everything else.
 */
export function MilestoneTimeline({
  projection,
  settings,
}: {
  projection: ProjectionResult;
  settings: NetWorthSettings;
}) {
  const currency = settings.currency;

  const events = useMemo(() => {
    const out: TimelineEvent[] = [];

    out.push({
      id: "today",
      age: settings.currentAge,
      label: "Today",
      sub: formatCurrencyInteger(projection.today.netWorth, currency),
      color: "#5DD3F3",
      icon: <Sparkles className="h-3.5 w-3.5" />,
    });

    for (const c of projection.crossings) {
      out.push({
        id: `cross-${c.amount}`,
        age: c.age,
        label: c.label,
        sub: "net worth crossing",
        color: "#2CA2FF",
        icon: <Milestone className="h-3.5 w-3.5" />,
      });
    }

    if (projection.debtFreeAge != null && projection.debtFreeAge > settings.currentAge) {
      out.push({
        id: "debt-free",
        age: projection.debtFreeAge,
        label: "Debt-free",
        sub: "last loan paid off",
        color: "#FB923C",
        icon: <ShieldCheck className="h-3.5 w-3.5" />,
      });
    }

    if (projection.fiAge != null) {
      out.push({
        id: "fi",
        age: projection.fiAge,
        label: "Financial freedom",
        sub: `25× spending reached`,
        color: "#0BC18D",
        icon: <Flag className="h-3.5 w-3.5" />,
      });
    }

    out.push({
      id: "retire",
      age: settings.retirementAge,
      label: "Retirement",
      sub: projection.atRetirement
        ? formatCurrencyInteger(projection.atRetirement.nominal, currency)
        : "planned stop",
      color: "#FF6F69",
      icon: <Sunrise className="h-3.5 w-3.5" />,
    });

    if (
      projection.peakNetWorth.value > projection.today.netWorth &&
      projection.peakNetWorth.age !== settings.retirementAge
    ) {
      out.push({
        id: "peak",
        age: projection.peakNetWorth.age,
        label: "Peak wealth",
        sub: formatCurrencyInteger(projection.peakNetWorth.value, currency),
        color: "#ECAA0B",
        icon: <Crown className="h-3.5 w-3.5" />,
      });
    }

    if (projection.depletionAge != null) {
      out.push({
        id: "depletion",
        age: projection.depletionAge,
        label: "Funds depleted",
        sub: "spending outruns assets",
        color: "#EF4444",
        icon: <Flag className="h-3.5 w-3.5" />,
      });
    }

    return out
      .filter((e) => e.age >= settings.currentAge && e.age <= 100)
      .sort((a, b) => a.age - b.age);
  }, [projection, settings, currency]);

  if (events.length <= 1) return null;

  const minAge = settings.currentAge;
  const maxAge = Math.max(...events.map((e) => e.age), settings.retirementAge) + 2;
  const span = Math.max(1, maxAge - minAge);

  return (
    <div className="rounded-3xl border border-chart-border bg-chart-muted/40 p-5 backdrop-blur-sm sm:p-7">
      <div className="flex items-center gap-2">
        <Milestone className="h-4 w-4 text-[#2CA2FF]" />
        <h2 className="text-lg font-bold text-foreground sm:text-xl">Your life timeline</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Every crossing your current plan produces, laid out by age. Move a lever and watch the flags slide.
      </p>

      {/* rail */}
      <div className="relative mt-12 hidden h-1.5 rounded-full bg-chart-muted sm:block">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(100, ((settings.retirementAge - minAge) / span) * 100)}%`,
            background: "linear-gradient(90deg, #2CA2FF66, #0BC18D66)",
          }}
        />
        {events.map((e, i) => {
          const pct = ((e.age - minAge) / span) * 100;
          const above = i % 2 === 0;
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: above ? 6 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="absolute"
              style={{ left: `${pct}%` }}
            >
              <span
                className="absolute -translate-x-1/2 rounded-full border-2"
                style={{
                  width: 13,
                  height: 13,
                  top: -3.5,
                  borderColor: e.color,
                  background: "var(--chart-surface)",
                }}
              />
              <div
                className={`absolute w-32 -translate-x-1/2 text-center ${above ? "bottom-4" : "top-5"}`}
              >
                <p className="flex items-center justify-center gap-1 text-[10px] font-bold" style={{ color: e.color }}>
                  {e.icon}
                  {e.label}
                </p>
                <p className="text-[9px] font-semibold text-muted-foreground">
                  age {e.age} · {e.sub}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="hidden h-12 sm:block" />

      {/* mobile: stacked list */}
      <div className="mt-4 flex flex-col gap-2 sm:hidden">
        {events.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-3 rounded-xl border border-chart-border bg-chart-muted/50 px-3 py-2"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${e.color}1c`, color: e.color }}
            >
              {e.icon}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">
                {e.label} <span className="font-semibold text-muted-foreground">· age {e.age}</span>
              </p>
              <p className="truncate text-[10px] text-muted-foreground">{e.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
