import { sql } from "@/lib/db";

export async function logAdminAudit(opts: {
  adminIdentifier: string;
  action: string;
  resource: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
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
  } catch (err) {
    console.error("[admin-audit] failed to persist:", err);
  }
}

export function extractRequestMeta(request: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const fwd = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return {
    ipAddress: fwd || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent") || null,
  };
}
