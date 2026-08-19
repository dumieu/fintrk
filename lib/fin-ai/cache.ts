import "server-only";
import { createHash } from "node:crypto";

import { rawSql } from "@/lib/db";
import { ensureFinAiTables } from "@/lib/fin-ai/db-bootstrap";
import { buildDigest, loadFinancialSnapshot, resolveWindow } from "@/lib/fin-ai/digest";

/**
 * Two-layer cache in front of the financial digest.
 *
 * Layer 1 - in-isolate memo: a warm serverless instance answers follow-up turns
 * with zero database work.
 * Layer 2 - Postgres (`fin_ai_digest_cache`): survives cold starts, so a user
 * returning tomorrow still skips the aggregation pass if nothing changed.
 *
 * Both layers are keyed on a fingerprint: one probe query that reads row counts
 * and max(updated_at) across every table the digest draws from. If the ledger,
 * accounts, budgets, goals, net worth, categories, or ignore rules changed, the
 * fingerprint changes and the digest is rebuilt. Otherwise the cached bytes are
 * reused verbatim - which matters twice over, because identical bytes are also
 * what makes GPT-5.6 prompt caching bill the digest prefix at the cached rate.
 *
 * The probe is a single round trip of scalar subqueries; it costs far less than
 * the ledger read it avoids.
 */

/**
 * Bump when the digest renderer changes shape. Old cached rows then miss and
 * get rebuilt, instead of serving text the current prompt no longer matches.
 */
const DIGEST_SCHEMA_VERSION = "v1";

/** In-isolate memo lifetime. Short enough that an edit shows up quickly. */
const MEMO_TTL_MS = 5 * 60_000;

/**
 * Hard ceiling on how old a persisted digest may be. The fingerprint catches
 * everything with a timestamp, but a few edits leave no trace it can see (a
 * category rename, for instance). A daily rebuild bounds that staleness.
 */
const DB_CACHE_MAX_AGE_HOURS = 24;

interface MemoEntry {
  fingerprint: string;
  digest: string;
  tier: number;
  charCount: number;
  expiresAt: number;
}

const memo = new Map<string, MemoEntry>();

/** Keeps a long-lived isolate from accumulating digests for many users. */
function trimMemo() {
  if (memo.size <= 64) return;
  const now = Date.now();
  for (const [key, entry] of memo) {
    if (entry.expiresAt <= now) memo.delete(key);
  }
  while (memo.size > 64) {
    const oldest = memo.keys().next().value;
    if (oldest === undefined) break;
    memo.delete(oldest);
  }
}

/**
 * One round trip that captures "has anything the digest depends on changed?".
 * Counts catch deletions; max(updated_at) catches edits; both together catch
 * an edit-plus-delete that happens to preserve the count.
 */
async function computeFingerprint(userId: string, windowStart: string): Promise<string> {
  const rows = (await rawSql`
    SELECT
      (SELECT COUNT(*) FROM transactions
        WHERE user_id = ${userId} AND posted_date >= ${windowStart})            AS txn_count,
      (SELECT COALESCE(MAX(updated_at)::text, '') FROM transactions
        WHERE user_id = ${userId} AND posted_date >= ${windowStart})            AS txn_updated,
      (SELECT COUNT(*) FROM transactions WHERE user_id = ${userId})             AS txn_total,
      (SELECT COALESCE(MAX(updated_at)::text, '') FROM accounts
        WHERE user_id = ${userId})                                              AS acct_updated,
      (SELECT COUNT(*) FROM accounts WHERE user_id = ${userId})                 AS acct_count,
      (SELECT COALESCE(MAX(updated_at)::text, '') FROM recurring_patterns
        WHERE user_id = ${userId})                                              AS rec_updated,
      (SELECT COUNT(*) FROM recurring_patterns WHERE user_id = ${userId})       AS rec_count,
      (SELECT COALESCE(MAX(updated_at)::text, '') FROM net_worth_items
        WHERE user_id = ${userId})                                              AS nw_updated,
      (SELECT COUNT(*) FROM net_worth_items WHERE user_id = ${userId})          AS nw_count,
      (SELECT COALESCE(MAX(updated_at)::text, '') FROM net_worth_settings
        WHERE user_id = ${userId})                                              AS nws_updated,
      (SELECT COALESCE(MAX(updated_at)::text, '') FROM budgets
        WHERE user_id = ${userId})                                              AS bud_updated,
      (SELECT COUNT(*) FROM budgets WHERE user_id = ${userId})                  AS bud_count,
      (SELECT COALESCE(MAX(updated_at)::text, '') FROM goals
        WHERE user_id = ${userId})                                              AS goal_updated,
      (SELECT COUNT(*) FROM goals WHERE user_id = ${userId})                    AS goal_count,
      (SELECT COUNT(*) FROM transaction_ignores WHERE user_id = ${userId})      AS ign_count,
      (SELECT COALESCE(MAX(created_at)::text, '') FROM transaction_ignores
        WHERE user_id = ${userId})                                              AS ign_updated,
      (SELECT COUNT(*) FROM user_categories WHERE user_id = ${userId})          AS cat_count,
      (SELECT COALESCE(MAX(updated_at)::text, '') FROM users
        WHERE clerk_user_id = ${userId})                                        AS user_updated
  `) as Array<Record<string, unknown>>;

  const row = rows[0] ?? {};
  const parts = [
    DIGEST_SCHEMA_VERSION,
    windowStart,
    ...Object.keys(row)
      .sort()
      .map((k) => `${k}=${String(row[k] ?? "")}`),
  ];
  return createHash("md5").update(parts.join("|")).digest("hex");
}

