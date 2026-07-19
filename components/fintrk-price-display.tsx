import {
  type FintrkPlanPriceMode,
  fintrkPlanCompareAtPriceUsd,
  fintrkPlanDisplayPriceUsd,
} from "@/lib/plan-pricing";

/**
 * Live FinTRK Pro price with a crossed-out compare-at ("was") price.
 * Compare-at is always live + $3/mo (or ×12 for annual totals).
 */
export function FintrkPriceWithWas({
  mode,
  period,
  size = "lg",
  className = "",
}: {
  mode: FintrkPlanPriceMode;
  period?: string;
  size?: "lg" | "md" | "sm" | "inline";
  className?: string;
}) {
  const was = fintrkPlanCompareAtPriceUsd(mode);
  const current = fintrkPlanDisplayPriceUsd(mode);

  const wasCls =
    size === "lg"
      ? "text-base sm:text-lg"
      : size === "md"
        ? "text-sm"
        : size === "sm"
          ? "text-xs"
          : "text-[inherit]";

  const currentCls =
    size === "lg"
      ? "text-4xl font-bold tracking-tight"
      : size === "md"
        ? "text-2xl font-bold"
        : size === "sm"
          ? "text-base font-semibold"
          : "font-semibold text-[inherit]";

  return (
    <span
      className={`inline-flex flex-wrap items-baseline gap-1.5 tabular-nums ${className}`}
    >
      <span
        className={`font-medium text-muted-foreground/70 line-through decoration-[1.5px] decoration-muted-foreground/55 ${wasCls}`}
        aria-label={`Was ${was}`}
      >
        {was}
      </span>
      <span className={`text-foreground ${currentCls}`}>{current}</span>
      {period ? (
        <span className="text-sm text-muted-foreground">{period}</span>
      ) : null}
    </span>
  );
}

/** Inline note fragment: crossed-out was + live price (+ optional suffix). */
export function FintrkPriceInlineWas({
  mode,
  suffix = "",
  className = "",
}: {
  mode: FintrkPlanPriceMode;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={`whitespace-nowrap tabular-nums ${className}`}>
      <span className="line-through decoration-[1.5px] text-muted-foreground/70">
        {fintrkPlanCompareAtPriceUsd(mode)}
      </span>{" "}
      <span className="font-semibold text-foreground">
        {fintrkPlanDisplayPriceUsd(mode)}
      </span>
      {suffix}
    </span>
  );
}
