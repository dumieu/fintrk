import "server-only";
import { db } from "@/lib/db";
import { aiCosts } from "@/lib/db/schema";

interface AiCostInput {
  userId: string;
  model: string;
  query: string;
  /** Full-price prompt tokens (exclude cached reads and cache writes). */
  inputTokens?: number;
  /** Prompt tokens served from a provider cache, billed at the cached rate. */
  cachedInputTokens?: number;
  /** GPT-5.6 cache writes, billed at 1.25x the uncached input rate. */
  cacheWriteTokens?: number;
  outputTokens?: number;
}

/** USD per 1M tokens, paid tier. */
const MODEL_PRICING: Record<
  string,
  { input: number; cachedInput: number; cacheWrite?: number; output: number }
> = {
  "gemini-2.0-flash": { input: 0.10, cachedInput: 0.025, output: 0.40 },
  "gemini-2.5-flash-lite": { input: 0.10, cachedInput: 0.025, output: 0.40 },
  "gemini-2.5-flash": { input: 0.30, cachedInput: 0.03, output: 2.50 },
  "gemini-2.5-pro": { input: 1.25, cachedInput: 0.31, output: 10.0 },
  "gpt-5.6-luna": { input: 0.20, cachedInput: 0.02, cacheWrite: 0.25, output: 1.20 },
};

export async function logAiCost(input: AiCostInput): Promise<void> {
  try {
    const pricing =
      MODEL_PRICING[input.model] ?? { input: 0.10, cachedInput: 0.025, output: 0.40 };
    const cacheWriteRate = pricing.cacheWrite ?? pricing.input;
    const inputCost =
      ((input.inputTokens ?? 0) / 1_000_000) * pricing.input +
      ((input.cachedInputTokens ?? 0) / 1_000_000) * pricing.cachedInput +
      ((input.cacheWriteTokens ?? 0) / 1_000_000) * cacheWriteRate;
    const outputCost = ((input.outputTokens ?? 0) / 1_000_000) * pricing.output;

    await db.insert(aiCosts).values({
      userId: input.userId,
      aiModelId: input.model,
      aiQuery: input.query,
      inputTokens:
        (input.inputTokens ?? 0) +
        (input.cachedInputTokens ?? 0) +
        (input.cacheWriteTokens ?? 0),
      inputCost: inputCost.toFixed(6),
      outputTokens: input.outputTokens ?? 0,
      outputCost: outputCost.toFixed(6),
      totalCost: (inputCost + outputCost).toFixed(6),
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        _type: "ai_cost_log_error",
        model: input.model,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
