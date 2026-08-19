/** Verify the internal daily allowance: meter accumulation, percentage, warn
 *  threshold and the exhausted gate. Uses a throwaway user id and cleans up.
 *    npx tsx scripts/fin-ai-budget-check.ts */
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

async function main() {
  const {
    FIN_AI_DAILY_BUDGET_USD,
    FIN_AI_DAILY_BUDGET_MICRO_USD,
    FIN_AI_BUDGET_WARN_FRACTION,
    turnCostMicroUsd,
    toPublicUsage,
  } = await import("@/lib/fin-ai/constants");
  const { getDayUsage, recordTurnUsage } = await import("@/lib/fin-ai/usage");
  const { rawSql } = await import("@/lib/db");

  console.log(
    `budget: $${FIN_AI_DAILY_BUDGET_USD} = ${FIN_AI_DAILY_BUDGET_MICRO_USD} microUSD · warn at ${FIN_AI_BUDGET_WARN_FRACTION * 100}%`,
  );

  const userId = `__budget_check_${Date.now()}`;
  try {
    // Token counts taken from a measured cold turn on real data.
    const cold = turnCostMicroUsd(38441, 0, 1583);
    const cached = turnCostMicroUsd(600, 37853, 900);
    console.log(`measured cold turn: ${cold} microUSD · cached turn: ${cached} microUSD`);
    console.log(
      `=> a day allows ~${Math.floor(FIN_AI_DAILY_BUDGET_MICRO_USD / cold)} cold turns, or 1 cold + ~${Math.floor((FIN_AI_DAILY_BUDGET_MICRO_USD - cold) / cached)} cached follow-ups`,
    );

    const start = await getDayUsage(userId);
    console.log(`fresh user: pct=${start.pct} public=${JSON.stringify(toPublicUsage(start))}`);

    let turn = 0;
    let snap = start;
    while (snap.costMicroUsd < FIN_AI_DAILY_BUDGET_MICRO_USD && turn < 60) {
      turn += 1;
      snap = await recordTurnUsage(userId, {
        inputTokens: turn === 1 ? 38441 : 600,
        cachedInputTokens: turn === 1 ? 0 : 37853,
        outputTokens: turn === 1 ? 1583 : 900,
      });
      const gateOpen = snap.costMicroUsd < FIN_AI_DAILY_BUDGET_MICRO_USD;
      const warn = snap.pct >= FIN_AI_BUDGET_WARN_FRACTION * 100;
      if (turn <= 2 || warn || !gateOpen) {
        console.log(
          `turn ${turn}: cost=${snap.costMicroUsd} pct=${snap.pct.toFixed(1)}% requests=${snap.requestCount} warn=${warn} gate=${gateOpen ? "open" : "CLOSED"}`,
        );
      }
    }

    console.log(
      `\nallowance exhausted after ${turn} turns (1 cold + ${turn - 1} cached). pct clamps at ${snap.pct}.`,
    );
    console.log(`public payload sent to the browser: ${JSON.stringify(toPublicUsage(snap))}`);
  } finally {
    await rawSql`DELETE FROM fin_ai_chat_usage WHERE user_id = ${userId}`;
    console.log("cleaned up test rows");
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
