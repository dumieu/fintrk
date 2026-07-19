import "server-only";
import { sql } from "@/lib/db";

let _ensured: Promise<void> | null = null;

/**
 * Idempotently creates the `error_logs` table the first time the admin app
 * needs it. Aligns with FinTRK user-app Drizzle (`text` / UUID id).
 *
 * If an older branch still has SERIAL/integer `id`, rebuilds the table so
 * UUID inserts from the user app succeed. CREATE IF NOT EXISTS alone cannot
 * rewrite an existing PK type.
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

    const idCols = await sql`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'error_logs'
        AND column_name = 'id'
    `;
    const idType = String(idCols[0]?.data_type ?? "").toLowerCase();
    if (idType === "integer" || idType === "bigint" || idType === "smallint") {
      console.warn(
        "[ensure-error-logs] Migrating error_logs.id from",
        idType,
        "to TEXT for UUID compatibility",
      );
      await sql`DROP TABLE IF EXISTS error_logs_id_migrate`;
      await sql`
        CREATE TABLE error_logs_id_migrate (
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
      await sql`
        INSERT INTO error_logs_id_migrate (
          id, clerk_user_id, error_context, error_message, error_code,
          severity, pathname, ip_address, user_agent, metadata,
          created_at, resolved_at, resolved_comment
        )
        SELECT
          id::text, clerk_user_id, error_context, error_message, error_code,
          severity, pathname, ip_address, user_agent, metadata,
          created_at, resolved_at, resolved_comment
        FROM error_logs
      `;
      await sql`DROP TABLE error_logs`;
      await sql`ALTER TABLE error_logs_id_migrate RENAME TO error_logs`;
    }

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
