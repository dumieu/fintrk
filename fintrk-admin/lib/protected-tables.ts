import "server-only";

/**
 * Public tables that must not be mutated via the generic row editor.
 * Break-the-glass sessions, the audit buffer, and admin settings
 * (vendor checklist) have dedicated APIs; table-browser INSERT/UPDATE/DELETE
 * would bypass those controls.
 *
 * Also locked:
 * - cron_runs: forging success/failure would mislead the Crons dashboard
 * - mcp_*: auth code / bearer / client secret hash material
 */
export const MUTATION_PROTECTED_TABLES = new Set([
  "admin_decryption_sessions",
  "admin_audit_buffer",
  "admin_settings",
  "cron_runs",
  "mcp_tokens",
  "mcp_auth_codes",
  "mcp_clients",
]);

/** Columns that must never appear in the row editor / filter chips / export. */
const SECRETS_REDACT_COLUMNS: Record<string, ReadonlySet<string>> = {
  mcp_tokens: new Set(["token_hash", "refresh_hash"]),
  mcp_auth_codes: new Set(["code_hash", "code_challenge"]),
  mcp_clients: new Set(["client_secret_hash"]),
  // Statement upload payloads (encrypted base64 / JSON) - never dump in grid.
  statements: new Set(["file_data"]),
};

export function isMutationProtectedTable(table: string): boolean {
  return MUTATION_PROTECTED_TABLES.has(table);
}

export function isSecretsRedactTable(table: string): boolean {
  return table in SECRETS_REDACT_COLUMNS;
}

export function isSecretsRedactColumn(table: string, column: string): boolean {
  return SECRETS_REDACT_COLUMNS[table]?.has(column) === true;
}

/** Redact secret columns for table-browser GET / export / mutation responses. */
export function redactSecretsRow(
  table: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const cols = SECRETS_REDACT_COLUMNS[table];
  if (!cols) return row;
  let changed = false;
  const out: Record<string, unknown> = { ...row };
  for (const col of cols) {
    if (col in out) {
      out[col] = "[redacted]";
      changed = true;
    }
  }
  return changed ? out : row;
}
