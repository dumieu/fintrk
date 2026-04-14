"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList, type ReactNode } from "react";
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

/** Chip tints — keep aligned with `FLOW_COLORS` in default-categories. */
const THEME_CHIP: Record<CategoryFlowTheme, { idle: string; active: string }> = {
  inflow: {
    idle: "border-[#22C55E]/30 bg-[#22C55E]/10 text-white/90 hover:border-[#22C55E]/50 hover:bg-[#22C55E]/16",
    active:
      "border-[#22C55E]/70 bg-[#22C55E]/24 text-white shadow-[0_0_28px_-10px_rgba(34,197,94,0.55)] ring-1 ring-[#22C55E]/40",
  },
  outflow: {
    idle: "border-[#EF4444]/32 bg-[#EF4444]/10 text-white/90 hover:border-[#EF4444]/52 hover:bg-[#EF4444]/16",
    active:
      "border-[#EF4444]/72 bg-[#EF4444]/22 text-white shadow-[0_0_28px_-10px_rgba(239,68,68,0.5)] ring-1 ring-[#EF4444]/40",
  },
  savings: {
    idle: "border-[#9333EA]/35 bg-[#9333EA]/12 text-white/90 hover:border-[#9333EA]/55 hover:bg-[#9333EA]/20",
    active:
      "border-[#9333EA]/75 bg-[#9333EA]/24 text-white shadow-[0_0_28px_-10px_rgba(147,51,234,0.5)] ring-1 ring-[#9333EA]/45",
  },
  misc: {
    idle: "border-[#808080]/30 bg-[#808080]/10 text-white/90 hover:border-[#808080]/50 hover:bg-[#808080]/16",
    active:
      "border-[#808080]/70 bg-[#808080]/24 text-white shadow-[0_0_28px_-10px_rgba(128,128,128,0.45)] ring-1 ring-[#808080]/40",
  },
  unknown: {
    idle: "border-white/12 bg-black/25 text-white/85 hover:border-white/22 hover:bg-white/[0.07]",
    active:
      "border-white/35 bg-white/[0.12] text-white shadow-[0_0_22px_-10px_rgba(255,255,255,0.12)] ring-1 ring-white/15",
  },
};

const DRAG_THRESHOLD_PX = 8;
const SCROLL_STEP_RATIO = 0.82;

const SLICER_CHEVRON_BTN =
  "flex h-6 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/12 bg-black/30 px-1 text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-25";

/** Non–color-coded chips (Category Mapping top slicers). */
const NEUTRAL_CHIP_IDLE =
  "border-white/12 bg-black/25 text-white/85 hover:border-white/22 hover:bg-white/[0.07]";
const NEUTRAL_CHIP_ACTIVE =
  "border-white/38 bg-white/[0.11] text-white shadow-[0_0_20px_-10px_rgba(255,255,255,0.1)] ring-1 ring-white/16";

function useSlicerScrollState(deps: DependencyList) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps drive re-measure when content changes
  }, [updateScrollEdges, ...deps]);

  const scrollByDir = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = Math.max(200, el.clientWidth * SCROLL_STEP_RATIO) * dir;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  return { scrollRef, canLeft, canRight, scrollByDir };
}

