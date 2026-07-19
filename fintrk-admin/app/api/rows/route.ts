import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
import { isEncryptedTable } from "@/lib/crypto/encrypted-fields";
import { adminRowFields } from "@/lib/crypto/phi-response";
import { getActiveDecryptionSession, trackSessionAccess } from "@/lib/decryption-session";
import { isMutationProtectedTable } from "@/lib/protected-tables";
import { CLERK_USER_ID_EMAIL_TABLES } from "@/lib/user-email-filter-tables";
import { parseLimitParam, parsePageParam } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FINTRK_STATS_TABLES = new Set([
  "transactions",
  "statements",
  "accounts",
  "ai_costs",
  "ai_insights",
  "users",
]);

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
  return tables.map((t) => t.table_name as string);
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
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = ${tableName}
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
    `,
  ]);
  const primaryKeys = (pk as { column_name: string }[]).map((r) => r.column_name);
  return {
    allColumns: cols as ColumnDef[],
    textColumns: (cols as ColumnDef[])
      .filter((c) => ["character varying", "text", "character"].includes(c.data_type))
      .map((c) => c.column_name),
    primaryKeys,
    /** Sole PK column, or null when none / composite (mutations require a single PK). */
    primaryKey: primaryKeys.length === 1 ? primaryKeys[0] : null,
  };
}

/** Reject client primaryKey unless it matches the table's real single-column PK. */
function assertClientPrimaryKey(
  clientPk: string,
  realPk: string | null,
): NextResponse | null {
  if (!realPk) {
    return NextResponse.json(
      { error: "table_has_no_single_primary_key" },
      { status: 400 },
    );
  }
  if (clientPk !== realPk) {
    return NextResponse.json({ error: "invalid_primary_key" }, { status: 400 });
  }
  return null;
}

function hasColumn(cols: ColumnDef[], name: string): boolean {
  return cols.some((c) => c.column_name === name);
}

/** Join user email onto user_id / clerk_user_id tables via users.primary_email. */
function userEmailExtraSelect(
  table: string,
  cols: ColumnDef[],
  validTables: string[],
): string {
  if (!validTables.includes("users")) return "";

  if (table === "users" && hasColumn(cols, "primary_email")) {
    return `, _r.primary_email AS "user_email"`;
  }

  if (hasColumn(cols, "user_id")) {
    return `, (
      SELECT u.primary_email FROM users u
      WHERE u.clerk_user_id = _r.user_id AND TRIM(COALESCE(u.primary_email, '')) <> ''
      LIMIT 1
    ) AS "user_email"`;
  }

  if (CLERK_USER_ID_EMAIL_TABLES.has(table) && hasColumn(cols, "clerk_user_id")) {
    return `, (
      SELECT u.primary_email FROM users u
      WHERE u.clerk_user_id = _r.clerk_user_id AND TRIM(COALESCE(u.primary_email, '')) <> ''
      LIMIT 1
    ) AS "user_email"`;
  }

  return "";
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");
    const exportAll = searchParams.get("exportAll") === "true";
    // exportAll must start at offset 0; ignoring client page avoids skipped rows.
    const page = exportAll ? 1 : parsePageParam(searchParams.get("page"), 1);
    // Cap export dumps to limit abuse / accidental full-table loads.
    const limit = exportAll
      ? 50_000
      : parseLimitParam(searchParams.get("limit"), 50, 200);
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "";
    const order = searchParams.get("order") === "desc" ? "DESC" : "ASC";
    const columnFilter = searchParams.get("column") || "";
    const columnValue = searchParams.get("value") || "";
    const exact = searchParams.get("exact") === "true";
    const filtersParam = searchParams.get("filters") || "";

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

    const effectiveColumnFilter =
      columnFilter && columnFilter !== "__none__" ? columnFilter : "";
    if (effectiveColumnFilter && columnValue) {
      const validCol = allColumns.find((c) => c.column_name === effectiveColumnFilter);
      if (validCol) {
        if (exact) {
          whereClause = `WHERE "${effectiveColumnFilter}"::text = $${p}`;
          params.push(columnValue);
          p++;
        } else if (["character varying", "text", "character"].includes(validCol.data_type)) {
          whereClause = `WHERE "${effectiveColumnFilter}" ILIKE $${p}`;
          params.push(`%${columnValue}%`);
          p++;
        } else {
          whereClause = `WHERE "${effectiveColumnFilter}"::text ILIKE $${p}`;
          params.push(`%${columnValue}%`);
          p++;
        }
      }
    }

    if (!whereClause && search) {
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

    if (filtersParam) {
      try {
        const parsedFilters: Record<string, string[]> = JSON.parse(filtersParam);
        const filterConditions: string[] = [];
        for (const [colName, filterValues] of Object.entries(parsedFilters)) {
          if (!Array.isArray(filterValues) || filterValues.length === 0) continue;
          const validCol = allColumns.find((c) => c.column_name === colName);
          if (!validCol) continue;
          const hasNull = filterValues.includes("__null__");
          const nonNullValues = filterValues.filter((v) => v !== "__null__");
          const parts: string[] = [];
          if (nonNullValues.length > 0) {
            parts.push(`"${colName}"::text = ANY($${p}::text[])`);
            params.push(nonNullValues);
            p++;
          }
          if (hasNull) parts.push(`"${colName}" IS NULL`);
          if (parts.length > 0) filterConditions.push(`(${parts.join(" OR ")})`);
        }
        if (filterConditions.length > 0) {
          if (whereClause) whereClause += ` AND ${filterConditions.join(" AND ")}`;
          else whereClause = `WHERE ${filterConditions.join(" AND ")}`;
        }
      } catch {
        /* ignore invalid JSON */
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

    const byteaCols = allColumns.filter((c) => c.data_type === "bytea");
    const byteaSelect = byteaCols
      .map((c) => `length("${c.column_name}") AS "${c.column_name}_size"`)
      .join(", ");

    const fullSelect = [selectCols, byteaSelect].filter(Boolean).join(", ");
    const extraSelect = userEmailExtraSelect(table, allColumns, validTables);

    const dataQuery = `SELECT ${fullSelect}${extraSelect} FROM "${table}" AS _r ${whereClause} ORDER BY "${sortCol}" ${order} LIMIT $${p} OFFSET $${p + 1}`;
    params.push(limit, offset);

    let rows = await sql.query(dataQuery, params);

    const session = await getActiveDecryptionSession({
      email: gate.email,
      userId: gate.userId,
    });
    const canDecrypt = Boolean(session);
    rows = rows.map((r) =>
      adminRowFields(table, r as Record<string, unknown>, canDecrypt),
    );
    const decrypted = canDecrypt && isEncryptedTable(table);
    if (session && isEncryptedTable(table)) {
      await trackSessionAccess(session.id, table);
      console.log(
        JSON.stringify({
          _type: "fintrk_admin_audit",
          action: "rows_read_decrypted",
          admin: gate.email,
          table,
          sessionId: session.id,
          at: new Date().toISOString(),
        }),
      );
    }

    let tableStats: Record<string, number> | undefined;
    if (FINTRK_STATS_TABLES.has(table)) {
      if (table === "users" && hasColumn(allColumns, "clerk_user_id")) {
        const [s] = await sql`
          SELECT COUNT(*)::int AS distinct_rows, COUNT(DISTINCT clerk_user_id)::int AS distinct_users
          FROM users
        `;
        tableStats = {
          distinct_rows: Number(s.distinct_rows),
          distinct_users: Number(s.distinct_users),
        };
      } else if (hasColumn(allColumns, "user_id")) {
        const statsQ = `SELECT COUNT(*)::int AS distinct_rows, COUNT(DISTINCT user_id)::int AS distinct_users FROM "${table}"`;
        const [s] = await sql.query(statsQ, []);
        tableStats = {
          distinct_rows: Number(s?.distinct_rows ?? 0),
          distinct_users: Number(s?.distinct_users ?? 0),
        };
      }
    }

    return NextResponse.json({
      rows,
      encrypted: isEncryptedTable(table),
      decrypted,
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
      ...(tableStats && { tableStats }),
    });
  } catch (e) {
    console.error("GET rows error:", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}

async function canDecryptForAdmin(gate: {
  email: string;
  userId: string;
}): Promise<boolean> {
  const session = await getActiveDecryptionSession({
    email: gate.email,
    userId: gate.userId,
  });
  return Boolean(session);
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { table, data } = (await request.json()) as {
      table: string;
      data: Record<string, unknown>;
    };
    if (!table || !data) return NextResponse.json({ error: "missing" }, { status: 400 });

    const valid = await getValidTables();
    if (!valid.includes(table)) return NextResponse.json({ error: "invalid_table" }, { status: 400 });
    if (isMutationProtectedTable(table)) {
      return NextResponse.json(
        { error: "table_mutations_forbidden" },
        { status: 403 },
      );
    }

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
    const canDecrypt = await canDecryptForAdmin(gate);
    const row = adminRowFields(
      table,
      (result[0] ?? {}) as Record<string, unknown>,
      canDecrypt,
    );
    return NextResponse.json({ row }, { status: 201 });
  } catch (e) {
    console.error("POST rows error:", e);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}

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
    if (isMutationProtectedTable(table)) {
      return NextResponse.json(
        { error: "table_mutations_forbidden" },
        { status: 403 },
      );
    }

    const { allColumns, primaryKey: realPk } = await getTableMeta(table);
    const validNames = new Set(allColumns.map((c) => c.column_name));
    if (typeof primaryKey !== "string") {
      return NextResponse.json({ error: "invalid_primary_key" }, { status: 400 });
    }
    const pkErr = assertClientPrimaryKey(primaryKey, realPk);
    if (pkErr) return pkErr;

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
    if (result.length > 1) {
      console.error("PUT rows matched multiple rows for PK", table, primaryKey);
      return NextResponse.json({ error: "ambiguous_primary_key" }, { status: 409 });
    }
    const canDecrypt = await canDecryptForAdmin(gate);
    const row = adminRowFields(
      table,
      result[0] as Record<string, unknown>,
      canDecrypt,
    );
    return NextResponse.json({ row });
  } catch (e) {
    console.error("PUT rows error:", e);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

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
    if (isMutationProtectedTable(table)) {
      return NextResponse.json(
        { error: "table_mutations_forbidden" },
        { status: 403 },
      );
    }

    const { primaryKey: realPk } = await getTableMeta(table);
    const pkErr = assertClientPrimaryKey(primaryKey, realPk);
    if (pkErr) return pkErr;

    // Pass PK as text - Number() loses precision on large numeric ids.
    const query = `DELETE FROM "${table}" WHERE "${primaryKey}" = $1 RETURNING *`;
    const result = await sql.query(query, [primaryValue]);
    if (result.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (result.length > 1) {
      console.error("DELETE rows matched multiple rows for PK", table, primaryKey);
      return NextResponse.json({ error: "ambiguous_primary_key" }, { status: 409 });
    }
    const canDecrypt = await canDecryptForAdmin(gate);
    const deleted = adminRowFields(
      table,
      result[0] as Record<string, unknown>,
      canDecrypt,
    );
    return NextResponse.json({ deleted });
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
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
