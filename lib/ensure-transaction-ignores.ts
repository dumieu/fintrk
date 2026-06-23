import "server-only";
import { rawSql, resilientRawSql } from "@/lib/db";

let ensurePromise: Promise<void> | null = null;

/**
 * Ensures the per-user transaction ignore list exists. An ignore is either a
 * single transaction (scope 'item') or every transaction sharing a display
 * name (scope 'name'). NULLs are allowed in the unique indexes, so a user can
 * hold many item rows (transaction_id set, name_key null) and many name rows
 * (name_key set, transaction_id null) without collision.
 */
export function ensureTransactionIgnoresTable(): Promise<void> {
  ensurePromise ??= (async () => {
    await resilientRawSql(() => rawSql`
      CREATE TABLE IF NOT EXISTS transaction_ignores (
        id serial PRIMARY KEY,
        user_id varchar(255) NOT NULL,
        scope varchar(8) NOT NULL,
        transaction_id uuid,
        name_key varchar(255),
        display_name varchar(255) NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await resilientRawSql(() => rawSql`
      CREATE UNIQUE INDEX IF NOT EXISTS transaction_ignores_user_txn_idx
      ON transaction_ignores (user_id, transaction_id)
    `);
    await resilientRawSql(() => rawSql`
      CREATE UNIQUE INDEX IF NOT EXISTS transaction_ignores_user_name_idx
      ON transaction_ignores (user_id, name_key)
    `);
    await resilientRawSql(() => rawSql`
      CREATE INDEX IF NOT EXISTS transaction_ignores_user_idx
      ON transaction_ignores (user_id)
    `);
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });

  return ensurePromise;
}
