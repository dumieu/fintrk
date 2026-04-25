import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ColumnDef {
  column_name: string;
  data_type: string;
  column_default: string | null;
}

async function getValidTables(): Promise<string[]> {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  return tables.map((t) => t.table_name);
}

async function getTableMeta(tableName: string) {
  const [cols, pk] = await Promise.all([
    sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
      ORDER BY ordinal_position
    `,
    sql`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = ${tableName}
        AND tc.constraint_type = 'PRIMARY KEY'
    `,
  ]);
  return {
    allColumns: cols as ColumnDef[],
    textColumns: cols
      .filter((c) => ["character varying", "text", "character"].includes(c.data_type))
      .map((c) => c.column_name as string),
    primaryKey: (pk[0]?.column_name as string | undefined) ?? null,
  };
}

// ── GET: list rows with search / sort / pagination ─────────────────────────
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "";
    const order = searchParams.get("order") === "desc" ? "DESC" : "ASC";

    if (!table) return NextResponse.json({ error: "table_required" }, { status: 400 });

    const validTables = await getValidTables();
    if (!validTables.includes(table)) {
      return NextResponse.json({ error: "invalid_table" }, { status: 400 });
    }

    const meta = await getTableMeta(table);
    const { allColumns, textColumns, primaryKey } = meta;

    const offset = (page - 1) * limit;
    let whereClause = "";
    const params: unknown[] = [];
    let p = 1;

    if (search) {
      const conditions: string[] = [];
      for (const col of textColumns) {
        conditions.push(`"${col}" ILIKE $${p}`);
        params.push(`%${search}%`);
        p++;
      }
      for (const col of allColumns) {
        if (
          !["character varying", "text", "character"].includes(col.data_type) &&
          col.data_type !== "bytea" &&
          col.data_type !== "jsonb" &&
          col.data_type !== "json"
        ) {
          conditions.push(`"${col.column_name}"::text ILIKE $${p}`);
          params.push(`%${search}%`);
          p++;
        }
      }
      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(" OR ")}`;
      }
    }

    const countQuery = `SELECT COUNT(*)::int AS count FROM "${table}" ${whereClause}`;
    const countResult = await sql.query(countQuery, params);
    const totalRows = (countResult[0]?.count as number) || 0;

    const sortCol =
      allColumns.find((c) => c.column_name === sort)?.column_name ??
      primaryKey ??
      allColumns[0]?.column_name ??
      "id";

    const selectCols = allColumns
      .filter((c) => c.data_type !== "bytea")
      .map((c) => `"${c.column_name}"`)
      .join(", ");

    const dataQuery = `SELECT ${selectCols} FROM "${table}" ${whereClause} ORDER BY "${sortCol}" ${order} LIMIT $${p} OFFSET $${p + 1}`;
    params.push(limit, offset);

    const rows = await sql.query(dataQuery, params);

    return NextResponse.json({
      rows,
      meta: {
        primaryKey,
        columns: allColumns.map((c) => ({
          name: c.column_name,
          type: c.data_type,
          default: c.column_default,
        })),
      },
      pagination: {
        page,
        limit,
        totalRows,
        totalPages: Math.max(1, Math.ceil(totalRows / limit)),
      },
    });
  } catch (e) {
    console.error("GET rows error:", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}

// ── POST: insert row ───────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { table, data } = (await request.json()) as { table: string; data: Record<string, unknown> };
    if (!table || !data) return NextResponse.json({ error: "missing" }, { status: 400 });

    const valid = await getValidTables();
    if (!valid.includes(table)) return NextResponse.json({ error: "invalid_table" }, { status: 400 });

    const { allColumns } = await getTableMeta(table);
    const validNames = new Set(allColumns.map((c) => c.column_name));

    const entries = Object.entries(data).filter(([k, v]) => {
      if (!validNames.has(k)) return false;
      if (v === "" || v === null || v === undefined) return false;
      const def = allColumns.find((c) => c.column_name === k);
      if (def?.column_default?.includes("generated always")) return false;
      return true;
    });

    if (entries.length === 0) return NextResponse.json({ error: "no_data" }, { status: 400 });

    const cols = entries.map(([k]) => `"${k}"`).join(", ");
    const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
    const values = entries.map(([, v]) => v);

    const query = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING *`;
    const result = await sql.query(query, values);
    return NextResponse.json({ row: result[0] }, { status: 201 });
  } catch (e) {
    console.error("POST rows error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "insert_failed" }, { status: 500 });
  }
}

// ── PUT: update row ────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const body = (await request.json()) as {
      table: string;
      primaryKey: string;
      primaryValue: unknown;
      data: Record<string, unknown>;
    };
    const { table, primaryKey, primaryValue, data } = body;
    if (!table || !primaryKey || primaryValue === undefined || !data) {
      return NextResponse.json({ error: "missing" }, { status: 400 });
    }

    const valid = await getValidTables();
    if (!valid.includes(table)) return NextResponse.json({ error: "invalid_table" }, { status: 400 });

    const { allColumns } = await getTableMeta(table);
    const validNames = new Set(allColumns.map((c) => c.column_name));

    const entries = Object.entries(data).filter(([k]) => {
      if (!validNames.has(k)) return false;
      if (k === primaryKey) return false;
      const def = allColumns.find((c) => c.column_name === k);
      if (def?.column_default?.includes("generated always")) return false;
      return true;
    });

    if (entries.length === 0) return NextResponse.json({ error: "no_data" }, { status: 400 });

    const setClauses = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(", ");
    const values = entries.map(([, v]) => (v === "" ? null : v));
    values.push(primaryValue);

    const query = `UPDATE "${table}" SET ${setClauses} WHERE "${primaryKey}" = $${values.length} RETURNING *`;
    const result = await sql.query(query, values);
    if (result.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ row: result[0] });
  } catch (e) {
    console.error("PUT rows error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "update_failed" }, { status: 500 });
  }
}

// ── DELETE: drop row ───────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");
    const primaryKey = searchParams.get("primaryKey");
    const primaryValue = searchParams.get("primaryValue");

    if (!table || !primaryKey || primaryValue === null) {
      return NextResponse.json({ error: "missing" }, { status: 400 });
    }

    const valid = await getValidTables();
    if (!valid.includes(table)) return NextResponse.json({ error: "invalid_table" }, { status: 400 });

    const parsed = /^\d+$/.test(primaryValue) ? Number(primaryValue) : primaryValue;
    const query = `DELETE FROM "${table}" WHERE "${primaryKey}" = $1 RETURNING *`;
    const result = await sql.query(query, [parsed]);
    if (result.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ deleted: result[0] });
  } catch (e) {
    console.error("DELETE rows error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("violates foreign key constraint")) {
      const match = msg.match(/on table "(\w+)"/);
      return NextResponse.json(
        {
          error: `Cannot delete: referenced by ${match?.[1] ? `"${match[1]}"` : "another table"}. Delete dependent rows first.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
