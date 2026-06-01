"use client";

import {
  analyticsCategoryGlow,
  analyticsCategoryLabelTone,
} from "@/lib/analytics-category-colors";

export interface AnalyticsLegendCategory {
  name: string;
  color: string;
  share?: number;
}

interface AnalyticsCategoryLegendProps {
  categories: AnalyticsLegendCategory[];
  avgSpend?: number | null;
  avgIncome?: number | null;
  compact?: boolean;
  /** When set, only this category is shown on the chart. */
  soloCategory?: string | null;
  /** Subcategory legend when a parent category filter is active. */
  subcategoryBreakdown?: AnalyticsLegendCategory[];
  onToggleCategory?: (name: string) => void;
  onShowAll?: () => void;
}

function formatShare(share: number | undefined): string | null {
  if (share == null || share <= 0) return null;
  if (share < 0.05) return "<0.1%";
  if (share < 10) return `${share.toFixed(1)}%`;
  return `${Math.round(share)}%`;
}

function CategorySlicerButton({
  category,
  highlighted,
  dimmed,
  onToggle,
  readOnly = false,
}: {
  category: AnalyticsLegendCategory;
  highlighted: boolean;
  dimmed: boolean;
  onToggle: () => void;
  readOnly?: boolean;
}) {
  const shareLabel = formatShare(category.share);
  const tone = analyticsCategoryLabelTone(category.color);
  const textMain = tone === "light" ? "text-white" : "text-[#0a0a0a]";
  const textSub = tone === "light" ? "text-white/85" : "text-[#0a0a0a]/75";
  const title = readOnly
    ? category.name
    : highlighted
      ? `Clear filter · show all categories`
      : `Show only ${category.name}`;

  const className = [
    "group relative min-w-[7.5rem] max-w-full overflow-hidden rounded-xl border px-3 py-2 text-left",
    "transition-all duration-200 ease-out",
    dimmed
      ? "scale-[0.97] border-white/[0.06] opacity-35 saturate-[0.45] hover:opacity-55"
      : "scale-100 border-white/20 opacity-100 shadow-lg",
    highlighted && !readOnly ? "ring-2 ring-white/35" : "",
    readOnly ? "" : "hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
  ].join(" ");

  const style = {
    background: dimmed
      ? `linear-gradient(145deg, ${category.color}88 0%, ${category.color}55 100%)`
      : `linear-gradient(145deg, ${category.color} 0%, ${category.color}cc 52%, ${category.color}99 100%)`,
    boxShadow: dimmed
      ? undefined
      : `0 6px 22px -4px ${analyticsCategoryGlow(category.color, 0.55)}, inset 0 1px 0 rgba(255,255,255,0.28)`,
  };

  const inner = (
    <>
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-white/22 to-transparent"
        aria-hidden
      />
      <span className="relative flex min-w-0 flex-col gap-0.5">
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
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={highlighted}
      title={title}
      className={className}
      style={style}
    >
      {inner}
    </button>
  );
}

export function AnalyticsCategoryLegend({
  categories,
  avgSpend,
  avgIncome,
  compact = false,
  soloCategory = null,
  subcategoryBreakdown,
  onToggleCategory,
  onShowAll,
}: AnalyticsCategoryLegendProps) {
  const filterActive = soloCategory != null;
  const showRefLines =
    !filterActive &&
    ((avgSpend != null && avgSpend > 0) || (avgIncome != null && avgIncome > 0));
  const slicerEnabled = Boolean(onToggleCategory);
  const hasSubcategories =
    filterActive && subcategoryBreakdown != null && subcategoryBreakdown.length > 0;

  if (categories.length === 0 && !showRefLines && !hasSubcategories) return null;

  const soloLabel = soloCategory?.toLowerCase() ?? "";

  return (
    <div
      className={
        compact
          ? "space-y-2.5"
          : "mt-1 border-t border-white/[0.06] pt-4"
      }
    >
      {categories.length > 0 ? (
        <div className="space-y-2.5">
          {slicerEnabled && filterActive ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-medium text-white/40">
                Showing <span className="font-semibold capitalize text-white/65">{soloLabel}</span> only
              </p>
              {onShowAll ? (
                <button
                  type="button"
                  onClick={onShowAll}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-white/65 transition-colors hover:border-white/20 hover:bg-white/[0.10] hover:text-white/90"
                >
                  Show all
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Category slicers"
          >
            {categories.map((c) => {
              const highlighted = filterActive && soloCategory === c.name;
              const dimmed = filterActive && soloCategory !== c.name;
              return (
                <CategorySlicerButton
                  key={c.name}
                  category={c}
                  highlighted={highlighted}
                  dimmed={dimmed}
                  onToggle={() => onToggleCategory?.(c.name)}
                />
              );
            })}
          </div>

          {hasSubcategories ? (
            <div className="space-y-2 border-t border-white/[0.04] pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/35">
                Subcategories in chart
              </p>
              <div className="flex flex-wrap gap-2" role="list" aria-label="Subcategory breakdown">
                {subcategoryBreakdown!.map((c) => (
                  <CategorySlicerButton
                    key={c.name}
                    category={c}
                    highlighted={false}
                    dimmed={false}
                    readOnly
                    onToggle={() => {}}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showRefLines ? (
        <div
          className={`flex flex-wrap items-center gap-2 ${
            categories.length > 0 ? "border-t border-white/[0.04] pt-3" : ""
          }`}
        >
          {avgSpend != null && avgSpend > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-[#FF4444]/25 bg-[#FF4444]/10 px-2.5 py-1.5 text-[10px]">
              <span
                className="inline-block h-[2px] w-5 shrink-0 rounded-full"
                style={{
                  background: "linear-gradient(90deg, transparent, #FF4444, transparent)",
                  boxShadow: "0 0 8px rgba(255,68,68,0.55)",
                }}
                aria-hidden
              />
              <span className="font-semibold text-[#FFB4B4]">Avg spend · last 6 mo</span>
            </span>
          ) : null}
          {avgIncome != null && avgIncome > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-[#39FF14]/25 bg-[#39FF14]/10 px-2.5 py-1.5 text-[10px]">
              <span
                className="inline-block h-[2px] w-5 shrink-0 rounded-full"
                style={{
                  background: "linear-gradient(90deg, transparent, #39FF14, transparent)",
                  boxShadow: "0 0 8px rgba(57,255,20,0.45)",
                }}
                aria-hidden
              />
              <span className="font-semibold text-[#9DFFB0]">Avg income · last 6 mo</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
