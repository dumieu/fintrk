"use client";

import { useMemo } from "react";
import {
  Lightbulb,
  PiggyBank,
  CalendarMinus,
  TrendingDown,
  Flame,
  CreditCard,
  Target,
} from "lucide-react";
import {
  project,
  type NetWorthItem,
  type NetWorthSettings,
  type ProjectionResult,
} from "@/lib/net-worth";

/**
 * Live sensitivity engine: each card re-runs the full projection with one
 * lever nudged, then reports the delta. Updates with every input change so
 * users see exactly which lever buys them the most freedom.
 */
export function InsightDeck({
  items,
  settings,
  base,
}: {
  items: NetWorthItem[];
  settings: NetWorthSettings;
  base: ProjectionResult;
}) {
  const cards = useMemo(() => {
    const out: {
      id: string;
      icon: React.ReactNode;
      accent: string;
      title: string;
      headline: string;
      detail: string;
    }[] = [];

    const currency = settings.currency;
    const atRet = (p: ProjectionResult) => p.atRetirement?.nominal ?? 0;

    // 1) Save more
    {
      const bump = settings.monthlyContribution >= 5_000 ? 1_000 : 500;
      const alt = project(items, { ...settings, monthlyContribution: settings.monthlyContribution + bump });
      const fiDelta = base.fiAge != null && alt.fiAge != null ? base.fiAge - alt.fiAge : null;
      const nwDelta = atRet(alt) - atRet(base);
      out.push({
        id: "save-more",
        icon: <PiggyBank className="h-4 w-4" />,
        accent: "#0BC18D",
        title: `Save ${money(bump, currency)} more / month`,
        headline:
          fiDelta != null && fiDelta > 0
            ? `Freedom arrives ${fiDelta} year${fiDelta === 1 ? "" : "s"} sooner`
            : alt.fiAge != null && base.fiAge == null
              ? `Unlocks freedom at age ${alt.fiAge}`
              : `+${money(nwDelta, currency)} at retirement`,
        detail:
          fiDelta != null && fiDelta > 0
            ? `And ${money(nwDelta, currency)} more waiting at age ${settings.retirementAge}.`
            : `Compounding turns ${money(bump * 12, currency)}/yr into real acceleration.`,
      });
    }

    // 2) Retire 2 years earlier
    if (settings.retirementAge - 2 >= settings.currentAge) {
      const alt = project(items, { ...settings, retirementAge: settings.retirementAge - 2 });
      const costAtRet = atRet(base) - (alt.atRetirement?.nominal ?? 0);
      const lastsBase = base.depletionAge != null ? `${base.depletionAge}` : "100+";
      const lastsAlt = alt.depletionAge != null ? `${alt.depletionAge}` : "100+";
      out.push({
        id: "retire-earlier",
        icon: <CalendarMinus className="h-4 w-4" />,
        accent: "#ECAA0B",
        title: `Retire at ${settings.retirementAge - 2} instead`,
        headline:
          alt.depletionAge != null && base.depletionAge == null
            ? `Money would now run out at ${alt.depletionAge}`
            : `Money lasts to ${lastsAlt} (vs ${lastsBase})`,
        detail: `Two fewer earning years cost about ${money(Math.max(0, costAtRet), currency)} at the retirement line.`,
      });
    }

    // 3) Returns 2% lower
    {
      const alt = project(items, {
        ...settings,
        defaultGrowthRate: Math.max(0, settings.defaultGrowthRate - 0.02),
      });
      const nwDelta = atRet(base) - atRet(alt);
      out.push({
        id: "returns-lower",
        icon: <TrendingDown className="h-4 w-4" />,
        accent: "#FB923C",
        title: "If returns run 2% colder",
        headline: `${money(Math.max(0, nwDelta), currency)} less at retirement`,
        detail:
          alt.depletionAge != null && base.depletionAge == null
            ? `And the plan would deplete at age ${alt.depletionAge}. Returns matter - so does the buffer.`
            : "Your plan still holds. That is the margin of safety working.",
      });
    }

    // 4) Inflation +1%
    {
      const alt = project(items, { ...settings, inflationRate: settings.inflationRate + 0.01 });
      const lastsAlt = alt.depletionAge;
      out.push({
        id: "inflation",
        icon: <Flame className="h-4 w-4" />,
        accent: "#FF6F69",
        title: "If inflation runs 1% hotter",
        headline:
          lastsAlt != null && base.depletionAge == null
            ? `Funds would deplete at age ${lastsAlt}`
            : lastsAlt != null && base.depletionAge != null
              ? `Depletion moves from ${base.depletionAge} to ${lastsAlt}`
              : "Plan survives - spending stays covered to 100",
        detail: `Every withdrawal is indexed, so hotter inflation quietly raises your real burn rate.`,
      });
    }

    // 5) Debt reality
    if (base.totalInterestPaid > 1_000) {
      out.push({
        id: "debt",
        icon: <CreditCard className="h-4 w-4" />,
        accent: "#EF4444",
        title: "The true cost of your debt",
        headline: `${money(base.totalInterestPaid, currency)} in lifetime interest`,
        detail:
          base.debtFreeAge != null
            ? `Debt-free at ${base.debtFreeAge}. Extra principal payments shrink both numbers.`
            : "Interest accrues faster than the payoff schedule - prioritise the highest APR.",
      });
    }

    // 6) Savings-rate guidance
    if (settings.annualIncome > 0 && base.savingsRate != null) {
      const ratePct = Math.round(base.savingsRate * 100);
      const target = 0.2;
      if (base.savingsRate < target) {
        const needed = Math.round((settings.annualIncome * target) / 12);
        out.push({
          id: "rate",
          icon: <Target className="h-4 w-4" />,
          accent: "#2CA2FF",
          title: `Savings rate: ${ratePct}%`,
          headline: `${money(needed, currency)}/mo reaches the 20% benchmark`,
          detail: "Savings rate is the single strongest lever for the freedom age - stronger than returns.",
        });
      } else {
        out.push({
          id: "rate",
          icon: <Target className="h-4 w-4" />,
          accent: "#0BC18D",
          title: `Savings rate: ${ratePct}%`,
          headline: ratePct >= 30 ? "Elite tier - FI-grade saving" : "Above the 20% benchmark",
          detail:
            base.coastFiNumber > 0 && base.coastFiAchieved
              ? "You have hit Coast FI: even with zero new savings, growth alone carries you to freedom."
              : "Keep the rate steady through raises and the curve bends up on its own.",
        });
      }
    }

    return out.slice(0, 6);
  }, [items, settings, base]);

  return (
    <div className="rounded-3xl border border-chart-border bg-chart-muted/40 p-5 backdrop-blur-sm sm:p-7">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-[#ECAA0B]" />
        <h2 className="text-lg font-bold text-foreground sm:text-xl">What moves your number</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Each card re-runs your full plan with one lever nudged - live sensitivity analysis on your actual balance sheet.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border p-4 transition hover:scale-[1.01]"
            style={{
              borderColor: `${c.accent}28`,
              background: `linear-gradient(160deg, ${c.accent}0d 0%, transparent 70%)`,
            }}
          >
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: c.accent }}>
              {c.icon}
              {c.title}
            </p>
            <p className="mt-1.5 text-sm font-bold leading-snug text-foreground">{c.headline}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{c.detail}</p>
          </div>
        ))}
      </div>
    </div>
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
