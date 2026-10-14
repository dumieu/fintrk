import type Stripe from "stripe";

/**
 * Subscription id on an invoice. Older API versions put it on
 * `invoice.subscription`. Newer versions nest it under
 * `parent.subscription_details.subscription`.
 */
export function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const legacy = (
    invoice as Stripe.Invoice & {
      subscription?: string | { id?: string } | null;
    }
  ).subscription;
  if (typeof legacy === "string" && legacy) return legacy;
  if (legacy && typeof legacy === "object" && legacy.id) return legacy.id;

  const parent = (
    invoice as Stripe.Invoice & {
      parent?: {
        subscription_details?: { subscription?: string | { id?: string } | null };
      } | null;
    }
  ).parent?.subscription_details?.subscription;
  if (typeof parent === "string" && parent) return parent;
  if (parent && typeof parent === "object" && parent.id) return parent.id;
  return null;
}
