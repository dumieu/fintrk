"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Crown,
  Flag,
  ShieldCheck,
  CalendarClock,
  Banknote,
} from "lucide-react";
import { formatCurrencyInteger } from "@/lib/format";
import type { MonteCarloResult, NetWorthSettings, ProjectionResult } from "@/lib/net-worth";
import { CountUp } from "./count-up";

/**
 * The mission-control hero: live net worth, plan readiness ring, FI age,
 * success probability, and the value waiting at retirement. Every number
 * re-derives from the same projection the curve and levers use.
 */
export function CommandCenter({
  projection,
  mc,
  settings,
}: {
  projection: ProjectionResult;
  mc: MonteCarloResult | null;
  settings: NetWorthSettings;
}) {
  const { today, fiAge, freedomNumber, liquidToday, depletionAge, atRetirement, debtFreeAge } = projection;
  const currency = settings.currency;
  const success = mc?.successProbability ?? null;

  const score = useMemo(() => {
    const successPart = (success ?? 0.6) * 55;
    const fiProgress = freedomNumber > 0 ? Math.min(1, liquidToday / freedomNumber) : depletionAge == null ? 0.8 : 0.4;
    const fiPart = fiProgress * 30;
    const debtHealth = today.assets > 0 ? 1 - Math.min(1, today.liabilities / today.assets) : today.liabilities > 0 ? 0 : 1;
    const debtPart = debtHealth * 15;
    return Math.round(Math.max(0, Math.min(100, successPart + fiPart + debtPart)));
  }, [success, freedomNumber, liquidToday, depletionAge, today]);

  const grade =
    score >= 85 ? { label: "Legendary", color: "#0BC18D" }
    : score >= 70 ? { label: "On track", color: "#2CA2FF" }
    : score >= 50 ? { label: "Building", color: "#ECAA0B" }
    : score >= 30 ? { label: "At risk", color: "#FB923C" }
    : { label: "Critical", color: "#FF6F69" };

  const yearsToFi = fiAge != null ? Math.max(0, fiAge - settings.currentAge) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-chart-border bg-chart-surface p-6 shadow-chart sm:p-8"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_auto_1.6fr]">
        {/* live net worth */}
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-chart-border bg-chart-muted px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" style={{ color: "#0BC18D" }} />
            Net Worth Atlas · Live
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground sm:text-6xl">
            <CountUp value={today.netWorth} formatter={(n) => formatCurrencyInteger(Math.round(n), currency)} />
          </h1>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] sm:text-xs">
            <Pill icon={<TrendingUp className="h-3 w-3" />} accent="#0BC18D">
              Assets {formatCurrencyInteger(today.assets, currency)}
            </Pill>
            <Pill icon={<TrendingDown className="h-3 w-3" />} accent="#FF6F69">
              Liabilities {formatCurrencyInteger(today.liabilities, currency)}
            </Pill>
            <Pill icon={<Crown className="h-3 w-3" />} accent="#ECAA0B">
              Blended growth {Math.round(projection.effectiveAssetRate * 100)}%
            </Pill>
            {projection.savingsRate != null && (
              <Pill icon={<Banknote className="h-3 w-3" />} accent="#2CA2FF">
                Savings rate {Math.round(projection.savingsRate * 100)}%
              </Pill>
            )}
          </div>
        </div>

        {/* readiness ring */}
        <div className="flex items-center justify-center">
          <ReadinessRing score={score} grade={grade} />
        </div>

        {/* outcome stats */}
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <StatCard
            icon={<Flag className="h-3.5 w-3.5" />}
            accent="#0BC18D"
            label="Freedom age"
            value={fiAge != null ? `${fiAge}` : "—"}
            sub={
              fiAge != null
                ? yearsToFi === 0
                  ? "you are already free"
                  : `in ${yearsToFi} year${yearsToFi === 1 ? "" : "s"}`
                : freedomNumber > 0
                  ? "not reached by 100"
                  : "set retirement spending"
            }
          />
          <StatCard
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            accent={success == null ? "#AD74FF" : success >= 0.8 ? "#0BC18D" : success >= 0.6 ? "#ECAA0B" : "#FF6F69"}
            label="Plan success"
            value={success != null ? `${Math.round(success * 100)}%` : "…"}
            sub={`money lasts to 95 · ${mc?.runs ?? 0} simulations`}
          />
          <StatCard
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            accent="#2CA2FF"
            label={`At retirement (${settings.retirementAge})`}
            value={atRetirement ? shortMoney(atRetirement.nominal, currency) : "—"}
            sub={atRetirement ? `${shortMoney(atRetirement.real, currency)} in today's $` : "past horizon"}
          />
          <StatCard
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            accent={debtFreeAge != null ? "#0BC18D" : "#FB923C"}
            label="Debt-free age"
            value={debtFreeAge != null ? (debtFreeAge <= settings.currentAge ? "Now" : `${debtFreeAge}`) : "—"}
            sub={
              projection.totalInterestPaid > 0
                ? `${shortMoney(projection.totalInterestPaid, currency)} lifetime interest`
                : "no debt on file"
            }
          />
        </div>
      </div>
    </motion.div>
  );
}

function ReadinessRing({ score, grade }: { score: number; grade: { label: string; color: string } }) {
  const R = 64;
  const C = 2 * Math.PI * R;
  const filled = (score / 100) * C;
  return (
    <div className="relative flex h-[168px] w-[168px] items-center justify-center">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--chart-grid)" strokeWidth="10" />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2CA2FF" />
            <stop offset="60%" stopColor="#0BC18D" />
            <stop offset="100%" stopColor="#ECAA0B" />
          </linearGradient>
        </defs>
        <motion.circle
          cx="80"
          cy="80"
          r={R}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C - filled }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black tabular-nums text-foreground">{score}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">readiness</span>
        <span
          className="mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ background: `${grade.color}1d`, color: grade.color }}
        >
          {grade.label}
        </span>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  accent,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      className="min-w-0 rounded-2xl border p-3.5"
      style={{ borderColor: `${accent}28`, background: `linear-gradient(160deg, ${accent}0e 0%, transparent 70%)` }}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-xl font-black tabular-nums tracking-tight text-foreground sm:text-2xl">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Pill({ icon, accent, children }: { icon: React.ReactNode; accent: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium text-foreground"
      style={{ borderColor: `${accent}40`, background: `${accent}15` }}
    >
      <span style={{ color: accent }}>{icon}</span>
      {children}
    </span>
  );
}

function shortMoney(v: number, currency: string): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  let s: string;
  if (abs >= 1_000_000_000) s = `${(abs / 1_000_000_000).toFixed(1)}B`;
  else if (abs >= 1_000_000) s = `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  else if (abs >= 1_000) s = `${Math.round(abs / 1_000)}K`;
  else s = String(Math.round(abs));
  try {
    const sym =
      new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? "$";
    return `${sign}${sym}${s}`;
  } catch {
    return `${sign}$${s}`;
  }
}