function SlicerChevronRow({
  children,
  canLeft,
  canRight,
  scrollByDir,
  leftAria,
  rightAria,
}: {
  children: ReactNode;
  canLeft: boolean;
  canRight: boolean;
  scrollByDir: (dir: -1 | 1) => void;
  leftAria: string;
  rightAria: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1.5">
      <button
        type="button"
        aria-label={leftAria}
        disabled={!canLeft}
        onClick={() => scrollByDir(-1)}
        className={cn(SLICER_CHEVRON_BTN)}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2} />
      </button>
      {children}
      <button
        type="button"
        aria-label={rightAria}
        disabled={!canRight}
        onClick={() => scrollByDir(1)}
        className={cn(SLICER_CHEVRON_BTN)}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

function chipClass(theme: CategoryFlowTheme, selected: boolean): string {
  const t = THEME_CHIP[theme];
  return cn("transition-all duration-200", selected ? t.active : t.idle);
}

function neutralChipClass(selected: boolean): string {
  return cn("transition-all duration-200", selected ? NEUTRAL_CHIP_ACTIVE : NEUTRAL_CHIP_IDLE);
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
  showLabel = true,
  /** When true, chips and icons use neutral styling (e.g. Category Mapping). */
  neutralChips = false,
}: {
  options: CategorySlicerOption[];
  selectedId: string;
  onSelect: (categoryId: string) => void;
  /** When false, hides the left "Category" title (e.g. Category Mapping page). */
  showLabel?: boolean;
  neutralChips?: boolean;
}) {
  const allSelected = selectedId === "";
  const { scrollRef, canLeft, canRight, scrollByDir } = useSlicerScrollState([options.length]);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
    /** From `[data-slicer-chip]`; `""` = All. `undefined` = pointerdown not on a chip (scroll/track only). */
    pendingSelect: string | undefined;
  } | null>(null);

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
  }, [scrollRef]);

  const onPointerMoveStrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    el.scrollLeft = d.startScroll - dx;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true;
  }, [scrollRef]);

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
  }, [scrollRef]);

  return (
    <div className="rounded-xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:rounded-2xl sm:p-2">
      <div className={cn("flex min-w-0 items-center", showLabel ? "gap-1.5 sm:gap-3" : "gap-0")}>
        {showLabel ? (
          <p className="shrink-0 whitespace-nowrap px-0.5 text-[9px] font-medium uppercase tracking-wider text-white/40 sm:px-1 sm:text-[10px]">
            Category
          </p>
        ) : null}
        <SlicerChevronRow
          canLeft={canLeft}
          canRight={canRight}
          scrollByDir={scrollByDir}
          leftAria="Scroll categories left"
          rightAria="Scroll categories right"
        >
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
                neutralChips
                  ? neutralChipClass(allSelected)
                  : allSelected
                    ? "border-[#0BC18D]/55 bg-[#0BC18D]/18 text-white shadow-[0_0_26px_-10px_rgba(11,193,141,0.6)] ring-1 ring-[#0BC18D]/30"
                    : "border-white/12 bg-black/25 text-white/85 hover:border-white/22 hover:bg-white/[0.07]",
              )}
              aria-pressed={allSelected}
            >
              <TransactionCategoryIcon preset="all" size="xs" monochrome={neutralChips} />
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
                    neutralChips ? neutralChipClass(selected) : chipClass(opt.flowTheme, selected),
                  )}
                  aria-pressed={selected}
                  title={opt.label}
                >
                  <TransactionCategoryIcon
                    categoryName={opt.categoryName}
                    subcategoryName={opt.subcategoryName}
                    size="xs"
                    monochrome={neutralChips}
                  />
                  <span className="max-w-[5.5rem] truncate text-left text-[10px] font-semibold leading-none sm:max-w-[9rem]">
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </SlicerChevronRow>
      </div>
    </div>
  );
}

export type SubcategoryTypeSlicerValue =
  | "non-discretionary"
  | "semi-discretionary"
  | "discretionary";

const SUBCAT_TYPE_SLICER_OPTIONS: { value: SubcategoryTypeSlicerValue; label: string }[] = [
  { value: "non-discretionary", label: "Non-discretionary" },
  { value: "semi-discretionary", label: "Semi-discretionary" },
  { value: "discretionary", label: "Discretionary" },
];

