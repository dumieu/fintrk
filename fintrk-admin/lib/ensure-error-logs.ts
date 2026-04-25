import "server-only";
import { sql } from "@/lib/db";

let _ensured: Promise<void> | null = null;

/**
 * Idempotently creates the `error_logs` table the first time the admin app
 * needs it. The user app does not write to this table today; this is here so
 * the Errors page can persist resolution state and so future user-app
 * instrumentation has a stable target schema.
 */
export function ensureErrorLogsTable(): Promise<void> {
  if (_ensured) return _ensured;
  _ensured = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS error_logs (
        id              SERIAL PRIMARY KEY,
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
    await sql`CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON error_logs (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS error_logs_user_idx ON error_logs (clerk_user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS error_logs_resolved_idx ON error_logs (resolved_at) WHERE resolved_at IS NULL`;
  })().catch((e) => {
    _ensured = null;
    throw e;
  });
  return _ensured;
}
