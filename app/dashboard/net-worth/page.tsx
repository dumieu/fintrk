"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import { Loader2, Eye, EyeOff, Activity, Layers3 } from "lucide-react";
import {
  horizonFor,
  MAX_PROJECTION_AGE,
  monteCarlo,
  project,
  type NetWorthItem,
  type NetWorthSettings,
} from "@/lib/net-worth";
import { CommandCenter } from "./_components/command-center";
import { WealthCurve } from "./_components/wealth-curve";
import { MilestoneTimeline } from "./_components/milestones";
import { LeverDeck } from "./_components/levers";
import { BalanceSheet } from "./_components/balance-sheet";
import { InsightDeck } from "./_components/insights";
import { ScenarioMatrix } from "./_components/scenarios";

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
  annualIncome: 90_000,
  incomeGrowthRate: 0.03,
  postRetirementIncome: 24_000,
  postRetirementIncomeStartAge: 67,
};

// Realistic middle-class US family defaults so the user lands on a chart that
// tells a story before they edit anything.
const SAMPLE_ITEMS: NetWorthItem[] = [
  { kind: "asset",     category: "cash",        label: "Checking",       amount: 10_000,  currency: "USD", growthRate: null },
  { kind: "asset",     category: "savings",     label: "Emergency fund", amount: 25_000,  currency: "USD", growthRate: null },
  { kind: "asset",     category: "investments", label: "Brokerage",      amount: 45_000,  currency: "USD", growthRate: null },
  { kind: "asset",     category: "retirement",  label: "401(k) / IRA",   amount: 110_000, currency: "USD", growthRate: null },
  { kind: "asset",     category: "real_estate", label: "Home equity",    amount: 200_000, currency: "USD", growthRate: null },
  { kind: "asset",     category: "vehicles",    label: "Vehicles",       amount: 20_000,  currency: "USD", growthRate: null },
  { kind: "liability", category: "mortgage",    label: "Mortgage",       amount: 230_000, currency: "USD", growthRate: null },
  { kind: "liability", category: "auto_loan",   label: "Auto loan",      amount: 15_000,  currency: "USD", growthRate: null },
  { kind: "liability", category: "credit_card", label: "Credit cards",   amount: 5_000,   currency: "USD", growthRate: null },
];

