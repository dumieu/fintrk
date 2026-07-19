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
 *
 * Never reuses a Stripe customer tagged to a different Clerk user (poisoned
 * privateMetadata). Clears the bad id and creates a fresh customer instead.
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
  if (typeof existing === "string" && existing.length > 0) {
    const owned = await claimOrRejectExistingCustomer(existing, clerkUserId);
    if (owned) return existing;
    // Stale / foreign customer id in Clerk - drop it and create a new one below.
    await client.users.updateUserMetadata(clerkUserId, {
      privateMetadata: { stripeCustomerId: null },
    });
  }

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

/**
 * Returns true if `customerId` may be used by `clerkUserId`.
 * Rejects deleted customers and customers tagged to someone else.
 * Heals missing clerkUserId metadata only when empty (never overwrites).
 */
async function claimOrRejectExistingCustomer(
  customerId: string,
  clerkUserId: string,
): Promise<boolean> {
  const stripe = getStripe();
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      logServerError(
        "billing_sync_customer_deleted",
        new Error(`customer ${customerId} deleted; creating new`),
      );
      return false;
    }
    const owner = (customer as Stripe.Customer).metadata?.clerkUserId?.trim() ?? "";
    if (owner && owner !== clerkUserId) {
      logServerError(
        "billing_sync_customer_owner_mismatch",
        new Error(`customer ${customerId} owner ${owner} != session ${clerkUserId}`),
      );
      return false;
    }
    if (!owner) {
      await stripe.customers.update(customerId, {
        metadata: { clerkUserId },
      });
    }
    return true;
  } catch (err) {
    logServerError("billing_sync_customer_claim", err);
    return false;
  }
}

/**
 * Resolve the Clerk user id tied to a Stripe subscription.
 * Prefer customer.metadata (set at create) over subscription.metadata, which
 * is easier to edit in Dashboard/API and could retarget Pro entitlement.
 */
async function clerkUserIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromSub = typeof sub.metadata?.clerkUserId === "string" ? sub.metadata.clerkUserId.trim() : "";
  let fromCustomer = "";

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) {
    try {
      const stripe = getStripe();
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted) {
        const raw = (customer as Stripe.Customer).metadata?.clerkUserId;
        if (typeof raw === "string") fromCustomer = raw.trim();
      }
    } catch (err) {
      logServerError("billing_sync_customer_lookup", err);
    }
  }

  if (fromCustomer && fromSub && fromCustomer !== fromSub) {
    logServerError(
      "billing_sync_clerk_mismatch",
      new Error(`sub ${sub.id}: customer vs subscription clerkUserId mismatch; using customer`),
    );
    return fromCustomer;
  }
  if (fromCustomer) return fromCustomer;
  if (fromSub) return fromSub;
  return null;
}

/** Higher = more authoritative for entitlement (active beats canceled). */
function subscriptionRank(sub: Stripe.Subscription): number {
  switch (sub.status) {
    case "active":
      return 500;
    case "trialing":
      return 400;
    case "past_due":
      return 300;
    case "paused":
      return 200;
    case "incomplete":
      return 100;
    default:
      return 0;
  }
}

/**
 * Pick the subscription that should drive Clerk plan state. Prevents a stale
 * canceled/deleted webhook from demoting a user who still has an active sub.
 */
function pickBestSubscription(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  if (subs.length === 0) return null;
  return [...subs].sort((a, b) => {
    const byRank = subscriptionRank(b) - subscriptionRank(a);
    if (byRank !== 0) return byRank;
    return (b.created ?? 0) - (a.created ?? 0);
  })[0]!;
}

/**
 * List live subscriptions for a customer and merge in the webhook object
 * (deleted events may already be absent from list).
 */
async function reconcileSubscription(
  preferred: Stripe.Subscription,
): Promise<Stripe.Subscription> {
  const customerId =
    typeof preferred.customer === "string" ? preferred.customer : preferred.customer?.id;
  if (!customerId) return preferred;

  try {
    const stripe = getStripe();
    const listed = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const byId = new Map<string, Stripe.Subscription>();
    for (const s of listed.data) byId.set(s.id, s);
    byId.set(preferred.id, preferred);
    const best = pickBestSubscription([...byId.values()]);
    return best ?? preferred;
  } catch (err) {
    logServerError("billing_sync_list_subs", err);
    return preferred;
  }
}

/**
 * Write a Stripe subscription's state onto the Clerk user so the app's
 * entitlement checks (middleware claim + publicMetadata) reflect it.
 * Always reconciles against the customer's other subscriptions so an old
 * canceled/deleted event cannot clobber a newer Pro subscription.
 */
export async function syncSubscriptionToClerk(sub: Stripe.Subscription): Promise<void> {
  const clerkUserId = await clerkUserIdForSubscription(sub);
  if (!clerkUserId) {
    logServerError("billing_sync_no_user", new Error(`No clerkUserId for sub ${sub.id}`));
    return;
  }

  const effective = await reconcileSubscription(sub);
  const isPro = PRO_STATUSES.has(effective.status);
  const periodEnd = subscriptionPeriodEnd(effective);

  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkUserId, {
    publicMetadata: {
      plan: isPro ? PRO_PLAN : "free",
      planStatus: effective.status,
      planRenewsAt: periodEnd,
    },
    privateMetadata: {
      stripeCustomerId:
        typeof effective.customer === "string" ? effective.customer : effective.customer?.id,
      stripeSubscriptionId: effective.id,
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
