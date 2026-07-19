import "server-only";
import { logAdminAudit } from "@/lib/admin-audit";
import { sql } from "@/lib/db";

/**
 * Break-the-glass decryption sessions for the FinTRK admin app.
 *
 * Decryption of user data in the admin table browser is OFF by default. An
 * admin must explicitly start a time-boxed (12h) session with a written
 * reason; every decrypted read is audited. Sessions are scoped to the
 * requesting admin so another admin cannot ride an open glass-break.
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

export interface DecryptionSessionOwner {
  email: string;
  userId: string;
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

/**
 * Returns the active session for this admin only (not revoked, not expired).
 * Other admins' glass-break sessions are invisible and cannot decrypt for them.
 */
export async function getActiveDecryptionSession(
  owner: DecryptionSessionOwner,
): Promise<DecryptionSession | null> {
  await ensureDecryptionSessionTable();
  const email = owner.email.trim().toLowerCase();
  const rows = (await sql`
    SELECT id, admin_email, admin_user_id, reason, started_at, expires_at, revoked, access_count
    FROM admin_decryption_sessions
    WHERE revoked = false
      AND expires_at > now()
      AND (
        lower(trim(admin_email)) = ${email}
        OR (admin_user_id IS NOT NULL AND admin_user_id = ${owner.userId})
      )
    ORDER BY started_at DESC
    LIMIT 1
  `) as DecryptionSession[];
  return rows[0] ?? null;
}

/**
 * Start a BTG session. Persists to admin_audit_buffer; if the audit row
 * cannot be written, the new session is revoked and this throws so callers
 * do not claim a glass-break without a durable trail.
 */
export async function createDecryptionSession(
  adminEmail: string,
  adminUserId: string | null,
  reason: string,
): Promise<DecryptionSession> {
  await ensureDecryptionSessionTable();
  const email = adminEmail.trim().toLowerCase();
  // Revoke this admin's prior active sessions only - other admins keep theirs.
  if (adminUserId) {
    await sql`
      UPDATE admin_decryption_sessions
      SET revoked = true, revoked_at = now()
      WHERE revoked = false
        AND (
          lower(trim(admin_email)) = ${email}
          OR admin_user_id = ${adminUserId}
        )
    `;
  } else {
    await sql`
      UPDATE admin_decryption_sessions
      SET revoked = true, revoked_at = now()
      WHERE revoked = false
        AND lower(trim(admin_email)) = ${email}
    `;
  }
  const rows = (await sql`
    INSERT INTO admin_decryption_sessions (admin_email, admin_user_id, reason, expires_at)
    VALUES (${email}, ${adminUserId}, ${reason}, now() + (${SESSION_HOURS} || ' hours')::interval)
    RETURNING id, admin_email, admin_user_id, reason, started_at, expires_at, revoked, access_count
  `) as DecryptionSession[];
  const session = rows[0];
  if (!session) {
    throw new Error("decrypt_session_insert_failed");
  }

  const audited = await logAdminAudit({
    adminIdentifier: email || adminUserId || "unknown",
    action: "decrypt_session_start",
    resource: "admin_decryption_sessions",
    detail: {
      sessionId: session.id,
      reason,
      sessionHours: SESSION_HOURS,
      expiresAt: session.expires_at,
    },
  });
  if (!audited) {
    await sql`
      UPDATE admin_decryption_sessions
      SET revoked = true, revoked_at = now()
      WHERE id = ${session.id}
    `;
    throw new Error("decrypt_session_audit_failed");
  }

  console.log(
    JSON.stringify({
      _type: "fintrk_admin_audit",
      action: "decrypt_session_start",
      admin: email,
      reason,
      sessionId: session.id,
      at: new Date().toISOString(),
    }),
  );
  return session;
}

export async function revokeActiveDecryptionSession(
  owner: DecryptionSessionOwner,
): Promise<{ revoked: boolean; auditFailed: boolean }> {
  await ensureDecryptionSessionTable();
  const email = owner.email.trim().toLowerCase();
  const active = await getActiveDecryptionSession(owner);
  if (!active) {
    return { revoked: false, auditFailed: false };
  }

  await sql`
    UPDATE admin_decryption_sessions
    SET revoked = true, revoked_at = now()
    WHERE id = ${active.id}
  `;

  const audited = await logAdminAudit({
    adminIdentifier: email || owner.userId || "unknown",
    action: "decrypt_session_end",
    resource: "admin_decryption_sessions",
    detail: {
      sessionId: active.id,
      accessCount: active.access_count,
      reason: active.reason,
    },
  });

  console.log(
    JSON.stringify({
      _type: "fintrk_admin_audit",
      action: "decrypt_session_end",
      admin: email,
      sessionId: active.id,
      at: new Date().toISOString(),
    }),
  );
  return { revoked: true, auditFailed: !audited };
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
