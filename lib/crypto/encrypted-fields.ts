/**
 * Registry of database columns that hold FinTRK field-level ciphertext.
 *
 * Scope rule: a column may be encrypted ONLY if it is never used inside SQL
 * for filtering, joining, grouping, sorting, range comparison, aggregation, or
 * a unique/dedup index. Columns that power search, dedup, merchant rules, and
 * analytics (merchant_name, raw_description, reference_id, masked_number,
 * base_amount and other numeric amounts) stay plaintext by design.
 *
 * `text`  = columns decrypted with `df()`.
 * `json`  = jsonb columns decrypted with `dfJson()` (ciphertext stored as a
 *           JSON string scalar).
 *
 * Keep this file in sync with the copy in `fintrk-admin/lib/crypto/`.
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
    // file_name stays plaintext: it is used in SQL dedupe equality
    // (eq(statements.file_name, ...)) and joined/displayed widely.
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
