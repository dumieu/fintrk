import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
import { parseLimitParam } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function getValidTables(): Promise<string[]> {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  return tables.map((t) => t.table_name);
}

async function getColumnInfo(tableName: string, columnName: string) {
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${columnName}
  `;
  return cols[0] || null;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");
    const column = searchParams.get("column");
    const limit = parseLimitParam(searchParams.get("limit"), 500, 1000);

    if (!table || !column) {
      return NextResponse.json(
        { error: "Table and column required" },
        { status: 400 }
      );
    }

    const validTables = await getValidTables();
    if (!validTables.includes(table)) {
      return NextResponse.json(
        { error: "Invalid table name" },
        { status: 400 }
      );
    }

    const colInfo = await getColumnInfo(table, column);
    if (!colInfo) {
      return NextResponse.json(
        { error: "Invalid column name" },
        { status: 400 }
      );
    }

    const query = `
      SELECT DISTINCT "${column}"::text AS value
      FROM "${table}"
      ORDER BY 1 NULLS LAST
      LIMIT $1
    `;
    const result = await sql.query(query, [limit + 1]);

    const values: string[] = [];
    let hasNull = false;
    for (const r of result) {
      if (r.value === null) {
        hasNull = true;
      } else {
        values.push(r.value);
      }
    }

    return NextResponse.json({
      values,
      hasNull,
      total: values.length + (hasNull ? 1 : 0),
    });
  } catch (error) {
    console.error("GET column values error:", error);
    return NextResponse.json(
      { error: "Failed to fetch column values" },
      { status: 500 }
    );
  }
}
