import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  const { id: clerkUserId } = await context.params;
  if (!clerkUserId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  try {
    const [
      profile,
      counts,
      lifetime,
      monthlyTimeline,
      flowSplit,
      currencyMix,
      countryMix,
      topMerchants,
      topCategories,
      activeRecurring,
      recentTransactions,
      recentStatements,
      aiCost,
      hourly,
      dow,
    ] = await Promise.all([
      sql`SELECT
        u.clerk_user_id, u.primary_email, u.first_name, u.last_name, u.username,
        u.image_url, u.main_currency, u.main_currency_percentage, u.detect_travel,
        u.created_at, u.updated_at
      FROM users u WHERE u.clerk_user_id = ${clerkUserId} LIMIT 1`,

      sql`SELECT
        (SELECT COUNT(*)::int FROM accounts            WHERE user_id = ${clerkUserId}) AS accounts,
        (SELECT COUNT(*)::int FROM statements          WHERE user_id = ${clerkUserId}) AS statements,
        (SELECT COUNT(*)::int FROM transactions        WHERE user_id = ${clerkUserId}) AS transactions,
        (SELECT COUNT(*)::int FROM recurring_patterns  WHERE user_id = ${clerkUserId}) AS recurring_patterns,
        (SELECT COUNT(*)::int FROM ai_insights         WHERE user_id = ${clerkUserId}) AS ai_insights,
        (SELECT COUNT(*)::int FROM budgets             WHERE user_id = ${clerkUserId}) AS budgets,
        (SELECT COUNT(*)::int FROM goals               WHERE user_id = ${clerkUserId}) AS goals,
        (SELECT COUNT(*)::int FROM file_upload_log     WHERE user_id = ${clerkUserId}) AS file_uploads`,

      sql`SELECT
        MIN(posted_date) AS first_txn_date,
        MAX(posted_date) AS last_txn_date,
        COUNT(*)::int    AS txn_count,
        COUNT(DISTINCT base_currency)::int AS distinct_currencies,
        COUNT(DISTINCT country_iso)::int   AS distinct_countries,
        COUNT(DISTINCT merchant_id)::int   AS distinct_merchants
      FROM transactions WHERE user_id = ${clerkUserId}`,

      // Monthly inflow vs outflow per main currency
      sql`SELECT
        TO_CHAR(DATE_TRUNC('month', t.posted_date), 'YYYY-MM') AS month,
        COALESCE(SUM(CASE WHEN uc.flow_type = 'inflow'  THEN ABS(t.base_amount) END), 0)::numeric(18,2) AS inflow,
        COALESCE(SUM(CASE WHEN uc.flow_type = 'outflow' THEN ABS(t.base_amount) END), 0)::numeric(18,2) AS outflow,
        COALESCE(SUM(CASE WHEN uc.flow_type = 'savings' THEN ABS(t.base_amount) END), 0)::numeric(18,2) AS savings,
        COUNT(*)::int AS txns
      FROM transactions t
      LEFT JOIN user_categories uc ON uc.id = t.category_id
      WHERE t.user_id = ${clerkUserId}
      GROUP BY 1
      ORDER BY 1`,

      sql`SELECT
        COALESCE(uc.flow_type, 'misc') AS flow,
        COUNT(*)::int                  AS txns,
        SUM(ABS(t.base_amount))::numeric(18,2) AS volume
      FROM transactions t
      LEFT JOIN user_categories uc ON uc.id = t.category_id
      WHERE t.user_id = ${clerkUserId}
      GROUP BY uc.flow_type`,

      sql`SELECT base_currency AS currency, COUNT(*)::int AS count,
        SUM(ABS(base_amount))::numeric(18,2) AS volume
      FROM transactions WHERE user_id = ${clerkUserId}
      GROUP BY base_currency ORDER BY count DESC`,

      sql`SELECT COALESCE(country_iso, 'Unknown') AS country, COUNT(*)::int AS count
      FROM transactions WHERE user_id = ${clerkUserId}
      GROUP BY country_iso ORDER BY count DESC LIMIT 12`,

      sql`SELECT
        COALESCE(t.merchant_name, m.canonical_name, '—') AS merchant,
        COUNT(*)::int AS txns,
        SUM(ABS(t.base_amount))::numeric(18,2) AS volume
      FROM transactions t
      LEFT JOIN merchants m ON m.id = t.merchant_id
      WHERE t.user_id = ${clerkUserId}
      GROUP BY 1
      ORDER BY volume DESC NULLS LAST
      LIMIT 12`,

      sql`SELECT
        uc.name AS category,
        uc.flow_type AS flow,
        COUNT(*)::int AS txns,
        SUM(ABS(t.base_amount))::numeric(18,2) AS volume
      FROM transactions t
      LEFT JOIN user_categories uc ON uc.id = t.category_id
      WHERE t.user_id = ${clerkUserId} AND uc.flow_type = 'outflow'
      GROUP BY uc.name, uc.flow_type
      ORDER BY volume DESC
      LIMIT 10`,

      sql`SELECT id, merchant_name, interval_label, expected_amount, currency,
        next_expected_date, last_seen_date, occurrence_count
      FROM recurring_patterns
      WHERE user_id = ${clerkUserId} AND is_active = true
      ORDER BY expected_amount DESC NULLS LAST
      LIMIT 25`,

      sql`SELECT id, posted_date, raw_description, merchant_name, base_amount, base_currency,
        foreign_amount, foreign_currency, country_iso, is_recurring,
        (SELECT name FROM user_categories uc WHERE uc.id = transactions.category_id) AS category
      FROM transactions WHERE user_id = ${clerkUserId}
      ORDER BY posted_date DESC, created_at DESC
      LIMIT 30`,

      sql`SELECT id, file_name, file_size, status, ai_model, transactions_imported,
        transactions_duplicate, period_start, period_end, ai_error, created_at, ai_processed_at
      FROM statements WHERE user_id = ${clerkUserId}
      ORDER BY created_at DESC
      LIMIT 20`,

      sql`SELECT
        COALESCE(SUM(total_cost), 0)::numeric(12,4)                                           AS total_cost,
        COALESCE(SUM(total_cost) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'),0)::numeric(12,4) AS cost_7d,
        COUNT(*)::int                                                                          AS calls
      FROM ai_costs WHERE user_id = ${clerkUserId}`,

      sql`SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS count
      FROM transactions WHERE user_id = ${clerkUserId} GROUP BY 1 ORDER BY 1`,

      sql`SELECT EXTRACT(DOW FROM posted_date)::int AS dow, COUNT(*)::int AS count
      FROM transactions WHERE user_id = ${clerkUserId} GROUP BY 1 ORDER BY 1`,
    ]);

    const profileRow = (profile as Record<string, unknown>[])[0];
    if (!profileRow) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({
      profile: profileRow,
      counts: (counts as Record<string, unknown>[])[0] || {},
      lifetime: (lifetime as Record<string, unknown>[])[0] || {},
      monthlyTimeline,
      flowSplit,
      currencyMix,
      countryMix,
      topMerchants,
      topCategories,
      activeRecurring,
      recentTransactions,
      recentStatements,
      aiCost: (aiCost as Record<string, unknown>[])[0] || { total_cost: 0, cost_7d: 0, calls: 0 },
      hourly,
      dow,
    });
  } catch (e) {
    console.error("User detail error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "user_detail_failed" }, { status: 500 });
  }
}
