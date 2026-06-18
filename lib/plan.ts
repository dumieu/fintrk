import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";

import { isProMetadata, readPlanMetadata } from "@/lib/entitlement";

/**
 * FinTRK Pro plan, billed directly through Stripe (see lib/stripe.ts). Plan
 * state lives on the Clerk user's publicMetadata, written by the Stripe webhook
 * (/api/webhooks/stripe). Trialing users count as Pro, so the 7-day trial lifts
 * the wall and it re-engages when the subscription lapses.
 */
export const PRO_PLAN = "pro";

/**
 * Dev escape hatch. Set `FINTRK_BILLING_ENFORCED=false` to disable the paywall
 * locally (still requires a signed-in session). Production leaves this unset.
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

/** Read plan metadata from the session-token claim, if it's configured. */
function planClaimFromSession(sessionClaims: unknown): unknown {
  const c = sessionClaims as Record<string, unknown> | null | undefined;
  if (!c) return undefined;
  return c.metadata ?? c.publicMetadata ?? undefined;
}

/**
 * True when the current request may use the (Pro-only) authenticated app:
 * an active subscription or trial, the public demo, or when enforcement is off.
 * Fast path reads the session claim; falls back to live publicMetadata.
 */
export async function hasProAccess(): Promise<boolean> {
  if (!billingEnforced()) return true;
  if (await isDemoRequest()) return true;

  const { userId, sessionClaims } = await auth();
  if (!userId) return false;

  if (isProMetadata(planClaimFromSession(sessionClaims))) return true;

  try {
    const user = await currentUser();
    return isProMetadata(user?.publicMetadata);
  } catch {
    return false;
  }
}

export interface PlanState {
  isPro: boolean;
  status: string | null;
  renewsAt: number | null;
  /** Has a Stripe customer => can open the billing portal to manage/cancel. */
  manageable: boolean;
}

/** Full plan snapshot for the billing page (reads live Clerk metadata). */
export async function getPlanState(): Promise<PlanState> {
  try {
    const user = await currentUser();
    if (!user) return { isPro: false, status: null, renewsAt: null, manageable: false };
    const meta = readPlanMetadata(user.publicMetadata);
    const stripeCustomerId = (user.privateMetadata as Record<string, unknown> | null)?.[
      "stripeCustomerId"
    ];
    return {
      isPro: isProMetadata(user.publicMetadata),
      status: meta.planStatus ?? null,
      renewsAt: meta.planRenewsAt ?? null,
      manageable: typeof stripeCustomerId === "string" && stripeCustomerId.length > 0,
    };
  } catch {
    return { isPro: false, status: null, renewsAt: null, manageable: false };
  }
}
