/**
 * Local diagnostic: run real chat turns against GPT-5.6 Luna with a real digest
 * and report the token split, so caching and cost can be verified before shipping.
 *   npx tsx scripts/fin-ai-chat-probe.ts [userId]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Module } from "module";
const origResolve = (
  Module as unknown as { _resolveFilename: (...a: unknown[]) => string }
)._resolveFilename;
(
  Module as unknown as { _resolveFilename: (...a: unknown[]) => string }
)._resolveFilename = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return require.resolve("./_noop-server-only.cjs");
  return origResolve.call(this, request, ...rest);
};

const QUESTIONS = [
  "Write me a realistic monthly budget I can actually stick to.",
  "Which recurring charges should I cancel first, and what does it save me a year?",
  "Save this plan into FinTRK for me.",
];

async function main() {
  const { db } = await import("@/lib/db");
  const { transactions } = await import("@/lib/db/schema");
  const { buildDigest, loadFinancialSnapshot, resolveWindow } = await import(
    "@/lib/fin-ai/digest"
  );
  const { streamGenerateContent } = await import("@/lib/fin-ai/openai");
  type ChatTurn = import("@/lib/fin-ai/openai").ChatTurn;
  const { SYSTEM_INSTRUCTION } = await import("@/lib/fin-ai/prompt");
  const { turnCostMicroUsd, FIN_AI_DAILY_BUDGET_MICRO_USD } = await import(
    "@/lib/fin-ai/constants"
  );
  const { sql } = await import("drizzle-orm");

  let userId = process.argv[2];
  if (!userId) {
    const rows = await db
      .select({ userId: transactions.userId, n: sql<number>`COUNT(*)::int` })
      .from(transactions)
      .groupBy(transactions.userId)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(1);
    userId = rows[0]!.userId;
  }

  const window = resolveWindow();
  const digest = buildDigest(await loadFinancialSnapshot(userId, window));
  const today = new Date().toISOString().slice(0, 10);

  const history: ChatTurn[] = [];
  let totalMicro = 0;

  for (const q of QUESTIONS) {
    history.push({ role: "user", content: q });
    const t0 = Date.now();
    const res = await streamGenerateContent(
      {
        systemInstruction: SYSTEM_INSTRUCTION,
        digest: digest.text,
        today,
        history,
        promptCacheKey: `fin-ai-probe:${userId}`,
      },
      () => {},
    );
    history.push({ role: "assistant", content: res.text });

    const cached = res.usage.cachedContentTokenCount ?? 0;
    const written = res.usage.cacheWriteTokenCount ?? 0;
    const input = Math.max(0, res.usage.promptTokenCount - cached - written);
    const output = res.usage.candidatesTokenCount;
    const micro = turnCostMicroUsd(input, cached, output, written);
    totalMicro += micro;

    console.log("\n" + "=".repeat(78));
    console.log(`Q: ${q}`);
    const spaceRuns = (res.text.match(/ {4,}/g) ?? []).reduce((s, r) => s + r.length, 0);
    console.log(
      `prompt ${res.usage.promptTokenCount} (cached ${cached} · write ${written}) · output ${output} · reasoning ${res.usage.thoughtsTokenCount} · ${micro} microUSD · ${Date.now() - t0}ms · finish ${res.finishReason} · chars ${res.text.length} · padding-spaces ${spaceRuns}`,
    );
    console.log("-".repeat(78));
    console.log(res.text);
  }

  console.log("\n" + "=".repeat(78));
  console.log(
    `TOTAL ${totalMicro} microUSD ($${(totalMicro / 1_000_000).toFixed(5)}) for ${QUESTIONS.length} turns · ${((totalMicro / FIN_AI_DAILY_BUDGET_MICRO_USD) * 100).toFixed(1)}% of the ${FIN_AI_DAILY_BUDGET_MICRO_USD} microUSD daily allowance`,
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
