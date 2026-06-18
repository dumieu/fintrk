import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe, hasStripeKey } from "@/lib/stripe";
import { syncSubscriptionToClerk } from "@/lib/billing-sync";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe -> FinTRK source of truth. On any subscription lifecycle change we
 * write the resulting plan/status onto the Clerk user, which drives the trial
 * wall (middleware claim + publicMetadata). This route is public (signature
 * verified) - see middleware `/api/webhooks/(.*)`.
 */
export async function POST(req: NextRequest) {
  if (!hasStripeKey()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    logServerError("stripe_webhook_no_secret", new Error("STRIPE_WEBHOOK_SECRET missing"));
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret);
  } catch (err) {
    logServerError("stripe_webhook_verify", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncSubscriptionToClerk(event.data.object as Stripe.Subscription);
        break;

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscriptionToClerk(sub);
        }
        break;
      }

      default:
        // Ignore unrelated events.
        break;
    }
  } catch (err) {
    logServerError(`stripe_webhook_handle_${event.type}`, err);
    // 500 so Stripe retries transient failures.
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
