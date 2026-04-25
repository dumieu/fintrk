"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, Search, Info } from "lucide-react";
import { formatCurrencyInteger } from "@/lib/format";
import {
  ASSET_CATEGORIES,
  LIABILITY_CATEGORIES,
  findAssetCategory,
  findLiabilityCategory,
  totals,
  type NetWorthItem,
} from "@/lib/net-worth";
import { iconForItem, type PresetItem } from "@/lib/net-worth-presets";
import { PresetPicker } from "./preset-picker";

export function BalanceSheet({
  items,
  currency,
  defaultRate,
  inflationRate,
  onAddAsset,
  onAddLiability,
  onAddPresetItem,
  onUpdate,
  onRemove,
  onSeedExample,
}: {
  items: NetWorthItem[];
  currency: string;
  defaultRate: number;
  /** Assumed annual inflation (decimal), used in tooltip copy only. */
  inflationRate: number;
  /** Add a blank asset row (kept for backwards-compat / "Custom" path). */
  onAddAsset: () => void;
  /** Add a blank liability row (kept for backwards-compat / "Custom" path). */
  onAddLiability: () => void;
  /**
   * Preferred path for adding new lines: pass a fully-formed item from the
   * preset picker (or the picker's custom-entry path). Parent decides
   * starting amount / growth rate.
   */
  onAddPresetItem?: (item: NetWorthItem) => void;
  onUpdate: (idx: number, patch: Partial<NetWorthItem>) => void;
  onRemove: (idx: number) => void;
  onSeedExample: () => void;
}) {
  const [pickerKind, setPickerKind] = useState<"asset" | "liability" | null>(null);
  const t = totals(items);
  const indexed = items.map((it, i) => ({ it, i }));
  const assets = indexed.filter((x) => x.it.kind === "asset");
  const liabs = indexed.filter((x) => x.it.kind === "liability");

  const isEmpty = items.length === 0;

  const handlePick = (
    pick:
      | { kind: "preset"; preset: PresetItem }
      | { kind: "custom"; categoryId: string; label: string },
    forKind: "asset" | "liability",
  ) => {
    if (pick.kind === "preset") {
      const p = pick.preset;
      const item: NetWorthItem = {
        kind: p.kind,
        category: p.categoryId,
        label: p.label,
        amount: 0,
        currency,
        growthRate: p.growthRate ?? null,
      };
      if (onAddPresetItem) onAddPresetItem(item);
      else forKind === "asset" ? onAddAsset() : onAddLiability();
    } else {
      const item: NetWorthItem = {
        kind: forKind,
        category: pick.categoryId,
        label: pick.label,
        amount: 0,
        currency,
        growthRate: null,
      };
      if (onAddPresetItem) onAddPresetItem(item);
      else forKind === "asset" ? onAddAsset() : onAddLiability();
    }
  };

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 backdrop-blur-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
            <Wallet className="h-4 w-4 text-[#0BC18D]" />
            Balance sheet
          </h2>
          <p className="mt-1 text-xs text-white/55">
            Pick from a curated catalog or search for anything — icons are auto-assigned. Saves automatically.
          </p>
        </div>
        {isEmpty && (
          <button
            type="button"
            onClick={onSeedExample}
            className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/[0.1]"
          >
            Load sample
          </button>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── ASSETS column ── */}
        <Column
          accent="#0BC18D"
          icon={<TrendingUp className="h-4 w-4" />}
          title="Assets"
          totalLabel={formatCurrencyInteger(t.assets, currency)}
          onAdd={() => setPickerKind("asset")}
          addLabel="Add asset"
        >
          <AnimatePresence initial={false}>
            {assets.map(({ it, i }) => (
              <Row
                key={i}
                idx={i}
                item={it}
                accent="#0BC18D"
                categories={ASSET_CATEGORIES}
                defaultRateLabel={`${Math.round(defaultRate * 100)}%`}
                inflationRate={inflationRate}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ))}
          </AnimatePresence>
          {assets.length === 0 && <EmptyHint accent="#0BC18D" text="No assets yet — search a curated catalog of cash, investments, real estate, vehicles & more." />}
        </Column>

        {/* ── LIABILITIES column ── */}
        <Column
          accent="#FF6F69"
          icon={<TrendingDown className="h-4 w-4" />}
          title="Liabilities"
          totalLabel={formatCurrencyInteger(t.liabilities, currency)}
          onAdd={() => setPickerKind("liability")}
          addLabel="Add liability"
        >
          <AnimatePresence initial={false}>
            {liabs.map(({ it, i }) => (
              <Row
                key={i}
                idx={i}
                item={it}
                accent="#FF6F69"
                categories={LIABILITY_CATEGORIES}
                defaultRateLabel="—"
                inflationRate={inflationRate}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ))}
          </AnimatePresence>
          {liabs.length === 0 && <EmptyHint accent="#FF6F69" text="No liabilities — beautiful. Search if you have a mortgage, credit card, or loan." />}
        </Column>
      </div>

      {/* Net worth strip */}
      <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-[#0BC18D]/10 via-transparent to-[#FF6F69]/10 px-5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/70">Net worth</span>
        <span className="text-xl font-black tracking-tight text-white">
          {formatCurrencyInteger(t.netWorth, currency)}
        </span>
      </div>

      <PresetPicker
        open={pickerKind !== null}
        kind={pickerKind ?? "asset"}
        onClose={() => setPickerKind(null)}
        onPick={(pick) => handlePick(pick, pickerKind ?? "asset")}
      />
    </div>
  );
}

function Column({
  accent, icon, title, totalLabel, onAdd, addLabel, children,
}: {
  accent: string;
  icon: React.ReactNode;
  title: string;
  totalLabel: string;
  onAdd: () => void;
  addLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: `${accent}25`, background: `linear-gradient(180deg, ${accent}08 0%, transparent 60%)` }}>
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>
          {icon}
          {title}
        </span>
        <span className="text-sm font-bold tabular-nums text-white">{totalLabel}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2.5 text-[11px] font-semibold transition hover:bg-white/[0.04]"
        style={{ borderColor: `${accent}55`, color: accent }}
      >
        <Search className="h-3.5 w-3.5" />
        {addLabel}
        <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-normal opacity-70">
          <Plus className="h-2.5 w-2.5" /> from catalog
        </span>
      </button>
    </div>
  );
}

