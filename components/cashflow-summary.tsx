"use client";

import { useEffect, useState } from "react";
import type { CashflowSummaryResponse } from "@/app/api/analytics/cashflow-summary/route";
import { chartChipClass, chartPanelClass } from "@/lib/chart-ui";
import { cn } from "@/lib/utils";

/** Compact short-form (e.g. 32_456 → "32.5K"). Mirrors the chart formatter. */
function compact(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${sign}${(a / 1_000).toFixed(a >= 10_000 ? 1 : 1)}K`;
  return `${sign}${Math.round(a).toLocaleString()}`;
}

/**
 * Header summary tile: `FCF Monthly − Expenses Monthly = Surplus | Gap`.
 * Renders as a single horizontal line (collapses cleanly on narrow widths).
 *
 * - FCF Monthly  = avg monthly income (positive flows)
 * - Expenses     = avg monthly expenses (|negative flows|)
 * - Result       = FCF − Expenses: green + "Surplus Monthly" if non-negative, red + "Gap Monthly" if negative
 */
export function CashflowSummary({
  months = 12,
  variant = "default",
}: {
  months?: number;
  variant?: "default" | "ribbon";
}) {
  const [data, setData] = useState<CashflowSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/analytics/cashflow-summary?months=${months}`)
      .then((r) => r.json())
      .then((j: CashflowSummaryResponse | { error: string }) => {
        if (cancelled) return;
        if (!("error" in j)) setData(j);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [months]);

  const ribbon = variant === "ribbon";

  if (loading && !data) {
    return (
      <div
        aria-hidden
        className={
          ribbon
            ? "h-[46px] w-[240px] animate-pulse rounded-lg border border-chart-border bg-chart-muted sm:w-[280px]"
            : "h-[58px] w-[280px] animate-pulse rounded-xl border border-chart-border bg-chart-muted"
        }
      />
    );
  }
  if (!data || data.monthsUsed === 0) return null;

  const isSurplus = data.gap >= 0;
  const gapColor = isSurplus ? "text-[#39FF14]" : "text-[#FF5577]";
  const gapShadow = isSurplus
    ? "0 0 12px rgba(57,255,20,0.45)"
    : "0 0 12px rgba(255,85,119,0.45)";
  const resultLabel = isSurplus ? "Surplus" : "Gap";

  return (
    <div
      className={cn(
        chartPanelClass,
        "relative flex shrink-0 items-center",
        ribbon
          ? "gap-2 rounded-lg px-3 py-1.5 pr-6 sm:gap-2.5 sm:px-3.5"
          : "gap-3 px-4 py-2.5 pr-7",
      )}
    >
      <Stat
        label="Income"
        value={compact(data.avgMonthlyIncome)}
        valueClass="text-foreground"
        compact={ribbon}
      />
      <Op compact={ribbon}>−</Op>
      <Stat
        label="Expenses"
        value={compact(data.avgMonthlyExpenses)}
        valueClass="text-foreground/80"
        compact={ribbon}
      />
      <Op compact={ribbon}>=</Op>
      <Stat
        label={resultLabel}
        value={compact(data.gap)}
        valueClass={gapColor}
        valueStyle={{ textShadow: gapShadow }}
        compact={ribbon}
      />
      <InfoBadge
        text={`Rolling average across the last ${data.monthsUsed} active month${data.monthsUsed === 1 ? "" : "s"} (max ${data.maxMonthsConsidered}). Months whose expenses are below 20% of the average are excluded.`}
      />
    </div>
  );
}

/** Small "i" icon in the top-right corner with a CSS-only hover tooltip. */
function InfoBadge({ text }: { text: string }) {
  return (
    <div className="group absolute right-1.5 top-1.5">
      <button
        type="button"
        aria-label="What is this?"
        className={cn(chartChipClass, "grid h-4 w-4 cursor-help place-items-center rounded-full text-[9px] font-bold leading-none")}
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 hidden w-56 rounded-md border border-chart-border bg-chart-surface px-2.5 py-1.5 text-[11px] leading-snug text-foreground shadow-chart group-hover:block"
        style={{ boxShadow: "var(--chart-tooltip-shadow)" }}
      >
        {text}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
  valueStyle,
  compact = false,
}: {
  label: string;
  value: string;
  valueClass: string;
  valueStyle?: React.CSSProperties;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center leading-tight">
      <span
        className={`font-extrabold tabular-nums ${compact ? "text-base sm:text-lg" : "text-lg sm:text-xl"} ${valueClass}`}
        style={{ letterSpacing: "0.01em", ...valueStyle }}
      >
        {value}
      </span>
      <span className={`font-medium uppercase tracking-wide text-muted-foreground ${compact ? "text-[9px]" : "text-[10px]"}`}>
        {label}
      </span>
    </div>
  );
}

function Op({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <span
      className={`select-none font-light text-muted-foreground ${compact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"}`}
    >
      {children}
    </span>
  );
}
