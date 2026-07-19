import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import type Stripe from "stripe";

import { appOrigin, getStripe, hasStripeKey } from "@/lib/stripe";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opens the Stripe-hosted customer portal to manage / cancel the subscription. */
export async function POST() {
  if (!hasStripeKey()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await currentUser();
    const customerId = (user?.privateMetadata as Record<string, unknown> | null)?.[
      "stripeCustomerId"
    ];
    if (typeof customerId !== "string" || !customerId) {
      return NextResponse.json({ error: "No subscription found." }, { status: 404 });
    }

    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      return NextResponse.json({ error: "No subscription found." }, { status: 404 });
    }
    // Fail closed: require Stripe customer.metadata.clerkUserId === session.
    // Untagged customers must not open for whoever holds the id in Clerk metadata.
    const owner = (customer as Stripe.Customer).metadata?.clerkUserId?.trim();
    if (!owner || owner !== userId) {
      logServerError(
        "billing_portal_owner_mismatch",
        new Error(
          `customer ${customerId} owner ${owner || "(none)"} != session ${userId}`,
        ),
      );
      return NextResponse.json({ error: "No subscription found." }, { status: 404 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appOrigin()}/dashboard/upgrade`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    logServerError("billing_portal", err);
    return NextResponse.json({ error: "Could not open billing portal." }, { status: 500 });
  }
}
