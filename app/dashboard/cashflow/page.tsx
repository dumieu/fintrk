"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Waves,
  Sparkles,
  Loader2,
  Upload,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CashflowSankey, type CashflowSankeyData } from "@/components/cashflow-sankey";
import { TimeSlicer } from "@/components/time-slicer";
import {
  detectTimePreset,
  rollingRange,
  type TimePresetId,
} from "@/lib/time-range-presets";
import {
  FINTRK_TRANSACTIONS_CHANGED,
} from "@/lib/notify-transactions-changed";
import { cn } from "@/lib/utils";

interface Filters {
  dateFrom: string;
  dateTo: string;
  currency: string;
}

export default function CashflowPage() {
  const [data, setData] = useState<CashflowSankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<Filters>({ dateFrom: "", dateTo: "", currency: "" });
  const inFlightRef = useRef<AbortController | null>(null);
  const [showParticles, setShowParticles] = useState(false);

  const load = useCallback(
    async (f: Filters, mode: "initial" | "refresh") => {
      if (inFlightRef.current) inFlightRef.current.abort();
      const ctrl = new AbortController();
      inFlightRef.current = ctrl;
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        const params = new URLSearchParams();
        if (f.dateFrom) params.set("dateFrom", f.dateFrom);
        if (f.dateTo) params.set("dateTo", f.dateTo);
        if (f.currency) params.set("currency", f.currency);
        const res = await fetch(`/api/cashflow/sankey?${params}`, { signal: ctrl.signal });
        const d = await res.json();
        if (ctrl.signal.aborted) return;
        if (!d.error) setData(d as CashflowSankeyData);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void load(filters, "initial");
  }, [filters, load]);

  useEffect(() => {
    const handler = () => void load(filters, "refresh");
    window.addEventListener(FINTRK_TRANSACTIONS_CHANGED, handler);
    return () => window.removeEventListener(FINTRK_TRANSACTIONS_CHANGED, handler);
  }, [filters, load]);

  /** Tracks viewport size so the Sankey chart can grow on tall/wide monitors
   *  but never overflow the visible page on tablets and phones. */
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 900 : window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleTimePreset = useCallback((preset: TimePresetId) => {
    setFilters((f) => {
      if (preset === "all") return { ...f, dateFrom: "", dateTo: "" };
      const { from, to } = rollingRange(preset);
      return { ...f, dateFrom: from, dateTo: to };
    });
  }, []);

  const activePreset = detectTimePreset(filters.dateFrom, filters.dateTo);

  const hasData = !!data && (data.inflow.value > 0 || data.outflow.value > 0 || data.savings.value > 0);

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <BackgroundAurora />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-5 sm:px-6 sm:py-7">
        {/* TOOLBAR */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-wrap items-end justify-end gap-3"
        >
          <TimeSlicer activePreset={activePreset} onSelect={handleTimePreset} />
          {data && data.availableCurrencies.length > 1 && (
            <CurrencyPicker
              currency={data.currency}
              options={data.availableCurrencies}
              onSelect={(c) => setFilters((f) => ({ ...f, currency: c }))}
            />
          )}
          <ParticlesToggle on={showParticles} onChange={setShowParticles} />
        </motion.div>

        {/* SANKEY CARD — allowed to break out wider than the rest of the
         *  page on large screens. The rest of the page (header, KPI row,
         *  legend) stays bound to the standard `max-w-[1480px]` container. */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#100726]/85 via-[#0d061f]/85 to-[#08041a]/85 p-0.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-md sm:p-2"
          style={{
            // Sankey gets a controlled "breakout" beyond the 1280px page box on
            // wider monitors only:
            //   • viewport ≤ 1480px → no breakout, card stays inside max-w-7xl
            //   • viewport between 1480px and 2120px → linear breakout
            //   • viewport ≥ 2120px → breakout caps at 320px per side
            //                          (effective card width 1920px) AND we
            //                          always preserve a 24px gap to the screen
            //                          edge so the card never touches it.
            marginLeft:
              "calc(0px - max(0px, min((100vw - 1480px) / 2, 320px, (100vw - 1280px) / 2 - 24px)))",
            marginRight:
              "calc(0px - max(0px, min((100vw - 1480px) / 2, 320px, (100vw - 1280px) / 2 - 24px)))",
          }}
        >
          {/* Animated rainbow border accent — spin tied to the Particles toggle */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-2xl opacity-40"
            style={{
              background:
                "conic-gradient(from 180deg at 50% 50%, rgba(11,193,141,0.0) 0deg, rgba(11,193,141,0.45) 60deg, rgba(44,162,255,0.45) 130deg, rgba(173,116,255,0.45) 200deg, rgba(255,111,105,0.45) 270deg, rgba(11,193,141,0.0) 360deg)",
              maskImage: "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)",
              WebkitMask: "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)",
              padding: 1,
              animation: showParticles ? "fintrk-spin-slow 18s linear infinite" : "none",
            }}
          />
          <div className="relative rounded-[14px] bg-[#06031a]/80 p-1.5 sm:p-4 md:p-5">
            {refreshing && (
              <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/65 backdrop-blur">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating
              </div>
            )}

            {loading ? (
              <div className="flex h-[520px] flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 animate-pulse rounded-full bg-[#0BC18D]/20 blur-xl" />
                  <Loader2 className="relative h-10 w-10 animate-spin text-[#34E6B0]" />
                </div>
                <p className="text-sm text-white/65">Mapping your money flow…</p>
              </div>
            ) : !hasData ? (
              <div className="flex h-[520px] flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0BC18D]/20 to-[#AD74FF]/20 ring-1 ring-white/10">
                  <Waves className="h-8 w-8 text-[#34E6B0]" />
                </div>
                <p className="text-lg font-semibold text-white/90">Your cashflow story is waiting</p>
                <p className="mt-2 max-w-md text-sm text-white/55">
                  Upload a statement to see income, spending, and savings flow as a
                  living, breathing diagram.
                </p>
                <Link href="/dashboard/upload" className="mt-5">
                  <Button className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white hover:opacity-90">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Statement
                  </Button>
                </Link>
              </div>
            ) : (
              <CashflowSankey
                data={data!}
                height={(() => {
                  const narrow = viewport.w < 1024;
                  const veryNarrow = viewport.w < 640;
                  /** Pixels reserved for header, KPI row, padding, legend &
                   *  page chrome — measured empirically from the layout. */
                  const reserved = veryNarrow ? 380 : narrow ? 400 : 420;
                  /** Natural height for the current category count. */
                  const natural = Math.max(
                    veryNarrow ? 320 : narrow ? 380 : 480,
                    Math.min(
                      veryNarrow ? 520 : narrow ? 640 : 780,
                      80 + (data!.outflow.categories.length + data!.savings.categories.length) * 38,
                    ),
                  );
                  /** Allow up to +50% taller on tall monitors only. */
                  const ceiling = Math.round(natural * 1.5);
                  /** Hard cap so the legend stays visible on short viewports. */
                  const fits = viewport.h - reserved;
                  return Math.max(280, Math.min(ceiling, fits));
                })()}
                showParticles={showParticles}
              />
            )}
          </div>
        </motion.div>

        {/* LEGEND */}
        {hasData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-[11px] text-white/60"
          >
            <LegendDot color="#0BC18D" label="Inflow" />
            <LegendDot color="#F4D03F" label="Income trunk" />
            <LegendDot color="#FF6F69" label="Spending" />
            <LegendDot color="#AD74FF" label="Savings & Investments" />
            <LegendDot color="#2CA2FF" label="Unallocated surplus" />
            <LegendDot color="#E11D48" label="Deficit (drawdown)" />
            <span className="ml-auto hidden text-[10px] uppercase tracking-wider text-white/35 sm:inline">
              Hover a node or ribbon to trace its path
            </span>
          </motion.div>
        )}
      </div>

      <style jsx global>{`
        @keyframes fintrk-spin-slow {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────  CURRENCY PICKER  ─────────────────── */

function CurrencyPicker({
  currency, options, onSelect,
}: {
  currency: string;
  options: string[];
  onSelect: (c: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
      <div className="flex flex-nowrap items-center gap-1">
        <span className="px-1.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
          Currency
        </span>
        {options.map((c) => {
          const selected = c === currency;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onSelect(c)}
              className={cn(
                "h-6 rounded-lg border px-2 text-[10px] font-semibold leading-none transition-all",
                selected
                  ? "border-[#ECAA0B]/55 bg-gradient-to-br from-[#ECAA0B]/22 to-[#ECAA0B]/8 text-white shadow-[0_0_18px_-6px_rgba(236,170,11,0.55)]"
                  : "border-white/15 bg-white/[0.03] text-white/65 hover:border-white/35 hover:text-white/85",
              )}
              aria-pressed={selected}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────  PARTICLES TOGGLE  ──────────────────── */

function ParticlesToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold transition-all",
        on
          ? "border-[#0BC18D]/55 bg-gradient-to-br from-[#0BC18D]/22 to-[#2CA2FF]/12 text-white shadow-[0_0_18px_-6px_rgba(11,193,141,0.55)]"
          : "border-white/15 bg-white/[0.03] text-white/65 hover:border-white/35 hover:text-white/85",
      )}
      aria-pressed={on}
      title={on ? "Particles on" : "Particles off"}
    >
      <Sparkles className={cn("h-3.5 w-3.5", on ? "text-[#34E6B0]" : "text-white/55")} />
      Particles
    </button>
  );
}

/* ──────────────────────  LEGEND DOT  ──────────────────── */

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}88` }}
      />
      {label}
    </span>
  );
}

/* ──────────────────────  AURORA BACKDROP  ──────────────────── */

function BackgroundAurora() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -left-32 top-10 h-[460px] w-[460px] rounded-full bg-[#0BC18D]/15 blur-[120px]" />
        <div className="absolute right-0 top-32 h-[520px] w-[520px] rounded-full bg-[#AD74FF]/12 blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full bg-[#2CA2FF]/10 blur-[120px]" />
      </div>
    </>
  );
}
