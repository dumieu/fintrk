"use client";

import { CalendarClock, CalendarDays, CalendarRange, InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimePresetId } from "@/lib/time-range-presets";

type PresetRow = {
  id: TimePresetId;
  /** Short label — single-line toolbar. */
  label: string;
  /** Accessible / tooltip name. */
  ariaLabel: string;
  icon: typeof CalendarDays;
  accent: string;
  activeAccent: string;
};

const PRESETS: PresetRow[] = [
  {
    id: "all",
    label: "All",
    ariaLabel: "All time",
    icon: InfinityIcon,
    accent:
      "border-white/18 bg-gradient-to-br from-white/[0.09] to-white/[0.02] hover:border-white/28 hover:from-white/[0.12]",
    activeAccent:
      "border-[#0BC18D]/55 bg-gradient-to-br from-[#0BC18D]/20 to-[#0BC18D]/8 shadow-[0_0_28px_-12px_rgba(11,193,141,0.55)] ring-1 ring-[#0BC18D]/35",
  },
  {
    id: "30d",
    label: "30d",
    ariaLabel: "Last 30 days",
    icon: CalendarDays,
    accent:
      "border-[#2CA2FF]/25 bg-gradient-to-br from-[#2CA2FF]/12 to-[#AD74FF]/8 hover:border-[#2CA2FF]/45",
    activeAccent:
      "border-[#2CA2FF]/60 bg-gradient-to-br from-[#2CA2FF]/22 to-[#AD74FF]/12 shadow-[0_0_28px_-12px_rgba(44,162,255,0.45)] ring-1 ring-[#2CA2FF]/35",
  },
  {
    id: "90d",
    label: "90d",
    ariaLabel: "Last 90 days",
    icon: CalendarRange,
    accent:
      "border-[#AD74FF]/28 bg-gradient-to-br from-[#AD74FF]/14 to-[#7C5CFC]/10 hover:border-[#AD74FF]/48",
    activeAccent:
      "border-[#AD74FF]/60 bg-gradient-to-br from-[#AD74FF]/24 to-[#7C5CFC]/14 shadow-[0_0_28px_-12px_rgba(173,116,255,0.45)] ring-1 ring-[#AD74FF]/40",
  },
  {
    id: "12m",
    label: "12m",
    ariaLabel: "Last 12 months",
    icon: CalendarClock,
    accent:
      "border-[#ECAA0B]/28 bg-gradient-to-br from-[#ECAA0B]/12 to-[#FF6F69]/10 hover:border-[#ECAA0B]/45",
    activeAccent:
      "border-[#ECAA0B]/58 bg-gradient-to-br from-[#ECAA0B]/22 to-[#FF6F69]/12 shadow-[0_0_28px_-12px_rgba(236,170,11,0.4)] ring-1 ring-[#ECAA0B]/38",
  },
];

export function TimeSlicer({
  activePreset,
  onSelect,
}: {
  activePreset: TimePresetId | null;
  onSelect: (preset: TimePresetId) => void;
}) {
  return (
    <div className="w-fit max-w-full rounded-xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:rounded-2xl sm:p-2">
      <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2">
        <p className="shrink-0 whitespace-nowrap px-0.5 text-[9px] font-medium uppercase tracking-wider text-white/40 sm:px-1 sm:text-[10px]">
          Period
        </p>
        <div
          role="toolbar"
          aria-label="Time range"
          className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.14)_transparent]"
        >
        {PRESETS.map((p) => {
          const selected = activePreset === p.id;
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              title={p.ariaLabel}
              aria-label={p.ariaLabel}
              className={cn(
                "flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-1.5 py-0 text-left transition-all duration-200 sm:gap-1.5 sm:px-2",
                selected ? p.activeAccent : p.accent,
              )}
              aria-pressed={selected}
            >
              <Icon
                className={cn(
                  "h-3 w-3 shrink-0",
                  selected ? "text-white" : "text-white/75",
                )}
                strokeWidth={2}
              />
              <span className="whitespace-nowrap text-[9px] font-semibold leading-none text-white/95 sm:text-[10px]">
                {p.label}
              </span>
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
