"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/format";
import { AnalyticsDetailTooltip } from "@/components/analytics-detail-tooltip";
import { useAnalyticsDetail } from "@/components/use-analytics-detail";

export interface MerchantRow {
  name: string;
  total: number;
  count: number;
  currency: string;
}

const PAGE = 50;

/** Fixed height (~4 rows, room for two-line rows) so the card stays stable when filtering. */
/** Fills the parent flex container (set via `flex-1` on CardContent). */
const LIST_HEIGHT = "h-full min-h-[200px] w-full";
const LIST_SCROLL = `${LIST_HEIGHT} min-h-0 flex-1 flex flex-col overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]`;

function merchantKey(m: MerchantRow) {
  return `${m.name}\0${m.currency}`;
}

export function MerchantsAnalyticsList({ filterQuery = "" }: { filterQuery?: string }) {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { tip, open, scheduleClose, clearLeave } = useAnalyticsDetail();

  const nextOffsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const fetchGen = useRef(0);

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
      const r = await fetch(`/api/analytics/merchants?offset=${off}&limit=${PAGE}`);
      const j = await r.json();
      if (gen !== fetchGen.current) return;

      if (j.error) {
        setError(typeof j.error === "string" ? j.error : "Failed to load");
        return;
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
  }, []);

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
        className={`flex ${LIST_HEIGHT} items-center justify-center rounded-xl border border-white/[0.04] bg-white/[0.02]`}
      >
        <p className="px-4 text-center text-sm text-white/50">{error}</p>
      </div>
    );
  }

  if (!loading && merchants.length === 0) {
    return (
      <div
        className={`flex ${LIST_HEIGHT} items-center justify-center rounded-xl border border-white/[0.04] bg-white/[0.02]`}
      >
        <p className="px-4 text-center text-sm text-white/50">No merchant data yet</p>
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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#0BC18D]" />
        </div>
      ) : (
        <>
          {q && filtered.length === 0 && merchants.length > 0 && (
            <p className="mb-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-xs text-white/55">
              No merchants match “{filterQuery.trim()}”. Try another term or scroll to load more.
            </p>
          )}
          <ul className="space-y-2">
            {filtered.map((m) => {
              const rank = rankByKey.get(merchantKey(m)) ?? 0;
              return (
                <li
                  key={merchantKey(m)}
                  className="flex cursor-default items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 transition-colors hover:border-white/12 hover:bg-white/[0.05]"
                  onMouseEnter={(e) =>
                    void open({
                      rect: e.currentTarget.getBoundingClientRect(),
                      entity: "merchant",
                      value: m.name,
                      label: m.name,
                      accent: "#0BC18D",
                      currency: m.currency,
                    })
                  }
                  onMouseLeave={scheduleClose}
                >
                  <span className="w-5 shrink-0 text-right text-[10px] font-medium tabular-nums text-white/40">
                    {rank}
                  </span>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0BC18D]/12 text-xs font-bold uppercase text-[#0BC18D]">
                    {(m.name || "?").charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs font-medium leading-snug text-white/90">{m.name}</p>
                    <p className="text-[10px] text-white/45">
                      {m.count} {m.count === 1 ? "transaction" : "transactions"}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-xs font-bold tabular-nums text-white/90">
                    {formatCurrency(m.total, m.currency)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div ref={sentinelRef} className="h-4 w-full shrink-0" aria-hidden />
          {loading && merchants.length > 0 && (
            <div className="flex justify-center py-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-[#0BC18D]" />
            </div>
          )}
          {!hasMore && merchants.length > 0 && !q && (
            <p className="pb-2 pt-1 text-center text-[10px] text-white/35">End of list</p>
          )}
        </>
      )}

      {typeof document !== "undefined" &&
        tip &&
        createPortal(
          <AnalyticsDetailTooltip
            rect={tip.rect}
            entity={tip.entity}
            label={tip.label}
            accentColor={tip.accent}
            data={tip.data}
            loading={tip.loading}
            errorMessage={tip.error}
            onMouseEnter={clearLeave}
            onMouseLeave={scheduleClose}
          />,
          document.body,
        )}
    </div>
  );
}
