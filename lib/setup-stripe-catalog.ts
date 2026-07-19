import "server-only";

import Stripe from "stripe";

import { FINTRK_PLAN_PRICING } from "@/lib/plan-pricing";
import { getStripe, PRICE_LOOKUP_ANNUAL, PRICE_LOOKUP_MONTHLY } from "@/lib/stripe";

export interface StripeCatalogResult {
  productId: string;
  monthlyPriceId: string;
  annualPriceId: string;
  created: string[];
}

async function ensurePrice(
  stripe: Stripe,
  productId: string,
  lookupKey: string,
  unitAmount: number,
  interval: "month" | "year",
  created: string[],
): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const current = existing.data[0];
  if (current && current.unit_amount === unitAmount) return current;

  // Amount changed (or no price yet): create a new Price and move the
  // lookup key onto it so checkout picks up the live amount. Existing
  // subscribers stay on their prior Price objects.
  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: unitAmount,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
  });
  created.push(`${lookupKey}:${price.id}`);
  return price;
}

/** Idempotent FinTRK Pro product + monthly/annual USD prices in Stripe. */
export async function ensureStripeCatalog(): Promise<StripeCatalogResult> {
  const stripe = getStripe();
  const created: string[] = [];

  let productId: string | null = null;
  for (const lk of [PRICE_LOOKUP_MONTHLY, PRICE_LOOKUP_ANNUAL]) {
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
    created.push(`product:${product.id}`);
  }

  const monthly = await ensurePrice(
    stripe,
    productId,
    PRICE_LOOKUP_MONTHLY,
    FINTRK_PLAN_PRICING.monthlyCents,
    "month",
    created,
  );
  const annual = await ensurePrice(
    stripe,
    productId,
    PRICE_LOOKUP_ANNUAL,
    FINTRK_PLAN_PRICING.annualCents,
    "year",
    created,
  );

  return {
    productId,
    monthlyPriceId: monthly.id,
    annualPriceId: annual.id,
    created,
  };
}
