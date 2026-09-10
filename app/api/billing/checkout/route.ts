import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import {
  appOrigin,
  getStripe,
  hasStripeKey,
  PRICE_LOOKUP_ANNUAL,
  PRICE_LOOKUP_MONTHLY,
  TRIAL_DAYS,
} from "@/lib/stripe";
import { getOrCreateCustomerId } from "@/lib/billing-sync";
import { PRO_STATUSES } from "@/lib/entitlement";
import { logServerError } from "@/lib/safe-error";
import { xrefCustomerMap } from "@/lib/xref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasStripeKey()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let interval: "month" | "year" = "month";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.interval === "year" || body?.interval === "annual") interval = "year";
  } catch {
    /* default monthly */
  }

  try {
    const stripe = getStripe();
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? null;

    const lookupKey = interval === "year" ? PRICE_LOOKUP_ANNUAL : PRICE_LOOKUP_MONTHLY;
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) {
      logServerError("billing_checkout_missing_price", new Error(`No price for ${lookupKey}`));
      return NextResponse.json(
        { error: "Plan not available. Please contact support." },
        { status: 500 },
      );
    }

    const customerId = await getOrCreateCustomerId(userId, email);
    void xrefCustomerMap(userId, customerId);

    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });
    const live = existing.data.find((s) => PRO_STATUSES.has(s.status));
    if (live) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${appOrigin()}/dashboard/upgrade`,
      });
      return NextResponse.json({ url: portal.url });
    }

    // Only first-time subscribers get the free trial.
    const hadSubscription = existing.data.length > 0;
    const origin = appOrigin();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        metadata: { clerkUserId: userId, app: "fintrk" },
        ...(hadSubscription ? {} : { trial_period_days: TRIAL_DAYS }),
      },
      customer_update: { name: "auto", address: "auto" },
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard/cashflow?subscribed=1`,
      cancel_url: `${origin}/dashboard/upgrade?canceled=1`,
      metadata: { clerkUserId: userId, app: "fintrk" },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    logServerError("billing_checkout", err);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
