import { config } from "dotenv";
import { ensureStripeCatalog } from "../lib/setup-stripe-catalog";

config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  const result = await ensureStripeCatalog();
  console.log("✓ Stripe catalog ready");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
