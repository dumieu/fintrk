"use client";

import { useEffect, useRef, useState } from "react";
import { chartChipClass, chartPanelClass } from "@/lib/chart-ui";
import { cn } from "@/lib/utils";

const LEGEND_ITEMS = [
  { color: "#0BC18D", label: "Inflow" },
  { color: "#F4D03F", label: "Income trunk" },
  { color: "#FF6F69", label: "Spending" },
  { color: "#AD74FF", label: "Savings & Investments" },
  { color: "#2CA2FF", label: "Unallocated surplus" },
  { color: "#E11D48", label: "Deficit (drawdown)" },
] as const;

function CashflowLegendContent() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {LEGEND_ITEMS.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: item.color, boxShadow: `0 0 10px ${item.color}88` }}
              aria-hidden
            />
            {item.label}
          </span>
        ))}
      </div>
      <p className="border-t border-chart-border pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        Hover a node or ribbon to trace its path
      </p>
    </div>
  );
}

export function CashflowLegendHelpButton() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(chartChipClass, "grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold leading-none")}
        aria-label={open ? "Hide diagram legend" : "Show diagram legend"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        ?
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Cashflow diagram legend"
          className={cn(chartPanelClass, "absolute left-0 top-[calc(100%+6px)] z-[120] w-[min(420px,calc(100vw-2rem))] p-3")}
          style={{ boxShadow: "var(--chart-tooltip-shadow)" }}
        >
          <CashflowLegendContent />
        </div>
      ) : null}
    </div>
  );
}
