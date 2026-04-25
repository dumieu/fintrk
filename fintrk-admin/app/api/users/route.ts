import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = (page - 1) * limit;

    let whereClause = "";
    const params: unknown[] = [];
    let p = 1;
    if (search) {
      const cond: string[] = [];
      for (const col of ["primary_email", "first_name", "last_name", "username", "clerk_user_id"]) {
        cond.push(`u."${col}" ILIKE $${p}`);
        params.push(`%${search}%`);
        p++;
      }
      whereClause = `WHERE ${cond.join(" OR ")}`;
    }

    const countQ = `SELECT COUNT(*)::int AS count FROM users u ${whereClause}`;
    const totalRes = await sql.query(countQ, params);
    const totalRows = (totalRes[0]?.count as number) || 0;

    const dataQ = `
      SELECT
        u.clerk_user_id,
        u.primary_email,
        u.first_name,
        u.last_name,
        u.username,
        u.image_url,
        u.main_currency,
        u.main_currency_percentage,
        u.detect_travel,
        u.created_at,
        u.updated_at,
        (SELECT COUNT(*)::int FROM accounts        a WHERE a.user_id = u.clerk_user_id) AS accounts,
        (SELECT COUNT(*)::int FROM statements      s WHERE s.user_id = u.clerk_user_id) AS statements,
        (SELECT COUNT(*)::int FROM transactions    t WHERE t.user_id = u.clerk_user_id) AS transactions,
        (SELECT COUNT(*)::int FROM recurring_patterns r WHERE r.user_id = u.clerk_user_id) AS recurring_patterns,
        (SELECT COUNT(*)::int FROM ai_insights     i WHERE i.user_id = u.clerk_user_id) AS ai_insights,
        (SELECT MAX(t.posted_date) FROM transactions t WHERE t.user_id = u.clerk_user_id) AS last_txn_date,
        (SELECT COALESCE(SUM(c.total_cost),0)::numeric(12,4) FROM ai_costs c WHERE c.user_id = u.clerk_user_id) AS ai_spend
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `;
    params.push(limit, offset);
    const rows = await sql.query(dataQ, params);

    return NextResponse.json({
      rows,
      pagination: {
        page,
        limit,
        totalRows,
        totalPages: Math.max(1, Math.ceil(totalRows / limit)),
      },
    });
  } catch (e) {
    console.error("Users list error:", e);
    return NextResponse.json({ error: "users_list_failed" }, { status: 500 });
  }
}