const SUBCAT_CHIP: Record<SubcategoryTypeSlicerValue, { idle: string; active: string }> = {
  "non-discretionary": {
    idle: "border-[#EF4444]/32 bg-[#EF4444]/10 text-white/90 hover:border-[#EF4444]/50 hover:bg-[#EF4444]/16",
    active:
      "border-[#EF4444]/72 bg-[#EF4444]/22 text-white shadow-[0_0_28px_-10px_rgba(239,68,68,0.45)] ring-1 ring-[#EF4444]/40",
  },
  "semi-discretionary": {
    idle: "border-[#ECAA0B]/35 bg-[#ECAA0B]/10 text-white/90 hover:border-[#ECAA0B]/55 hover:bg-[#ECAA0B]/18",
    active:
      "border-[#ECAA0B]/75 bg-[#ECAA0B]/22 text-white shadow-[0_0_28px_-10px_rgba(236,170,11,0.45)] ring-1 ring-[#ECAA0B]/42",
  },
  discretionary: {
    idle: "border-[#22C55E]/30 bg-[#22C55E]/10 text-white/90 hover:border-[#22C55E]/50 hover:bg-[#22C55E]/16",
    active:
      "border-[#22C55E]/72 bg-[#22C55E]/22 text-white shadow-[0_0_28px_-10px_rgba(34,197,94,0.5)] ring-1 ring-[#22C55E]/40",
  },
};

const SUBCAT_DOT: Record<SubcategoryTypeSlicerValue, string> = {
  "non-discretionary": "#EF4444",
  "semi-discretionary": "#ECAA0B",
  discretionary: "#22C55E",
};

function subcatTypeChipClass(
  value: SubcategoryTypeSlicerValue,
  selected: boolean,
  neutral: boolean,
): string {
  if (neutral) return neutralChipClass(selected);
  const t = SUBCAT_CHIP[value];
  return cn("transition-all duration-200", selected ? t.active : t.idle);
}

/** Expense subcategory type (non-discretionary / semi / discretionary) — same shell as FlowThemeSlicer. */
export function SubcategoryTypeSlicer({
  selectedType,
  onSelect,
  showLabel = true,
  /** When true, chips and dots use neutral styling (e.g. Category Mapping). */
  neutralChips = false,
  /** No chevrons; backdrop shrink-wraps to chips (pair with `FlowThemeSlicer compact`). */
  compact = false,
}: {
  /** `""` = no type filter (all). */
  selectedType: string;
  onSelect: (subcategoryType: string) => void;
  showLabel?: boolean;
  neutralChips?: boolean;
  compact?: boolean;
}) {
  const allSelected = selectedType === "";
  const showExpenseTypeLabel = showLabel && !compact;
  const { scrollRef, canLeft, canRight, scrollByDir } = useSlicerScrollState([]);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
    pendingSelect: string | undefined;
  } | null>(null);

  const onPointerDownStrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = scrollRef.current;
    if (!el) return;
    const chip = (e.target as HTMLElement).closest("[data-subcat-type-slicer-chip]");
    const pendingSelect = chip ? (chip.getAttribute("data-subcat-type-slicer-value") ?? "") : undefined;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
      pendingSelect,
    };
    el.setPointerCapture(e.pointerId);
  }, [scrollRef]);

  const onPointerMoveStrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    el.scrollLeft = d.startScroll - dx;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true;
  }, [scrollRef]);

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
  }, [scrollRef]);

  const subcatStripClass = compact
    ? cn(
        "flex min-h-6 w-max max-w-full shrink-0 touch-pan-x flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 py-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.14)_transparent]",
        "cursor-grab active:cursor-grabbing select-none",
      )
    : cn(
        "flex min-h-6 min-w-0 flex-1 touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 py-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.14)_transparent]",
        "cursor-grab active:cursor-grabbing select-none",
      );

  const subcatChipStrip = (
    <div
      ref={scrollRef}
      role="presentation"
      onPointerDown={onPointerDownStrip}
      onPointerMove={onPointerMoveStrip}
      onPointerUp={onPointerUpStrip}
      onPointerCancel={onPointerUpStrip}
      className={subcatStripClass}
    >
      <button
        type="button"
        data-subcat-type-slicer-chip
        data-subcat-type-slicer-value=""
        onKeyDown={(e) => chipKeyDown(e, onSelect, "")}
        className={cn(
          "flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-0 transition-all duration-200",
          neutralChipClass(allSelected),
        )}
        aria-pressed={allSelected}
      >
        <span className="text-[10px] font-semibold leading-none">All</span>
      </button>

      {SUBCAT_TYPE_SLICER_OPTIONS.map((opt) => {
        const selected = selectedType === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            data-subcat-type-slicer-chip
            data-subcat-type-slicer-value={opt.value}
            onKeyDown={(e) => chipKeyDown(e, onSelect, opt.value)}
            className={cn(
              "flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-0",
              subcatTypeChipClass(opt.value, selected, neutralChips),
            )}
            aria-pressed={selected}
          >
            {!neutralChips ? (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: SUBCAT_DOT[opt.value] }}
                aria-hidden
              />
            ) : null}
            <span className="max-w-[9rem] truncate text-left text-[10px] font-semibold leading-none sm:max-w-[14rem]">
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:rounded-2xl sm:p-2",
        compact && "w-fit max-w-full shrink-0",
      )}
    >
      <div className={cn("flex min-w-0 items-center", showExpenseTypeLabel ? "gap-1.5 sm:gap-3" : "gap-0")}>
        {showExpenseTypeLabel ? (
          <p className="shrink-0 whitespace-nowrap px-0.5 text-[9px] font-medium uppercase tracking-wider text-white/40 sm:px-1 sm:text-[10px]">
            Expense type
          </p>
        ) : null}
        {compact ? (
          subcatChipStrip
        ) : (
          <SlicerChevronRow
            canLeft={canLeft}
            canRight={canRight}
            scrollByDir={scrollByDir}
            leftAria="Scroll expense type options left"
            rightAria="Scroll expense type options right"
          >
            {subcatChipStrip}
          </SlicerChevronRow>
        )}
      </div>
    </div>
  );
}

