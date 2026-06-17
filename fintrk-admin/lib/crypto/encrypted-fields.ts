import { df, dfJson } from "@/lib/crypto/encryption";

/**
 * Registry of database columns that hold FinTRK field-level ciphertext.
 * Keep in sync with the user app's `lib/crypto/encrypted-fields.ts`.
 *
 * `text` = columns decrypted with df(). `json` = jsonb columns decrypted
 * with dfJson() (ciphertext stored as a JSON string scalar).
 */

export interface EncryptedTableSpec {
  text: string[];
  json: string[];
}

export const ENCRYPTED_FIELDS: Record<string, EncryptedTableSpec> = {
  users: {
    text: ["primary_email", "first_name", "last_name", "username", "image_url"],
    json: ["clerk_snapshot"],
  },
  accounts: {
    text: ["institution_name", "account_name"],
    json: [],
  },
  statements: {
    text: ["file_data", "ai_error"],
    json: [],
  },
  transactions: {
    text: ["note"],
    json: [],
  },
  net_worth_items: {
    text: ["label", "notes"],
    json: [],
  },
  net_worth_settings: {
    text: ["annual_income", "birth_month", "birth_year"],
    json: [],
  },
  ai_insights: {
    text: ["title", "body"],
    json: ["metadata"],
  },
};

export const ENCRYPTED_TABLES = new Set(Object.keys(ENCRYPTED_FIELDS));

export function isEncryptedTable(table: string): boolean {
  return ENCRYPTED_TABLES.has(table);
}

/**
 * Decrypt the encrypted columns of a raw (snake_case) row for a given table.
 * Unknown tables and plaintext values pass through unchanged.
 */
export function decryptRow<T extends Record<string, unknown>>(table: string, row: T): T {
  const spec = ENCRYPTED_FIELDS[table];
  if (!spec) return row;
  const out: Record<string, unknown> = { ...row };
  for (const col of spec.text) {
    if (col in out) out[col] = df(out[col] as string | null | undefined);
  }
  for (const col of spec.json) {
    if (col in out) out[col] = dfJson(out[col]);
  }
  return out as T;
}

/** Subset of encrypted columns to decrypt for a given list of column names. */
export function encryptedColumnsFor(table: string): Set<string> {
  const spec = ENCRYPTED_FIELDS[table];
  if (!spec) return new Set();
  return new Set([...spec.text, ...spec.json]);
}