function Row({
  idx, item, accent, categories, defaultRateLabel, inflationRate, onUpdate, onRemove,
}: {
  idx: number;
  item: NetWorthItem;
  accent: string;
  categories: { id: string; label: string; icon: string; defaultRate: number; color: string }[];
  defaultRateLabel: string;
  inflationRate: number;
  onUpdate: (idx: number, patch: Partial<NetWorthItem>) => void;
  onRemove: (idx: number) => void;
}) {
  const cat =
    item.kind === "asset" ? findAssetCategory(item.category) : findLiabilityCategory(item.category);
  const Icon = iconForItem(item.kind, item.category, item.label);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="group rounded-xl border border-white/10 bg-white/[0.04] p-2.5 transition hover:bg-white/[0.06]"
    >
      <div className="flex items-center gap-2">
        {/* Auto-derived icon — user never picks this */}
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ background: `${cat.color}22`, color: cat.color }}
          title={cat.label}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        {/* Hidden category select — preserved for users who want to recategorise without re-adding */}
        <select
          value={item.category}
          onChange={(e) => {
            const next = categories.find((c) => c.id === e.target.value);
            onUpdate(idx, {
              category: e.target.value,
              growthRate: item.growthRate == null ? next?.defaultRate ?? null : item.growthRate,
            });
          }}
          className="sr-only"
          aria-label="Category"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={item.label}
          onChange={(e) => onUpdate(idx, { label: e.target.value })}
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-white outline-none transition focus:border-white/15 focus:bg-white/[0.04]"
          placeholder="Label"
        />
        <IntegerAmountInput
          amount={Number.isFinite(item.amount) ? item.amount : 0}
          onCommit={(n) => onUpdate(idx, { amount: n })}
          className="h-8 w-[7.25rem] shrink-0 rounded-md border border-white/10 bg-white/[0.05] px-2 text-right text-sm font-bold tabular-nums text-white outline-none focus:border-white/30 sm:w-32"
        />
        <button
          type="button"
          onClick={() => onRemove(idx)}
          className="rounded-md p-1.5 text-white/30 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-[#FF6F69]"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between pl-10 pr-2 text-[10px] text-white/45">
        <span className="truncate">{cat.label}</span>
        <label className="flex items-center gap-1">
          {item.kind === "liability" ? (
            <span>rate</span>
          ) : (
            <span className="inline-flex items-center gap-0.5">
              <span>Nominal growth</span>
              <NominalGrowthInfo inflationPct={Math.round(inflationRate * 100)} />
            </span>
          )}
          <input
            type="number"
            step="1"
            min={0}
            max={100}
            value={item.growthRate == null ? "" : String(Math.round(item.growthRate * 100))}
            placeholder={defaultRateLabel}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                onUpdate(idx, { growthRate: null });
                return;
              }
              const pct = Math.round(Number(v));
              if (!Number.isFinite(pct)) return;
              onUpdate(idx, { growthRate: Math.min(100, Math.max(0, pct)) / 100 });
            }}
            className="h-5 w-12 rounded border border-white/10 bg-transparent px-1 text-right text-[10px] tabular-nums text-white outline-none focus:border-white/30"
          />
          <span>%</span>
        </label>
      </div>
    </motion.div>
  );
}

