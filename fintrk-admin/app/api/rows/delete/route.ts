import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function getValidTables(): Promise<string[]> {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  return tables.map((t) => t.table_name);
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { table, primaryKey, primaryValue } = await request.json();

    if (!table || !primaryKey || primaryValue === undefined) {
      return NextResponse.json(
        { error: "Table, primaryKey, and primaryValue required" },
        { status: 400 }
      );
    }

    const validTables = await getValidTables();
    if (!validTables.includes(table)) {
      return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
    }

    if (typeof primaryKey !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(primaryKey)) {
      return NextResponse.json({ error: "Invalid primaryKey" }, { status: 400 });
    }

    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${primaryKey}
    `;
    if (cols.length === 0) {
      return NextResponse.json({ error: "Invalid primaryKey" }, { status: 400 });
    }

    const query = `DELETE FROM "${table}" WHERE "${primaryKey}" = $1 RETURNING *`;
    const result = await sql.query(query, [primaryValue]);

    if (result.length === 0) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: result[0] });
  } catch (error) {
    console.error("DELETE error:", error);
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("violates foreign key constraint")) {
      const match = msg.match(/on table "(\w+)"/);
      const refTable = match?.[1];
      return NextResponse.json(
        {
          error: `Cannot delete: referenced by ${
            refTable ? `"${refTable}"` : "another table"
          }. Delete dependent rows first.`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Failed to delete row" }, { status: 500 });
  }
}
