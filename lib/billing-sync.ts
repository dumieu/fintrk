import "server-only";

import type Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";

import { getStripe, PRO_PLAN } from "@/lib/stripe";
import { PRO_STATUSES } from "@/lib/entitlement";
import { logServerError } from "@/lib/safe-error";

/**
 * Find the Stripe customer for a Clerk user, creating one on first checkout.
 * The customer id is cached on the user's privateMetadata; the Clerk user id is
 * stored on the Stripe customer's metadata so webhooks can map back.
 */
export async function getOrCreateCustomerId(
  clerkUserId: string,
  email: string | null,
): Promise<string> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const existing = (user.privateMetadata as Record<string, unknown> | null)?.[
    "stripeCustomerId"
  ];
  if (typeof existing === "string" && existing.length > 0) return existing;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { clerkUserId },
  });

  await client.users.updateUserMetadata(clerkUserId, {
    privateMetadata: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/** Resolve the Clerk user id tied to a Stripe subscription. */
async function clerkUserIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromSub = sub.metadata?.clerkUserId;
  if (fromSub) return fromSub;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  try {
    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const id = (customer as Stripe.Customer).metadata?.clerkUserId;
    return id || null;
  } catch (err) {
    logServerError("billing_sync_customer_lookup", err);
    return null;
  }
}

/**
 * Write a Stripe subscription's state onto the Clerk user so the app's
 * entitlement checks (middleware claim + publicMetadata) reflect it.
 */
export async function syncSubscriptionToClerk(sub: Stripe.Subscription): Promise<void> {
  const clerkUserId = await clerkUserIdForSubscription(sub);
  if (!clerkUserId) {
    logServerError("billing_sync_no_user", new Error(`No clerkUserId for sub ${sub.id}`));
    return;
  }

  const isPro = PRO_STATUSES.has(sub.status);
  const periodEnd = subscriptionPeriodEnd(sub);

  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkUserId, {
    publicMetadata: {
      plan: isPro ? PRO_PLAN : "free",
      planStatus: sub.status,
      planRenewsAt: periodEnd,
    },
    privateMetadata: {
      stripeCustomerId:
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      stripeSubscriptionId: sub.id,
    },
  });
}

/** current_period_end lives on the subscription item in recent Stripe API versions. */
function subscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const top = (sub as unknown as { current_period_end?: number }).current_period_end;
  if (typeof top === "number") return top;
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  return typeof item?.current_period_end === "number" ? item.current_period_end : null;
}
