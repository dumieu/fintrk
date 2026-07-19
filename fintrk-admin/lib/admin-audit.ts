import { sql } from "@/lib/db";

/** Ensure the audit buffer exists (Security page + mutation audit trail). */
export async function ensureAdminAuditBuffer(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS admin_audit_buffer (
      id TEXT PRIMARY KEY,
      admin_identifier TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

/**
 * Persist an audit row. Returns false on failure (callers that must not lie
 * about success should check; soft callers may ignore).
 */
export async function logAdminAudit(opts: {
  adminIdentifier: string;
  action: string;
  resource: string;
  detail?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    await ensureAdminAuditBuffer();
    await sql`
      INSERT INTO admin_audit_buffer (id, admin_identifier, action, resource, detail, created_at)
      VALUES (
        ${crypto.randomUUID()},
        ${opts.adminIdentifier},
        ${opts.action},
        ${opts.resource},
        ${JSON.stringify(opts.detail ?? {})}::jsonb,
        NOW()
      )
    `;
    return true;
  } catch (err) {
    console.error("[admin-audit] failed to persist:", err);
    return false;
  }
}

export function extractRequestMeta(request: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const fwd = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  return {
    ipAddress: fwd || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent") || null,
  };
}
