import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * FinTRK field-level encryption (AES-256-GCM), modeled on BioTRK's PHI stack.
 *
 * - One global master secret: FINTRK_ENCRYPTION_KEY (>= 32 chars).
 * - Per-value random IV; GCM auth tag prevents tampering.
 * - Stored format: "v2:" + base64( iv[16] + authTag[16] + ciphertext ).
 * - Plaintext passthrough: values that are not v2-prefixed are returned
 *   unchanged on read, so existing/unencrypted rows keep working and the
 *   data migrates lazily as rows are rewritten. This makes turning the key
 *   on a zero-downtime change.
 * - Key missing: ef() stores plaintext (app stays functional); df() refuses
 *   to leak v2 ciphertext to clients (returns null).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const V2_PREFIX = "v2:";
const FIXED_SALT = Buffer.from("fintrk-field-encrypt-v2-salt");
const BUF_MARKER = Buffer.from("FT2!");

let _cachedFieldKey: Buffer | null = null;
let _keyConfirmed = false;

function hasSecret(): boolean {
  if (_keyConfirmed) return true;
  const secret = process.env.FINTRK_ENCRYPTION_KEY;
  if (secret && secret.length >= 32) {
    _keyConfirmed = true;
    return true;
  }
  return false;
}

/** True when a usable encryption key is configured (for health checks/UI). */
export function hasEncryptionKey(): boolean {
  return hasSecret();
}

export function resetKeyCache(): void {
  _cachedFieldKey = null;
  _keyConfirmed = false;
}

function requireSecret(): string {
  const secret = process.env.FINTRK_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("FINTRK_ENCRYPTION_KEY must be a string of at least 32 characters");
  }
  return secret;
}

function getFieldKey(): Buffer {
  if (_cachedFieldKey) return _cachedFieldKey;
  _cachedFieldKey = scryptSync(requireSecret(), FIXED_SALT, KEY_LENGTH);
  return _cachedFieldKey;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(V2_PREFIX);
}

/** Encrypt a non-null string. Passthrough if no key configured. */
export function encryptField(plaintext: string): string {
  if (!hasSecret()) return plaintext;
  const key = getFieldKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return V2_PREFIX + Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypt a v2-encrypted field. Plaintext (no v2: prefix) is returned
 * unchanged to support gradual migration. On v2 decryption failure, returns
 * null to avoid leaking ciphertext.
 */
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
  } catch (err) {
    console.error(
      JSON.stringify({
        _type: "fintrk_decrypt_error",
        msg: "v2 field decryption failed",
        err: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

/** Encrypt a nullable string before a DB write. */
export function ef(val: string | null | undefined): string | null {
  if (val == null) return null;
  if (!hasSecret()) return val;
  return encryptField(val);
}

/** Decrypt a nullable string after a DB read. */
export function df(val: string | null | undefined): string | null {
  if (val == null) return null;
  if (!hasSecret()) {
    if (val.startsWith(V2_PREFIX)) return null;
    return val;
  }
  return decryptField(val);
}

/**
 * Encrypt a JSON-serializable value for storage in a jsonb column. The
 * ciphertext is itself a JSON string scalar (e.g. `"v2:..."`), which is valid
 * jsonb, so no column type change is required.
 */
export function efJson(val: unknown): string | null {
  if (val == null) return null;
  return ef(JSON.stringify(val));
}

/** Decrypt a jsonb value produced by `efJson` back into its original shape. */
export function dfJson<T = unknown>(val: unknown): T | null {
  if (val == null) return null;
  // Already-parsed plaintext jsonb (object/array) from a pre-encryption row.
  if (typeof val !== "string") return val as T;
  const plain = df(val);
  if (plain == null) return null;
  try {
    return JSON.parse(plain) as T;
  } catch {
    return null;
  }
}

/** Round-trip probe for ops/health endpoints. */
export function testEncryptionHealth(): { ok: boolean; error?: string } {
  try {
    if (!hasSecret()) return { ok: false, error: "FINTRK_ENCRYPTION_KEY not configured" };
    const probe = encryptField("__health_probe__");
    const result = decryptField(probe);
    if (result !== "__health_probe__") {
      return { ok: false, error: "Round-trip mismatch" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ── Binary encryption (e.g. raw statement bytes if ever stored as bytea) ── */

export function encryptBuffer(data: Buffer): Buffer {
  if (!hasSecret()) return data;
  const key = getFieldKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([BUF_MARKER, iv, authTag, encrypted]);
}

export function decryptBuffer(data: Buffer): Buffer {
  if (data.subarray(0, 4).equals(BUF_MARKER)) {
    const iv = data.subarray(4, 4 + IV_LENGTH);
    const authTag = data.subarray(4 + IV_LENGTH, 4 + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(4 + IV_LENGTH + AUTH_TAG_LENGTH);
    const key = getFieldKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
  return data;
}
