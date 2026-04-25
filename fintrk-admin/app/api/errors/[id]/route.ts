import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
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
  const [kind, raw] = id.split(":");
  if (kind !== "log" || !raw) {
    return NextResponse.json({ error: "only error_log rows can be resolved" }, { status: 400 });
  }
  const numericId = Number.parseInt(raw, 10);
  if (!Number.isFinite(numericId)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { comment?: string };
  const comment = (body.comment ?? "").slice(0, 500) || null;

  const res = await sql`
    UPDATE error_logs
    SET resolved_at = NOW(), resolved_comment = ${comment}
    WHERE id = ${numericId}
    RETURNING id, resolved_at, resolved_comment
  `;
  if (res.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, row: res[0] });
}
