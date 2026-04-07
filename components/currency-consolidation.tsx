"use client";

import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ConsolidatedAccount {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  nativeBalance: number;
  nativeCurrency: string;
  homeBalance: number;
  homeCurrency: string;
  txnCount: number;
}

interface CurrencyBreakdown {
  currency: string;
  nativeBalance: number;
  homeBalance: number;
}

interface Props {
  totalBalance: number;
  homeCurrency: string;
  accounts: ConsolidatedAccount[];
  currencyBreakdown: CurrencyBreakdown[];
}

const TYPE_ICONS: Record<string, string> = {
  checking: "🏦",
  savings: "💰",
  credit: "💳",
  investment: "📈",
  loan: "🏠",
  unknown: "🔗",
};

export function CurrencyConsolidation({ totalBalance, homeCurrency, accounts, currencyBreakdown }: Props) {
  const maxBalance = Math.max(...accounts.map((a) => Math.abs(a.homeBalance)), 1);

  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <p className="text-[10px] text-white/60 uppercase tracking-wider mb-0.5">Consolidated Balance</p>
        <p className={cn("text-2xl font-bold tabular-nums", totalBalance >= 0 ? "text-[#0BC18D]" : "text-[#FF6F69]")}>
          {totalBalance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(totalBalance), homeCurrency)}
        </p>
      </div>

      {currencyBreakdown.length > 1 && (
        <div className="flex gap-1.5 flex-wrap justify-center">
          {currencyBreakdown.map((cb) => (
            <span key={cb.currency} className="px-2.5 py-1 rounded-full text-[10px] font-mono bg-white/8 border border-white/15 text-white/75">
              {cb.currency} {formatCurrency(cb.nativeBalance, cb.currency)}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {accounts.map((acct, i) => {
          const barPct = Math.abs(acct.homeBalance) / maxBalance * 100;
          return (
            <motion.div
              key={acct.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-lg bg-white/[0.06] px-3 py-2 border border-white/10"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">{TYPE_ICONS[acct.type] ?? "🔗"}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white/90 truncate">{acct.name}</p>
                    {acct.institution && (
                      <p className="text-[9px] text-white/50 truncate">{acct.institution}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={cn("text-xs font-bold tabular-nums", acct.nativeBalance >= 0 ? "text-[#0BC18D]" : "text-[#FF6F69]")}>
                    {formatCurrency(acct.nativeBalance, acct.nativeCurrency)}
                  </p>
                  {acct.nativeCurrency !== acct.homeCurrency && (
                    <p className="text-[9px] text-[#AD74FF]/80 tabular-nums">
                      ≈ {formatCurrency(acct.homeBalance, acct.homeCurrency)}
                    </p>
                  )}
                </div>
              </div>
              <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                <motion.div
                  className={cn("h-full rounded-full", acct.nativeBalance >= 0 ? "bg-[#0BC18D]/40" : "bg-[#FF6F69]/40")}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(barPct, 2)}%` }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
