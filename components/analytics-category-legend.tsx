"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  analyticsCategoryGlow,
  analyticsCategoryLabelTone,
} from "@/lib/analytics-category-colors";
import { chartChipClass } from "@/lib/chart-ui";
import { cn } from "@/lib/utils";

export interface AnalyticsLegendCategory {
  name: string;
  color: string;
  share?: number;
}

interface AnalyticsCategoryLegendProps {
  categories: AnalyticsLegendCategory[];
  compact?: boolean;
  /** When set, only this category is shown on the chart. */
  soloCategory?: string | null;
  /** Parent categories unchecked by the user — hidden from the chart. */
  hiddenCategories?: ReadonlySet<string>;
  /** Subcategory legend when a parent category filter is active. */
  subcategoryBreakdown?: AnalyticsLegendCategory[];
  onToggleCategory?: (name: string) => void;
  onToggleVisibility?: (name: string) => void;
  onShowAll?: () => void;
}

function formatShare(share: number | undefined): string | null {
  if (share == null || share <= 0) return null;
  if (share < 0.05) return "<0.1%";
  if (share < 10) return `${share.toFixed(1)}%`;
  return `${Math.round(share)}%`;
}

const DRAG_CLICK_THRESHOLD_PX = 4;
const SCROLL_STEP_PX = 220;

function LegendScrollArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === "left" ? "Scroll categories left" : "Scroll categories right"}
      className={cn(
        "grid h-7 w-6 shrink-0 place-items-center rounded-md border border-chart-border bg-chart-muted/80 text-muted-foreground transition-colors",
        disabled
          ? "cursor-default opacity-25"
          : "cursor-pointer hover:bg-chart-hover hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
    </button>
  );
}

