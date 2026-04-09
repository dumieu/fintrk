"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TransactionCategoryIcon } from "@/components/transaction-category-icon";
import { cn } from "@/lib/utils";
import type { CategoryFlowTheme } from "@/lib/category-flow-theme";

export interface CategorySlicerOption {
  value: string;
  label: string;
  categoryName: string | null;
  subcategoryName: string | null;
  flowTheme: CategoryFlowTheme;
}

/** Chip tints: inflow green #22C55E, savings purple #9333EA, outflow red #EF4444 — keep aligned with `FLOW_COLORS`. */
const THEME_CHIP: Record<CategoryFlowTheme, { idle: string; active: string }> = {
  inflow: {
    idle: "border-[#22C55E]/30 bg-[#22C55E]/10 text-white/90 hover:border-[#22C55E]/50 hover:bg-[#22C55E]/16",
    active:
      "border-[#22C55E]/70 bg-[#22C55E]/24 text-white shadow-[0_0_28px_-10px_rgba(34,197,94,0.55)] ring-1 ring-[#22C55E]/40",
  },
  savings: {
    idle: "border-[#9333EA]/35 bg-[#9333EA]/12 text-white/90 hover:border-[#9333EA]/55 hover:bg-[#9333EA]/20",
    active:
      "border-[#9333EA]/75 bg-[#9333EA]/24 text-white shadow-[0_0_28px_-10px_rgba(147,51,234,0.5)] ring-1 ring-[#9333EA]/45",
  },
  outflow: {
    idle: "border-[#EF4444]/32 bg-[#EF4444]/10 text-white/90 hover:border-[#EF4444]/52 hover:bg-[#EF4444]/16",
    active:
      "border-[#EF4444]/72 bg-[#EF4444]/22 text-white shadow-[0_0_28px_-10px_rgba(239,68,68,0.5)] ring-1 ring-[#EF4444]/40",
  },
  unknown: {
    idle: "border-white/12 bg-black/25 text-white/85 hover:border-white/22 hover:bg-white/[0.07]",
    active:
      "border-white/35 bg-white/[0.12] text-white shadow-[0_0_22px_-10px_rgba(255,255,255,0.12)] ring-1 ring-white/15",
  },
};

const SCROLL_STEP_RATIO = 0.82;
const DRAG_THRESHOLD_PX = 8;

function chipClass(theme: CategoryFlowTheme, selected: boolean): string {
  const t = THEME_CHIP[theme];
  return cn("transition-all duration-200", selected ? t.active : t.idle);
}

function chipKeyDown(
  e: React.KeyboardEvent,
  onSelect: (id: string) => void,
  value: string,
) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onSelect(value);
  }
}

