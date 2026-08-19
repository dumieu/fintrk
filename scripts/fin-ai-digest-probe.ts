/**
 * Local diagnostic: build the Fin AI digest for a user and report its size,
 * byte-stability and cache behaviour.
 *   npx tsx scripts/fin-ai-digest-probe.ts [userId] [--print]
 *
 * Side effect: clears the user's row in fin_ai_digest_cache so the cold path
 * can be timed. That row is a derived cache and rebuilds on the next request;
 * no financial data is touched.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

// Stub `server-only` so the real modules import cleanly under tsx/node.
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
  const { db } = await import("@/lib/db");
  const { transactions } = await import("@/lib/db/schema");
  const { buildDigest, loadFinancialSnapshot, resolveWindow } = await import(
    "@/lib/fin-ai/digest"
  );
  const { sql } = await import("drizzle-orm");

  let userId = process.argv[2];
  if (!userId || userId.startsWith("--")) {
    const rows = await db
      .select({ userId: transactions.userId, n: sql<number>`COUNT(*)::int` })
      .from(transactions)
      .groupBy(transactions.userId)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(1);
    userId = rows[0]?.userId;
    console.log(`auto-selected busiest user: ${userId} (${rows[0]?.n} txns)`);
  }
  if (!userId) throw new Error("no user with transactions");

  const window = resolveWindow();
  const t0 = Date.now();
  const snap = await loadFinancialSnapshot(userId, window);
  const loadMs = Date.now() - t0;
  const t1 = Date.now();
  const built = buildDigest(snap);
  const buildMs = Date.now() - t1;

  // Determinism: identical input must produce identical bytes, or implicit
  // caching never hits.
  const again = buildDigest(await loadFinancialSnapshot(userId, window));
  const stable = again.text === built.text;

  console.log({
    window: `${window.start} .. ${window.months.at(-1)}`,
    txnsInWindow: snap.txns.length,
    accounts: snap.accounts.length,
    recurring: snap.recurring.length,
    chars: built.charCount,
    approxTokens: Math.round(built.charCount / 4),
    tier: built.tier,
    loadMs,
    buildMs,
    byteStable: stable,
  });

  // Exercise the real cache path: build -> Postgres -> in-isolate memo.
  const { getDigest } = await import("@/lib/fin-ai/cache");
  const { rawSql } = await import("@/lib/db");
  await rawSql`DELETE FROM fin_ai_digest_cache WHERE user_id = ${userId}`;
  for (const label of ["cold", "warm-db", "warm-memo"]) {
    const t = Date.now();
    const r = await getDigest(userId);
    console.log(
      `cache ${label}: source=${r.source} chars=${r.charCount} tier=${r.tier} ${Date.now() - t}ms match=${r.text === built.text}`,
    );
  }

  if (process.argv.includes("--print")) console.log("\n" + built.text);
  else console.log("\n" + built.text.split("\n").slice(0, 40).join("\n"));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
