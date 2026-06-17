/**
 * Shared chart / analytics panel styling.
 * All tokens resolve via CSS variables in globals.css (light + dark).
 */

import { useEffect, useState } from "react";

/** Primary chart card shell (analytics grid, monthly stack, etc.) */
export const chartPanelClass =
  "rounded-xl border border-chart-border bg-chart-surface text-card-foreground shadow-chart";

/** Compact control chip on chart surfaces */
export const chartChipClass =
  "rounded-lg border border-chart-border bg-chart-muted text-muted-foreground transition-colors hover:bg-chart-hover hover:text-foreground";

/** Chart section title */
export const chartTitleClass = "text-sm font-semibold text-foreground";

/** Secondary / empty-state copy */
export const chartMutedClass = "text-sm text-muted-foreground";

/** Search / filter input on chart panels */
export const chartInputClass =
  "h-8 w-full rounded-lg border border-chart-border bg-chart-muted py-1 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground outline-none ring-0 transition-colors focus:border-primary/40 focus:bg-background";

/** Icon badge beside chart titles */
export const chartIconBadgeClass =
  "grid h-7 w-7 place-items-center rounded-lg bg-chart-icon-badge ring-1 ring-chart-border";

/** Scrollable list inside chart panels */
export const chartListRowClass =
  "rounded-lg border border-chart-border bg-chart-muted/60 transition-colors hover:bg-chart-hover";

/** Loading / refresh overlay on charts */
export const chartOverlayClass =
  "pointer-events-none absolute inset-0 flex items-center justify-center bg-chart-overlay backdrop-blur-[1px]";

export const chartOverlayPillClass =
  "rounded-lg border border-chart-border bg-chart-surface px-3 py-1.5 text-xs text-muted-foreground shadow-chart";

export const chartTooltipShellClass =
  "rounded-2xl border border-chart-border bg-chart-surface text-card-foreground shadow-[var(--chart-tooltip-shadow)] backdrop-blur-xl";

export const chartTooltipInnerClass =
  "rounded-xl border border-chart-border bg-chart-muted/50";


/** SVG fill/stroke tokens (use in className or style) */
export const chartSvg = {
  axis: "var(--chart-axis)",
  grid: "var(--chart-grid)",
  label: "var(--chart-label)",
  labelMuted: "var(--chart-label-muted)",
  track: "var(--chart-bar-track)",
} as const;

/** Whether the document is in dark mode (client only). */
export function isDarkChartSurface(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.classList.contains("dark");
}

export type ChartSurface = "light" | "dark";

/**
 * Reactive chart surface — re-renders when the user toggles light/dark.
 * Use for SVG blend modes, label colors, and opacity that cannot use CSS vars alone.
 */
export function useChartSurface(): ChartSurface {
  const [surface, setSurface] = useState<ChartSurface>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  useEffect(() => {
    const root = document.documentElement;
    const sync = () =>
      setSurface(root.classList.contains("dark") ? "dark" : "light");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return surface;
}

/** Sankey ribbon / label tokens keyed to CSS variables in globals.css */
export function sankeyTheme(surface: ChartSurface) {
  if (surface === "dark") {
    return {
      blendMode: "screen" as const,
      linkRest: 0.46,
      linkDim: 0.06,
      linkHi: 0.88,
      labelFill: ["rgba(255,255,255,0.98)", "rgba(255,255,255,0.88)"] as const,
      labelMuted: "rgba(255,255,255,0.58)",
      labelStroke: "rgba(8,5,26,0.92)",
      guide: "rgba(255,255,255,0.04)",
      nodeHighlight: "rgba(255,255,255,0.18)",
    };
  }
  return {
    blendMode: "normal" as const,
    linkRest: 0.68,
    linkDim: 0.16,
    linkHi: 0.94,
    labelFill: ["oklch(0.22 0.022 85)", "oklch(0.28 0.020 85)"] as const,
    labelMuted: "oklch(0.40 0.018 85)",
    labelStroke: "rgba(255,255,255,0.92)",
    guide: "oklch(0.82 0.012 85)",
    nodeHighlight: "rgba(255,255,255,0.22)",
  };
}
