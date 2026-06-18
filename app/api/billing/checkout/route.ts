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
import { logServerError } from "@/lib/safe-error";

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

    // Only first-time subscribers get the free trial.
    const hadSubscription = !!(user?.privateMetadata as Record<string, unknown> | null)?.[
      "stripeSubscriptionId"
    ];
    const origin = appOrigin();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        metadata: { clerkUserId: userId },
        ...(hadSubscription ? {} : { trial_period_days: TRIAL_DAYS }),
      },
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard/cashflow?subscribed=1`,
      cancel_url: `${origin}/dashboard/upgrade?canceled=1`,
      metadata: { clerkUserId: userId },
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
