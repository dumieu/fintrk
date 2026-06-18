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