export function CategorySlicer({
  options,
  selectedId,
  onSelect,
}: {
  options: CategorySlicerOption[];
  selectedId: string;
  onSelect: (categoryId: string) => void;
}) {
  const allSelected = selectedId === "";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
    /** From `[data-slicer-chip]`; `""` = All. `undefined` = pointerdown not on a chip (scroll/track only). */
    pendingSelect: string | undefined;
  } | null>(null);

  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanLeft(scrollLeft > 2);
    setCanRight(scrollLeft < scrollWidth - clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollEdges();
    el.addEventListener("scroll", updateScrollEdges, { passive: true });
    const ro = new ResizeObserver(updateScrollEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollEdges);
      ro.disconnect();
    };
  }, [options.length, updateScrollEdges]);

  const scrollByDir = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = Math.max(200, el.clientWidth * SCROLL_STEP_RATIO) * dir;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  const onPointerDownStrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = scrollRef.current;
    if (!el) return;

    const chip = (e.target as HTMLElement).closest("[data-slicer-chip]");
    const pendingSelect = chip ? (chip.getAttribute("data-slicer-value") ?? "") : undefined;

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
      pendingSelect,
    };
    el.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMoveStrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    el.scrollLeft = d.startScroll - dx;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true;
  }, []);

  const onPointerUpStrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || e.pointerId !== d.pointerId) return;

    if (el?.hasPointerCapture?.(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    const moved = d.moved;
    const pending = d.pendingSelect;
    dragRef.current = null;

    if (!moved && pending !== undefined) {
      onSelectRef.current(pending);
    }
  }, []);

  return (
    <div className="rounded-xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:rounded-2xl sm:p-2">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
        <p className="shrink-0 whitespace-nowrap px-0.5 text-[9px] font-medium uppercase tracking-wider text-white/40 sm:px-1 sm:text-[10px]">
          Category
        </p>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1.5">
        <button
          type="button"
          aria-label="Scroll categories left"
          disabled={!canLeft}
          onClick={() => scrollByDir(-1)}
          className={cn(
            "flex h-6 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/12 bg-black/30 px-1 text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-25",
          )}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>

        <div
          ref={scrollRef}
          role="presentation"
          onPointerDown={onPointerDownStrip}
          onPointerMove={onPointerMoveStrip}
          onPointerUp={onPointerUpStrip}
          onPointerCancel={onPointerUpStrip}
          className={cn(
            "flex min-h-6 min-w-0 flex-1 touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 py-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.14)_transparent]",
            "cursor-grab active:cursor-grabbing select-none",
          )}
        >
          <button
            type="button"
            data-slicer-chip
            data-slicer-value=""
            onKeyDown={(e) => chipKeyDown(e, onSelect, "")}
            className={cn(
              "flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-0 transition-all duration-200",
              allSelected
                ? "border-[#0BC18D]/55 bg-[#0BC18D]/18 text-white shadow-[0_0_26px_-10px_rgba(11,193,141,0.6)] ring-1 ring-[#0BC18D]/30"
                : "border-white/12 bg-black/25 text-white/85 hover:border-white/22 hover:bg-white/[0.07]",
            )}
            aria-pressed={allSelected}
          >
            <TransactionCategoryIcon preset="all" size="xs" />
            <span className="max-w-[5.5rem] truncate text-left text-[10px] font-semibold leading-none sm:max-w-[9rem]">
              All categories
            </span>
          </button>

          {options.map((opt) => {
            const selected = selectedId === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                data-slicer-chip
                data-slicer-value={opt.value}
                onKeyDown={(e) => chipKeyDown(e, onSelect, opt.value)}
                className={cn(
                  "flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-0",
                  chipClass(opt.flowTheme, selected),
                )}
                aria-pressed={selected}
                title={opt.label}
              >
                <TransactionCategoryIcon
                  categoryName={opt.categoryName}
                  subcategoryName={opt.subcategoryName}
                  categorySuggestion={null}
                  size="xs"
                />
                <span className="max-w-[5.5rem] truncate text-left text-[10px] font-semibold leading-none sm:max-w-[9rem]">
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Scroll categories right"
          disabled={!canRight}
          onClick={() => scrollByDir(1)}
          className={cn(
            "flex h-6 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/12 bg-black/30 px-1 text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-25",
          )}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </button>
        </div>
      </div>
    </div>
  );
}

const FLOW_THEME_OPTIONS: { value: CategoryFlowTheme; label: string }[] = [
  { value: "inflow", label: "Inflow" },
  { value: "savings", label: "Savings & investments" },
  { value: "outflow", label: "Outflow" },
];

/** Parent flow (inflow / savings / outflow / other) — sits above category chips on Transactions. */
export function FlowThemeSlicer({
  selectedFlowTheme,
  onSelect,
}: {
  /** `""` = all flows. */
  selectedFlowTheme: string;
  onSelect: (flowTheme: string) => void;
}) {
  const allSelected = selectedFlowTheme === "";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
    pendingSelect: string | undefined;
  } | null>(null);

  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanLeft(scrollLeft > 2);
    setCanRight(scrollLeft < scrollWidth - clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollEdges();
    el.addEventListener("scroll", updateScrollEdges, { passive: true });
    const ro = new ResizeObserver(updateScrollEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollEdges);
      ro.disconnect();
    };
  }, [updateScrollEdges]);

  const scrollByDir = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = Math.max(200, el.clientWidth * SCROLL_STEP_RATIO) * dir;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  const onPointerDownStrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = scrollRef.current;
    if (!el) return;
    const chip = (e.target as HTMLElement).closest("[data-flow-slicer-chip]");
    const pendingSelect = chip ? (chip.getAttribute("data-flow-slicer-value") ?? "") : undefined;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
      pendingSelect,
    };
    el.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMoveStrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    el.scrollLeft = d.startScroll - dx;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true;
  }, []);

  const onPointerUpStrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (el?.hasPointerCapture?.(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const moved = d.moved;
    const pending = d.pendingSelect;
    dragRef.current = null;
    if (!moved && pending !== undefined) {
      onSelectRef.current(pending);
    }
  }, []);

  const dotColor: Record<CategoryFlowTheme, string> = {
    inflow: "#22C55E",
    savings: "#9333EA",
    outflow: "#EF4444",
    unknown: "rgba(255,255,255,0.35)",
  };

  return (
    <div className="rounded-xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:rounded-2xl sm:p-2">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
        <p className="shrink-0 whitespace-nowrap px-0.5 text-[9px] font-medium uppercase tracking-wider text-white/40 sm:px-1 sm:text-[10px]">
          Flow
        </p>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1.5">
          <button
            type="button"
            aria-label="Scroll flow options left"
            disabled={!canLeft}
            onClick={() => scrollByDir(-1)}
            className={cn(
              "flex h-6 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/12 bg-black/30 px-1 text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-25",
            )}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>

          <div
            ref={scrollRef}
            role="presentation"
            onPointerDown={onPointerDownStrip}
            onPointerMove={onPointerMoveStrip}
            onPointerUp={onPointerUpStrip}
            onPointerCancel={onPointerUpStrip}
            className={cn(
              "flex min-h-6 min-w-0 flex-1 touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 py-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.14)_transparent]",
              "cursor-grab active:cursor-grabbing select-none",
            )}
          >
            <button
              type="button"
              data-flow-slicer-chip
              data-flow-slicer-value=""
              onKeyDown={(e) => chipKeyDown(e, onSelect, "")}
              className={cn(
                "flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-0 transition-all duration-200",
                allSelected
                  ? "border-[#0BC18D]/55 bg-[#0BC18D]/18 text-white shadow-[0_0_26px_-10px_rgba(11,193,141,0.6)] ring-1 ring-[#0BC18D]/30"
                  : "border-white/12 bg-black/25 text-white/85 hover:border-white/22 hover:bg-white/[0.07]",
              )}
              aria-pressed={allSelected}
            >
              <span className="text-[10px] font-semibold leading-none">All flows</span>
            </button>

            {FLOW_THEME_OPTIONS.map((opt) => {
              const selected = selectedFlowTheme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-flow-slicer-chip
                  data-flow-slicer-value={opt.value}
                  onKeyDown={(e) => chipKeyDown(e, onSelect, opt.value)}
                  className={cn(
                    "flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-0",
                    chipClass(opt.value, selected),
                  )}
                  aria-pressed={selected}
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor[opt.value] }}
                    aria-hidden
                  />
                  <span className="max-w-[8rem] truncate text-left text-[10px] font-semibold leading-none sm:max-w-[11rem]">
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="Scroll flow options right"
            disabled={!canRight}
            onClick={() => scrollByDir(1)}
            className={cn(
              "flex h-6 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/12 bg-black/30 px-1 text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-25",
            )}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
