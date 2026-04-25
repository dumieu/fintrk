import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.error("Stats query failed:", e);
    return fallback;
  }
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const [
      counts,
      trends,
      sparklines,
      userGrowth,
      currencyMix,
      countryMix,
      topMerchants,
      topCategories,
      flowSplit,
      ingestPulse,
      aiCostRollup,
      dataFreshness,
      tableSizes,
    ] = await Promise.all([
      // 1. Headline counts
      safe(
        sql`SELECT
          (SELECT COUNT(*)::int FROM users)                AS users,
          (SELECT COUNT(*)::int FROM accounts)             AS accounts,
          (SELECT COUNT(*)::int FROM statements)           AS statements,
          (SELECT COUNT(*)::int FROM transactions)         AS transactions,
          (SELECT COUNT(*)::int FROM merchants)            AS merchants,
          (SELECT COUNT(*)::int FROM user_categories)      AS user_categories,
          (SELECT COUNT(*)::int FROM recurring_patterns)   AS recurring_patterns,
          (SELECT COUNT(*)::int FROM budgets)              AS budgets,
          (SELECT COUNT(*)::int FROM goals)                AS goals,
          (SELECT COUNT(*)::int FROM ai_insights)          AS ai_insights`,
        [{}],
      ),

      // 2. 7-day vs prior-7-day trends
      safe(
        sql`SELECT
          (SELECT COUNT(*)::int FROM users WHERE created_at >= NOW() - INTERVAL '7 days')                                     AS users_7d,
          (SELECT COUNT(*)::int FROM users WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days') AS users_prev_7d,
          (SELECT COUNT(*)::int FROM transactions WHERE created_at >= NOW() - INTERVAL '7 days')                              AS txn_7d,
          (SELECT COUNT(*)::int FROM transactions WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days') AS txn_prev_7d,
          (SELECT COUNT(*)::int FROM statements WHERE created_at >= NOW() - INTERVAL '7 days')                                AS stmt_7d,
          (SELECT COUNT(*)::int FROM statements WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days') AS stmt_prev_7d,
          (SELECT COUNT(*)::int FROM ai_insights WHERE generated_at >= NOW() - INTERVAL '7 days')                             AS ai_7d,
          (SELECT COUNT(*)::int FROM ai_insights WHERE generated_at >= NOW() - INTERVAL '14 days' AND generated_at < NOW() - INTERVAL '7 days') AS ai_prev_7d`,
        [{}],
      ),

      // 3. 30-day sparklines
      safe(
        sql`WITH days AS (
            SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date AS day
          ),
          u  AS (SELECT DATE(created_at) AS day, COUNT(*)::int AS c FROM users          WHERE created_at >= CURRENT_DATE - 29 GROUP BY 1),
          tx AS (SELECT DATE(created_at) AS day, COUNT(*)::int AS c FROM transactions   WHERE created_at >= CURRENT_DATE - 29 GROUP BY 1),
          st AS (SELECT DATE(created_at) AS day, COUNT(*)::int AS c FROM statements     WHERE created_at >= CURRENT_DATE - 29 GROUP BY 1),
          ai AS (SELECT DATE(generated_at) AS day, COUNT(*)::int AS c FROM ai_insights  WHERE generated_at >= CURRENT_DATE - 29 GROUP BY 1)
          SELECT
            days.day::text  AS day,
            COALESCE(u.c, 0)  AS users,
            COALESCE(tx.c, 0) AS transactions,
            COALESCE(st.c, 0) AS statements,
            COALESCE(ai.c, 0) AS insights
          FROM days
          LEFT JOIN u  ON u.day  = days.day
          LEFT JOIN tx ON tx.day = days.day
          LEFT JOIN st ON st.day = days.day
          LEFT JOIN ai ON ai.day = days.day
          ORDER BY days.day`,
        [],
      ),

      // 4. User growth — monthly + cumulative
      safe(
        sql`SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM')              AS month,
          COUNT(*)::int                                                     AS count,
          (SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', created_at)))::int AS cumulative
        FROM users
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)`,
        [],
      ),

      // 5. Currency mix
      safe(
        sql`SELECT base_currency AS currency, COUNT(*)::int AS count
        FROM transactions GROUP BY base_currency ORDER BY count DESC LIMIT 12`,
        [],
      ),

      // 6. Country mix (transactions)
      safe(
        sql`SELECT COALESCE(country_iso, 'Unknown') AS country, COUNT(*)::int AS count
        FROM transactions GROUP BY country_iso ORDER BY count DESC LIMIT 15`,
        [],
      ),

      // 7. Top merchants by volume
      safe(
        sql`SELECT m.canonical_name AS merchant, COUNT(*)::int AS txns,
          SUM(ABS(t.base_amount))::numeric(18,2)  AS volume
        FROM transactions t
        JOIN merchants m ON m.id = t.merchant_id
        GROUP BY m.canonical_name
        ORDER BY txns DESC
        LIMIT 12`,
        [],
      ),

      // 8. Top categories by spend
      safe(
        sql`SELECT
          uc.name      AS category,
          uc.flow_type AS flow,
          COUNT(*)::int AS txns,
          SUM(ABS(t.base_amount))::numeric(18,2) AS volume
        FROM transactions t
        JOIN user_categories uc ON uc.id = t.category_id
        WHERE uc.flow_type = 'outflow'
        GROUP BY uc.name, uc.flow_type
        ORDER BY volume DESC
        LIMIT 10`,
        [],
      ),

      // 9. Inflow vs outflow (last 90 days)
      safe(
        sql`SELECT
          uc.flow_type AS flow,
          COUNT(*)::int                              AS txns,
          SUM(ABS(t.base_amount))::numeric(18,2)     AS volume
        FROM transactions t
        LEFT JOIN user_categories uc ON uc.id = t.category_id
        WHERE t.posted_date >= CURRENT_DATE - 90
        GROUP BY uc.flow_type
        ORDER BY volume DESC NULLS LAST`,
        [],
      ),

      // 10. Statement processing pulse (last 30 days, by status)
      safe(
        sql`SELECT
          DATE(created_at)::text AS day,
          status,
          COUNT(*)::int          AS count
        FROM statements
        WHERE created_at >= CURRENT_DATE - 29
        GROUP BY 1,2
        ORDER BY 1`,
        [],
      ),

      // 11. AI cost roll-up
      safe(
        sql`SELECT
          COALESCE(SUM(total_cost),0)::numeric(12,4)                                                       AS total_cost,
          COALESCE(SUM(total_cost) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::numeric(12,4) AS cost_7d,
          COUNT(*)::int                                                                                      AS calls
        FROM ai_costs`,
        [{}],
      ),

      // 12. Data freshness
      safe(
        sql`SELECT
          (SELECT MAX(created_at)::text   FROM users)                AS last_user,
          (SELECT MAX(created_at)::text   FROM transactions)         AS last_txn,
          (SELECT MAX(created_at)::text   FROM statements)           AS last_stmt,
          (SELECT MAX(generated_at)::text FROM ai_insights)          AS last_insight,
          (SELECT MAX(updated_at)::text   FROM recurring_patterns)   AS last_recurring`,
        [{}],
      ),

      // 13. Table sizes
      safe(
        sql`SELECT relname AS table_name, n_live_tup::int AS row_count
        FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC`,
        [],
      ),
    ]);

    const c = (counts as Record<string, unknown>[])[0] || {};
    const t = (trends as Record<string, unknown>[])[0] || {};
    const a = (aiCostRollup as Record<string, unknown>[])[0] || {};
    const f = (dataFreshness as Record<string, unknown>[])[0] || {};

    return NextResponse.json({
      counts: {
        users: Number(c.users) || 0,
        accounts: Number(c.accounts) || 0,
        statements: Number(c.statements) || 0,
        transactions: Number(c.transactions) || 0,
        merchants: Number(c.merchants) || 0,
        userCategories: Number(c.user_categories) || 0,
        recurringPatterns: Number(c.recurring_patterns) || 0,
        budgets: Number(c.budgets) || 0,
        goals: Number(c.goals) || 0,
        aiInsights: Number(c.ai_insights) || 0,
      },
      trends: {
        users: { current: Number(t.users_7d) || 0, previous: Number(t.users_prev_7d) || 0 },
        transactions: { current: Number(t.txn_7d) || 0, previous: Number(t.txn_prev_7d) || 0 },
        statements: { current: Number(t.stmt_7d) || 0, previous: Number(t.stmt_prev_7d) || 0 },
        aiInsights: { current: Number(t.ai_7d) || 0, previous: Number(t.ai_prev_7d) || 0 },
      },
      sparklines,
      userGrowth,
      currencyMix,
      countryMix,
      topMerchants,
      topCategories,
      flowSplit,
      ingestPulse,
      aiCost: {
        total: Number(a.total_cost) || 0,
        cost7d: Number(a.cost_7d) || 0,
        calls: Number(a.calls) || 0,
      },
      dataFreshness: {
        lastUser: f.last_user ?? null,
        lastTransaction: f.last_txn ?? null,
        lastStatement: f.last_stmt ?? null,
        lastInsight: f.last_insight ?? null,
        lastRecurring: f.last_recurring ?? null,
      },
      tableSizes,
    });
  } catch (e) {
    console.error("Stats route error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "stats_failed" }, { status: 500 });
  }
}
