import "server-only";
import { db } from "@/lib/db";
import { aiCosts } from "@/lib/db/schema";

interface AiCostInput {
  userId: string;
  model: string;
  query: string;
  inputTokens?: number;
  outputTokens?: number;
}

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.0-flash": { input: 0.10, output: 0.40 },
  "gemini-2.5-flash-lite": { input: 0.075, output: 0.30 },
  "gemini-2.5-flash": { input: 0.15, output: 0.60 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
};

export async function logAiCost(input: AiCostInput): Promise<void> {
  try {
    const pricing = MODEL_PRICING[input.model] ?? { input: 0.10, output: 0.40 };
    const inputCost = ((input.inputTokens ?? 0) / 1_000_000) * pricing.input;
    const outputCost = ((input.outputTokens ?? 0) / 1_000_000) * pricing.output;

    await db.insert(aiCosts).values({
      userId: input.userId,
      aiModelId: input.model,
      aiQuery: input.query,
      inputTokens: input.inputTokens ?? 0,
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
