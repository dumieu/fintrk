/**
 * Shared (client + server) constants for "Fin", the in-app FinTRK AI advisor.
 *
 * Pricing (internal only - never shown to users): GPT-5.6 Luna paid tier,
 * USD per 1M tokens (https://developers.openai.com/api/docs/pricing):
 *   input $0.20 · cache write $0.25 (1.25x) · cached input $0.02 (90% off)
 *   · output $1.20
 * Output includes reasoning tokens, which is exactly why reasoning_effort is
 * pinned to "none".
 *
 * Cost architecture (why a turn is cheap):
 *   1. Prompt caching carries the digest. An explicit GPT-5.6 breakpoint sits
 *      at the end of the financial record so the system instruction + digest
 *      stay reusable when today's date or the question changes. Implicit
 *      caching still covers the growing conversation. This only works while
 *      the prefix stays byte-stable, which is why the digest is rendered
 *      deterministically and the date is passed as a separate later part.
 *   2. prompt_cache_key is the Clerk user id, which GPT-5.6 requires for
 *      reliable breakpoint matching.
 *   3. The digest is cached in Postgres behind a data fingerprint, so a turn
 *      that follows an unchanged ledger runs one small probe query instead of a
 *      full aggregation pass - and reproduces the exact same bytes, which is
 *      what keeps the prompt cache hitting.
 *   4. One model call per turn. No tool loop: a tool loop re-sends the whole
 *      prompt on every iteration and multiplies input spend.
 *   5. Reasoning is off. Reasoning tokens bill at the output rate.
 *   6. All arithmetic is precomputed in SQL/JS, so output tokens go to advice
 *      rather than to the model doing sums out loud.
 *
 * Budget policy: each user gets the equivalent of $0.05 of model usage per UTC
 * calendar day, resetting at 00:00 UTC. Dollar figures, token counts, and the
 * model identity are internal. The only user-facing surface is a percentage
 * allowance bar in the chat panel. Never show cents or dollars in the UI.
 */

export const FIN_AI_MODEL = "gpt-5.6-luna";

/** USD per one million tokens. */
export const PRICE_INPUT_PER_M = 0.2;
export const PRICE_CACHE_WRITE_PER_M = 0.25;
export const PRICE_CACHED_INPUT_PER_M = 0.02;
export const PRICE_OUTPUT_PER_M = 1.2;

/**
 * Hard daily spend ceiling per user (internal accounting only). Resets 00:00
 * UTC. Never surface this figure in the UI.
 */
export const FIN_AI_DAILY_BUDGET_USD = 0.05;
export const FIN_AI_DAILY_BUDGET_MICRO_USD = Math.round(
  FIN_AI_DAILY_BUDGET_USD * 1_000_000,
);

/** Warning threshold (fraction of the daily budget). Drives bar colour only. */
export const FIN_AI_BUDGET_WARN_FRACTION = 0.8;

/** Generation caps. Reasoning is off: reasoning tokens bill at the output rate. */
export const FIN_AI_MAX_OUTPUT_TOKENS = 1200;
/** User composer / inbound user-turn cap. */
export const FIN_AI_MAX_USER_CHARS = 4_000;
/**
 * Prior assistant turns in the request body. Luna answers can exceed the user
 * cap. Applying the user cap to history made the next turn fail validation
 * with "could not be read".
 */
export const FIN_AI_MAX_ASSISTANT_CHARS = 16_000;

/** Rolling data window fed to the model, in calendar months (incl. current). */
export const FIN_AI_WINDOW_MONTHS = 12;

/** Live usage snapshot recorded after every chat turn (server-side shape). */
export interface FinAiUsageSnapshot {
  /** UTC calendar day key, e.g. "2026-08-16". */
  day: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  requestCount: number;
  /** Internal metering - never surface as dollars in the UI. */
  costMicroUsd: number;
  budgetMicroUsd: number;
  /** 0..100, clamped. Sizes the allowance bar. */
  pct: number;
}

/** Client-safe slice of usage. No tokens, no dollars, no model name. */
export type FinAiUsagePublic = Pick<FinAiUsageSnapshot, "day" | "pct">;

export function toPublicUsage(u: FinAiUsageSnapshot): FinAiUsagePublic {
  return { day: u.day, pct: u.pct };
}

/** UTC calendar day key, e.g. "2026-08-16". */
export function currentDayKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * Exact turn cost in micro-USD from OpenAI usage token counts.
 * `inputTokens` is the ordinary uncached share (prompt minus cached minus
 * cache-write). Cache writes bill at 1.25x, not as a surcharge on top of
 * the uncached rate.
 */
export function turnCostMicroUsd(
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  cacheWriteTokens = 0,
): number {
  return Math.ceil(
    inputTokens * PRICE_INPUT_PER_M +
      cachedInputTokens * PRICE_CACHED_INPUT_PER_M +
      cacheWriteTokens * PRICE_CACHE_WRITE_PER_M +
      outputTokens * PRICE_OUTPUT_PER_M,
  );
}

export function usagePct(costMicroUsd: number): number {
  return Math.max(
    0,
    Math.min(100, (costMicroUsd / FIN_AI_DAILY_BUDGET_MICRO_USD) * 100),
  );
}
