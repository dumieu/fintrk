import "server-only";

import { getStripe } from "@/lib/stripe";
import { PRO_STATUSES } from "@/lib/entitlement";
import { syncSubscriptionToClerk } from "@/lib/billing-sync";

export interface CheckoutConfirmResult {
  ok: boolean;
  status: string | null;
  error?: string;
}

/**
 * Apply a finished Checkout session to the signed-in Clerk user immediately,
 * so the paywall does not wait on the webhook.
 */
export async function confirmCheckoutSession(
  sessionId: string,
  clerkUserId: string,
): Promise<CheckoutConfirmResult> {
  if (!sessionId.startsWith("cs_")) {
    return { ok: false, status: null, error: "That checkout session is not valid." };
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const owner = session.client_reference_id || session.metadata?.clerkUserId || "";
  if (!owner || owner !== clerkUserId) {
    return { ok: false, status: null, error: "This checkout does not belong to your account." };
  }
  if (session.metadata?.app && session.metadata.app !== "fintrk") {
    return { ok: false, status: null, error: "This checkout is not a FinTRK plan." };
  }
  if (session.mode !== "subscription" || session.status !== "complete") {
    return { ok: false, status: null, error: "Checkout is not finished yet." };
  }

  const subRef = session.subscription;
  const subId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!subId) {
    return { ok: false, status: null, error: "No subscription was created." };
  }

  const sub = await stripe.subscriptions.retrieve(subId);
  await syncSubscriptionToClerk(sub);
  if (!PRO_STATUSES.has(sub.status)) {
    return {
      ok: false,
      status: sub.status,
      error: "Payment is not active yet. You can try again from this page.",
    };
  }
  return { ok: true, status: sub.status };
}