/** Compact three-way expense-type control (no scroll) — same chip colors as `SubcategoryTypeSlicer`. */
export function SubcategoryTypeInlinePicker({
  selected,
  onSelect,
  className,
}: {
  selected: SubcategoryTypeSlicerValue | null;
  onSelect: (t: SubcategoryTypeSlicerValue) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 gap-1 rounded-lg border border-white/[0.10] bg-black/30 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
      role="group"
      aria-label="Expense type"
    >
      {SUBCAT_TYPE_SLICER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            // Prevent focus leaving the name field first — otherwise InlineInput
            // blur runs commit → onCancel (unchanged name) and unmounts this panel
            // before click fires (mouse + touch).
            e.preventDefault();
          }}
          onClick={() => onSelect(opt.value)}
          className={cn(
            "flex min-h-[2.75rem] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border px-0.5 py-1 transition-all duration-200 sm:min-h-0 sm:px-1 sm:py-1.5",
            subcatTypeChipClass(opt.value, selected === opt.value, false),
          )}
          aria-pressed={selected === opt.value}
          title={opt.label}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: SUBCAT_DOT[opt.value] }}
            aria-hidden
          />
          <span className="line-clamp-2 w-full px-0.5 text-center text-[7px] font-semibold leading-[1.15] text-white/90 sm:text-[8px]">
            {opt.label}
          </span>
        </button>
      ))}
    </div>
  );
}

const FLOW_THEME_OPTIONS: { value: CategoryFlowTheme; label: string }[] = [
  { value: "inflow", label: "Inflow" },
  { value: "outflow", label: "Outflow" },
  { value: "savings", label: "Savings & investments" },
  { value: "misc", label: "Misc" },
];

