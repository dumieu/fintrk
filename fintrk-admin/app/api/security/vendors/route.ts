import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-admin";
import { logAdminAudit } from "@/lib/admin-audit";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const VENDORS = [
  { id: "neon", name: "Neon", purpose: "Postgres (household financial data)" },
  { id: "clerk", name: "Clerk", purpose: "Authentication (admin + user apps)" },
  { id: "vercel", name: "Vercel", purpose: "Hosting / crons" },
  { id: "stripe", name: "Stripe", purpose: "FinTRK Pro subscriptions" },
  { id: "google-ai", name: "Google AI / Gemini", purpose: "Statement AI + insights" },
] as const;

async function ensureAdminSettings(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

const patchSchema = z.object({
  vendorId: z.string().min(1),
  status: z.enum(["signed", "pending", "n_a", "not_required"]),
  dateSigned: z.string().nullable().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    await ensureAdminSettings();

    const rows = await sql`
      SELECT key, value FROM admin_settings WHERE key LIKE 'vendor_checklist:%'
    `;

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of rows as { key: string; value: Record<string, unknown> }[]) {
      const id = row.key.replace("vendor_checklist:", "");
      byId.set(id, row.value ?? {});
    }

    const vendors = VENDORS.map((v) => {
      const stored = byId.get(v.id) ?? {};
      return {
        id: v.id,
        name: v.name,
        purpose: v.purpose,
        status: (stored.status as string) ?? "pending",
        dateSigned: (stored.dateSigned as string | null) ?? null,
        notes: (stored.notes as string) ?? "",
      };
    });

    return NextResponse.json(
      { vendors },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[security/vendors] GET failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { vendorId, status, dateSigned, notes } = parsed.data;
    if (!VENDORS.some((v) => v.id === vendorId)) {
      return NextResponse.json({ error: "Unknown vendor" }, { status: 400 });
    }

    await ensureAdminSettings();
    const key = `vendor_checklist:${vendorId}`;
    const value = {
      status,
      dateSigned: dateSigned ?? null,
      notes: notes ?? "",
    };

    await sql`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;

    const audited = await logAdminAudit({
      adminIdentifier: gate.email || gate.userId,
      action: "vendor_checklist_update",
      resource: "admin_settings",
      detail: { vendorId, status, dateSigned: dateSigned ?? null },
    });
    if (!audited) {
      return NextResponse.json(
        {
          error: "Vendor checklist updated but audit log failed to persist",
          success: true,
          vendorId,
          ...value,
          auditFailed: true,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, vendorId, ...value });
  } catch (err) {
    console.error("[security/vendors] POST failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
