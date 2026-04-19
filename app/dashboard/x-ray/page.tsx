"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles, ScanSearch, Activity, AlertOctagon, ArrowRight, Loader2 } from "lucide-react";
import { LeakCard, type Leak } from "@/components/x-ray/leak-card";
import { TomorrowSimulator } from "@/components/x-ray/tomorrow-simulator";
import Link from "next/link";

const DnaWheel = dynamic(
  () => import("@/components/x-ray/dna-wheel").then((m) => m.DnaWheel),
  { ssr: false, loading: () => <DnaWheelSkeleton /> },
);

interface SubcatNode {
  id: number;
  name: string;
  total: number;
  count: number;
  monthlyMean: number;
  topMerchants: { name: string; total: number; count: number }[];
  flowType: string;
  discretionary: string | null;
}
interface ParentNode {
  id: number;
  name: string;
  color: string;
  total: number;
  count: number;
  share: number;
  subcategories: SubcatNode[];
}
interface MonthlyMix {
  month: string;
  total: number;
  byParent: Record<string, number>;
}
interface Archetype {
  code: string;
  name: string;
  blurb: string;
  scoreCard: { label: string; value: number; max: number; tone: string }[];
}
interface XRayResponse {
  currency: string;
  monthsCovered: number;
  totals: {
    inflow: number;
    outflow: number;
    netFlow: number;
    txCount: number;
    discretionaryShare: number;
    recurringShare: number;
  };
  dna: ParentNode[];
  monthly: MonthlyMix[];
  leaks: Leak[];
  archetype: Archetype;
  simulator: {
    baselineMonthlyOutflow: number;
    baselineMonthlySavings: number;
    parents: { id: number; name: string; color: string; monthly: number }[];
  };
  hourHeatmap: number[];
}

