"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/format";
import { AnalyticsDetailTooltip } from "@/components/analytics-detail-tooltip";
import { useAnalyticsDetail } from "@/components/use-analytics-detail";

export interface CountrySpendRow {
  country: string;
  total: number;
  count: number;
}

const PAGE = 20;

/** Same fixed viewport as Merchants — scroll inside; rows are NOT flex children (avoids flex-shrink clipping). */
/** Fills the parent flex container (set via `flex-1` on CardContent). */
const LIST_HEIGHT = "h-full min-h-[200px] w-full";
const LIST_SCROLL = `${LIST_HEIGHT} min-h-0 flex-1 flex flex-col overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]`;

export function GeographicSpendingList() {
  const [countries, setCountries] = useState<CountrySpendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grandTotal, setGrandTotal] = useState(0);
  const [maxCountryTotal, setMaxCountryTotal] = useState(1);
  const [primaryCurrency, setPrimaryCurrency] = useState("USD");

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const nextOffsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const fetchGen = useRef(0);

  const { tip, open, scheduleClose, clearLeave } = useAnalyticsDetail();

  const loadPage = useCallback(async (reset: boolean) => {
    if (loadingRef.current) return;
    if (!reset && !hasMoreRef.current) return;

    const gen = ++fetchGen.current;
    if (reset) {
      nextOffsetRef.current = 0;
      hasMoreRef.current = true;
      setHasMore(true);
      setCountries([]);
    }

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const off = nextOffsetRef.current;
    try {
      const r = await fetch(
        `/api/analytics/countries?offset=${off}&limit=${PAGE}`,
      );
      const j = (await r.json()) as {
        error?: string;
        countries?: CountrySpendRow[];
        hasMore?: boolean;
        nextOffset?: number;
        primaryCurrency?: string;
        grandTotal?: number;
        maxCountryTotal?: number;
      };
      if (gen !== fetchGen.current) return;

      if (j.error || !r.ok) {
        setError(typeof j.error === "string" ? j.error : "Failed to load");
        return;
      }

      const rows = j.countries ?? [];
      hasMoreRef.current = j.hasMore === true;
      setHasMore(j.hasMore === true);
      nextOffsetRef.current = j.nextOffset ?? off + rows.length;

      if (typeof j.grandTotal === "number") setGrandTotal(j.grandTotal);
      if (typeof j.maxCountryTotal === "number" && j.maxCountryTotal > 0) {
        setMaxCountryTotal(j.maxCountryTotal);
      }
      if (j.primaryCurrency) setPrimaryCurrency(j.primaryCurrency);

      if (reset) setCountries(rows);
      else setCountries((prev) => [...prev, ...rows]);
    } catch {
      if (gen === fetchGen.current) setError("Could not load countries");
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
  }, [loadPage, countries.length]);

  if (error) {
    return (
      <div
        className={`flex ${LIST_HEIGHT} items-center justify-center rounded-xl border border-white/[0.04] bg-white/[0.02]`}
      >
        <p className="px-4 text-center text-sm text-white/50">{error}</p>
      </div>
    );
  }

  if (!loading && countries.length === 0) {
    return (
      <div
        className={`flex ${LIST_HEIGHT} items-center justify-center rounded-xl border border-white/[0.04] bg-white/[0.02]`}
      >
        <p className="px-4 text-center text-sm text-white/50">No geographic data yet</p>
      </div>
    );
  }

  const barMax = Math.max(maxCountryTotal, 1);
  const totalGeo = grandTotal > 0 ? grandTotal : countries.reduce((s, c) => s + c.total, 0);
  const centerInitialLoad = loading && countries.length === 0;

  return (
    <>
      <div ref={scrollRef} className={LIST_SCROLL}>
        {centerInitialLoad ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#AD74FF]" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {countries.map((c, idx) => {
                const share = totalGeo > 0 ? (c.total / totalGeo) * 100 : 0;
                const widthPct = Math.max(4, (c.total / barMax) * 100);
                const iso = c.country.trim().toUpperCase();
                const rank = idx + 1;
                return (
                  <div
                    key={`${c.country}-${idx}`}
                    className="group relative shrink-0 cursor-default rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.07]"
                    onMouseEnter={(e) =>
                      void open({
                        rect: e.currentTarget.getBoundingClientRect(),
                        entity: "country",
                        value: iso,
                        label: c.country,
                        accent: "#AD74FF",
                      })
                    }
                    onMouseLeave={scheduleClose}
                  >
                    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
                      <div
                        className="absolute inset-y-0 left-0 opacity-25 transition-opacity group-hover:opacity-40"
                        style={{
                          width: `${widthPct}%`,
                          background:
                            "linear-gradient(90deg, rgba(173,116,255,0.6), rgba(44,162,255,0.4))",
                        }}
                      />
                    </div>
                    <div className="relative flex items-start gap-2.5">
                      <span className="w-4 shrink-0 pt-0.5 text-right text-[10px] font-semibold tabular-nums text-white/35">
                        {rank}
                      </span>
                      <span className="mt-0.5 shrink-0 text-base leading-none">
                        {countryFlag(iso)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold leading-snug text-white/90">
                          {c.country}
                        </p>
                        <p className="mt-0.5 text-[9px] leading-snug text-white/45">
                          {c.count} {c.count === 1 ? "txn" : "txns"} ·{" "}
                          {share.toFixed(1)}%
                        </p>
                      </div>
                      <span className="shrink-0 pt-0.5 text-right text-[12px] font-bold tabular-nums text-white">
                        {formatCurrency(c.total, primaryCurrency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div ref={sentinelRef} className="h-4 w-full shrink-0" aria-hidden />
            {loading && countries.length > 0 && (
              <div className="flex justify-center py-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-[#AD74FF]" />
              </div>
            )}
            {!hasMore && countries.length > 0 && (
              <p className="pb-2 pt-1 text-center text-[10px] text-white/35">
                End of list
              </p>
            )}
          </>
        )}
      </div>

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
    </>
  );
}

function countryFlag(iso: string): string {
  if (!iso || iso.length !== 2) return "🌍";
  const offset = 0x1f1e6;
  return String.fromCodePoint(
    iso.charCodeAt(0) - 65 + offset,
    iso.charCodeAt(1) - 65 + offset,
  );
}