export default function NetWorthPage() {
  const [items, setItems] = useState<NetWorthItem[]>([]);
  const [settings, setSettings] = useState<NetWorthSettings>(DEFAULT_SETTINGS);
  const [initialItems, setInitialItems] = useState<NetWorthItem[]>([]);
  const [initialSettings, setInitialSettings] = useState<NetWorthSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [showBands, setShowBands] = useState(true);
  const [showClasses, setShowClasses] = useState(true);
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
          growthRate: it.growthRate == null ? null : Math.round(it.growthRate * 100) / 100,
        }));
        const loadedSettings: NetWorthSettings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
        loadedSettings.defaultGrowthRate = Math.round(loadedSettings.defaultGrowthRate * 100) / 100;
        loadedSettings.inflationRate = Math.round(loadedSettings.inflationRate * 100) / 100;
        loadedSettings.incomeGrowthRate = Math.round(loadedSettings.incomeGrowthRate * 100) / 100;
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
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Live engine ──────────────────────────────────────────────────────────
  const projection = useMemo(() => project(items, settings), [items, settings]);

  // Monte Carlo + scenarios are heavier: run them on deferred inputs so
  // slider drags stay at 60fps while the bands catch up a frame later.
  const deferredItems = useDeferredValue(items);
  const deferredSettings = useDeferredValue(settings);
  const mc = useMemo(
    () => monteCarlo(deferredItems, deferredSettings, { runs: 400, seed: 1337 }),
    [deferredItems, deferredSettings],
  );

  const isDirty = useMemo(
    () =>
      JSON.stringify(items) !== JSON.stringify(initialItems) ||
      JSON.stringify(settings) !== JSON.stringify(initialSettings),
    [items, settings, initialItems, initialSettings],
  );

  // ─── Save ────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
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
    } catch {
      // auto-save retries on the next edit
    }
  }, [items, settings]);

  useEffect(() => {
    if (loading) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    if (!isDirty) return;
    const id = setTimeout(() => {
      void save();
    }, 1200);
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

  const addPresetItem = useCallback(
    (item: NetWorthItem) => {
      setItems((prev) => [...prev, { ...item, currency: settings.currency }]);
    },
    [settings.currency],
  );

  const seedExample = useCallback(() => setItems(SAMPLE_ITEMS), []);

  if (loading) {
    return (
      <div className="min-h-[80vh] bg-app-canvas">
        <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const mode: "nominal" | "real" = settings.showInflationAdjusted ? "real" : "nominal";

  return (
    <div className="relative isolate min-h-[80vh] bg-app-canvas">
      <Aurora />

      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-8">
        {/* ────────── COMMAND CENTER ────────── */}
        <CommandCenter projection={projection} mc={mc} settings={settings} />

        {/* ────────── WEALTH TRAJECTORY ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-6 rounded-3xl border border-chart-border bg-chart-muted/40 p-4 pb-2 backdrop-blur-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] sm:px-5 sm:pt-5"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground sm:text-xl">The wealth curve</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {mode === "real"
                  ? "Real net worth in today's purchasing power."
                  : "Nominal net worth - actual dollars at each future age."}{" "}
                Age {settings.currentAge} to {settings.currentAge + horizonFor(settings.currentAge)}. Shaded fan = {mc.runs} market simulations. Drag the retirement flag.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Toggle
                active={settings.showInflationAdjusted}
                onClick={() => setSettings((s) => ({ ...s, showInflationAdjusted: !s.showInflationAdjusted }))}
                icon={settings.showInflationAdjusted ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              >
                {settings.showInflationAdjusted ? "Real $ (today)" : "Nominal $"}
              </Toggle>
              <Toggle active={showBands} onClick={() => setShowBands((v) => !v)} icon={<Activity className="h-3.5 w-3.5" />}>
                Uncertainty
              </Toggle>
              <Toggle active={showClasses} onClick={() => setShowClasses((v) => !v)} icon={<Layers3 className="h-3.5 w-3.5" />}>
                Asset classes
              </Toggle>
            </div>
          </div>
          <div className="mt-2">
            <WealthCurve
              series={projection.series}
              bands={showBands ? mc.bands : null}
              settings={settings}
              currency={settings.currency}
              mode={mode}
              fiAge={projection.fiAge}
              depletionAge={projection.depletionAge}
              showBands={showBands}
              showClasses={showClasses}
              onRetirementAgeChange={(age) =>
                setSettings((s) => ({
                  ...s,
                  retirementAge: Math.max(s.currentAge, Math.min(MAX_PROJECTION_AGE, age)),
                }))
              }
            />
          </div>
        </motion.div>

        {/* ────────── LEVER DECK ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6"
        >
          <LeverDeck
            settings={settings}
            projection={projection}
            dobFallbackAge={FALLBACK_AGE}
            onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          />
        </motion.div>

        {/* ────────── INSIGHTS ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="mt-6"
        >
          <InsightDeck items={items} settings={settings} base={projection} />
        </motion.div>

        {/* ────────── LIFE TIMELINE ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="mt-6"
        >
          <MilestoneTimeline projection={projection} settings={settings} />
        </motion.div>

        {/* ────────── THREE FUTURES ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="mt-6"
        >
          <ScenarioMatrix items={deferredItems} settings={deferredSettings} />
        </motion.div>

        {/* ────────── BALANCE SHEET ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
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

        {/* footer note */}
        <p className="mx-auto mt-10 max-w-2xl text-center text-[11px] leading-relaxed text-muted-foreground">
          Monthly simulation: assets compound individually, debts amortise with real APRs,
          income grows with raises, and spending is indexed to inflation. The fan shows
          percentile outcomes across {mc.runs} randomised market paths. Estimates, not investment advice.
        </p>
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition"
      style={
        active
          ? { borderColor: "rgba(11,193,141,0.45)", background: "rgba(11,193,141,0.12)", color: "var(--foreground)" }
          : { borderColor: "var(--chart-border)", background: "var(--chart-muted)", color: "var(--muted-foreground)" }
      }
    >
      {icon}
      {children}
    </button>
  );
}

// ─── Aurora background ───────────────────────────────────────────────────────
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
