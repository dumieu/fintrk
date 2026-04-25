"use client";

import { Hourglass, Crown, AlertTriangle } from "lucide-react";
import { formatCurrencyInteger } from "@/lib/format";
import { MAX_PROJECTION_AGE, type NetWorthSettings } from "@/lib/net-worth";

/**
 * Narrative card that translates the raw projection into one human sentence:
 *   "At your current pace, your money lasts X years past retirement."
 *   "You'd need $1.7M in invested assets to make this drawdown perpetual."
 */
export function FreedomCard({
  settings,
  depletionAge,
  yearsOfFreedom,
  freedomNumber,
  blendedRate,
}: {
  settings: NetWorthSettings;
  depletionAge: number | null;
  yearsOfFreedom: number | null;
  freedomNumber: number;
  blendedRate: number;
}) {
  const yearsToRetire = Math.max(0, settings.retirementAge - settings.currentAge);
  const drawdownSet = settings.annualDrawdown > 0;
  const sustainable = depletionAge == null;

  // Headline based on situation
  let headline: string;
  let icon = <Hourglass className="h-4 w-4" />;
  let accent = "#AD74FF";
  if (!drawdownSet) {
    headline = "Set an annual drawdown to see how long your wealth lasts in retirement.";
    icon = <Hourglass className="h-4 w-4" />;
    accent = "#AD74FF";
  } else if (sustainable) {
    headline = `Your portfolio can sustain ${formatCurrencyInteger(settings.annualDrawdown, settings.currency)} per year through age ${MAX_PROJECTION_AGE}+ — that's financial freedom.`;
    icon = <Crown className="h-4 w-4" />;
    accent = "#0BC18D";
  } else {
    headline = `At ${formatCurrencyInteger(settings.annualDrawdown, settings.currency)}/yr, your assets run out at age ${depletionAge}. That's ${yearsOfFreedom} years of retirement covered.`;
    icon = <AlertTriangle className="h-4 w-4" />;
    accent = "#FF6F69";
  }

  return (
    <div
      className="overflow-hidden rounded-3xl border p-5 backdrop-blur-sm sm:p-7"
      style={{
        borderColor: `${accent}30`,
        background: `linear-gradient(140deg, ${accent}10 0%, transparent 70%)`,
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accent}20`, color: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
            Freedom outlook
          </p>
          <p className="mt-1 text-base font-semibold leading-snug text-white sm:text-lg">
            {headline}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Years to retirement"
              value={`${yearsToRetire}`}
              subtitle={`age ${settings.retirementAge}`}
              accent="#2CA2FF"
            />
            <Stat
              label="Freedom number"
              value={
                freedomNumber > 0
                  ? formatCurrencyInteger(freedomNumber, settings.currency)
                  : "—"
              }
              subtitle={
                freedomNumber > 0
                  ? `${formatCurrencyInteger(settings.annualDrawdown, settings.currency)} ÷ real rate`
                  : "Set a drawdown"
              }
              accent="#ECAA0B"
            />
            <Stat
              label="Blended growth"
              value={`${Math.round(blendedRate * 100)}%`}
              subtitle={
                settings.showInflationAdjusted
                  ? "real (after inflation)"
                  : `${Math.round(settings.inflationRate * 100)}% inflation`
              }
              accent="#0BC18D"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums text-white" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-white/40">{subtitle}</p>
    </div>
  );
}
