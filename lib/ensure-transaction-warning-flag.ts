import "server-only";
import { rawSql, resilientRawSql } from "@/lib/db";

let ensurePromise: Promise<void> | null = null;

export function ensureTransactionWarningFlagColumn(): Promise<void> {
  ensurePromise ??= (async () => {
    await resilientRawSql(() => rawSql`
      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS warning_flag boolean DEFAULT false NOT NULL
    `);
    await resilientRawSql(() => rawSql`
      CREATE TABLE IF NOT EXISTS merchant_warning_rules (
        id serial PRIMARY KEY,
        user_id varchar(255) NOT NULL,
        merchant_name varchar(255) NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await resilientRawSql(() => rawSql`
      CREATE UNIQUE INDEX IF NOT EXISTS merchant_warning_rules_user_merchant_idx
      ON merchant_warning_rules (user_id, merchant_name)
    `);
    await resilientRawSql(() => rawSql`
      CREATE INDEX IF NOT EXISTS merchant_warning_rules_user_idx
      ON merchant_warning_rules (user_id)
    `);
    await resilientRawSql(() => rawSql`
      CREATE TABLE IF NOT EXISTS merchant_label_rules (
        id serial PRIMARY KEY,
        user_id varchar(255) NOT NULL,
        merchant_name varchar(255) NOT NULL,
        label varchar(20) NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await resilientRawSql(() => rawSql`
      CREATE UNIQUE INDEX IF NOT EXISTS merchant_label_rules_user_merchant_idx
      ON merchant_label_rules (user_id, merchant_name)
    `);
    await resilientRawSql(() => rawSql`
      CREATE INDEX IF NOT EXISTS merchant_label_rules_user_idx
      ON merchant_label_rules (user_id)
    `);
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });

  return ensurePromise;
}
