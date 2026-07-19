import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
import { extractRequestMeta, logAdminAudit } from "@/lib/admin-audit";
import { ensureErrorLogsTable } from "@/lib/ensure-error-logs";

export const dynamic = "force-dynamic";

/** Mark an `error_logs` row as resolved. Statement / file_upload errors live
 *  in their own tables and aren't mutated here. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  await ensureErrorLogsTable();
  const { id } = await context.params;
  const colon = id.indexOf(":");
  const kind = colon >= 0 ? id.slice(0, colon) : "";
  const raw = colon >= 0 ? id.slice(colon + 1) : "";
  // User app writes UUID text ids (Drizzle); never parseInt - that rejects
  // UUIDs and can truncate digit-prefixed ids.
  if (kind !== "log" || !raw || raw.length > 128) {
    return NextResponse.json({ error: "only error_log rows can be resolved" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { comment?: string };
  const comment = (body.comment ?? "").slice(0, 500) || null;

  const res = await sql`
    UPDATE error_logs
    SET resolved_at = NOW(), resolved_comment = ${comment}
    WHERE id::text = ${raw}
    RETURNING id, resolved_at, resolved_comment
  `;
  if (res.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const meta = extractRequestMeta(request);
  const audited = await logAdminAudit({
    adminIdentifier: gate.email || gate.userId,
    action: "error_log_resolve",
    resource: "error_logs",
    detail: {
      errorLogId: raw,
      comment,
      ip: meta.ipAddress,
      ua: meta.userAgent,
    },
  });
  if (!audited) {
    return NextResponse.json(
      {
        error: "Error marked resolved but audit log failed to persist",
        ok: true,
        row: res[0],
        auditFailed: true,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, row: res[0] });
}
