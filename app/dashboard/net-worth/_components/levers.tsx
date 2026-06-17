"use client";

import { useEffect, useId, useState } from "react";
import {
  Briefcase,
  TrendingUp,
  Calendar,
  ArrowDown,
  LineChart,
  Landmark,
} from "lucide-react";
import { MAX_PROJECTION_AGE, type NetWorthSettings, type ProjectionResult } from "@/lib/net-worth";
import { DobInput } from "./dob-input";

/** Matches `app/api/net-worth/route.ts` zod caps for manual entry. */
const MONTHLY_MANUAL_MAX = 1_000_000;
const ANNUAL_MANUAL_MAX = 100_000_000;

const SAVINGS_RATE_PRESETS = [0.1, 0.15, 0.2, 0.3, 0.5];

/**
 * The lever deck. Four groups - Earning curve, Retirement income, Spending,
 * Market - and every slider feeds the same `project()` call, so the curve,
 * command center, insights, milestones, and scenarios all move together.
 */
export function LeverDeck({
  settings,
  projection,
  onChange,
  dobFallbackAge,
}: {
  settings: NetWorthSettings;
  projection: ProjectionResult;
  onChange: (patch: Partial<NetWorthSettings>) => void;
  dobFallbackAge: number;
}) {
  const onDobChange = (patch: { birthMonth: number | null; birthYear: number | null }) => {
    const next: Partial<NetWorthSettings> = { ...patch };
    if (patch.birthMonth && patch.birthYear) {
      const now = new Date();
      const m = now.getMonth() + 1;
      const y = now.getFullYear();
      next.currentAge = Math.max(0, Math.min(120, y - patch.birthYear - (m < patch.birthMonth ? 1 : 0)));
    } else {
      next.currentAge = dobFallbackAge;
    }
    onChange(next);
  };

  const savingsRate = projection.savingsRate;

  return (
    <div className="rounded-3xl border border-chart-border bg-chart-muted/40 p-5 backdrop-blur-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground sm:text-xl">
            <LineChart className="h-4 w-4 text-[#AD74FF]" />
            The lever deck
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every lever rewires the entire atlas in real time - curve, freedom age, success odds, milestones.
          </p>
        </div>
        <div className="max-w-md">
          <DobInput
            compact
            birthMonth={settings.birthMonth}
            birthYear={settings.birthYear}
            fallbackAge={settings.currentAge}
            accent="#AD74FF"
            onChange={onDobChange}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── EARNING CURVE ── */}
        <LeverGroup
          icon={<Briefcase className="h-4 w-4" />}
          accent="#2CA2FF"
          title="Earning curve"
          subtitle="Income powers savings; raises compound your contributions."
        >
          <Slider
            accent="#2CA2FF"
            label="Take-home income"
            suffix="/yr"
            value={settings.annualIncome}
            min={0}
            max={500_000}
            step={1_000}
            money
            currency={settings.currency}
            manualMax={ANNUAL_MANUAL_MAX}
            onChange={(v) => onChange({ annualIncome: v })}
          />
          <Slider
            accent="#5DD3F3"
            label="Annual raises"
            value={Math.round(settings.incomeGrowthRate * 100)}
            min={0}
            max={10}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => onChange({ incomeGrowthRate: v / 100 })}
          />
          <Slider
            accent="#0BC18D"
            label="Saved monthly"
            value={settings.monthlyContribution}
            min={0}
            max={50_000}
            step={100}
            money
            currency={settings.currency}
            manualMax={MONTHLY_MANUAL_MAX}
            onChange={(v) => onChange({ monthlyContribution: v })}
          />
          {settings.annualIncome > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Savings rate{savingsRate != null ? ` ${Math.round(savingsRate * 100)}%` : ""} ·
              </span>
              {SAVINGS_RATE_PRESETS.map((r) => {
                const active = savingsRate != null && Math.abs(savingsRate - r) < 0.005;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      onChange({
                        monthlyContribution: Math.round((settings.annualIncome * r) / 12 / 50) * 50,
                      })
                    }
                    className="rounded-full border px-2 py-0.5 text-[10px] font-bold transition"
                    style={
                      active
                        ? { borderColor: "#0BC18D", background: "#0BC18D22", color: "#0BC18D" }
                        : { borderColor: "var(--chart-border)", color: "var(--muted-foreground)" }
                    }
                  >
                    {Math.round(r * 100)}%
                  </button>
                );
              })}
              {savingsRate != null && savingsRate > 0.95 && (
                <span className="text-[10px] font-semibold text-[#FB923C]">saving more than income</span>
              )}
            </div>
          )}
        </LeverGroup>

        {/* ── RETIREMENT INCOME ── */}
        <LeverGroup
          icon={<Landmark className="h-4 w-4" />}
          accent="#ECAA0B"
          title="Retirement & pension"
          subtitle="When you stop, and what keeps paying you after."
        >
          <Slider
            accent="#ECAA0B"
            label="Retirement age"
            value={settings.retirementAge}
            min={Math.max(settings.currentAge, 30)}
            max={MAX_PROJECTION_AGE}
            step={1}
            format={(v) => `${Math.round(v)}`}
            onChange={(v) =>
              onChange({
                retirementAge: Math.max(settings.currentAge, Math.min(MAX_PROJECTION_AGE, Math.round(v))),
              })
            }
          />
          <Slider
            accent="#34D399"
            label="Pension / SS"
            suffix="/yr"
            value={settings.postRetirementIncome}
            min={0}
            max={120_000}
            step={1_000}
            money
            currency={settings.currency}
            manualMax={ANNUAL_MANUAL_MAX}
            onChange={(v) => onChange({ postRetirementIncome: v })}
          />
          <Slider
            accent="#AD74FF"
            label="Pension starts"
            value={settings.postRetirementIncomeStartAge}
            min={50}
            max={80}
            step={1}
            format={(v) => `age ${Math.round(v)}`}
            onChange={(v) => onChange({ postRetirementIncomeStartAge: Math.round(v) })}
          />
          <Slider
            accent="#5DD3F3"
            label="Side income after"
            suffix="/mo"
            value={settings.monthlyContributionPost}
            min={0}
            max={20_000}
            step={100}
            money
            currency={settings.currency}
            manualMax={MONTHLY_MANUAL_MAX}
            onChange={(v) => onChange({ monthlyContributionPost: v })}
          />
        </LeverGroup>

        {/* ── SPENDING ── */}
        <LeverGroup
          icon={<ArrowDown className="h-4 w-4" />}
          accent="#FF6F69"
          title="Spending plan"
          subtitle="In today's dollars - the engine indexes them with inflation."
        >
          <Slider
            accent="#FF6F69"
            label="Retirement spend"
            suffix="/yr"
            value={settings.annualDrawdown}
            min={0}
            max={500_000}
            step={1_000}
            money
            currency={settings.currency}
            manualMax={ANNUAL_MANUAL_MAX}
            onChange={(v) => onChange({ annualDrawdown: v })}
          />
          <Slider
            accent="#FB923C"
            label="Withdrawals before"
            suffix="/yr"
            value={settings.annualDrawdownPre}
            min={0}
            max={300_000}
            step={1_000}
            money
            currency={settings.currency}
            manualMax={ANNUAL_MANUAL_MAX}
            onChange={(v) => onChange({ annualDrawdownPre: v })}
          />
          {projection.freedomNumber > 0 && (
            <p className="pt-0.5 text-[10px] leading-relaxed text-muted-foreground">
              Freedom number:{" "}
              <span className="font-bold text-[#0BC18D]">
                {shortMoney(projection.freedomNumber, settings.currency)}
              </span>{" "}
              invested (25× spending) makes this drawdown self-sustaining.
            </p>
          )}
        </LeverGroup>

        {/* ── MARKET ── */}
        <LeverGroup
          icon={<TrendingUp className="h-4 w-4" />}
          accent="#0BC18D"
          title="Market assumptions"
          subtitle="Inflation always bites: spending and pensions are indexed to it."
        >
          <Slider
            accent="#0BC18D"
            label="Default growth"
            value={Math.round(settings.defaultGrowthRate * 100)}
            min={0}
            max={20}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => onChange({ defaultGrowthRate: v / 100 })}
          />
          <Slider
            accent="#FF6F69"
            label="Inflation"
            value={Math.round(settings.inflationRate * 100)}
            min={0}
            max={10}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => onChange({ inflationRate: v / 100 })}
          />
          <p className="pt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            Real blended return:{" "}
            <span className="font-bold text-foreground">
              {Math.round((projection.effectiveAssetRate - settings.inflationRate) * 100)}%
            </span>{" "}
            after {Math.round(settings.inflationRate * 100)}% inflation. Per-asset overrides live in the balance sheet.
          </p>
        </LeverGroup>
      </div>
    </div>
  );
}

