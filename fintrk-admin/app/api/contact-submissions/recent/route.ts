import { NextResponse } from "next/server";

import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const rows = await sql`
      SELECT id, full_name, email, country, message, created_at
      FROM contact_submissions
      ORDER BY created_at DESC
      LIMIT 5
    `;

    const result = (rows as Record<string, unknown>[]).map((row) => ({
      id_submission: row.id,
      full_name: row.full_name,
      email: row.email,
      country: row.country,
      message: row.message,
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    }));

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("Recent contact submissions error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