/** Parent flow (inflow / savings / outflow / other) — sits above category chips on Transactions. */
export function FlowThemeSlicer({
  selectedFlowTheme,
  onSelect,
  showLabel = true,
  /** No title/chevrons; outer width fits chips only (pair with Category slicer flex-1). */
  compact = false,
  /** When true, flow chips and dots use neutral styling (e.g. Category Mapping). */
  neutralChips = false,
}: {
  /** `""` = no parent-flow filter (all). */
  selectedFlowTheme: string;
  onSelect: (flowTheme: string) => void;
  /** When false, hides the left "Flow" title (e.g. Category Mapping page). Ignored when `compact`. */
  showLabel?: boolean;
  compact?: boolean;
  neutralChips?: boolean;
}) {
  const allSelected = selectedFlowTheme === "";
  const showFlowLabel = showLabel && !compact;
  const { scrollRef, canLeft, canRight, scrollByDir } = useSlicerScrollState([]);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
    pendingSelect: string | undefined;
  } | null>(null);

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
  }, [scrollRef]);

  const onPointerMoveStrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    el.scrollLeft = d.startScroll - dx;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true;
  }, [scrollRef]);

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
  }, [scrollRef]);

  const dotColor: Record<CategoryFlowTheme, string> = {
    inflow: "#22C55E",
    outflow: "#EF4444",
    savings: "#9333EA",
    misc: "#808080",
    unknown: "rgba(255,255,255,0.35)",
  };

  const stripClass = compact
    ? cn(
        "flex min-h-6 w-max max-w-full shrink-0 touch-pan-x flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 py-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.14)_transparent]",
        "cursor-grab active:cursor-grabbing select-none",
      )
    : cn(
        "flex min-h-6 min-w-0 flex-1 touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 py-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.14)_transparent]",
        "cursor-grab active:cursor-grabbing select-none",
      );

  const flowChipStrip = (
    <div
      ref={scrollRef}
      role="presentation"
      onPointerDown={onPointerDownStrip}
      onPointerMove={onPointerMoveStrip}
      onPointerUp={onPointerUpStrip}
      onPointerCancel={onPointerUpStrip}
      className={stripClass}
    >
      <button
        type="button"
        data-flow-slicer-chip
        data-flow-slicer-value=""
        onKeyDown={(e) => chipKeyDown(e, onSelect, "")}
        className={cn(
          "flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-0 transition-all duration-200",
          neutralChips
            ? neutralChipClass(allSelected)
            : allSelected
              ? "border-[#0BC18D]/55 bg-[#0BC18D]/18 text-white shadow-[0_0_26px_-10px_rgba(11,193,141,0.6)] ring-1 ring-[#0BC18D]/30"
              : "border-white/12 bg-black/25 text-white/85 hover:border-white/22 hover:bg-white/[0.07]",
        )}
        aria-pressed={allSelected}
      >
        <span className="text-[10px] font-semibold leading-none">All</span>
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
              neutralChips ? neutralChipClass(selected) : chipClass(opt.value, selected),
            )}
            aria-pressed={selected}
          >
            {!neutralChips ? (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: dotColor[opt.value] }}
                aria-hidden
              />
            ) : null}
            <span className="max-w-[8rem] truncate text-left text-[10px] font-semibold leading-none sm:max-w-[11rem]">
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:rounded-2xl sm:p-2",
        compact && "w-fit max-w-full shrink-0",
      )}
    >
      <div className={cn("flex min-w-0 items-center", showFlowLabel ? "gap-1.5 sm:gap-3" : "gap-0")}>
        {showFlowLabel ? (
          <p className="shrink-0 whitespace-nowrap px-0.5 text-[9px] font-medium uppercase tracking-wider text-white/40 sm:px-1 sm:text-[10px]">
            Flow
          </p>
        ) : null}
        {compact ? (
          flowChipStrip
        ) : (
          <SlicerChevronRow
            canLeft={canLeft}
            canRight={canRight}
            scrollByDir={scrollByDir}
            leftAria="Scroll flow options left"
            rightAria="Scroll flow options right"
          >
            {flowChipStrip}
          </SlicerChevronRow>
        )}
      </div>
    </div>
  );
}
