import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
import { isEncrypted } from "@/lib/crypto/encryption";
import { encryptedColumnsFor } from "@/lib/crypto/encrypted-fields";
import { phiTextForAdminResponse } from "@/lib/crypto/phi-response";
import { getActiveDecryptionSession, trackSessionAccess } from "@/lib/decryption-session";
import { isSecretsRedactColumn } from "@/lib/protected-tables";
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

    // Never dump MCP hashes or statement upload blobs into filter chips.
    if (isSecretsRedactColumn(table, column)) {
      return NextResponse.json({ values: [], hasNull: false, total: 0 });
    }

    // Null presence is a separate EXISTS: ORDER BY … NULLS LAST + LIMIT never
    // reaches the null row when distinct non-nulls fill the page.
    const valuesQuery = `
      SELECT DISTINCT "${column}"::text AS value
      FROM "${table}"
      WHERE "${column}" IS NOT NULL
      ORDER BY 1
      LIMIT $1
    `;
    const nullQuery = `
      SELECT EXISTS (
        SELECT 1 FROM "${table}" WHERE "${column}" IS NULL
      ) AS has_null
    `;
    const [result, nullRows] = await Promise.all([
      sql.query(valuesQuery, [limit]),
      sql.query(nullQuery, []),
    ]);
    const hasNull = Boolean(nullRows[0]?.has_null);

    const session = await getActiveDecryptionSession({
      email: gate.email,
      userId: gate.userId,
    });
    const canDecrypt = Boolean(session);
    const encryptedCols = encryptedColumnsFor(table);
    const columnMayBeEncrypted = encryptedCols.has(column);

    if (session && columnMayBeEncrypted) {
      await trackSessionAccess(session.id, table);
    }

    const values: string[] = [];
    for (const r of result) {
      const s = String(r.value);
      // Without BTG, skip AES-GCM ciphertext so filter chips cannot dump v2: blobs.
      if (!canDecrypt && isEncrypted(s)) continue;
      if (columnMayBeEncrypted || isEncrypted(s)) {
        const plain = phiTextForAdminResponse(s, canDecrypt);
        if (plain == null) continue;
        values.push(plain);
      } else {
        values.push(s);
      }
    }

    return NextResponse.json({
      values,
      hasNull,
      total: values.length + (hasNull ? 1 : 0),
      decrypted: canDecrypt && columnMayBeEncrypted,
    });
  } catch (error) {
    console.error("GET column values error:", error);
    return NextResponse.json(
      { error: "Failed to fetch column values" },
      { status: 500 }
    );
  }
}
