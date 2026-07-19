import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
import { adminRowFields } from "@/lib/crypto/phi-response";
import { getActiveDecryptionSession } from "@/lib/decryption-session";
import { isMutationProtectedTable } from "@/lib/protected-tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function getValidTables(): Promise<string[]> {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  return tables.map((t) => t.table_name);
}

async function getRealPrimaryKey(tableName: string): Promise<string | null> {
  const pk = await sql`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = ${tableName}
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `;
  if (pk.length !== 1) return null;
  return pk[0].column_name as string;
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
    if (isMutationProtectedTable(table)) {
      return NextResponse.json(
        { error: "table_mutations_forbidden" },
        { status: 403 },
      );
    }

    if (typeof primaryKey !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(primaryKey)) {
      return NextResponse.json({ error: "Invalid primaryKey" }, { status: 400 });
    }

    const realPk = await getRealPrimaryKey(table);
    if (!realPk) {
      return NextResponse.json(
        { error: "Table has no single-column primary key" },
        { status: 400 },
      );
    }
    if (primaryKey !== realPk) {
      return NextResponse.json({ error: "Invalid primaryKey" }, { status: 400 });
    }

    const query = `DELETE FROM "${table}" WHERE "${primaryKey}" = $1 RETURNING *`;
    const result = await sql.query(query, [primaryValue]);

    if (result.length === 0) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }
    if (result.length > 1) {
      console.error("POST rows/delete matched multiple rows for PK", table, primaryKey);
      return NextResponse.json({ error: "ambiguous_primary_key" }, { status: 409 });
    }

    const session = await getActiveDecryptionSession({
      email: gate.email,
      userId: gate.userId,
    });
    const deleted = adminRowFields(
      table,
      result[0] as Record<string, unknown>,
      Boolean(session),
    );
    return NextResponse.json({ deleted });
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
