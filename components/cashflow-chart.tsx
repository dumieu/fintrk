"use client";

import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CashFlowBar {
  month: string;
  income: number;
  expenses: number;
  net: number;
  isProjected: boolean;
}

interface CashFlowChartProps {
  bars: CashFlowBar[];
  currency: string;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortMonth(yyyymm: string) {
  const [, m] = yyyymm.split("-");
  return MONTH_NAMES[parseInt(m, 10) - 1] ?? m;
}

export function CashFlowChart({ bars, currency }: CashFlowChartProps) {
  if (bars.length === 0) return <p className="text-sm text-white/50 py-4 text-center">No data yet</p>;

  const maxVal = Math.max(...bars.map((b) => Math.max(b.income, b.expenses)), 1);

  return (
    <div className="space-y-1">
      {bars.map((bar, i) => {
        const incomePct = (bar.income / maxVal) * 100;
        const expensePct = (bar.expenses / maxVal) * 100;

        return (
          <div key={bar.month} className={cn("rounded-lg p-2.5 transition-colors", bar.isProjected ? "bg-white/[0.04] border border-dashed border-white/15" : "bg-white/[0.06]")}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={cn("text-[10px] font-semibold uppercase tracking-wider", bar.isProjected ? "text-[#AD74FF]/80" : "text-white/70")}>
                {shortMonth(bar.month)} {bar.isProjected && "·  Projected"}
              </span>
              <span className={cn("text-xs font-bold tabular-nums", bar.net >= 0 ? "text-[#0BC18D]" : "text-[#FF6F69]")}>
                {bar.net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(bar.net), currency)}
              </span>
            </div>
            <div className="flex gap-1.5 h-3">
              <motion.div
                className="rounded-sm bg-[#0BC18D]/60"
                initial={{ width: 0 }}
                animate={{ width: `${incomePct}%` }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
              />
              <motion.div
                className={cn("rounded-sm", bar.isProjected ? "bg-[#FF6F69]/30" : "bg-[#FF6F69]/50")}
                initial={{ width: 0 }}
                animate={{ width: `${expensePct}%` }}
                transition={{ duration: 0.5, delay: i * 0.05 + 0.1 }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-[#0BC18D]/80 tabular-nums">{formatCurrency(bar.income, currency)}</span>
              <span className="text-[9px] text-[#FF6F69]/80 tabular-nums">{formatCurrency(bar.expenses, currency)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
