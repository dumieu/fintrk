/**
 * Public read-only endpoint that returns the entire demo dataset
 * (clerk_user_id = "demo") as one JSON blob the client can hold in memory
 * and mutate locally without ever touching the database.
 *
 * No auth.  Cached at the edge for 60s — the dataset changes only when
 * `npm run seed:demo` is rerun.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const DEMO = "demo";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  try {
    const [
      accounts,
      categories,
      transactions,
      recurring,
      goals,
      budgets,
      insights,
      statements,
    ] = await Promise.all([
      sql`
        SELECT id, account_name, institution_name, account_type, card_network,
               masked_number, primary_currency, country_iso, is_active
        FROM accounts
        WHERE user_id = ${DEMO}
        ORDER BY account_type, account_name
      `,
      sql`
        SELECT id, name, slug, parent_id, icon, color, sort_order,
               subcategory_type, flow_type
        FROM user_categories
        WHERE user_id = ${DEMO}
        ORDER BY parent_id NULLS FIRST, sort_order, id
      `,
      sql`
        SELECT t.id, t.account_id, t.posted_date, t.raw_description,
               t.merchant_name, t.category_id, t.base_amount, t.base_currency,
               t.foreign_amount, t.foreign_currency, t.implicit_fx_rate,
               t.country_iso, t.is_recurring, t.note, t.label,
               c.slug AS category_slug, c.name AS category_name,
               c.color AS category_color, c.flow_type
        FROM transactions t
        LEFT JOIN user_categories c ON c.id = t.category_id
        WHERE t.user_id = ${DEMO}
        ORDER BY t.posted_date DESC, t.id DESC
      `,
      sql`
        SELECT id, merchant_name, category_id, interval_days, interval_label,
               expected_amount, currency, next_expected_date, last_seen_date,
               occurrence_count, is_active
        FROM recurring_patterns
        WHERE user_id = ${DEMO}
        ORDER BY ABS(expected_amount) DESC
      `,
      sql`
        SELECT id, name, target_amount, current_amount, currency,
               target_date, linked_account_ids, is_completed
        FROM goals
        WHERE user_id = ${DEMO}
        ORDER BY id
      `,
      sql`
        SELECT id, category_id, account_id, name, amount, currency,
               period, rollover, alert_threshold, is_active
        FROM budgets
        WHERE user_id = ${DEMO}
        ORDER BY id
      `,
      sql`
        SELECT id, insight_type, title, body, severity, metadata,
               is_read, is_dismissed, generated_at
        FROM ai_insights
        WHERE user_id = ${DEMO}
        ORDER BY generated_at DESC
        LIMIT 20
      `,
      sql`
        SELECT id, account_id, file_name, file_size, status,
               transactions_imported, period_start, period_end, created_at
        FROM statements
        WHERE user_id = ${DEMO}
        ORDER BY period_end DESC
        LIMIT 24
      `,
    ]);

    return NextResponse.json(
      {
        family: {
          name: "The Sterling Family",
          city: "Austin, TX",
          adults: ["Marcus Sterling, 41 — Engineering Manager", "Elena Sterling, 39 — Marketing Director"],
          kids: ["Ava, 12", "Noah, 8"],
          tagline: "Two incomes, one mortgage, two college funds — three years of real life.",
          homeCurrency: "USD",
        },
        accounts,
        categories,
        transactions,
        recurring,
        goals,
        budgets,
        insights,
        statements,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "demo_snapshot_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
