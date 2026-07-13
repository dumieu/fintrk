"use client";

import { useCallback, useId, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

/** Discrete amount bands. Last step means that floor and above (no upper cap). */
export const TXN_SIZE_STEPS = [0, 20, 40, 60, 80, 100, 300, 500, 1000, 3000, 5000, 10000] as const;
export const TXN_SIZE_OPEN: number = TXN_SIZE_STEPS[TXN_SIZE_STEPS.length - 1];

function compactSize(n: number, openEnded = false): string {
  if (openEnded && n >= TXN_SIZE_OPEN) return "10K+";
  const abs = Math.abs(n);
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs % 1000 === 0 ? 0 : 1)}K`;
  return String(Math.round(n));
}

function nearestStepIndex(value: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < TXN_SIZE_STEPS.length; i++) {
    const d = Math.abs(TXN_SIZE_STEPS[i] - value);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function indexFromClientX(clientX: number, track: HTMLElement): number {
  const rect = track.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
  return Math.round(ratio * (TXN_SIZE_STEPS.length - 1));
}

export function TransactionSizeSlider({
  min,
  max,
  currencyCode,
  onChange,
  className,
}: {
  min: number;
  max: number;
  currencyCode?: string;
  onChange: (next: { min: number; max: number }) => void;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const trackRef = useRef<HTMLDivElement>(null);
  const minIdx = nearestStepIndex(min);
  const maxIdx = Math.max(minIdx, nearestStepIndex(max));
  const lo = TXN_SIZE_STEPS[minIdx];
  const hi = TXN_SIZE_STEPS[maxIdx];
  const leftPct = (minIdx / (TXN_SIZE_STEPS.length - 1)) * 100;
  const rightPct = (maxIdx / (TXN_SIZE_STEPS.length - 1)) * 100;
  const active = lo > 0 || hi < TXN_SIZE_OPEN;

  const symbol = useMemo(() => {
    try {
      const parts = new Intl.NumberFormat("en", {
        style: "currency",
        currency: currencyCode && currencyCode.length === 3 ? currencyCode : "USD",
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0,
      }).formatToParts(0);
      return parts.find((p) => p.type === "currency")?.value ?? "$";
    } catch {
      return "$";
    }
  }, [currencyCode]);

  const setFromClientX = useCallback(
    (clientX: number, thumb: "min" | "max") => {
      const el = trackRef.current;
      if (!el) return;
      const idx = indexFromClientX(clientX, el);
      if (thumb === "min") {
        const nextMin = TXN_SIZE_STEPS[Math.min(idx, maxIdx)];
        onChange({ min: nextMin, max: hi });
      } else {
        const nextMax = TXN_SIZE_STEPS[Math.max(idx, minIdx)];
        onChange({ min: lo, max: nextMax });
      }
    },
    [hi, lo, maxIdx, minIdx, onChange],
  );

  const startDrag = (thumb: "min" | "max") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX, thumb);
    const onMove = (ev: PointerEvent) => setFromClientX(ev.clientX, thumb);
    const onUp = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={cn(
        "group/size relative pointer-events-auto inline-flex h-[26px] items-center gap-2 rounded-lg border border-chart-border bg-chart-surface/92 px-2 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.55)] backdrop-blur-md ring-1 ring-white/[0.04]",
        active && "border-[#0BC18D]/35 ring-[#0BC18D]/10",
        className,
      )}
    >
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-max max-w-[14rem] -translate-x-1/2",
          "rounded-md border border-chart-border bg-[#0a1210]/95 px-2 py-1.5 text-center text-[10px] leading-snug text-muted-foreground shadow-lg",
          "opacity-0 transition-opacity duration-75 group-hover/size:opacity-100",
        )}
      >
        Filter the chart by transaction amount.
        <br />
        Snaps to common size bands.
      </div>
      <span className="shrink-0 text-[9px] font-semibold tracking-wide text-muted-foreground">
        Transaction $
      </span>
      <span className="w-10 shrink-0 text-right text-[10px] font-semibold tabular-nums text-[#0BC18D]">
        {symbol}
        {compactSize(lo)}
      </span>
      <div
        ref={trackRef}
        className="relative h-2 w-[7.5rem] shrink-0 touch-none sm:w-[9rem]"
        role="group"
        aria-label="Transaction amount range"
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-chart-border" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#0BC18D]/85"
          style={{
            left: `${leftPct}%`,
            width: `${Math.max(0, rightPct - leftPct)}%`,
            boxShadow: "0 0 10px -2px rgba(11,193,141,0.55)",
          }}
        />
        <button
          type="button"
          aria-label={`Minimum transaction amount ${symbol}${compactSize(lo)}`}
          aria-valuemin={0}
          aria-valuemax={TXN_SIZE_STEPS.length - 1}
          aria-valuenow={minIdx}
          className={cn(
            "absolute top-1/2 z-[2] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
            "border-2 border-[#0BC18D] bg-[#0a1210] shadow-[0_0_0_3px_rgba(11,193,141,0.18)]",
            "cursor-ew-resize transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0BC18D]/50",
          )}
          style={{ left: `${leftPct}%` }}
          onPointerDown={startDrag("min")}
        />
        <button
          type="button"
          aria-label={`Maximum transaction amount ${symbol}${compactSize(hi, true)}`}
          aria-valuemin={0}
          aria-valuemax={TXN_SIZE_STEPS.length - 1}
          aria-valuenow={maxIdx}
          className={cn(
            "absolute top-1/2 z-[2] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
            "border-2 border-[#0BC18D] bg-[#0BC18D] shadow-[0_0_0_3px_rgba(11,193,141,0.22)]",
            "cursor-ew-resize transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0BC18D]/50",
          )}
          style={{ left: `${rightPct}%` }}
          onPointerDown={startDrag("max")}
        />
        <label className="sr-only" htmlFor={`${id}-min`}>
          Minimum amount
        </label>
        <input
          id={`${id}-min`}
          type="range"
          min={0}
          max={TXN_SIZE_STEPS.length - 1}
          step={1}
          value={minIdx}
          onChange={(e) => {
            const next = Math.min(Number(e.target.value), maxIdx);
            onChange({ min: TXN_SIZE_STEPS[next], max: hi });
          }}
          className="sr-only"
        />
        <label className="sr-only" htmlFor={`${id}-max`}>
          Maximum amount
        </label>
        <input
          id={`${id}-max`}
          type="range"
          min={0}
          max={TXN_SIZE_STEPS.length - 1}
          step={1}
          value={maxIdx}
          onChange={(e) => {
            const next = Math.max(Number(e.target.value), minIdx);
            onChange({ min: lo, max: TXN_SIZE_STEPS[next] });
          }}
          className="sr-only"
        />
      </div>
      <span className="w-10 shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
        {symbol}
        {compactSize(hi, true)}
      </span>
    </div>
  );
}
