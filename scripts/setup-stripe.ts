import { chmodSync, writeFileSync } from "fs";

import { config } from "dotenv";
import { Module } from "module";

config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

const origResolve = (
  Module as unknown as { _resolveFilename: (...a: unknown[]) => string }
)._resolveFilename;
(
  Module as unknown as { _resolveFilename: (...a: unknown[]) => string }
)._resolveFilename = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return require.resolve("./_noop-server-only.cjs");
  return origResolve.call(this, request, ...rest);
};

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  const { ensureStripeCatalog } = await import("../lib/setup-stripe-catalog");
  const result = await ensureStripeCatalog();
  const { webhookSigningSecret, ...safe } = result;
  console.log("Stripe catalog ready");
  console.log(JSON.stringify(safe, null, 2));
  if (webhookSigningSecret) {
    const secretFile = "/tmp/fintrk-stripe-whsec.txt";
    writeFileSync(secretFile, webhookSigningSecret, { mode: 0o600 });
    chmodSync(secretFile, 0o600);
    console.log(`New webhook signing secret written to ${secretFile}. Add it to STRIPE_WEBHOOK_SECRET. Not printed here.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
