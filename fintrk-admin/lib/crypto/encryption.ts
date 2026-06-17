import "server-only";
import { createDecipheriv, scryptSync } from "crypto";

/**
 * FinTRK field decryption (AES-256-GCM) - admin copy.
 *
 * Mirrors the user app's `lib/crypto/encryption.ts` format:
 *   "v2:" + base64( iv[16] + authTag[16] + ciphertext )
 *
 * Requires the SAME FINTRK_ENCRYPTION_KEY as the user app. This module only
 * decrypts (admin never re-encrypts user data). When the key is missing or a
 * value is plaintext, the value is returned unchanged.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const V2_PREFIX = "v2:";
const FIXED_SALT = Buffer.from("fintrk-field-encrypt-v2-salt");

let _cachedFieldKey: Buffer | null = null;

export function hasEncryptionKey(): boolean {
  const secret = process.env.FINTRK_ENCRYPTION_KEY;
  return Boolean(secret && secret.length >= 32);
}

function getFieldKey(): Buffer {
  if (_cachedFieldKey) return _cachedFieldKey;
  const secret = process.env.FINTRK_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("FINTRK_ENCRYPTION_KEY must be a string of at least 32 characters");
  }
  _cachedFieldKey = scryptSync(secret, FIXED_SALT, KEY_LENGTH);
  return _cachedFieldKey;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(V2_PREFIX);
}

export function decryptField(value: string): string | null {
  if (!value.startsWith(V2_PREFIX)) return value;
  try {
    const buf = Buffer.from(value.slice(V2_PREFIX.length), "base64");
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return null;
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const key = getFieldKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Decrypt a nullable string field. Plaintext passes through. */
export function df(val: string | null | undefined): string | null {
  if (val == null) return null;
  if (!hasEncryptionKey()) {
    if (val.startsWith(V2_PREFIX)) return null;
    return val;
  }
  return decryptField(val);
}

/** Decrypt a jsonb value (ciphertext stored as a JSON string scalar). */
export function dfJson<T = unknown>(val: unknown): T | null {
  if (val == null) return null;
  if (typeof val !== "string") return val as T;
  const plain = df(val);
  if (plain == null) return null;
  try {
    return JSON.parse(plain) as T;
  } catch {
    return null;
  }
}
