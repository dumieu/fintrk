import "server-only";

import Stripe from "stripe";

/**
 * Direct Stripe integration (replaces Clerk Billing, which does not support
 * Singapore-based Stripe accounts). Stripe natively supports SG accounts
 * charging in USD, so checkout, the customer portal, the 7-day trial, and
 * proration are all handled here against the FinTRK Stripe account.
 *
 * Required env:
 *   STRIPE_SECRET_KEY       - sk_live_... (server only)
 *   STRIPE_WEBHOOK_SECRET   - whsec_...   (signature verification)
 * Optional:
 *   NEXT_PUBLIC_APP_URL     - canonical origin for success/cancel/return URLs
 */

export const STRIPE_API_VERSION = "2026-05-27.dahlia";

/** Plan identity, mirrored into Clerk user metadata for fast entitlement reads. */
export const PRO_PLAN = "pro";

/** Stable price lookup keys (resolved at runtime; no hardcoded price IDs). */
export const PRICE_LOOKUP_MONTHLY = "fintrk_pro_monthly";
export const PRICE_LOOKUP_ANNUAL = "fintrk_pro_annual";

/** Optional pinned Price ids. Lookup keys are the fallback. */
export const PRICE_ENV_MONTHLY = "STRIPE_PRICE_PRO_MONTHLY";
export const PRICE_ENV_ANNUAL = "STRIPE_PRICE_PRO_ANNUAL";
export const PORTAL_CONFIGURATION_ENV = "STRIPE_PORTAL_CONFIGURATION_ID";

export const TRIAL_DAYS = 7;

let cached: Stripe | null = null;

export function hasStripeKey(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Lazily-instantiated Stripe client. Throws only when actually used without a key. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!cached) {
    cached = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return cached;
}

/** Canonical origin for Stripe redirect URLs. */
export function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://fintrk.io";
}

/**
 * The FinTRK Stripe account is incorporated in Singapore, so its default
 * currency is SGD. Checkout must use the USD Price we created. An env pin
 * wins; otherwise the lookup key on the live key's mode.
 */
export async function resolveProPriceId(
  interval: "month" | "year",
): Promise<string | null> {
  const envName = interval === "year" ? PRICE_ENV_ANNUAL : PRICE_ENV_MONTHLY;
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;

  const lookupKey = interval === "year" ? PRICE_LOOKUP_ANNUAL : PRICE_LOOKUP_MONTHLY;
  const prices = await getStripe().prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  return prices.data[0]?.id ?? null;
}

/**
 * FinTRK-only Customer Portal configuration. Passing this on every portal
 * session keeps a later default configuration from opening the wrong portal.
 */
export async function resolvePortalConfigurationId(): Promise<string | undefined> {
  const fromEnv = process.env[PORTAL_CONFIGURATION_ENV]?.trim();
  if (fromEnv) return fromEnv;
  const listed = await getStripe().billingPortal.configurations.list({
    active: true,
    limit: 100,
  });
  return listed.data.find((c) => c.metadata?.fintrk === "portal")?.id;
}
