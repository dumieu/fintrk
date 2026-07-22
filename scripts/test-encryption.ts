/**
 * Round-trip + optional cross-app verification for FinTRK field encryption.
 *   npx tsx scripts/test-encryption.ts
 *
 * Cross-app checks load the admin decrypt module from a sibling MktgTRK
 * checkout when present. The FinTRK Vercel deploy does not include MktgTRK,
 * so those checks are skipped there (and this file is not part of `next build`).
 */
import { existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// Stub `server-only` so the real modules import cleanly under tsx/node.
import { Module } from "module";
const origResolve = (Module as unknown as { _resolveFilename: (...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (...a: unknown[]) => string })._resolveFilename = function (
  request: unknown,
  ...rest: unknown[]
) {
  if (request === "server-only") return require.resolve("./_noop-server-only.cjs");
  return origResolve.call(this, request, ...rest);
};

type DecryptApi = {
  df: (val: string | null | undefined) => string | null;
  dfJson: <T = unknown>(val: unknown) => T | null;
};

/** Admin decrypt lives in xTRK Admin (MktgTRK). Optional for standalone clones. */
async function loadAdminDecrypt(): Promise<DecryptApi | null> {
  const adminFile = join(process.cwd(), "..", "MktgTRK", "lib", "fintrk", "crypto", "encryption.ts");
  if (!existsSync(adminFile)) return null;
  const mod = await import(pathToFileURL(adminFile).href);
  return mod as DecryptApi;
}

async function main() {
  const user = await import("../lib/crypto/encryption");
  const admin = await loadAdminDecrypt();

  let pass = 0;
  let fail = 0;
  const check = (name: string, cond: boolean) => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}`); }
  };

  console.log("Key configured:", user.hasEncryptionKey());
  if (!admin) {
    console.log("Admin decrypt module not found (sibling MktgTRK) - skipping cross-app checks");
  }

  // 1. Basic round trip (user app)
  const plain = "Marcus Sterling - marcus@example.com";
  const ct = user.ef(plain)!;
  check("ef produces v2 ciphertext", ct.startsWith("v2:") && ct !== plain);
  check("user df round-trips", user.df(ct) === plain);

  // 2. Cross-app: admin decrypts user ciphertext
  if (admin) {
    check("admin df decrypts user ciphertext", admin.df(ct) === plain);
  }

  // 3. JSON helper
  const obj = { first_name: "Elena", nested: { kids: 3 } };
  const jct = user.efJson(obj)!;
  check("efJson produces v2 ciphertext", jct.startsWith("v2:"));
  check("dfJson round-trips (user)", JSON.stringify(user.dfJson(jct)) === JSON.stringify(obj));
  if (admin) {
    check("dfJson round-trips (admin)", JSON.stringify(admin.dfJson(jct)) === JSON.stringify(obj));
  }

  // 4. Plaintext passthrough (migration safety)
  check("df passes through plaintext", user.df("90000.00") === "90000.00");
  if (admin) {
    check("admin df passes through plaintext", admin.df("just text") === "just text");
  }

  // 5. null handling
  check("ef(null) === null", user.ef(null) === null);
  check("df(null) === null", user.df(null) === null);

  // 6. Tamper detection
  const tampered = ct.slice(0, -4) + "AAAA";
  check("tampered ciphertext -> null", user.df(tampered) === null || user.df(tampered) !== plain);

  console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
