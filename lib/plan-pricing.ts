/**
 * FinTRK Pro display + catalog pricing (USD).
 *
 * Display copy and Stripe catalog bootstrap share these amounts. Actual
 * charges come from Stripe Prices resolved by lookup key at checkout
 * (`fintrk_pro_monthly` / `fintrk_pro_annual`).
 *
 * Live (Jul 2026): monthly $6.98 · annual $4.98/mo ($59.76/yr).
 * Compare-at UI shows a crossed-out price $3/mo higher.
 */

/** Temporary promo markdown: crossed-out "was" is this many cents/mo higher. */
export const FINTRK_COMPARE_AT_MARKDOWN_CENTS_PER_MONTH = 300;

export const FINTRK_PLAN_PRICING = {
  /** Monthly subscription, cents. */
  monthlyCents: 698,
  /** Annual subscription billed up-front, cents ($4.98 × 12). */
  annualCents: 5976,
  /** Monthly equivalent when paying annually, cents. */
  annualPerMonthCents: 498,
  currency: "USD",
} as const;

export const FINTRK_COMPARE_AT_PRICING = {
  monthlyCents:
    FINTRK_PLAN_PRICING.monthlyCents + FINTRK_COMPARE_AT_MARKDOWN_CENTS_PER_MONTH,
  annualPerMonthCents:
    FINTRK_PLAN_PRICING.annualPerMonthCents +
    FINTRK_COMPARE_AT_MARKDOWN_CENTS_PER_MONTH,
  annualCents:
    FINTRK_PLAN_PRICING.annualCents +
    FINTRK_COMPARE_AT_MARKDOWN_CENTS_PER_MONTH * 12,
  currency: FINTRK_PLAN_PRICING.currency,
} as const;

export type FintrkPlanPriceMode = "monthly" | "annually" | "annualTotal";

export function formatFintrkUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: FINTRK_PLAN_PRICING.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function fintrkPlanAmountCents(
  mode: FintrkPlanPriceMode,
  table: typeof FINTRK_PLAN_PRICING | typeof FINTRK_COMPARE_AT_PRICING,
): number {
  if (mode === "monthly") return table.monthlyCents;
  if (mode === "annually") return table.annualPerMonthCents;
  return table.annualCents;
}

export function fintrkPlanDisplayPriceUsd(
  mode: FintrkPlanPriceMode = "monthly",
): string {
  return formatFintrkUsd(fintrkPlanAmountCents(mode, FINTRK_PLAN_PRICING));
}

export function fintrkPlanCompareAtPriceUsd(
  mode: FintrkPlanPriceMode = "monthly",
): string {
  return formatFintrkUsd(fintrkPlanAmountCents(mode, FINTRK_COMPARE_AT_PRICING));
}

/** Rounded percent saved vs monthly when choosing annual billing. */
export function fintrkPlanAnnualSavingsPercentRounded(): number {
  const { monthlyCents, annualPerMonthCents } = FINTRK_PLAN_PRICING;
  return Math.round(
    ((monthlyCents - annualPerMonthCents) / monthlyCents) * 100,
  );
}
