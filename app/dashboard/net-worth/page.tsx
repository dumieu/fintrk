"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Loader2,
  Crown,
  Eye,
  EyeOff,
  Info,
} from "lucide-react";
import { formatCurrencyInteger } from "@/lib/format";
import {
  horizonFor,
  MAX_PROJECTION_AGE,
  project,
  totals,
  type NetWorthItem,
  type NetWorthSettings,
} from "@/lib/net-worth";
import { CountUp } from "./_components/count-up";
import { WealthCurve } from "./_components/wealth-curve";
import { MilestoneCards } from "./_components/milestones";
import { ProjectionControls } from "./_components/controls";
import { BalanceSheet } from "./_components/balance-sheet";
import { FreedomCard } from "./_components/freedom-card";
import { ScenarioStrip } from "./_components/scenarios";

/** Until the user enters a DOB, every projection anchors to this age. */
const FALLBACK_AGE = 40;

const DEFAULT_SETTINGS: NetWorthSettings = {
  currency: "USD",
  defaultGrowthRate: 0.10,
  monthlyContribution: 1500,
  monthlyContributionPost: 0,
  inflationRate: 0.03,
  currentAge: FALLBACK_AGE,
  retirementAge: 65,
  birthMonth: null,
  birthYear: null,
  annualDrawdownPre: 0,
  annualDrawdown: 60_000,
  showInflationAdjusted: false,
};

// Realistic middle-class US family defaults so the user lands on a chart that
// tells a story before they edit anything. Roughly tracks median household
// net worth + portfolio mix.
const SAMPLE_ITEMS: NetWorthItem[] = [
  { kind: "asset",     category: "cash",        label: "Checking",          amount: 10_000,  currency: "USD", growthRate: null },
  { kind: "asset",     category: "savings",     label: "Emergency fund",    amount: 25_000,  currency: "USD", growthRate: null },
  { kind: "asset",     category: "investments", label: "Brokerage",         amount: 45_000,  currency: "USD", growthRate: null },
  { kind: "asset",     category: "retirement",  label: "401(k) / IRA",      amount: 110_000, currency: "USD", growthRate: null },
  { kind: "asset",     category: "real_estate", label: "Home equity",       amount: 200_000, currency: "USD", growthRate: null },
  { kind: "asset",     category: "vehicles",    label: "Vehicles",          amount: 20_000,  currency: "USD", growthRate: null },
  { kind: "liability", category: "mortgage",    label: "Mortgage",          amount: 230_000, currency: "USD", growthRate: null },
  { kind: "liability", category: "auto_loan",   label: "Auto loan",         amount: 15_000,  currency: "USD", growthRate: null },
  { kind: "liability", category: "credit_card", label: "Credit cards",      amount: 5_000,   currency: "USD", growthRate: null },
];

