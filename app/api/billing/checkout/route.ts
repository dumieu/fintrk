import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import {
  appOrigin,
  getStripe,
  hasStripeKey,
  resolvePortalConfigurationId,
  resolveProPriceId,
  TRIAL_DAYS,
} from "@/lib/stripe";
import { getOrCreateCustomerId } from "@/lib/billing-sync";
import { PRO_STATUSES } from "@/lib/entitlement";
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

    const priceId = await resolveProPriceId(interval);
    if (!priceId) {
      logServerError("billing_checkout_missing_price", new Error(`No price for ${interval}`));
      return NextResponse.json(
        { error: "Plan not available. Please contact support." },
        { status: 500 },
      );
    }

    const customerId = await getOrCreateCustomerId(userId, email);

    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });
    const live = existing.data.find((s) => PRO_STATUSES.has(s.status));
    if (live) {
      const configuration = await resolvePortalConfigurationId();
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${appOrigin()}/dashboard/upgrade`,
        ...(configuration ? { configuration } : {}),
      });
      return NextResponse.json({ url: portal.url });
    }

    // Only first-time subscribers get the free trial.
    const hadSubscription = existing.data.length > 0;
    const origin = appOrigin();
    const periodLabel = interval === "year" ? "annual" : "monthly";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { clerkUserId: userId, app: "fintrk", plan: "pro", interval },
        description: `FinTRK Pro - ${periodLabel}`,
        ...(hadSubscription
          ? {}
          : {
              trial_period_days: TRIAL_DAYS,
              trial_settings: {
                end_behavior: { missing_payment_method: "cancel" },
              },
            }),
      },
      // The account default currency is SGD. Keep the charge on the USD Price.
      adaptive_pricing: { enabled: false },
      payment_method_collection: "always",
      customer_update: { name: "auto", address: "auto" },
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard/upgrade?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/upgrade?canceled=1`,
      metadata: { clerkUserId: userId, app: "fintrk", plan: "pro", interval },
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
