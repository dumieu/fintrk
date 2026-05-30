"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AnalyticsDetailTooltip,
  detailTipAnchorFromEvent,
} from "@/components/analytics-detail-tooltip";
import { useAnalyticsDetail } from "@/components/use-analytics-detail";
import { CategoryTransactionsModal } from "@/components/category-transactions-modal";

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
  const totalAbs = useMemo(
    () => bars.reduce((s, b) => s + Math.abs(b.amount), 0),
    [bars],
  );

  const { tip, open, scheduleClose, clearLeave } = useAnalyticsDetail();
  const [categoryModal, setCategoryModal] = useState<string | null>(null);

  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-white/50 text-sm">
        Upload a statement to see spending breakdown
      </div>
    );
  }

  return (
    <>
      <div className="scrollbar-slim-dark min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
        {bars.map((bar, i) => {
          const pct = (Math.abs(bar.amount) / max) * 100;
          const amt = Math.abs(bar.amount);
          const shareOfTotal =
            totalAbs > 0 ? (amt / totalAbs) * 100 : 0;
          const pctLabel =
            shareOfTotal > 0 && shareOfTotal < 0.05
              ? "<0.1%"
              : shareOfTotal < 10
                ? `${shareOfTotal.toFixed(1)}%`
                : `${Math.round(shareOfTotal)}%`;
          return (
            <div
              key={`${bar.label}-${i}`}
              className="group cursor-pointer"
              onClick={() => setCategoryModal(bar.label)}
              onMouseEnter={(e) =>
                void open({
                  ...detailTipAnchorFromEvent(e),
                  entity: "category",
                  value: bar.label,
                  label: bar.label,
                  accent: bar.color,
                })
              }
              onMouseLeave={scheduleClose}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-white/85 truncate max-w-[60%]">
                  {bar.label}
                </span>
                <span className="shrink-0 text-right text-xs font-bold tabular-nums text-white">
                  <span>
                    {currency}{" "}
                    {amt.toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  <span className="ml-1.5 text-[10px] font-semibold text-white/50">
                    ({pctLabel})
                  </span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: bar.color,
                    width: `${Math.min(pct, 100)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {typeof document !== "undefined" &&
        tip &&
        createPortal(
          <AnalyticsDetailTooltip
            rect={tip.rect}
            clientX={tip.clientX}
            clientY={tip.clientY}
            avoidRect={tip.avoidRect}
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

      {categoryModal &&
        typeof document !== "undefined" &&
        createPortal(
          <CategoryTransactionsModal
            filter={{ mode: "category", name: categoryModal, level: "category" }}
            currency={currency}
            onClose={() => setCategoryModal(null)}
          />,
          document.body,
        )}
    </>
  );
}