function NominalGrowthInfo({ inflationPct }: { inflationPct: number }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? "nominal-growth-tooltip" : undefined}
        aria-label="What nominal growth means and how inflation is handled"
        onClick={() => setOpen((o) => !o)}
        className="rounded p-0.5 text-white/35 outline-none transition hover:text-[#0BC18D] focus-visible:ring-1 focus-visible:ring-[#0BC18D]/60"
      >
        <Info className="size-3 shrink-0" strokeWidth={2.5} />
      </button>
      {open ? (
        <span
          role="tooltip"
          id="nominal-growth-tooltip"
          className="absolute bottom-[calc(100%+6px)] right-0 z-50 w-[min(17.5rem,calc(100vw-2rem))] rounded-lg border border-white/15 bg-[#0e0822] px-2.5 py-2 text-left text-[10px] leading-relaxed text-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
        >
          <span className="font-bold text-white">Inflation</span> is the average yearly rise in prices.
          Over time, the same dollars buy less unless returns keep pace.
          <span className="mt-1.5 block">
            The <span className="font-semibold text-white">nominal growth %</span> on each asset is the
            total expected yearly return in actual dollars — it is{" "}
            <span className="font-semibold text-white">inclusive of inflation</span>, meaning it already
            contains the part of returns that merely offsets rising prices (plus any real gain on top).
          </span>
          <span className="mt-1.5 block text-white/75">
            Your inflation assumption in Projection controls is{" "}
            <span className="tabular-nums font-semibold text-white">{inflationPct}%</span> per year. When
            you turn on <span className="font-semibold text-white">Real $ (today)</span> on the wealth
            curve, we subtract that rate from nominal growth so the chart shows purchasing power after
            inflation.
          </span>
        </span>
      ) : null}
    </span>
  );
}

function EmptyHint({ accent, text }: { accent: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-white/45" style={{ borderColor: `${accent}25` }}>
      {text}
    </div>
  );
}

function IntegerAmountInput({
  amount,
  onCommit,
  className,
}: {
  amount: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() =>
    Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString("en-US"),
  );

  useEffect(() => {
    if (!focused) {
      setText(Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString("en-US"));
    }
  }, [amount, focused]);

  const commit = () => {
    setFocused(false);
    const raw = text.replace(/,/g, "").trim();
    if (raw === "") {
      onCommit(0);
      return;
    }
    const n = Math.round(Number(raw.replace(/[^0-9]/g, "")));
    if (!Number.isFinite(n)) return;
    onCommit(Math.max(0, n));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label="Amount"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^0-9,]/g, ""))}
      onFocus={() => {
        setFocused(true);
        setText(String(Math.round(Number.isFinite(amount) ? amount : 0)));
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}
