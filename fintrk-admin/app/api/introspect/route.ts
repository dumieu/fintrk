import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: 401 });
  }

  try {
    const singleTable = new URL(request.url).searchParams.get("table");
    const tableFilter = singleTable ? sql`AND t.table_name = ${singleTable}` : sql``;

    const [allColumns, allPKs, allFKs, allCounts] = await Promise.all([
      sql`
        SELECT
          table_name, column_name, data_type, udt_name,
          is_nullable, column_default,
          character_maximum_length, numeric_precision,
          numeric_scale, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (
            SELECT t.table_name FROM information_schema.tables t
            WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' ${tableFilter}
          )
        ORDER BY table_name, ordinal_position
      `,
      sql`
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name IN (
            SELECT t.table_name FROM information_schema.tables t
            WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' ${tableFilter}
          )
      `,
      sql`
        SELECT
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table,
          ccu.column_name AS foreign_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name IN (
            SELECT t.table_name FROM information_schema.tables t
            WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' ${tableFilter}
          )
      `,
      sql`
        SELECT
          s.relname AS table_name,
          GREATEST(s.n_live_tup, 0)::int AS row_count
        FROM pg_stat_user_tables s
        WHERE s.schemaname = 'public'
        ${singleTable ? sql`AND s.relname = ${singleTable}` : sql``}
        ORDER BY s.relname
      `,
    ]);

    const columnsByTable = new Map<string, typeof allColumns>();
    for (const c of allColumns) {
      const arr = columnsByTable.get(c.table_name) ?? [];
      arr.push(c);
      columnsByTable.set(c.table_name, arr);
    }
    const pkByTable = new Map<string, string>();
    for (const pk of allPKs) pkByTable.set(pk.table_name, pk.column_name);
    const fksByTable = new Map<string, typeof allFKs>();
    for (const fk of allFKs) {
      const arr = fksByTable.get(fk.table_name) ?? [];
      arr.push(fk);
      fksByTable.set(fk.table_name, arr);
    }
    const countByTable = new Map<string, number>();
    for (const c of allCounts) countByTable.set(c.table_name, c.row_count);

    const tableNames = Array.from(columnsByTable.keys()).sort();
    const result = tableNames.map((name) => ({
      name,
      columns: (columnsByTable.get(name) ?? []).map((c) => ({
        name: c.column_name,
        type: c.data_type,
        udtName: c.udt_name,
        nullable: c.is_nullable === "YES",
        default: c.column_default,
        maxLength: c.character_maximum_length,
        precision: c.numeric_precision,
        scale: c.numeric_scale,
        position: c.ordinal_position,
      })),
      primaryKey: pkByTable.get(name) ?? null,
      foreignKeys: (fksByTable.get(name) ?? []).map((f) => ({
        column: f.column_name,
        targetTable: f.foreign_table,
        targetColumn: f.foreign_column,
      })),
      rowCount: countByTable.get(name) ?? 0,
    }));

    return NextResponse.json({ tables: result });
  } catch (e) {
    console.error("Introspect error:", e);
    return NextResponse.json({ error: "introspect_failed" }, { status: 500 });
  }
}