function LeverGroup({
  icon,
  accent,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border px-4 py-3.5"
      style={{
        borderColor: `${accent}25`,
        background: `linear-gradient(180deg, ${accent}08 0%, transparent 75%)`,
      }}
    >
      <div className="flex items-baseline gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: accent }}>
          {icon}
          {title}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>
      <div className="mt-2.5 flex flex-col gap-2">{children}</div>
    </div>
  );
}

// ─── slider ──────────────────────────────────────────────────────────────────

function Slider({
  accent,
  label,
  value,
  min,
  max,
  step,
  format,
  suffix,
  onChange,
  money = false,
  manualMax,
  currency,
}: {
  accent: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  suffix?: string;
  onChange: (v: number) => void;
  money?: boolean;
  manualMax?: number;
  currency?: string;
}) {
  const id = useId();
  const forRange = money ? Math.min(Math.max(value, min), max) : value;
  const pct = ((forRange - min) / Math.max(0.0001, max - min)) * 100;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-chart-border bg-chart-muted/40 px-2.5 py-1.5">
      <label
        htmlFor={id}
        className="w-[104px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={forRange}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 appearance-none bg-transparent"
        style={{
          background: `linear-gradient(to right, ${accent} 0%, ${accent} ${pct}%, var(--chart-grid) ${pct}%, var(--chart-grid) 100%)`,
          borderRadius: "9999px",
          height: "5px",
        }}
      />
      {money && currency != null && manualMax != null ? (
        <span className="flex shrink-0 items-baseline gap-0.5">
          <AmountInput
            value={value}
            onCommit={(n) => onChange(Math.min(manualMax, n))}
            accent={accent}
            currency={currency}
            ariaLabel={`${label} amount`}
          />
          {suffix && <span className="text-[9px] font-semibold text-muted-foreground">{suffix}</span>}
        </span>
      ) : (
        <span
          className="w-[60px] shrink-0 rounded-md px-1.5 py-0.5 text-right text-[11px] font-bold tabular-nums"
          style={{ background: `${accent}22`, color: accent }}
        >
          {format ? format(value) : value}
        </span>
      )}
      <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: white;
          border: 2px solid ${accent};
          box-shadow: 0 0 0 2px ${accent}22;
          cursor: grab;
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
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

function AmountInput({
  value,
  onCommit,
  accent,
  currency,
  ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  accent: string;
  currency: string;
  ariaLabel: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => shortMoney(value, currency));

  useEffect(() => {
    if (!focused) setText(shortMoney(value, currency));
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
      setText(shortMoney(value, currency));
      return;
    }
    onCommit(Math.max(0, Math.round(n)));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      className="min-w-[64px] max-w-[92px] shrink-0 rounded-md border border-transparent px-1.5 py-0.5 text-right text-[11px] font-bold tabular-nums outline-none focus:border-chart-border"
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

function shortMoney(v: number, currency: string): string {
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
  if (v >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `${sym}${Math.round(v / 1_000)}k`;
  return `${sym}${Math.round(v)}`;
}
