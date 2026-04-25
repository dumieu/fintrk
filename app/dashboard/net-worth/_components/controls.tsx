"use client";

import { useEffect, useId, useState } from "react";
import { Settings, TrendingUp, Calendar, Wallet, ArrowDown } from "lucide-react";
import { MAX_PROJECTION_AGE, type NetWorthSettings } from "@/lib/net-worth";
import { DobInput } from "./dob-input";

/** Matches `app/api/net-worth/route.ts` zod caps for manual entry. */
const MONTHLY_CONTRIBUTION_MANUAL_MAX = 1_000_000;
const ANNUAL_DRAWDOWN_MANUAL_MAX = 100_000_000;

export function ProjectionControls({
  settings,
  onChange,
  dobFallbackAge,
}: {
  settings: NetWorthSettings;
  onChange: (patch: Partial<NetWorthSettings>) => void;
  /** Age used when DOB is cleared (matches Net Worth page fallback). */
  dobFallbackAge: number;
}) {
  const onDobChange = (patch: { birthMonth: number | null; birthYear: number | null }) => {
    const next: Partial<NetWorthSettings> = { ...patch };
    if (patch.birthMonth && patch.birthYear) {
      const now = new Date();
      const m = now.getMonth() + 1;
      const y = now.getFullYear();
      const age = Math.max(0, Math.min(120, y - patch.birthYear - (m < patch.birthMonth ? 1 : 0)));
      next.currentAge = age;
    } else {
      next.currentAge = dobFallbackAge;
    }
    onChange(next);
  };

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 backdrop-blur-sm sm:p-7">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
          <Settings className="h-4 w-4 text-[#AD74FF]" />
          Projection controls
        </h2>
        <p className="mt-1 text-xs text-white/55">
          Move a slider — every chart, milestone, and projection updates instantly.
        </p>
      </div>

      <div className="mt-3 max-w-md lg:max-w-lg">
        <DobInput
          compact
          birthMonth={settings.birthMonth}
          birthYear={settings.birthYear}
          fallbackAge={settings.currentAge}
          accent="#AD74FF"
          onChange={onDobChange}
        />
      </div>

      {/* ── Top row: rates + retirement age ── */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Slider
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          accent="#0BC18D"
          label="Default growth rate"
          help="Applied to assets without their own override."
          value={Math.round(settings.defaultGrowthRate * 100)}
          min={0}
          max={20}
          step={1}
          format={(v) => `${v}%`}
          onChange={(v) => onChange({ defaultGrowthRate: Math.round(v) / 100 })}
        />
        <Slider
          icon={<TrendingUp className="h-3.5 w-3.5 rotate-180" />}
          accent="#FF6F69"
          label="Inflation rate"
          help="Toggle real $ on the chart to subtract from each asset's growth."
          value={Math.round(settings.inflationRate * 100)}
          min={0}
          max={10}
          step={1}
          format={(v) => `${v}%`}
          onChange={(v) => onChange({ inflationRate: Math.round(v) / 100 })}
        />
        <Slider
          icon={<Calendar className="h-3.5 w-3.5" />}
          accent="#ECAA0B"
          label="Retirement age"
          help="Drawdown phase begins after this age."
          value={settings.retirementAge}
          min={Math.max(settings.currentAge, 30)}
          max={MAX_PROJECTION_AGE}
          step={1}
          format={(v) => `${Math.round(v)}`}
          onChange={(v) =>
            onChange({
              retirementAge: Math.max(
                settings.currentAge,
                Math.min(MAX_PROJECTION_AGE, Math.round(v)),
              ),
            })
          }
        />
      </div>

      {/* ── Paired group: monthly contribution before / after retirement ── */}
      <PairedGroup
        title="Monthly contribution"
        subtitle="What you save into invested assets each month."
        icon={<Wallet className="h-4 w-4" />}
        accent="#2CA2FF"
      >
        <Slider
          compact
          accent="#2CA2FF"
          label="Before"
          help=""
          value={settings.monthlyContribution}
          min={0}
          max={50_000}
          step={100}
          format={(v) => formatMoneyShort(v, settings.currency)}
          onChange={(v) => onChange({ monthlyContribution: v })}
          manualMax={MONTHLY_CONTRIBUTION_MANUAL_MAX}
          currency={settings.currency}
        />
        <Slider
          compact
          accent="#5DD3F3"
          label="After"
          help=""
          value={settings.monthlyContributionPost}
          min={0}
          max={50_000}
          step={100}
          format={(v) => formatMoneyShort(v, settings.currency)}
          onChange={(v) => onChange({ monthlyContributionPost: v })}
          manualMax={MONTHLY_CONTRIBUTION_MANUAL_MAX}
          currency={settings.currency}
        />
      </PairedGroup>

      {/* ── Paired group: annual drawdown before / after retirement ── */}
      <PairedGroup
        title="Annual drawdown"
        subtitle="How much you'll spend out of your portfolio each year."
        icon={<ArrowDown className="h-4 w-4" />}
        accent="#FF6F69"
      >
        <Slider
          compact
          accent="#FB923C"
          label="Before"
          help=""
          value={settings.annualDrawdownPre}
          min={0}
          max={300_000}
          step={1_000}
          format={(v) => formatMoneyShort(v, settings.currency)}
          onChange={(v) => onChange({ annualDrawdownPre: v })}
          manualMax={ANNUAL_DRAWDOWN_MANUAL_MAX}
          currency={settings.currency}
        />
        <Slider
          compact
          accent="#FF6F69"
          label="After"
          help=""
          value={settings.annualDrawdown}
          min={0}
          max={500_000}
          step={1_000}
          format={(v) => formatMoneyShort(v, settings.currency)}
          onChange={(v) => onChange({ annualDrawdown: v })}
          manualMax={ANNUAL_DRAWDOWN_MANUAL_MAX}
          currency={settings.currency}
        />
      </PairedGroup>
    </div>
  );
}