export default function NetWorthPage() {
  const [items, setItems] = useState<NetWorthItem[]>([]);
  const [settings, setSettings] = useState<NetWorthSettings>(DEFAULT_SETTINGS);
  const [initialItems, setInitialItems] = useState<NetWorthItem[]>([]);
  const [initialSettings, setInitialSettings] = useState<NetWorthSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const firstLoad = useRef(true);

  // ─── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/net-worth")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const loadedItems: NetWorthItem[] = (data.items ?? []).map((it: NetWorthItem) => ({
          ...it,
          growthRate:
            it.growthRate == null ? null : Math.round(it.growthRate * 100) / 100,
        }));
        const loadedSettings: NetWorthSettings = data.settings ?? DEFAULT_SETTINGS;
        loadedSettings.defaultGrowthRate =
          Math.round(loadedSettings.defaultGrowthRate * 100) / 100;
        loadedSettings.inflationRate = Math.round(loadedSettings.inflationRate * 100) / 100;
        // Anchor to age 40 every time until the user actually submits a DOB.
        if (loadedSettings.birthMonth == null || loadedSettings.birthYear == null) {
          loadedSettings.currentAge = FALLBACK_AGE;
        }
        if (loadedItems.length === 0) {
          setItems(SAMPLE_ITEMS);
        } else {
          setItems(loadedItems);
          setInitialItems(loadedItems);
        }
        setSettings(loadedSettings);
        setInitialSettings(loadedSettings);
      })
      .catch(() => setItems(SAMPLE_ITEMS))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const projection = useMemo(() => project(items, settings), [items, settings]);
  const t = useMemo(() => totals(items), [items]);

  const isDirty = useMemo(() => {
    return (
      JSON.stringify(items) !== JSON.stringify(initialItems) ||
      JSON.stringify(settings) !== JSON.stringify(initialSettings)
    );
  }, [items, settings, initialItems, initialSettings]);

  // ─── Save ────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/net-worth", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        }),
        fetch("/api/net-worth/items", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        }),
      ]);
      if (r1.ok && r2.ok) {
        setInitialItems(items);
        setInitialSettings(settings);
      }
    } finally {
      setSaving(false);
    }
  }, [items, settings]);

  // Auto-save 1.2s after the user stops editing.
  useEffect(() => {
    if (loading) return;
    if (firstLoad.current) { firstLoad.current = false; return; }
    if (!isDirty) return;
    const id = setTimeout(() => { void save(); }, 1200);
    return () => clearTimeout(id);
  }, [items, settings, isDirty, loading, save]);

  // ─── Mutations ───────────────────────────────────────────────────────────
  const addAsset = useCallback(() => {
    setItems((prev) => [
      ...prev,
      { kind: "asset", category: "investments", label: "New asset", amount: 0, currency: settings.currency, growthRate: null },
    ]);
  }, [settings.currency]);

  const addLiability = useCallback(() => {
    setItems((prev) => [
      ...prev,
      { kind: "liability", category: "credit_card", label: "New liability", amount: 0, currency: settings.currency, growthRate: null },
    ]);
  }, [settings.currency]);

  const updateItem = useCallback((idx: number, patch: Partial<NetWorthItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addPresetItem = useCallback((item: NetWorthItem) => {
    setItems((prev) => [...prev, { ...item, currency: settings.currency }]);
  }, [settings.currency]);

  const seedExample = useCallback(() => setItems(SAMPLE_ITEMS), []);

  // ─── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
        <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4">
          <Loader2 className="h-6 w-6 animate-spin text-white/50" />
        </div>
      </div>
    );
  }

  return (
    // NOTE: outer wrapper is `relative` (not overflow-hidden) so the parent
    // scroll container (`overflow-y-auto` from the dashboard layout) can
    // freely scroll the full content. The aurora glow lives inside its own
    // `absolute inset-0 overflow-hidden` wrapper so it stays contained.
    <div className="relative isolate min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <Aurora />

      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-8">
        {/* ────────── HERO ────────── */}
        <Hero
          netWorth={t.netWorth}
          assets={t.assets}
          liabilities={t.liabilities}
          currency={settings.currency}
          blendedRate={projection.effectiveAssetRate}
          inflationAdjusted={settings.showInflationAdjusted}
          milestones={projection.milestones}
        />

        {/* ────────── WEALTH CURVE (per-asset-class stacked) ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4 pb-2 backdrop-blur-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] sm:px-5 sm:pt-5"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white sm:text-xl">The wealth curve</h2>
              <p className="mt-1 text-xs text-white/55">
                {settings.showInflationAdjusted
                  ? "Real (inflation-adjusted) net worth in today's dollars."
                  : "Nominal net worth — actual dollars at each future age."}
                {" "}From age {settings.currentAge} to {settings.currentAge + horizonFor(settings.currentAge)}, with assets stacked by class and debt amortising in the band below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, showInflationAdjusted: !s.showInflationAdjusted }))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/80 transition hover:bg-white/[0.08]"
            >
              {settings.showInflationAdjusted ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {settings.showInflationAdjusted ? "Real $ (today)" : "Nominal $"}
            </button>
          </div>
          <div className="mt-2">
            <WealthCurve
              series={projection.series}
              settings={settings}
              currency={settings.currency}
              onRetirementAgeChange={(age) =>
                setSettings((s) => ({
                  ...s,
                  retirementAge: Math.max(s.currentAge, Math.min(MAX_PROJECTION_AGE, age)),
                }))
              }
            />
          </div>
        </motion.div>

        {/* ────────── BALANCE SHEET ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6"
        >
          <BalanceSheet
            items={items}
            currency={settings.currency}
            defaultRate={settings.defaultGrowthRate}
            inflationRate={settings.inflationRate}
            onAddAsset={addAsset}
            onAddLiability={addLiability}
            onAddPresetItem={addPresetItem}
            onUpdate={updateItem}
            onRemove={removeItem}
            onSeedExample={seedExample}
          />
        </motion.div>

        {/* ────────── MILESTONE CARDS ────────── */}
        <MilestoneCards
          milestones={projection.milestones}
          today={projection.today}
          currency={settings.currency}
        />

        {/* ────────── PROJECTION CONTROLS ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="mt-6"
        >
          <ProjectionControls
            settings={settings}
            dobFallbackAge={FALLBACK_AGE}
            onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          />
        </motion.div>

        {/* ────────── SCENARIO COMPARE ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="mt-6"
        >
          <ScenarioStrip items={items} settings={settings} />
        </motion.div>

        {/* ────────── FREEDOM CARD ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
          className="mt-6"
        >
          <FreedomCard
            settings={settings}
            depletionAge={projection.depletionAge}
            yearsOfFreedom={projection.yearsOfFreedom}
            freedomNumber={projection.freedomNumber}
            blendedRate={projection.effectiveAssetRate}
          />
        </motion.div>

        {/* footer note */}
        <p className="mx-auto mt-10 max-w-2xl text-center text-[11px] leading-relaxed text-white/40">
          Each asset compounds at its own rate. Liabilities amortise toward zero over their
          standard payoff term (mortgage 30y, credit card 5y, auto 5y, student 10y).
          Numbers are estimates, not investment advice.
        </p>
      </div>
    </div>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────
function Hero({
  netWorth, assets, liabilities, currency, blendedRate, inflationAdjusted,
  milestones,
}: {
  netWorth: number;
  assets: number;
  liabilities: number;
  currency: string;
  blendedRate: number;
  inflationAdjusted: boolean;
  milestones: { years: number; point: { netWorth: number } | null }[];
}) {
  const at10 = milestones.find((m) => m.years === 10)?.point?.netWorth ?? 0;
  const at30 = milestones.find((m) => m.years === 30)?.point?.netWorth ?? 0;
  const multiplier10 = netWorth > 0 ? at10 / netWorth : 0;
  const multiplier30 = netWorth > 0 ? at30 / netWorth : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-6 backdrop-blur-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] sm:p-9"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1.4fr]">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70">
            <Sparkles className="h-3 w-3" style={{ color: "#0BC18D" }} />
            Live net worth
          </div>
          <h1 className="mt-3 bg-gradient-to-br from-white via-white/95 to-white/70 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-6xl">
            <CountUp value={netWorth} formatter={(n) => formatCurrencyInteger(Math.round(n), currency)} />
          </h1>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] sm:text-xs">
            <Pill icon={<TrendingUp className="h-3 w-3" />} accent="#0BC18D">
              Assets {formatCurrencyInteger(assets, currency)}
            </Pill>
            <Pill icon={<TrendingDown className="h-3 w-3" />} accent="#FF6F69">
              Liabilities {formatCurrencyInteger(liabilities, currency)}
            </Pill>
            <Pill icon={<Crown className="h-3 w-3" />} accent="#ECAA0B">
              Blended growth {Math.round(blendedRate * 100)}%
            </Pill>
            {inflationAdjusted && (
              <Pill icon={<Info className="h-3 w-3" />} accent="#AD74FF">
                Real (today's $)
              </Pill>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 min-[640px]:flex-row min-[640px]:items-stretch">
          <ProjectionMilestoneCard
            title="PROJECTED 10 YEARS OUT"
            value={at10}
            multiplier={multiplier10}
            currency={currency}
          />
          <ProjectionMilestoneCard
            title="PROJECTED 30 YEARS OUT"
            value={at30}
            multiplier={multiplier30}
            currency={currency}
          />
        </div>
      </div>
    </motion.div>
  );
}

function ProjectionMilestoneCard({
  title,
  value,
  multiplier,
  currency,
}: {
  title: string;
  value: number;
  multiplier: number;
  currency: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-[#0BC18D]/20 bg-gradient-to-br from-[#0BC18D]/[0.08] via-[#2CA2FF]/[0.04] to-transparent p-5 sm:p-6">
      <p className="text-xs font-bold uppercase leading-snug tracking-wide text-[#0BC18D] sm:text-sm">
        {title}
      </p>
      <p className="mt-1 text-[27px] font-black leading-tight tracking-tight text-white sm:text-[33px]">
        <CountUp value={value} formatter={(n) => formatCurrencyInteger(Math.round(n), currency)} />
      </p>
      <div className="mt-3 flex items-baseline gap-2 text-xs text-white/60">
        <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-bold text-[#0BC18D]">
          {multiplier > 0 ? `${Math.round(multiplier)}×` : "—"}
        </span>
        <span>your money today</span>
      </div>
    </div>
  );
}

function Pill({
  icon, accent, children,
}: {
  icon: React.ReactNode;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium"
      style={{
        borderColor: `${accent}40`,
        background: `${accent}15`,
        color: "white",
      }}
    >
      <span style={{ color: accent }}>{icon}</span>
      {children}
    </span>
  );
}

// ─── Aurora background (own clipping wrapper so outer page scrolls cleanly) ─
function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full opacity-50 blur-[120px]"
        style={{ background: "radial-gradient(closest-side, rgba(11,193,141,0.45), transparent 70%)" }}
      />
      <div
        className="absolute top-32 right-0 h-[380px] w-[520px] rounded-full opacity-40 blur-[110px]"
        style={{ background: "radial-gradient(closest-side, rgba(173,116,255,0.55), transparent 70%)" }}
      />
      <div
        className="absolute bottom-0 left-0 h-[340px] w-[520px] rounded-full opacity-35 blur-[110px]"
        style={{ background: "radial-gradient(closest-side, rgba(44,162,255,0.45), transparent 70%)" }}
      />
    </div>
  );
}
