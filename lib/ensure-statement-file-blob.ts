import "server-only";
import { rawSql, resilientRawSql } from "@/lib/db";

let ensurePromise: Promise<void> | null = null;

/**
 * Durable statement-file storage columns.
 *  - file_blob: gzip + AES-256-GCM packed original bytes (see packBlob). Stored
 *    as bytea so there is no base64 storage bloat; read/written via
 *    encode/decode(?, 'base64') to stay safe over the Neon HTTP driver.
 *  - stored_size: byte length of file_blob, for storage telemetry / display.
 */
export function ensureStatementFileBlobColumns(): Promise<void> {
  ensurePromise ??= (async () => {
    await resilientRawSql(() => rawSql`
      ALTER TABLE statements
      ADD COLUMN IF NOT EXISTS file_blob bytea
    `);
    await resilientRawSql(() => rawSql`
      ALTER TABLE statements
      ADD COLUMN IF NOT EXISTS stored_size integer
    `);
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });

  return ensurePromise;
}
