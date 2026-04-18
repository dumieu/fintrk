"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AnalyticsDetailTooltip } from "@/components/analytics-detail-tooltip";
import { useAnalyticsDetail } from "@/components/use-analytics-detail";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Kept for backwards compatibility with the parent prop shape; not consumed by the new tooltip. */
export interface DayCategorySlice {
  label: string;
  amount: number;
  color: string;
}

interface DayOfWeekSpendProps {
  spend: number[];
  categoriesByDay: DayCategorySlice[][];
  currency: string;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
export function DayOfWeekSpend({ spend, categoriesByDay: _categoriesByDay, currency }: DayOfWeekSpendProps) {
  const { tip, open, scheduleClose, clearLeave } = useAnalyticsDetail();

  const maxDay = useMemo(() => Math.max(...spend, 1), [spend]);
  const weekTotal = useMemo(() => spend.reduce((a, b) => a + b, 0), [spend]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-center pt-0.5">
      <div className="flex items-end gap-1.5 sm:gap-2">
        {spend.map((amount, i) => {
          const shareOfWeek = weekTotal > 0 ? (amount / weekTotal) * 100 : 0;
          const barPct = maxDay > 0 ? (amount / maxDay) * 100 : 0;
          const isMax = amount > 0 && amount === Math.max(...spend);

          return (
            <div
              key={i}
              className="relative flex min-w-0 flex-1 cursor-default flex-col items-center"
              onMouseEnter={(e) =>
                void open({
                  rect: e.currentTarget.getBoundingClientRect(),
                  entity: "dow",
                  value: String(i),
                  label: `${DAY_LABELS[i]}`,
                  accent: isMax ? "#FF6F69" : "#2CA2FF",
                })
              }
              onMouseLeave={scheduleClose}
            >
              <div className="flex min-h-[28px] flex-col items-center justify-end gap-0.5 text-center">
                <span className="text-[9px] leading-tight text-white/65 tabular-nums">
                  {amount > 0 ? formatCurrency(amount, currency) : "—"}
                </span>
                <span className="text-[8px] font-medium leading-none text-[#7AE8C5]/90 tabular-nums">
                  {weekTotal > 0 && amount > 0
                    ? `${shareOfWeek.toFixed(0)}%`
                    : weekTotal > 0
                      ? "0%"
                      : "—"}
                </span>
              </div>

              <div className="mt-1 flex h-[170px] w-full flex-col justify-end overflow-hidden rounded-t-sm">
                <div
                  className={cn(
                    "w-full min-h-0 rounded-t-[4px]",
                    isMax ? "bg-[#FF6F69]" : "bg-[#2CA2FF]/70",
                  )}
                  style={{
                    height:
                      amount <= 0 ? "0%" : `${Math.max(barPct, amount > 0 ? 6 : 0)}%`,
                  }}
                />
              </div>

              <span className="mt-1 text-[10px] font-medium text-white/55">
                {DAY_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>

      {typeof document !== "undefined" &&
        tip &&
        createPortal(
          <AnalyticsDetailTooltip
            rect={tip.rect}
            entity={tip.entity}
            label={tip.label}
            accentColor={tip.accent}
            data={tip.data}
            loading={tip.loading}
            errorMessage={tip.error}
            onMouseEnter={clearLeave}
            onMouseLeave={scheduleClose}
          />,
          document.body,
        )}
    </div>
  );
}