export default function XRayPage() {
  const [data, setData] = useState<XRayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appliedLeaks, setAppliedLeaks] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/money-xray")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<XRayResponse>;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const externalReclaim = useMemo(
    () => Object.values(appliedLeaks).reduce((s, v) => s + v, 0),
    [appliedLeaks],
  );

  if (loading) {
    return (
      <div className="min-h-[80vh] bg-gradient-to-b from-[#04060d] via-[#06091a] to-[#0a0f24]">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-400" />
          <p className="mt-3 text-sm text-white/60">Decoding your spending DNA…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[80vh] bg-gradient-to-b from-[#04060d] via-[#06091a] to-[#0a0f24]">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <AlertOctagon className="mx-auto h-8 w-8 text-rose-400" />
          <h2 className="mt-3 text-xl font-bold text-white">X-Ray unavailable</h2>
          <p className="mt-2 text-sm text-white/60">
            {error ?? "We couldn't load your spending data right now."}
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
          >
            Back to dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const noData = data.totals.txCount === 0;
  if (noData) {
    return (
      <div className="min-h-[80vh] bg-gradient-to-b from-[#04060d] via-[#06091a] to-[#0a0f24]">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <ScanSearch className="mx-auto h-10 w-10 text-emerald-400" />
          <h2 className="mt-3 text-2xl font-bold text-white">Nothing to X-ray yet</h2>
          <p className="mt-2 text-sm text-white/60">
            Upload a statement and your spending DNA will materialise here.
          </p>
          <Link
            href="/dashboard/upload"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:opacity-90"
          >
            Upload your first statement
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full bg-gradient-to-b from-[#04060d] via-[#06091a] to-[#0a0f24] pb-12">
      <Aurora />

      <div className="relative mx-auto max-w-7xl px-4 py-8">
        {/* ─── Title strip ─────────────────────────────────────── */}
        <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
              <Sparkles className="h-3.5 w-3.5" />
              Money X-Ray
            </div>
            <h1 className="mt-1 bg-gradient-to-r from-emerald-300 via-cyan-300 to-violet-300 bg-clip-text text-3xl font-extrabold leading-tight text-transparent sm:text-4xl">
              The view of your money no app has ever shown you.
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-white/60">
              A living portrait of how your money actually moves — and the precise levers
              you can pull to bend the next 12 months in your favour.
            </p>
          </div>
          <ArchetypeBadge archetype={data.archetype} />
        </div>

        {/* ─── Hero: DNA Wheel + Archetype panel ───────────────── */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-950/80 to-black/80 p-4 shadow-2xl">
            <DnaWheel
              parents={data.dna}
              monthly={data.monthly}
              currency={data.currency}
              archetypeName={data.archetype.name}
              archetypeBlurb={data.archetype.blurb}
              monthlyOutflow={data.simulator.baselineMonthlyOutflow}
              monthsCovered={data.monthsCovered}
            />
          </div>

          <div className="space-y-4">
            <ArchetypePanel archetype={data.archetype} totals={data.totals} currency={data.currency} />
            <PulsePanel data={data} />
          </div>
        </div>

        {/* ─── Leaks + Simulator ───────────────────────────────── */}
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-950/80 to-black/80 p-5 shadow-2xl">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-rose-300/80">
                  <Activity className="h-3.5 w-3.5" />
                  Hidden Leaks
                </div>
                <h3 className="text-xl font-bold text-white">
                  {data.leaks.length === 0
                    ? "No measurable leaks — nice."
                    : `${data.leaks.length} actionable findings`}
                </h3>
                <p className="text-xs text-white/55">
                  Tap "Plug it" to feed the savings into the simulator on the right.
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-white/45">Total reclaimable</div>
                <div className="text-2xl font-extrabold text-emerald-300 tabular-nums">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: data.currency,
                    maximumFractionDigits: 0,
                  }).format(
                    Math.round(
                      data.leaks.reduce((s, l) => s + l.annualImpact, 0),
                    ),
                  )}
                </div>
                <div className="text-[10px] text-white/45">/ year</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {data.leaks.map((leak) => (
                <LeakCard
                  key={leak.id}
                  leak={leak}
                  currency={data.currency}
                  onSelect={(l, applied) => {
                    setAppliedLeaks((prev) => {
                      const next = { ...prev };
                      if (applied) next[l.id] = l.monthlyImpact;
                      else delete next[l.id];
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          </div>

          <TomorrowSimulator
            parents={data.simulator.parents}
            baselineMonthlyOutflow={data.simulator.baselineMonthlyOutflow}
            baselineMonthlyInflow={data.totals.inflow / Math.max(1, data.monthsCovered)}
            currency={data.currency}
            externalReclaim={externalReclaim}
          />
        </div>

        <p className="mt-8 text-center text-[11px] text-white/30">
          Computed from {data.totals.txCount.toLocaleString()} transactions across {data.monthsCovered} months.
          Projections are straight-line and exclude returns, inflation, and behaviour change.
        </p>
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

function DnaWheelSkeleton() {
  return (
    <div className="flex aspect-square items-center justify-center text-white/40">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}

function ArchetypeBadge({ archetype }: { archetype: Archetype }) {
  return (
    <div className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-1.5 text-xs font-semibold text-emerald-200 shadow-[0_0_24px_rgba(11,193,141,0.18)]">
      {archetype.name}
    </div>
  );
}

function ArchetypePanel({
  archetype,
  totals,
  currency,
}: {
  archetype: Archetype;
  totals: XRayResponse["totals"];
  currency: string;
}) {
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-950/80 to-black/80 p-5 shadow-2xl">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/80">
        Your archetype
      </div>
      <h3 className="mt-1 text-xl font-bold text-white">{archetype.name}</h3>
      <p className="mt-2 text-xs leading-relaxed text-white/65">{archetype.blurb}</p>

      <div className="mt-4 space-y-2">
        {archetype.scoreCard.map((s) => {
          const pct = Math.min(100, (s.value / s.max) * 100);
          const color =
            s.tone === "good"
              ? "#0BC18D"
              : s.tone === "warn"
                ? "#FB7185"
                : "#22D3EE";
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between text-[11px] text-white/65">
                <span>{s.label}</span>
                <span className="font-semibold tabular-nums" style={{ color }}>{s.value}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/8 pt-3 text-xs">
        <Stat label="Net flow" value={fmt.format(Math.round(totals.netFlow))} accent={totals.netFlow >= 0 ? "#A3E635" : "#F87171"} />
        <Stat label="Outflow" value={fmt.format(Math.round(totals.outflow))} accent="#F472B6" />
        <Stat label="Discretionary" value={`${Math.round(totals.discretionaryShare * 100)}%`} accent="#22D3EE" />
        <Stat label="Recurring" value={`${Math.round(totals.recurringShare * 100)}%`} accent="#FACC15" />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-black/30 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-sm font-extrabold tabular-nums" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function PulsePanel({ data }: { data: XRayResponse }) {
  const max = Math.max(1, ...data.hourHeatmap);
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-950/80 to-black/80 p-5 shadow-2xl">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300/80">
        Spend by hour
      </div>
      <h3 className="mt-1 text-base font-bold text-white">When the wallet opens</h3>
      <div className="mt-3 flex items-end gap-[2px] h-20">
        {data.hourHeatmap.map((v, h) => {
          const hPct = Math.max(2, (v / max) * 100);
          const isLate = h >= 22 || h < 4;
          return (
            <div
              key={h}
              className="flex-1 rounded-t-sm transition-all"
              style={{
                height: `${hPct}%`,
                background: isLate
                  ? `linear-gradient(180deg, #F87171, #FB923C)`
                  : `linear-gradient(180deg, #22D3EE, #0BC18D)`,
              }}
              title={`${String(h).padStart(2, "0")}:00 — ${Math.round(v).toLocaleString()}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-white/35">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </div>
  );
}

/* Subtle aurora background — fixed to viewport so it never alters page height
 * or interferes with the parent scroll container. */
function Aurora() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute -top-32 left-1/4 h-[480px] w-[480px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(11,193,141,0.35), transparent 70%)" }}
      />
      <div
        className="absolute right-0 top-1/3 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(173,116,255,0.35), transparent 70%)" }}
      />
      <div
        className="absolute -bottom-40 left-1/3 h-[480px] w-[480px] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(34,211,238,0.35), transparent 70%)" }}
      />
    </div>
  );
}
