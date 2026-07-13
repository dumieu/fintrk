import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";
import { decryptRow } from "@/lib/crypto/encrypted-fields";
import { getActiveDecryptionSession, trackSessionAccess } from "@/lib/decryption-session";
import {
  CLERK_API_BASE,
  userAppClerkSecret,
  type ClerkListUser,
} from "@/lib/user-app-clerk";
import { parseLimitParam, parsePageParam } from "@/lib/utils";

export const dynamic = "force-dynamic";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

async function fetchClerkPlanMap(
  clerkIds: string[],
): Promise<Map<string, { plan: string; planStatus: string | null }>> {
  const map = new Map<string, { plan: string; planStatus: string | null }>();
  const secret = userAppClerkSecret();
  if (!secret || clerkIds.length === 0) return map;

  // Batch via individual GETs with concurrency limit (Clerk has no bulk by id list)
  const chunk = clerkIds.slice(0, 80);
  await Promise.all(
    chunk.map(async (id) => {
      try {
        const res = await fetch(`${CLERK_API_BASE}/users/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${secret}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const user = (await res.json()) as ClerkListUser;
        const plan =
          typeof user.public_metadata?.plan === "string"
            ? user.public_metadata.plan
            : "free";
        const planStatus =
          typeof user.public_metadata?.planStatus === "string"
            ? user.public_metadata.planStatus
            : null;
        map.set(id, { plan, planStatus });
      } catch {
        /* ignore */
      }
    }),
  );
  return map;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const page = parsePageParam(searchParams.get("page"), 1);
    const limit = parseLimitParam(searchParams.get("limit"), 50, 200);
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
    let rows = await sql.query(dataQ, params);

    let decrypted = false;
    const session = await getActiveDecryptionSession();
    if (session) {
      rows = rows.map((r) => decryptRow("users", r as Record<string, unknown>));
      decrypted = true;
      await trackSessionAccess(session.id, "users");
    }

    const planMap = await fetchClerkPlanMap(
      rows.map((r) => String((r as { clerk_user_id: string }).clerk_user_id)),
    );

    const enriched = rows.map((r) => {
      const id = String((r as { clerk_user_id: string }).clerk_user_id);
      const plan = planMap.get(id);
      return {
        ...r,
        plan: plan?.plan ?? "unknown",
        planStatus: plan?.planStatus ?? null,
      };
    });

    // Charts (platform-wide, last 30 days)
    const days = lastNDays(30);
    let signups: { day: string; count: number }[] = [];
    let txnVol: { day: string; count: number }[] = [];
    let aiSpend: { day: string; cost: number }[] = [];
    try {
      signups = (await sql`
        SELECT DATE(created_at AT TIME ZONE 'UTC')::text AS day, COUNT(*)::int AS count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1
        ORDER BY 1
      `) as { day: string; count: number }[];
    } catch { /* table may be empty / missing */ }
    try {
      txnVol = (await sql`
        SELECT DATE(posted_date)::text AS day, COUNT(*)::int AS count
        FROM transactions
        WHERE posted_date >= (CURRENT_DATE - INTERVAL '30 days')
        GROUP BY 1
        ORDER BY 1
      `) as { day: string; count: number }[];
    } catch { /* ignore */ }
    try {
      aiSpend = (await sql`
        SELECT DATE(created_at AT TIME ZONE 'UTC')::text AS day,
               COALESCE(SUM(total_cost), 0)::float AS cost
        FROM ai_costs
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1
        ORDER BY 1
      `) as { day: string; cost: number }[];
    } catch { /* ignore */ }

    const signupByDay = new Map(signups.map((r) => [r.day, Number(r.count)]));
    const txnByDay = new Map(txnVol.map((r) => [r.day, Number(r.count)]));
    const costByDay = new Map(aiSpend.map((r) => [r.day, Number(r.cost)]));

    const chartSeries = days.map((day) => ({
      day,
      count: signupByDay.get(day) ?? 0,
      txns: txnByDay.get(day) ?? 0,
      cost: costByDay.get(day) ?? 0,
    }));

    // Pro vs free from Clerk metadata on current page + best-effort platform sample
    let proCount = 0;
    let freeCount = 0;
    for (const r of enriched) {
      if (r.plan === "pro") proCount++;
      else if (r.plan === "free") freeCount++;
    }

    return NextResponse.json({
      rows: enriched,
      decrypted,
      clerkKeyMissing: !userAppClerkSecret(),
      charts: {
        series: chartSeries,
        planMix: { pro: proCount, free: freeCount },
      },
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
