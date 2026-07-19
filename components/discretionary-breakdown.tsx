"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  DiscretionaryBucket,
  DiscretionaryResponse,
} from "@/app/api/analytics/discretionary/route";
import { formatCurrency } from "@/lib/format";
import { CategoryTransactionsModal } from "@/components/category-transactions-modal";
import { chartMutedClass } from "@/lib/chart-ui";
import {
  analyticsChartFiltersToSearchParams,
  type AnalyticsChartFilters,
  DEFAULT_ANALYTICS_CHART_FILTERS,
  ANALYTICS_TXN_SIZE_OPEN,
} from "@/lib/analytics/workspace-filters";
import { cn } from "@/lib/utils";

function compactK(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(a >= 10_000 ? 1 : 1)}K`;
  return Math.round(n).toLocaleString();
}

export function DiscretionaryBreakdown({
  filters = DEFAULT_ANALYTICS_CHART_FILTERS,
}: {
  filters?: AnalyticsChartFilters;
}) {
  const [data, setData] = useState<DiscretionaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leafModal, setLeafModal] = useState<string | null>(null);
  const filterKey = analyticsChartFiltersToSearchParams(filters).toString();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = analyticsChartFiltersToSearchParams(filters);
    fetch(`/api/analytics/discretionary?${params}`)
      .then((r) => r.json())
      .then((j: DiscretionaryResponse | { error: string }) => {
        if (cancelled) return;
        if ("error" in j) {
          setError(j.error);
          setData(null);
        } else {
          setData(j);
          setError(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // filterKey captures all filter fields used in the request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  if (loading && !data) {
    return (
      <div className={cn("flex min-h-0 flex-1 items-center justify-center", chartMutedClass)}>
        Loading discretionary breakdown…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-rose-300/80">
        {error ?? "Failed to load discretionary breakdown."}
      </div>
    );
  }
  if (data.total <= 0) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-2", chartMutedClass)}>
        <p>No discretionary data for this chart filter.</p>
        <p className="text-[11px] text-muted-foreground/70">
          Try widening the time window, amount range, or category visibility.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
        {data.buckets.map((b) => (
          <BucketCard
            key={b.type}
            bucket={b}
            currency={data.primaryCurrency}
            monthsCovered={data.monthsCovered}
            onLeafClick={setLeafModal}
          />
        ))}
      </div>

      {leafModal &&
        typeof document !== "undefined" &&
        createPortal(
          <CategoryTransactionsModal
            filter={{ mode: "category", name: leafModal, level: "subcategory" }}
            currency={data.primaryCurrency}
            minAmount={filters.minAmount > 0 ? filters.minAmount : undefined}
            maxAmount={
              filters.maxAmount < ANALYTICS_TXN_SIZE_OPEN ? filters.maxAmount : undefined
            }
            onClose={() => setLeafModal(null)}
          />,
          document.body,
        )}
    </div>
  );
}

function BucketCard({
  bucket,
  currency,
  monthsCovered,
  onLeafClick,
}: {
  bucket: DiscretionaryBucket;
  currency: string;
  monthsCovered: number;
  onLeafClick: (leafName: string) => void;
}) {
  const accent = bucket.accent;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="text-center">
        <h3
          className="text-[11px] font-bold leading-tight"
          style={{ color: accent, textShadow: `0 0 16px ${accent}55` }}
        >
          {bucket.label}
        </h3>
        <div className="mt-1 flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5">
          <span
            className="text-[15px] font-extrabold leading-none tabular-nums"
            style={{ color: accent }}
          >
            {bucket.share.toFixed(0)}%
          </span>
          <span className="whitespace-nowrap text-[13px] font-extrabold leading-none tabular-nums text-foreground">
            {compactCurrency(bucket.total, currency)}
          </span>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-hidden rounded-xl border backdrop-blur-md"
        style={{
          background: `linear-gradient(180deg, ${bucket.bg} 0%, var(--chart-muted) 100%)`,
          borderColor: `${accent}33`,
          boxShadow: `inset 0 0 0 1px var(--chart-border), 0 8px 22px -14px ${accent}55`,
        }}
      >
        {bucket.leaves.length === 0 ? (
          <div className="flex h-full items-center justify-center px-2 py-4 text-center text-[10px] text-muted-foreground">
            No spending in this bucket.
          </div>
        ) : (
          <ul className="scrollbar-slim h-full divide-y divide-chart-border overflow-y-auto overscroll-contain px-2 py-1 [scrollbar-gutter:stable]">
            {bucket.leaves.map((leaf) => (
              <li
                key={leaf.name}
                className="group flex cursor-pointer flex-col items-center gap-0.5 py-1.5 transition-colors hover:bg-chart-hover"
                onClick={() => onLeafClick(leaf.name)}
              >
                <span className="text-[15px] font-extrabold leading-none tabular-nums tracking-tight text-foreground">
                  {compactK(leaf.monthlyAvg)}
                </span>
                <span className="line-clamp-2 px-1 text-center text-[9px] leading-tight text-muted-foreground">
                  {leaf.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-center text-[9px] text-muted-foreground">
        ≈ {compactCurrency(bucket.monthlyAvg, currency)} / mo · {monthsCovered}mo
      </div>
    </div>
  );
}

function compactCurrency(n: number, currency: string): string {
  const a = Math.abs(n);
  if (a >= 1_000) {
    const sym = currencySymbol(currency);
    return `${sym}${compactK(n)}`;
  }
  return formatCurrency(n, currency);
}

function currencySymbol(c: string): string {
  switch (c) {
    case "USD":
    case "AUD":
    case "CAD":
    case "NZD":
    case "SGD":
    case "HKD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "JPY":
    case "CNY":
      return "¥";
    case "INR":
      return "₹";
    case "KRW":
      return "₩";
    case "CHF":
      return "CHF ";
    default:
      return `${c} `;
  }
}
