/**
 * Idempotent migration: ensures net_worth_kind, net_worth_items, and
 * net_worth_settings exist on the live Neon DB, and that net_worth_settings
 * has the post-retirement contribution + pre-retirement drawdown columns.
 *
 *   npx tsx scripts/push-net-worth-tables.ts
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  console.log("→ Ensuring net_worth_kind enum");
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'net_worth_kind') THEN
        CREATE TYPE net_worth_kind AS ENUM ('asset', 'liability');
      END IF;
    END
    $$;
  `;

  console.log("→ Ensuring net_worth_items table");
  await sql`
    CREATE TABLE IF NOT EXISTS net_worth_items (
      id              SERIAL PRIMARY KEY,
      user_id         VARCHAR(255) NOT NULL,
      kind            net_worth_kind NOT NULL,
      category        VARCHAR(32) NOT NULL DEFAULT 'other',
      label           VARCHAR(128) NOT NULL,
      amount          NUMERIC(18, 2) NOT NULL DEFAULT 0,
      currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
      growth_rate     NUMERIC(6, 4),
      notes           TEXT,
      display_order   INTEGER NOT NULL DEFAULT 0,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS nw_items_user_idx ON net_worth_items(user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS nw_items_user_kind_idx ON net_worth_items(user_id, kind);`;

  console.log("→ Ensuring net_worth_settings table");
  await sql`
    CREATE TABLE IF NOT EXISTS net_worth_settings (
      user_id                   VARCHAR(255) PRIMARY KEY,
      currency                  VARCHAR(3)     NOT NULL DEFAULT 'USD',
      default_growth_rate       NUMERIC(6, 4)  NOT NULL DEFAULT 0.1000,
      monthly_contribution      NUMERIC(15, 2) NOT NULL DEFAULT 0,
      inflation_rate            NUMERIC(6, 4)  NOT NULL DEFAULT 0.0300,
      current_age               INTEGER        NOT NULL DEFAULT 35,
      retirement_age            INTEGER        NOT NULL DEFAULT 65,
      annual_drawdown           NUMERIC(15, 2) NOT NULL DEFAULT 0,
      show_inflation_adjusted   BOOLEAN        NOT NULL DEFAULT false,
      updated_at                TIMESTAMPTZ    NOT NULL DEFAULT now()
    );
  `;

  console.log("→ Adding pre/post-retirement + DOB columns if missing");
  await sql`
    ALTER TABLE net_worth_settings
      ADD COLUMN IF NOT EXISTS monthly_contribution_post NUMERIC(15, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS annual_drawdown_pre       NUMERIC(15, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS birth_month               INTEGER,
      ADD COLUMN IF NOT EXISTS birth_year                INTEGER;
  `;

  console.log("✓ net worth tables ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
