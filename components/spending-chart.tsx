"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SpendingBar {
  label: string;
  amount: number;
  color: string;
}

interface SpendingChartProps {
  bars: SpendingBar[];
  currency: string;
  maxAmount?: number;
}

export function SpendingChart({ bars, currency, maxAmount }: SpendingChartProps) {
  const max = maxAmount ?? Math.max(...bars.map((b) => Math.abs(b.amount)), 1);

  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-white/50 text-sm">
        Upload a statement to see spending breakdown
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {bars.map((bar, i) => {
        const pct = (Math.abs(bar.amount) / max) * 100;
        return (
          <div key={bar.label} className="group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-white/85 truncate max-w-[60%]">{bar.label}</span>
              <span className="text-xs font-bold text-white tabular-nums">
                {currency} {Math.abs(bar.amount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/8 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: bar.color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(pct, 100)}%` }}
                transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
