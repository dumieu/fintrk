import "server-only";
import { rawSql, resilientRawSql } from "@/lib/db";

let ensurePromise: Promise<void> | null = null;

export function ensureDoubleChargeWatchlistTable(): Promise<void> {
  ensurePromise ??= (async () => {
    await resilientRawSql(() => rawSql`
      CREATE TABLE IF NOT EXISTS double_charge_watchlist_exclusions (
        id serial PRIMARY KEY,
        user_id varchar(255) NOT NULL,
        merchant_key varchar(96) NOT NULL,
        display_name varchar(255) NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await resilientRawSql(() => rawSql`
      CREATE UNIQUE INDEX IF NOT EXISTS double_charge_watchlist_excl_user_key_idx
      ON double_charge_watchlist_exclusions (user_id, merchant_key)
    `);
    await resilientRawSql(() => rawSql`
      CREATE INDEX IF NOT EXISTS double_charge_watchlist_excl_user_idx
      ON double_charge_watchlist_exclusions (user_id)
    `);
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });

  return ensurePromise;
}
