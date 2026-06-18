/**
 * One-time (idempotent) Stripe catalog setup for FinTRK Pro.
 * Creates a product + monthly ($8.98) and annual ($83.76) USD prices, each
 * tagged with a stable lookup_key so the app never hardcodes price IDs.
 *
 *   STRIPE_SECRET_KEY=sk_live_... npx tsx scripts/setup-stripe.ts
 *
 * Safe to re-run: it reuses existing prices found by lookup_key.
 */
import { config } from "dotenv";
import Stripe from "stripe";

config({ path: ".env.local" });
config({ path: ".env" });

const MONTHLY = "fintrk_pro_monthly";
const ANNUAL = "fintrk_pro_annual";

async function ensurePrice(
  stripe: Stripe,
  productId: string,
  lookupKey: string,
  unitAmount: number,
  interval: "month" | "year",
): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) {
    console.log(`= price ${lookupKey} already exists: ${existing.data[0].id}`);
    return existing.data[0];
  }
  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: unitAmount,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
  });
  console.log(`+ created price ${lookupKey}: ${price.id} (${unitAmount} usd / ${interval})`);
  return price;
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  const stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });

  // Reuse a product that already owns either price, else create one.
  let productId: string | null = null;
  for (const lk of [MONTHLY, ANNUAL]) {
    const found = await stripe.prices.list({ lookup_keys: [lk], limit: 1 });
    const p = found.data[0]?.product;
    if (p) {
      productId = typeof p === "string" ? p : p.id;
      break;
    }
  }
  if (!productId) {
    const product = await stripe.products.create({
      name: "FinTRK Pro",
      description:
        "Full access to FinTRK: uploads, cashflow, spend analytics, the Net Worth Atlas, and Connect-your-AI.",
    });
    productId = product.id;
    console.log(`+ created product: ${productId}`);
  } else {
    console.log(`= reusing product: ${productId}`);
  }

  await ensurePrice(stripe, productId, MONTHLY, 898, "month");
  await ensurePrice(stripe, productId, ANNUAL, 8376, "year");

  console.log("\n✓ Stripe catalog ready. Lookup keys:", MONTHLY, ANNUAL);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
