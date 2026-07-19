"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/format";
import { CategoryTransactionsModal } from "@/components/category-transactions-modal";
import { chartListRowClass, chartMutedClass } from "@/lib/chart-ui";
import {
  analyticsChartFiltersToSearchParams,
  type AnalyticsChartFilters,
  DEFAULT_ANALYTICS_CHART_FILTERS,
  ANALYTICS_TXN_SIZE_OPEN,
} from "@/lib/analytics/workspace-filters";
import { cn } from "@/lib/utils";

export interface MerchantRow {
  name: string;
  total: number;
  count: number;
  currency: string;
  subcategory: string | null;
  category: string | null;
  subcategoryColor: string | null;
}

const PAGE = 50;

/** Fills the parent flex container (set via `flex-1` on CardContent). */
const LIST_HEIGHT = "h-full min-h-[200px] w-full";
const LIST_SCROLL = `${LIST_HEIGHT} scrollbar-slim min-h-0 flex-1 flex flex-col overflow-y-auto overscroll-contain pb-2 pr-1 [scrollbar-gutter:stable]`;

function merchantKey(m: MerchantRow) {
  return `${m.name}\0${m.currency}`;
}

export function MerchantsAnalyticsList({
  filterQuery = "",
  onDateRangeLabel,
  chartFilters = DEFAULT_ANALYTICS_CHART_FILTERS,
}: {
  filterQuery?: string;
  onDateRangeLabel?: (label: string | null) => void;
  chartFilters?: AnalyticsChartFilters;
}) {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [merchantModal, setMerchantModal] = useState<MerchantRow | null>(null);

  const nextOffsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const fetchGen = useRef(0);
  const chartFilterKey = analyticsChartFiltersToSearchParams(chartFilters).toString();
  const chartFiltersRef = useRef(chartFilters);
  chartFiltersRef.current = chartFilters;

  const loadPage = useCallback(async (reset: boolean) => {
    if (loadingRef.current) return;
    if (!reset && !hasMoreRef.current) return;

    const gen = ++fetchGen.current;
    if (reset) {
      nextOffsetRef.current = 0;
      hasMoreRef.current = true;
      setHasMore(true);
      setMerchants([]);
    }

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const off = nextOffsetRef.current;
    try {
      const params = analyticsChartFiltersToSearchParams(chartFiltersRef.current);
      params.set("offset", String(off));
      params.set("limit", String(PAGE));
      const r = await fetch(`/api/analytics/merchants?${params}`);
      const j = await r.json();
      if (gen !== fetchGen.current) return;

      if (j.error) {
        setError(typeof j.error === "string" ? j.error : "Failed to load");
        return;
      }

      if (reset && onDateRangeLabel) {
        onDateRangeLabel(
          typeof j.dateRangeLabel === "string" ? j.dateRangeLabel : null,
        );
      }

      const rows: MerchantRow[] = j.merchants ?? [];
      hasMoreRef.current = j.hasMore === true;
      setHasMore(j.hasMore === true);
      nextOffsetRef.current = j.nextOffset ?? off + rows.length;

      if (reset) setMerchants(rows);
      else setMerchants((prev) => [...prev, ...rows]);
    } catch {
      if (gen === fetchGen.current) setError("Could not load merchants");
    } finally {
      if (gen === fetchGen.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [onDateRangeLabel, chartFilterKey]);

  useEffect(() => {
    void loadPage(true);
    return () => {
      fetchGen.current += 1;
      loadingRef.current = false;
    };
  }, [loadPage]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadPage(false);
      },
      { root, rootMargin: "160px", threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [loadPage, merchants.length]);

  const q = filterQuery.trim().toLowerCase();

  const rankByKey = useMemo(() => {
    const map = new Map<string, number>();
    merchants.forEach((row, i) => map.set(merchantKey(row), i + 1));
    return map;
  }, [merchants]);

  const filtered = useMemo(() => {
    if (!q) return merchants;
    return merchants.filter((m) => m.name.toLowerCase().includes(q));
  }, [merchants, q]);

  if (error) {
    return (
      <div
        className={`flex ${LIST_HEIGHT} items-center justify-center rounded-xl border border-chart-border bg-chart-muted/40`}
      >
        <p className={cn("px-4 text-center", chartMutedClass)}>{error}</p>
      </div>
    );
  }

  if (!loading && merchants.length === 0) {
    return (
      <div
        className={`flex ${LIST_HEIGHT} items-center justify-center rounded-xl border border-chart-border bg-chart-muted/40`}
      >
        <p className={cn("px-4 text-center", chartMutedClass)}>No merchant data yet</p>
      </div>
    );
  }

  const centerInitialLoad = loading && merchants.length === 0;

  return (
    <div
      ref={scrollRef}
      className={LIST_SCROLL}
    >
      {centerInitialLoad ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-chart-border border-t-[#0BC18D]" />
        </div>
      ) : (
        <>
          {q && filtered.length === 0 && merchants.length > 0 && (
            <p className="mb-3 rounded-lg border border-chart-border bg-chart-muted px-3 py-2 text-center text-xs text-muted-foreground">
              No merchants match “{filterQuery.trim()}”. Try another term or scroll to load more.
            </p>
          )}
          <ul className="space-y-2">
            {filtered.map((m) => {
              const rank = rankByKey.get(merchantKey(m)) ?? 0;
              return (
                <li
                  key={merchantKey(m)}
                  className={cn(chartListRowClass, "flex cursor-pointer items-center gap-3 px-2.5 py-2")}
                  onClick={() => setMerchantModal(m)}
                >
                  <span className="w-5 shrink-0 text-right text-[10px] font-medium tabular-nums text-muted-foreground">
                    {rank}
                  </span>
                  <div
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-chart-border bg-chart-muted text-[9px] font-semibold uppercase text-muted-foreground"
                    aria-hidden
                  >
                    {m.name.slice(0, 1) || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="break-words text-xs font-medium leading-snug text-foreground">{m.name}</p>
                      {m.subcategory ? (
                        <SubcategoryPill
                          label={categoryPillLabel(m.category, m.subcategory)}
                          color={m.subcategoryColor}
                        />
                      ) : null}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {m.count} {m.count === 1 ? "transaction" : "transactions"}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-xs font-bold tabular-nums text-foreground">
                    {formatCurrency(m.total, m.currency)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div ref={sentinelRef} className="h-4 w-full shrink-0" aria-hidden />
          {loading && merchants.length > 0 && (
            <div className="flex justify-center py-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-chart-border border-t-[#0BC18D]" />
            </div>
          )}
          {!hasMore && merchants.length > 0 && !q && (
            <p className="pb-2 pt-1 text-center text-[10px] text-muted-foreground">End of list</p>
          )}
        </>
      )}

      {merchantModal &&
        typeof document !== "undefined" &&
        createPortal(
          <CategoryTransactionsModal
            filter={{ mode: "merchant", name: merchantModal.name }}
            currency={merchantModal.currency}
            minAmount={chartFilters.minAmount > 0 ? chartFilters.minAmount : undefined}
            maxAmount={
              chartFilters.maxAmount < ANALYTICS_TXN_SIZE_OPEN
                ? chartFilters.maxAmount
                : undefined
            }
            onClose={() => setMerchantModal(null)}
          />,
          document.body,
        )}
    </div>
  );
}

function categoryPillLabel(category: string | null, subcategory: string): string {
  if (category && category !== subcategory) return `${category} - ${subcategory}`;
  return subcategory;
}

function SubcategoryPill({ label, color }: { label: string; color: string | null }) {
  const accent = color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#808080";
  return (
    <span
      className="inline-flex max-w-[12rem] shrink-0 items-center truncate rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none"
      style={{
        color: accent,
        borderColor: `${accent}55`,
        backgroundColor: `${accent}18`,
      }}
    >
      {label}
    </span>
  );
}
