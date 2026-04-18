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
import { currencyMeta, type CurrencyMeta } from "@/components/currency-meta";

export interface CurrencySpendRow {
  currency: string;
  total: number;
  count: number;
}

const PAGE = 20;

/** Fills the parent flex container (set via `flex-1` on CardContent). */
const LIST_HEIGHT = "h-full min-h-[200px] w-full";
const LIST_SCROLL = `${LIST_HEIGHT} min-h-0 flex-1 flex flex-col overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]`;

/** Round badge with the currency symbol over the issuer's brand-color gradient. */
function CurrencyBadge({ meta, size = 30 }: { meta: CurrencyMeta; size?: number }) {
  const [g1, g2] = meta.gradient;
  const symbolLong = meta.symbol.length > 2;
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full ring-1 ring-white/15"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${g1} 0%, ${g2} 100%)`,
        boxShadow: `0 4px 12px -4px ${g2}99, inset 0 1px 0 rgba(255,255,255,0.18)`,
      }}
      aria-label={meta.code}
    >
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center font-bold leading-none text-white drop-shadow"
        style={{
          fontSize: symbolLong ? size * 0.36 : size * 0.5,
          letterSpacing: symbolLong ? "-0.02em" : 0,
          textShadow: "0 1px 2px rgba(0,0,0,0.45)",
        }}
      >
        {meta.symbol}
      </span>
      <span
        className="pointer-events-none absolute -right-2 -top-2 h-4 w-4 rounded-full bg-white/15 blur-[2px]"
        aria-hidden
      />
    </div>
  );
}

export function CurrencySpendingList() {
  const [currencies, setCurrencies] = useState<CurrencySpendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grandTotal, setGrandTotal] = useState(0);
  const [maxCurrencyTotal, setMaxCurrencyTotal] = useState(1);
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
      setCurrencies([]);
    }

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const off = nextOffsetRef.current;
    try {
      const r = await fetch(
        `/api/analytics/currencies?offset=${off}&limit=${PAGE}`,
      );
      const j = (await r.json()) as {
        error?: string;
        currencies?: CurrencySpendRow[];
        hasMore?: boolean;
        nextOffset?: number;
        primaryCurrency?: string;
        grandTotal?: number;
        maxCurrencyTotal?: number;
      };
      if (gen !== fetchGen.current) return;

      if (j.error || !r.ok) {
        setError(typeof j.error === "string" ? j.error : "Failed to load");
        return;
      }

      const rows = j.currencies ?? [];
      hasMoreRef.current = j.hasMore === true;
      setHasMore(j.hasMore === true);
      nextOffsetRef.current = j.nextOffset ?? off + rows.length;

      if (typeof j.grandTotal === "number") setGrandTotal(j.grandTotal);
      if (typeof j.maxCurrencyTotal === "number" && j.maxCurrencyTotal > 0) {
        setMaxCurrencyTotal(j.maxCurrencyTotal);
      }
      if (j.primaryCurrency) setPrimaryCurrency(j.primaryCurrency);

      if (reset) setCurrencies(rows);
      else setCurrencies((prev) => [...prev, ...rows]);
    } catch {
      if (gen === fetchGen.current) setError("Could not load currencies");
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
  }, [loadPage, currencies.length]);

  if (error) {
    return (
      <div
        className={`flex ${LIST_HEIGHT} items-center justify-center rounded-xl border border-white/[0.04] bg-white/[0.02]`}
      >
        <p className="px-4 text-center text-sm text-white/50">{error}</p>
      </div>
    );
  }

  if (!loading && currencies.length === 0) {
    return (
      <div
        className={`flex ${LIST_HEIGHT} items-center justify-center rounded-xl border border-white/[0.04] bg-white/[0.02]`}
      >
        <p className="px-4 text-center text-sm text-white/50">No currency data yet</p>
      </div>
    );
  }

  const barMax = Math.max(maxCurrencyTotal, 1);
  const totalAll = grandTotal > 0 ? grandTotal : currencies.reduce((s, c) => s + c.total, 0);
  const centerInitialLoad = loading && currencies.length === 0;

  return (
    <>
      <div ref={scrollRef} className={LIST_SCROLL}>
        {centerInitialLoad ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#F2C94C]" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {currencies.map((c, idx) => {
                const meta = currencyMeta(c.currency);
                const share = totalAll > 0 ? (c.total / totalAll) * 100 : 0;
                const widthPct = Math.max(4, (c.total / barMax) * 100);
                const rank = idx + 1;
                const accent = meta.gradient[0];
                return (
                  <div
                    key={`${c.currency}-${idx}`}
                    className="group relative shrink-0 cursor-default rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.07]"
                    onMouseEnter={(e) =>
                      void open({
                        rect: e.currentTarget.getBoundingClientRect(),
                        entity: "currency",
                        value: meta.code,
                        label: `${meta.code} · ${meta.name}`,
                        accent,
                      })
                    }
                    onMouseLeave={scheduleClose}
                  >
                    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
                      <div
                        className="absolute inset-y-0 left-0 opacity-25 transition-opacity group-hover:opacity-40"
                        style={{
                          width: `${widthPct}%`,
                          background: `linear-gradient(90deg, ${meta.gradient[0]}99, ${meta.gradient[1]}55)`,
                        }}
                      />
                    </div>
                    <div className="relative flex items-center gap-2.5">
                      <span className="w-4 shrink-0 text-right text-[10px] font-semibold tabular-nums text-white/35">
                        {rank}
                      </span>
                      <CurrencyBadge meta={meta} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-bold leading-none tracking-wide text-white/95">
                            {meta.code}
                          </span>
                          <span className="text-[12px] leading-none">{meta.flag}</span>
                          <span className="truncate text-[10px] leading-none text-white/55">
                            {meta.name}
                          </span>
                        </div>
                        <p className="mt-1 text-[9px] leading-none text-white/45">
                          {c.count} {c.count === 1 ? "txn" : "txns"} · {share.toFixed(1)}%
                        </p>
                      </div>
                      <span className="shrink-0 text-right text-[12px] font-bold tabular-nums text-white">
                        {formatCurrency(c.total, primaryCurrency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div ref={sentinelRef} className="h-4 w-full shrink-0" aria-hidden />
            {loading && currencies.length > 0 && (
              <div className="flex justify-center py-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-[#F2C94C]" />
              </div>
            )}
            {!hasMore && currencies.length > 0 && (
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
