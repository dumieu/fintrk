import "server-only";

import { df, dfJson, isEncrypted } from "@/lib/crypto/encryption";
import { ENCRYPTED_FIELDS } from "@/lib/crypto/encrypted-fields";
import {
  isSecretsRedactColumn,
  redactSecretsRow,
} from "@/lib/protected-tables";

/**
 * Encrypted field text for admin API responses.
 * Decrypt only when `decrypt` is true (active break-the-glass session).
 * Without decrypt, `v2:` ciphertext is withheld (null); plaintext passes through.
 */
export function phiTextForAdminResponse(
  raw: string | null | undefined,
  decrypt = false,
): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw);
  if (!decrypt) {
    if (isEncrypted(s)) return null;
    return s.trim() || null;
  }
  const d = df(s);
  const out = (d ?? s).trim();
  return out || null;
}

/**
 * Apply BTG-gated decrypt / withhold to encrypted columns (and optional
 * `user_email` join overlay) on a snake_case admin row.
 * Secret / blob columns are always redacted (never decrypted or dumped).
 */
export function adminRowFields(
  table: string,
  row: Record<string, unknown>,
  canDecrypt: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  const spec = ENCRYPTED_FIELDS[table];
  if (spec) {
    for (const col of spec.text) {
      if (!(col in out)) continue;
      // Skip decrypt for columns we always redact (e.g. statements.file_data).
      if (isSecretsRedactColumn(table, col)) continue;
      out[col] = phiTextForAdminResponse(
        out[col] as string | null | undefined,
        canDecrypt,
      );
    }
    for (const col of spec.json) {
      if (!(col in out)) continue;
      if (isSecretsRedactColumn(table, col)) continue;
      if (canDecrypt) {
        out[col] = dfJson(out[col]);
      } else if (
        typeof out[col] === "string" &&
        isEncrypted(out[col] as string)
      ) {
        out[col] = null;
      }
    }
  }
  if ("user_email" in out) {
    out.user_email = phiTextForAdminResponse(
      out.user_email as string | null | undefined,
      canDecrypt,
    );
  }
  return redactSecretsRow(table, out);
}
