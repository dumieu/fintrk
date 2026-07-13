import { sql } from "drizzle-orm";
import { transactions } from "@/lib/db/schema";

/**
 * Visible transaction name in the table (prefers merchant_name, else raw_description).
 * Uses `||` so blank merchant_name still falls back to the statement line.
 */
export function transactionDisplayName(
  merchantName: string | null | undefined,
  rawDescription: string | null | undefined,
): string {
  const clean = (value: string) =>
    value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\ufeff]/g, "").trim();
  return clean(merchantName ?? "") || clean(rawDescription ?? "") || "";
}

/**
 * Normalized key for bulk "apply to matching names" actions.
 * Matches {@link transactionDisplayNameSql} in the database.
 */
export function transactionMerchantKey(
  merchantName: string | null | undefined,
  rawDescription: string | null | undefined,
): string {
  return transactionDisplayName(merchantName, rawDescription).toLowerCase().slice(0, 255);
}

export function transactionMatchesMerchantKey(
  merchantName: string | null | undefined,
  rawDescription: string | null | undefined,
  key: string,
): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  return transactionMerchantKey(merchantName, rawDescription) === normalized;
}

/** SQL expression aligned with {@link transactionMerchantKey}. */
export function transactionDisplayNameSql() {
  return sql`lower(btrim(coalesce(nullif(btrim(${transactions.merchantName}), ''), ${transactions.rawDescription})))`;
}

/** @deprecated alias — use transactionDisplayNameSql */
export function transactionMerchantKeySql() {
  return transactionDisplayNameSql();
}

export function eqTransactionMerchantKey(key: string) {
  return sql`${transactionDisplayNameSql()} = ${key.trim().toLowerCase()}`;
}
