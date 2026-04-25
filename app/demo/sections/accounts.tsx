"use client";

import { useMemo } from "react";
import {
  Building2,
  CreditCard,
  PiggyBank,
  TrendingUp,
  GraduationCap,
} from "lucide-react";
import { useDemoSnapshot } from "../demo-store";
import { accountBalances } from "../derived";
import { formatCurrency } from "@/lib/format";

const ICON_BY_TYPE: Record<string, typeof Building2> = {
  checking: Building2,
  savings: PiggyBank,
  credit: CreditCard,
  investment: TrendingUp,
  loan: GraduationCap,
};

const COLOR_BY_TYPE: Record<string, string> = {
  checking: "#2CA2FF",
  savings: "#0BC18D",
  credit: "#FF6F69",
  investment: "#AD74FF",
  loan: "#ECAA0B",
};

export function DemoAccountsSection() {
  const snap = useDemoSnapshot();
  const balances = useMemo(() => accountBalances(snap), [snap]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Accounts</h2>
          <p className="text-[11px] text-white/55">
            Live balances, computed from every transaction in the dataset.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {balances.map((a) => {
          const Icon = ICON_BY_TYPE[a.type] ?? Building2;
          const color = COLOR_BY_TYPE[a.type] ?? "#999";
          const isCredit = a.type === "credit";
          const display = isCredit ? -Math.abs(a.balance) : a.balance;
          return (
            <div
              key={a.accountId}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-4 transition hover:border-white/20"
            >
              <div
                aria-hidden
                className="absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-15 blur-2xl"
                style={{ background: color }}
              />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ background: `${color}20`, color }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-white/85">{a.institution}</p>
                      <p className="text-[10px] text-white/45">
                        {a.type.charAt(0).toUpperCase() + a.type.slice(1)}{a.mask ? ` · ····${a.mask}` : ""}
                      </p>
                    </div>
                  </div>
                  {a.cardNetwork && (
                    <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white/65">
                      {a.cardNetwork}
                    </span>
                  )}
                </div>

                <p className="mt-3 text-xs text-white/65 truncate">{a.name}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-white">
                  {formatCurrency(display, a.currency)}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[10px]">
                  <div>
                    <p className="text-white/40">In · 30d</p>
                    <p className="font-semibold text-[#0BC18D]">
                      {formatCurrency(a.inflow30d, a.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/40">Out · 30d</p>
                    <p className="font-semibold text-[#FF6F69]">
                      {formatCurrency(a.outflow30d, a.currency)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
