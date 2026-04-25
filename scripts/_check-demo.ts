import { neon } from "@neondatabase/serverless";
import * as fs from "fs";

async function main() {
  const env = fs.readFileSync("/Users/dumi/Cursor Ai/FinTRK/.env.local", "utf8");
  const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1].replace(/^"|"$/g, "");
  if (!url) throw new Error("no db url");
  const sql = neon(url);
  const rows = await sql`
    SELECT to_char(date_trunc('month', t.posted_date), 'YYYY-MM') as ym,
           c.flow_type, count(*)::int as n,
           round(sum(t.base_amount)::numeric, 2) as total
    FROM transactions t LEFT JOIN user_categories c ON c.id = t.category_id
    WHERE t.user_id = 'demo'
      AND t.posted_date >= (current_date - interval '24 months')
    GROUP BY 1, 2 ORDER BY 1 DESC, 2`;
  console.table(rows);
  const m = await sql`SELECT max(posted_date) as max, min(posted_date) as min, count(*)::int as n FROM transactions WHERE user_id='demo'`;
  console.log(m);
  const rec = await sql`SELECT merchant_name, expected_amount, interval_days, is_active FROM recurring_patterns WHERE user_id='demo' AND is_active=true ORDER BY ABS(expected_amount) DESC`;
  console.table(rec);
  // Check categories' flow_type values
  const cats = await sql`SELECT flow_type, count(*)::int FROM user_categories WHERE user_id='demo' GROUP BY flow_type`;
  console.log("category flow_types:", cats);
  // Snapshot endpoint computes joined flow_type — let's see if any txn category has null flow_type
  const tnull = await sql`SELECT count(*)::int FROM transactions t LEFT JOIN user_categories c ON c.id=t.category_id WHERE t.user_id='demo' AND c.flow_type IS NULL`;
  console.log("txn with null flow_type:", tnull);
}

main().catch((e) => { console.error(e); process.exit(1); });