function PairedGroup({
  title, subtitle, icon, accent, children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mt-4 rounded-xl border px-3.5 py-2.5"
      style={{
        borderColor: `${accent}25`,
        background: `linear-gradient(180deg, ${accent}06 0%, transparent 70%)`,
      }}
    >
      <div className="flex items-baseline gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: accent }}>
          {icon}
          {title}
        </span>
        <span className="truncate text-[10px] text-white/40">{subtitle}</span>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function CompactAmountInput({
  value,
  onCommit,
  accent,
  currency,
  maxManual,
  ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  accent: string;
  currency: string;
  maxManual: number;
  ariaLabel: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatMoneyShort(value, currency));

  useEffect(() => {
    if (!focused) setText(formatMoneyShort(value, currency));
  }, [value, focused, currency]);

  const commit = () => {
    setFocused(false);
    const raw = text.replace(/,/g, "").trim().replace(/^\s*\$\s*/i, "");
    if (raw === "") {
      onCommit(0);
      return;
    }
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      setText(formatMoneyShort(value, currency));
      return;
    }
    const rounded = Math.round(n);
    onCommit(Math.min(maxManual, Math.max(0, rounded)));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      className="min-w-[76px] max-w-[108px] shrink-0 rounded-md border border-transparent px-1.5 py-0.5 text-right text-[11px] font-bold tabular-nums outline-none focus:border-white/25"
      style={{ background: `${accent}22`, color: accent }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        setFocused(true);
        setText(value === 0 ? "" : String(Math.round(value)));
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function Slider({
  icon,
  accent,
  label,
  help,
  value,
  min,
  max,
  step,
  format,
  onChange,
  compact = false,
  manualMax,
  currency,
}: {
  icon?: React.ReactNode;
  accent: string;
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  /** Compact: single-row layout (label · slider · value), no help, tighter spacing. */
  compact?: boolean;
  /** Compact + currency: amount box allows typing beyond `max` up to this cap (API limit). */
  manualMax?: number;
  currency?: string;
}) {
  const id = useId();
  const thumb = compact ? 14 : 16;
  const track = compact ? 5 : 6;

  const forRange = compact && manualMax != null ? Math.min(Math.max(value, min), max) : value;
  const pct = ((forRange - min) / Math.max(0.0001, max - min)) * 100;

  if (compact) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5">
        <label
          htmlFor={id}
          className="w-[46px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/65"
        >
          {label}
        </label>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={manualMax != null ? forRange : value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-w-0 flex-1 appearance-none bg-transparent"
          style={{
            background: `linear-gradient(to right, ${accent} 0%, ${accent} ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
            borderRadius: "9999px",
            height: `${track}px`,
          }}
        />
        {manualMax != null && currency != null ? (
          <CompactAmountInput
            value={value}
            onCommit={onChange}
            accent={accent}
            currency={currency}
            maxManual={manualMax}
            ariaLabel={`${label} amount`}
          />
        ) : (
          <span
            className="w-[58px] shrink-0 rounded-md px-1.5 py-0.5 text-right text-[11px] font-bold tabular-nums"
            style={{ background: `${accent}22`, color: accent }}
          >
            {format(value)}
          </span>
        )}
        <style jsx>{`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: ${thumb}px;
            height: ${thumb}px;
            border-radius: 9999px;
            background: white;
            border: 2px solid ${accent};
            box-shadow: 0 0 0 2px ${accent}22;
            cursor: grab;
          }
          input[type="range"]::-moz-range-thumb {
            width: ${thumb}px;
            height: ${thumb}px;
            border-radius: 9999px;
            background: white;
            border: 2px solid ${accent};
            box-shadow: 0 0 0 2px ${accent}22;
            cursor: grab;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/70">
          {icon && <span style={{ color: accent }}>{icon}</span>}
          {label}
        </label>
        <span className="rounded-md px-2 py-0.5 text-sm font-bold tabular-nums" style={{ background: `${accent}22`, color: accent }}>
          {format(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full appearance-none bg-transparent"
        style={{
          background: `linear-gradient(to right, ${accent} 0%, ${accent} ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
          borderRadius: "9999px",
          height: `${track}px`,
        }}
      />
      <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: ${thumb}px;
          height: ${thumb}px;
          border-radius: 9999px;
          background: white;
          border: 2px solid ${accent};
          box-shadow: 0 0 0 3px ${accent}22;
          cursor: grab;
        }
        input[type="range"]::-moz-range-thumb {
          width: ${thumb}px;
          height: ${thumb}px;
          border-radius: 9999px;
          background: white;
          border: 2px solid ${accent};
          box-shadow: 0 0 0 3px ${accent}22;
          cursor: grab;
        }
      `}</style>
      {help && <p className="mt-2 text-[10px] leading-relaxed text-white/40">{help}</p>}
    </div>
  );
}

function formatMoneyShort(v: number, currency: string): string {
  const sym = (() => {
    try {
      return (
        new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
          .formatToParts(0)
          .find((p) => p.type === "currency")?.value ?? "$"
      );
    } catch {
      return "$";
    }
  })();
  if (v >= 1_000_000) return `${sym}${Math.round(v / 1_000_000)}M`;
  if (v >= 1_000) return `${sym}${Math.round(v / 1_000)}k`;
  return `${sym}${Math.round(v)}`;
}
