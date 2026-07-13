import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function normalizeColumnNames(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((x): x is string => typeof x === "string");
  }
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      /* not JSON */
    }
  }
  return [];
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const rows = await sql`
      SELECT
        s.relname AS name,
        ROUND((pg_total_relation_size(s.relid)::numeric / 1048576))::int AS size_mb,
        GREATEST(s.n_live_tup, 0)::int AS rows,
        (
          SELECT COUNT(*)::int
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = s.relname
        ) AS columns,
        COALESCE(s.last_autoanalyze, s.last_analyze) AS last_updated,
        COALESCE(
          (
            SELECT json_agg(c.column_name ORDER BY c.ordinal_position)
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = s.relname
          ),
          '[]'::json
        ) AS column_names
      FROM pg_stat_user_tables s
      WHERE s.schemaname = 'public'
      ORDER BY s.relname
    `;

    const result = (
      rows as {
        name: string;
        size_mb: number;
        rows: number;
        columns: number;
        last_updated: string | null;
        column_names: string[] | null;
      }[]
    ).map((r) => ({
      name: r.name,
      size_mb: Number.isFinite(r.size_mb) ? r.size_mb : 0,
      rows: r.rows,
      columns: r.columns,
      last_updated: r.last_updated ? new Date(r.last_updated).toISOString() : null,
      column_names: normalizeColumnNames(r.column_names),
    }));

    return NextResponse.json(result);
  } catch (e) {
    console.error("Neon tables API error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