export interface DigestResult {
  text: string;
  tier: number;
  charCount: number;
  /** Where the bytes came from - logged, never shown to the user. */
  source: "memo" | "db" | "built";
  windowStart: string;
}

/**
 * The digest for this user, from the cheapest layer that still has valid bytes.
 * Read-only with respect to financial data; the only write is the digest cache
 * row, which contains no data the user did not already own.
 */
export async function getDigest(userId: string): Promise<DigestResult> {
  await ensureFinAiTables();
  const window = resolveWindow();
  const fingerprint = await computeFingerprint(userId, window.start);

  const hit = memo.get(userId);
  if (hit && hit.fingerprint === fingerprint && hit.expiresAt > Date.now()) {
    return {
      text: hit.digest,
      tier: hit.tier,
      charCount: hit.charCount,
      source: "memo",
      windowStart: window.start,
    };
  }

  const cached = (await rawSql`
    SELECT digest, char_count, compression_tier
      FROM fin_ai_digest_cache
     WHERE user_id = ${userId}
       AND fingerprint = ${fingerprint}
       AND window_start = ${window.start}
       AND built_at > NOW() - (${DB_CACHE_MAX_AGE_HOURS} * INTERVAL '1 hour')
     LIMIT 1
  `) as Array<{ digest: string; char_count: number; compression_tier: number }>;

  if (cached[0]?.digest) {
    const row = cached[0];
    memo.set(userId, {
      fingerprint,
      digest: row.digest,
      tier: row.compression_tier ?? 0,
      charCount: row.char_count ?? row.digest.length,
      expiresAt: Date.now() + MEMO_TTL_MS,
    });
    trimMemo();
    return {
      text: row.digest,
      tier: row.compression_tier ?? 0,
      charCount: row.char_count ?? row.digest.length,
      source: "db",
      windowStart: window.start,
    };
  }

  const snapshot = await loadFinancialSnapshot(userId, window);
  const built = buildDigest(snapshot);

  memo.set(userId, {
    fingerprint,
    digest: built.text,
    tier: built.tier,
    charCount: built.charCount,
    expiresAt: Date.now() + MEMO_TTL_MS,
  });
  trimMemo();

  // Best-effort persist: a failed cache write must never fail a chat turn.
  try {
    await rawSql`
      INSERT INTO fin_ai_digest_cache
        (user_id, fingerprint, window_start, digest, char_count, compression_tier, built_at)
      VALUES (${userId}, ${fingerprint}, ${window.start}, ${built.text},
              ${built.charCount}, ${built.tier}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        fingerprint = EXCLUDED.fingerprint,
        window_start = EXCLUDED.window_start,
        digest = EXCLUDED.digest,
        char_count = EXCLUDED.char_count,
        compression_tier = EXCLUDED.compression_tier,
        built_at = NOW()`;
  } catch {
    // Ignored on purpose: the digest is already in hand for this turn.
  }

  return {
    text: built.text,
    tier: built.tier,
    charCount: built.charCount,
    source: "built",
    windowStart: window.start,
  };
}