/** Single-line, arrow-navigated, drag-to-scroll row for legend pills. */
function CategoryLegendScrollRow({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(maxScroll > 2 && el.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateArrows);
    };
  }, [updateArrows, children]);

  const scrollBy = useCallback((delta: number) => {
    stripRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = stripRef.current;
    if (!el) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const el = stripRef.current;
    if (!el) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > DRAG_CLICK_THRESHOLD_PX) dragRef.current.moved = true;
    el.scrollLeft = dragRef.current.scrollLeft - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const el = stripRef.current;
    dragRef.current.active = false;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (el) el.style.cursor = "";
    updateArrows();
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current.moved = false;
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <LegendScrollArrow
        direction="left"
        disabled={!canScrollLeft}
        onClick={() => scrollBy(-SCROLL_STEP_PX)}
      />
      <div
        ref={stripRef}
        role="group"
        aria-label={ariaLabel}
        className={cn(
          "min-w-0 flex-1 overflow-x-auto overflow-y-hidden",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          "cursor-grab active:cursor-grabbing",
          "touch-pan-x",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        <div className="flex w-max flex-nowrap items-stretch gap-2 pr-0.5">{children}</div>
      </div>
      <LegendScrollArrow
        direction="right"
        disabled={!canScrollRight}
        onClick={() => scrollBy(SCROLL_STEP_PX)}
      />
    </div>
  );
}

function CategoryVisibilityCheckbox({
  checked,
  tone,
  onToggle,
}: {
  checked: boolean;
  tone: "light" | "dark";
  onToggle: () => void;
}) {
  const border = tone === "light" ? "border-white/70" : "border-[#0a0a0a]/45";
  const bg = checked
    ? tone === "light"
      ? "bg-white/95"
      : "bg-[#0a0a0a]/85"
    : "bg-black/10";
  const checkColor = tone === "light" ? "#0a0a0a" : "#ffffff";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Hide category from chart" : "Show category on chart"}
      title={checked ? "Hide from chart" : "Show on chart"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "relative z-[1] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors",
        border,
        bg,
        "hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      )}
    >
      {checked ? (
        <svg
          viewBox="0 0 12 12"
          className="h-2.5 w-2.5"
          aria-hidden
          fill="none"
          stroke={checkColor}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.2 5 8.7 9.5 3.5" />
        </svg>
      ) : null}
    </button>
  );
}

function CategorySlicerButton({
  category,
  highlighted,
  dimmed,
  visible,
  onToggle,
  onToggleVisibility,
  readOnly = false,
}: {
  category: AnalyticsLegendCategory;
  highlighted: boolean;
  dimmed: boolean;
  visible: boolean;
  onToggle: () => void;
  onToggleVisibility?: () => void;
  readOnly?: boolean;
}) {
  const shareLabel = formatShare(category.share);
  const tone = analyticsCategoryLabelTone(category.color);
  const textMain = tone === "light" ? "text-white" : "text-[#0a0a0a]";
  const textSub = tone === "light" ? "text-foreground" : "text-[#0a0a0a]/75";
  const title = readOnly
    ? category.name
    : highlighted
      ? `Clear filter · show all categories`
      : `Show only ${category.name}`;

  const className = [
    "group relative min-w-[7.5rem] shrink-0 overflow-hidden rounded-xl border px-2.5 py-0.5 text-left",
    "transition-all duration-200 ease-out",
    dimmed || !visible
      ? "scale-[0.97] border-chart-border opacity-35 saturate-[0.45] hover:opacity-55"
      : "scale-100 border-chart-border opacity-100 shadow-lg",
    highlighted && !readOnly && visible ? "ring-2 ring-primary/30" : "",
    readOnly ? "" : "hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
  ].join(" ");

  const style = {
    background:
      dimmed || !visible
        ? `linear-gradient(145deg, ${category.color}88 0%, ${category.color}55 100%)`
        : `linear-gradient(145deg, ${category.color} 0%, ${category.color}cc 52%, ${category.color}99 100%)`,
    boxShadow:
      dimmed || !visible
        ? undefined
        : `0 6px 22px -4px ${analyticsCategoryGlow(category.color, 0.55)}, inset 0 1px 0 rgba(255,255,255,0.28)`,
  };

  const inner = (
    <>
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-white/22 to-transparent"
        aria-hidden
      />
      <span className="relative flex min-w-0 items-start gap-2">
        {onToggleVisibility ? (
          <CategoryVisibilityCheckbox
            checked={visible}
            tone={tone}
            onToggle={onToggleVisibility}
          />
        ) : null}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className={`truncate text-[11px] font-bold capitalize leading-tight tracking-tight ${textMain}`}
            style={{ textShadow: tone === "light" ? "0 1px 2px rgba(0,0,0,0.35)" : undefined }}
          >
            {category.name.toLowerCase()}
          </span>
          {shareLabel ? (
            <span className={`text-[10px] font-extrabold tabular-nums leading-none ${textSub}`}>
              {shareLabel}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );

  if (readOnly) {
    return (
      <span title={title} className={className} style={style} role="listitem">
        {inner}
      </span>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-pressed={highlighted}
      title={title}
      className={cn(className, "cursor-pointer")}
      style={style}
    >
      {inner}
    </div>
  );
}

export function AnalyticsCategoryLegend({
  categories,
  compact = false,
  soloCategory = null,
  hiddenCategories,
  subcategoryBreakdown,
  onToggleCategory,
  onToggleVisibility,
  onShowAll,
}: AnalyticsCategoryLegendProps) {
  const filterActive = soloCategory != null;
  const hidden = hiddenCategories ?? new Set<string>();
  const slicerEnabled = Boolean(onToggleCategory);
  const visibilityEnabled = Boolean(onToggleVisibility);
  const hasSubcategories =
    filterActive && subcategoryBreakdown != null && subcategoryBreakdown.length > 0;

  if (categories.length === 0 && !hasSubcategories) return null;

  const soloLabel = soloCategory?.toLowerCase() ?? "";
  const hiddenCount = categories.filter((c) => hidden.has(c.name)).length;

  return (
    <div
      className={
        compact
          ? "space-y-2.5"
          : "mt-1 border-t border-chart-border pt-4"
      }
    >
      {categories.length > 0 ? (
        <div className="space-y-2.5">
          {slicerEnabled && filterActive ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-medium text-muted-foreground">
                Showing <span className="font-semibold capitalize text-foreground">{soloLabel}</span> only
              </p>
              {onShowAll ? (
                <button
                  type="button"
                  onClick={onShowAll}
                  className={cn(chartChipClass, "shrink-0 px-2.5 py-1 text-[10px] font-semibold")}
                >
                  Show all
                </button>
              ) : null}
            </div>
          ) : visibilityEnabled && hiddenCount > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-medium text-muted-foreground">
                {hiddenCount} {hiddenCount === 1 ? "category hidden" : "categories hidden"} from chart
              </p>
              {onShowAll ? (
                <button
                  type="button"
                  onClick={onShowAll}
                  className={cn(chartChipClass, "shrink-0 px-2.5 py-1 text-[10px] font-semibold")}
                >
                  Show all
                </button>
              ) : null}
            </div>
          ) : null}
          <CategoryLegendScrollRow ariaLabel="Category slicers">
            {categories.map((c) => {
              const visible = !hidden.has(c.name);
              const highlighted = filterActive && soloCategory === c.name;
              const dimmed = filterActive && soloCategory !== c.name;
              return (
                <CategorySlicerButton
                  key={c.name}
                  category={c}
                  highlighted={highlighted}
                  dimmed={dimmed}
                  visible={visible}
                  onToggle={() => onToggleCategory?.(c.name)}
                  onToggleVisibility={
                    visibilityEnabled
                      ? () => onToggleVisibility?.(c.name)
                      : undefined
                  }
                />
              );
            })}
          </CategoryLegendScrollRow>

          {hasSubcategories ? (
            <div className="space-y-2 border-t border-chart-border pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Subcategories in chart
              </p>
              <CategoryLegendScrollRow ariaLabel="Subcategory breakdown">
                {subcategoryBreakdown!.map((c) => (
                  <CategorySlicerButton
                    key={c.name}
                    category={c}
                    highlighted={false}
                    dimmed={false}
                    visible
                    readOnly
                    onToggle={() => {}}
                  />
                ))}
              </CategoryLegendScrollRow>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
