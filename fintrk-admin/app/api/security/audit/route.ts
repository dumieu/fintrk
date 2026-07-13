import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-admin";
import { logAdminAudit } from "@/lib/admin-audit";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  action: z.string().min(1).max(128),
  resource: z.string().min(1).max(128),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const rows = await sql`
      SELECT id, admin_identifier, action, resource, detail, created_at
      FROM admin_audit_buffer
      ORDER BY created_at DESC
      LIMIT 200
    `;

    const items = (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      adminIdentifier: r.admin_identifier,
      action: r.action,
      resource: r.resource,
      detail: r.detail ?? {},
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
    }));

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[security/audit] GET failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    await logAdminAudit({
      adminIdentifier: gate.email || gate.userId,
      action: parsed.data.action,
      resource: parsed.data.resource,
      detail: parsed.data.detail,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[security/audit] POST failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
