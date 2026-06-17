import "server-only";
import { sql } from "@/lib/db";

/**
 * Break-the-glass decryption sessions for the FinTRK admin app.
 *
 * Decryption of user data in the admin table browser is OFF by default. An
 * admin must explicitly start a time-boxed (12h) session with a written
 * reason; every decrypted read is audited. This mirrors BioTRK's admin model.
 */

export const SESSION_HOURS = 12;

export interface DecryptionSession {
  id: number;
  admin_email: string;
  admin_user_id: string | null;
  reason: string;
  started_at: string;
  expires_at: string;
  revoked: boolean;
  access_count: number;
}

let _tableReady = false;

export async function ensureDecryptionSessionTable(): Promise<void> {
  if (_tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS admin_decryption_sessions (
      id              SERIAL PRIMARY KEY,
      admin_email     TEXT NOT NULL,
      admin_user_id   TEXT,
      reason          TEXT NOT NULL,
      tables_accessed TEXT[] NOT NULL DEFAULT '{}',
      access_count    INTEGER NOT NULL DEFAULT 0,
      started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at      TIMESTAMPTZ NOT NULL,
      revoked         BOOLEAN NOT NULL DEFAULT false,
      revoked_at      TIMESTAMPTZ
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS admin_decrypt_sessions_active_idx
      ON admin_decryption_sessions (expires_at)
      WHERE revoked = false;
  `;
  _tableReady = true;
}

/** Returns the active (not revoked, not expired) session, or null. */
export async function getActiveDecryptionSession(): Promise<DecryptionSession | null> {
  await ensureDecryptionSessionTable();
  const rows = (await sql`
    SELECT id, admin_email, admin_user_id, reason, started_at, expires_at, revoked, access_count
    FROM admin_decryption_sessions
    WHERE revoked = false AND expires_at > now()
    ORDER BY started_at DESC
    LIMIT 1
  `) as DecryptionSession[];
  return rows[0] ?? null;
}

export async function createDecryptionSession(
  adminEmail: string,
  adminUserId: string | null,
  reason: string,
): Promise<DecryptionSession> {
  await ensureDecryptionSessionTable();
  // Revoke any prior active sessions first - only one at a time.
  await sql`
    UPDATE admin_decryption_sessions
    SET revoked = true, revoked_at = now()
    WHERE revoked = false
  `;
  const rows = (await sql`
    INSERT INTO admin_decryption_sessions (admin_email, admin_user_id, reason, expires_at)
    VALUES (${adminEmail}, ${adminUserId}, ${reason}, now() + (${SESSION_HOURS} || ' hours')::interval)
    RETURNING id, admin_email, admin_user_id, reason, started_at, expires_at, revoked, access_count
  `) as DecryptionSession[];
  console.log(
    JSON.stringify({
      _type: "fintrk_admin_audit",
      action: "decrypt_session_start",
      admin: adminEmail,
      reason,
      sessionId: rows[0]?.id,
      at: new Date().toISOString(),
    }),
  );
  return rows[0];
}

export async function revokeActiveDecryptionSession(adminEmail: string): Promise<void> {
  await ensureDecryptionSessionTable();
  await sql`
    UPDATE admin_decryption_sessions
    SET revoked = true, revoked_at = now()
    WHERE revoked = false
  `;
  console.log(
    JSON.stringify({
      _type: "fintrk_admin_audit",
      action: "decrypt_session_end",
      admin: adminEmail,
      at: new Date().toISOString(),
    }),
  );
}

/** Record that a decrypted read touched a table (best-effort audit trail). */
export async function trackSessionAccess(sessionId: number, table: string): Promise<void> {
  try {
    await sql`
      UPDATE admin_decryption_sessions
      SET access_count = access_count + 1,
          tables_accessed =
            CASE WHEN ${table} = ANY(tables_accessed) THEN tables_accessed
                 ELSE array_append(tables_accessed, ${table}) END
      WHERE id = ${sessionId}
    `;
  } catch {
    /* audit failure must never break a read */
  }
}
