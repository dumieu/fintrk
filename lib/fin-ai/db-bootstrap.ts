import "server-only";
import { rawSql } from "@/lib/db";

/**
 * Idempotent bootstrap for the two tables the FinTRK AI chat owns. Mirrors the
 * `mcp_access_log` pattern so the feature works before a migration is applied.
 * Safe (and cheap) to call on every cold start; a module flag makes it a no-op
 * for the rest of the isolate's life.
 *
 * These are the ONLY tables the chat ever writes to, alongside the pre-existing
 * `ai_costs` ledger. No FinTRK financial table is ever mutated by the AI.
 */

let _ready = false;
let _inflight: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  // Per-user, per-UTC-day token + cost meter that backs the daily allowance.
  await rawSql`
    CREATE TABLE IF NOT EXISTS fin_ai_chat_usage (
      user_id VARCHAR(255) NOT NULL,
      day VARCHAR(10) NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      cost_micro_usd INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fin_ai_chat_usage_pkey PRIMARY KEY (user_id, day)
    )`;

  await rawSql`
    CREATE INDEX IF NOT EXISTS fin_ai_chat_usage_user_idx
      ON fin_ai_chat_usage (user_id)`;

  // Rendered financial digest, keyed by a fingerprint of the user's data. A hit
  // skips the whole aggregation pass AND guarantees byte-identical prompt bytes,
  // which is what keeps GPT-5.6 prompt caching billing at the cached rate.
  await rawSql`
    CREATE TABLE IF NOT EXISTS fin_ai_digest_cache (
      user_id VARCHAR(255) PRIMARY KEY,
      fingerprint VARCHAR(32) NOT NULL,
      window_start VARCHAR(10) NOT NULL,
      digest TEXT NOT NULL,
      char_count INTEGER NOT NULL DEFAULT 0,
      compression_tier SMALLINT NOT NULL DEFAULT 0,
      built_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

  _ready = true;
}

export async function ensureFinAiTables(): Promise<void> {
  if (_ready) return;
  if (!_inflight) {
    _inflight = bootstrap().finally(() => {
      _inflight = null;
    });
  }
  return _inflight;
}
