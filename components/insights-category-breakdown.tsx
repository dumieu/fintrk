"use client";

import { useEffect, useState } from "react";
import { SpendingChart } from "@/components/spending-chart";
import { chartMutedClass } from "@/lib/chart-ui";
import {
  analyticsChartFiltersToSearchParams,
  type AnalyticsChartFilters,
  DEFAULT_ANALYTICS_CHART_FILTERS,
  ANALYTICS_TXN_SIZE_OPEN,
} from "@/lib/analytics/workspace-filters";
import { cn } from "@/lib/utils";

type Bar = { label: string; amount: number; color: string };

/**
 * Category breakdown that tracks Spend Analytics chart filters.
 */
export function InsightsCategoryBreakdown({
  filters = DEFAULT_ANALYTICS_CHART_FILTERS,
}: {
  filters?: AnalyticsChartFilters;
}) {
  const [bars, setBars] = useState<Bar[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterKey = analyticsChartFiltersToSearchParams(filters).toString();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = analyticsChartFiltersToSearchParams(filters);
    fetch(`/api/analytics/category-breakdown?${params}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.error) {
          setError(typeof j.error === "string" ? j.error : "Failed to load");
          setBars([]);
          return;
        }
        setError(null);
        setBars(Array.isArray(j.categoryBreakdown) ? j.categoryBreakdown : []);
        if (typeof j.primaryCurrency === "string") setCurrency(j.primaryCurrency);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Network error");
          setBars([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  if (loading && bars.length === 0) {
    return (
      <div className={cn("flex min-h-0 flex-1 items-center justify-center", chartMutedClass)}>
        Loading categories…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-rose-300/80">
        {error}
      </div>
    );
  }
  if (bars.length === 0) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-1", chartMutedClass)}>
        <p>No category spend for this chart filter.</p>
      </div>
    );
  }

  return (
    <SpendingChart
      bars={bars}
      currency={currency}
      amountMin={filters.minAmount > 0 ? filters.minAmount : undefined}
      amountMax={
        filters.maxAmount < ANALYTICS_TXN_SIZE_OPEN ? filters.maxAmount : undefined
      }
    />
  );
}
