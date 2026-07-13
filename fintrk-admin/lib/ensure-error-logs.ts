import "server-only";
import { sql } from "@/lib/db";

let _ensured: Promise<void> | null = null;

/**
 * Idempotently creates the `error_logs` table the first time the admin app
 * needs it. Aligns with FinTRK user-app Drizzle (`text` / UUID id). CREATE IF
 * NOT EXISTS is a no-op when the user app already created the table; ADD
 * COLUMN covers resolve-column drift on older SERIAL tables.
 */
export function ensureErrorLogsTable(): Promise<void> {
  if (_ensured) return _ensured;
  _ensured = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS error_logs (
        id              TEXT PRIMARY KEY,
        clerk_user_id   VARCHAR(255),
        error_context   VARCHAR(255) NOT NULL,
        error_message   TEXT         NOT NULL,
        error_code      VARCHAR(64),
        severity        VARCHAR(16)  NOT NULL DEFAULT 'error',
        pathname        TEXT,
        ip_address      VARCHAR(64),
        user_agent      TEXT,
        metadata        JSONB,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ,
        resolved_comment TEXT
      )
    `;
    await sql`ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`;
    await sql`ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS resolved_comment TEXT`;
    await sql`CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON error_logs (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS error_logs_user_idx ON error_logs (clerk_user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS error_logs_resolved_idx ON error_logs (resolved_at) WHERE resolved_at IS NULL`;
  })().catch((e) => {
    _ensured = null;
    throw e;
  });
  return _ensured;
}
