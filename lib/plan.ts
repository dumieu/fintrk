import "server-only";

import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";

/**
 * Clerk Billing plan slug (matches the plan key configured in the Clerk
 * Dashboard). Clerk owns the Stripe connected account, checkout, customer
 * portal, the 7-day free trial, and proration. We only ever read the plan via
 * `has({ plan })` - users who are trialing are reported as subscribed, so the
 * trial wall lifts automatically during the trial and re-engages when it lapses.
 */
export const PRO_PLAN = "fintrk_pro";

/**
 * Dev escape hatch. Set `FINTRK_BILLING_ENFORCED=false` to disable the paywall
 * locally (still requires a signed-in Clerk session). Production leaves this
 * unset, so the trial wall is fully enforced by default.
 */
export function billingEnforced(): boolean {
  return process.env.FINTRK_BILLING_ENFORCED !== "false";
}

/** The public, no-auth /demo experience must never be paywalled. */
async function isDemoRequest(): Promise<boolean> {
  try {
    const h = await headers();
    return h.get("x-fintrk-demo") === "1";
  } catch {
    return false;
  }
}

/**
 * True when the current request may use the (Pro-only) authenticated app:
 * an active subscription OR an active free trial, the public demo, or when
 * billing enforcement is explicitly disabled for local development.
 */
export async function hasProAccess(): Promise<boolean> {
  if (!billingEnforced()) return true;
  if (await isDemoRequest()) return true;

  const { userId, has } = await auth();
  if (!userId || typeof has !== "function") return false;

  try {
    return has({ plan: PRO_PLAN });
  } catch {
    return false;
  }
}
