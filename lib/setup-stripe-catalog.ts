import "server-only";

import Stripe from "stripe";

import { FINTRK_PLAN_PRICING } from "@/lib/plan-pricing";
import {
  appOrigin,
  getStripe,
  PRICE_LOOKUP_ANNUAL,
  PRICE_LOOKUP_MONTHLY,
  STRIPE_API_VERSION,
} from "@/lib/stripe";

export const STRIPE_WEBHOOK_URL = "https://fintrk.io/api/webhooks/stripe";

export const PRODUCT_DESCRIPTION =
  "Full access to FinTRK: uploads, cashflow, spend analytics, and the Net Worth Atlas. 7-day free trial, then $6.98/month or $59.76/year.";

export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
] as const;

export interface StripeCatalogResult {
  productId: string;
  monthlyPriceId: string;
  annualPriceId: string;
  portalId: string | null;
  webhookId: string | null;
  webhookUpdated: boolean;
  created: string[];
  /**
   * Set only when this run created the webhook destination. Shown once.
   * Callers must not persist it (cron summaries, logs, or the database).
   */
  webhookSigningSecret?: string;
}

function priceNickname(interval: "month" | "year"): string {
  return interval === "month" ? "Pro monthly · $6.98/mo" : "Pro annual · $4.98/mo";
}

async function ensurePrice(
  stripe: Stripe,
  productId: string,
  lookupKey: string,
  unitAmount: number,
  interval: "month" | "year",
  created: string[],
): Promise<Stripe.Price> {
  const nickname = priceNickname(interval);
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const current = existing.data[0];
  if (current && current.unit_amount === unitAmount && current.currency === "usd") {
    if (current.nickname !== nickname) {
      await stripe.prices.update(current.id, { nickname });
      created.push(`nickname:${lookupKey}`);
    }
    return current;
  }

  // Amount changed (or no price yet): create a new Price and move the
  // lookup key onto it so checkout picks up the live amount. Existing
  // subscribers stay on their prior Price objects.
  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: unitAmount,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    nickname,
    metadata: { fintrk: lookupKey, app: "fintrk" },
  });
  created.push(`${lookupKey}:${price.id}`);
  return price;
}

/** Archive leftover active prices that nobody is subscribed to. */
async function retireSupersededPrices(
  stripe: Stripe,
  productId: string,
  keepIds: string[],
  created: string[],
): Promise<void> {
  const listed = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  for (const price of listed.data) {
    if (keepIds.includes(price.id)) continue;
    const subs = await stripe.subscriptions.list({
      price: price.id,
      status: "all",
      limit: 1,
    });
    if (subs.data.length > 0) continue;
    await stripe.prices.update(price.id, { active: false });
    created.push(`retired:${price.id}`);
  }
}

async function ensurePortal(
  stripe: Stripe,
  productId: string,
  priceIds: string[],
  created: string[],
): Promise<string | null> {
  const origin = appOrigin();
  const params: Stripe.BillingPortal.ConfigurationCreateParams = {
    name: "FinTRK Pro",
    business_profile: {
      headline: "FinTRK Pro - manage your plan",
      privacy_policy_url: `${origin}/privacy`,
      terms_of_service_url: `${origin}/terms`,
    },
    default_return_url: `${origin}/dashboard/upgrade`,
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "name", "address"],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: {
          enabled: true,
          options: [
            "too_expensive",
            "missing_features",
            "unused",
            "switched_service",
            "too_complex",
            "low_quality",
            "other",
          ],
        },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        trial_update_behavior: "continue_trial",
        products: [{ product: productId, prices: priceIds }],
      },
    },
    metadata: { fintrk: "portal", app: "fintrk" },
  };

  const listed = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  });
  const existing = listed.data.find((c) => c.metadata?.fintrk === "portal");
  if (existing) {
    await stripe.billingPortal.configurations.update(existing.id, {
      name: "FinTRK Pro",
      business_profile: params.business_profile,
      default_return_url: params.default_return_url,
      features: params.features,
      metadata: { fintrk: "portal", app: "fintrk" },
    });
    return existing.id;
  }
  const createdPortal = await stripe.billingPortal.configurations.create(params);
  created.push(`portal:${createdPortal.id}`);
  return createdPortal.id;
}

async function ensureWebhook(
  stripe: Stripe,
  created: string[],
): Promise<{ id: string | null; updated: boolean; secret?: string }> {
  const listed = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = listed.data.find(
    (w) => w.url === STRIPE_WEBHOOK_URL && w.status === "enabled",
  );
  if (!match) {
    const endpoint = await stripe.webhookEndpoints.create({
      url: STRIPE_WEBHOOK_URL,
      enabled_events: [...STRIPE_WEBHOOK_EVENTS],
      description: "FinTRK Pro subscription (direct Stripe, not Clerk Billing)",
      api_version: STRIPE_API_VERSION,
    });
    created.push(`webhook:${endpoint.id}`);
    return { id: endpoint.id, updated: true, secret: endpoint.secret ?? undefined };
  }

  const have = new Set(match.enabled_events);
  const missing = STRIPE_WEBHOOK_EVENTS.filter((e) => !have.has(e));
  if (missing.length === 0) return { id: match.id, updated: false };

  await stripe.webhookEndpoints.update(match.id, {
    enabled_events: Array.from(
      new Set([...match.enabled_events, ...STRIPE_WEBHOOK_EVENTS]),
    ) as Stripe.WebhookEndpointUpdateParams.EnabledEvent[],
    description: "FinTRK Pro subscription (direct Stripe, not Clerk Billing)",
  });
  created.push(`webhook-events:${missing.join(",")}`);
  return { id: match.id, updated: true };
}

/**
 * Heal Clerk Billing leftovers: older Stripe customers were tagged with
 * `user_id` instead of `clerkUserId`. Copy the value when our key is empty.
 */
async function healCustomerMetadata(stripe: Stripe, created: string[]): Promise<void> {
  let healed = 0;
  for await (const customer of stripe.customers.list({ limit: 100 })) {
    const clerkUserId = customer.metadata?.clerkUserId?.trim() ?? "";
    const legacy = customer.metadata?.user_id?.trim() ?? "";
    if (clerkUserId || !legacy) continue;
    await stripe.customers.update(customer.id, {
      metadata: { clerkUserId: legacy },
    });
    healed += 1;
  }
  if (healed > 0) created.push(`healed-customers:${healed}`);
}

/** Idempotent FinTRK Pro product, prices, portal, and webhook events. */
export async function ensureStripeCatalog(): Promise<StripeCatalogResult> {
  const stripe = getStripe();
  const created: string[] = [];

  let productId: string | null = null;
  for (const lk of [PRICE_LOOKUP_MONTHLY, PRICE_LOOKUP_ANNUAL]) {
    const found = await stripe.prices.list({ lookup_keys: [lk], limit: 1 });
    const p = found.data[0]?.product;
    if (p) {
      productId = typeof p === "string" ? p : p.id;
      break;
    }
  }

  if (!productId) {
    const product = await stripe.products.create({
      name: "FinTRK Pro",
      description: PRODUCT_DESCRIPTION,
      statement_descriptor: "FINTRK",
      metadata: { fintrk: "pro", app: "fintrk" },
    });
    productId = product.id;
    created.push(`product:${product.id}`);
  } else {
    await stripe.products.update(productId, {
      name: "FinTRK Pro",
      description: PRODUCT_DESCRIPTION,
      statement_descriptor: "FINTRK",
      metadata: { fintrk: "pro", app: "fintrk" },
    });
  }

  const monthly = await ensurePrice(
    stripe,
    productId,
    PRICE_LOOKUP_MONTHLY,
    FINTRK_PLAN_PRICING.monthlyCents,
    "month",
    created,
  );
  const annual = await ensurePrice(
    stripe,
    productId,
    PRICE_LOOKUP_ANNUAL,
    FINTRK_PLAN_PRICING.annualCents,
    "year",
    created,
  );

  await stripe.products.update(productId, { default_price: monthly.id });

  const portalId = await ensurePortal(
    stripe,
    productId,
    [monthly.id, annual.id],
    created,
  );
  await retireSupersededPrices(stripe, productId, [monthly.id, annual.id], created);
  const webhook = await ensureWebhook(stripe, created);
  await healCustomerMetadata(stripe, created);

  return {
    productId,
    monthlyPriceId: monthly.id,
    annualPriceId: annual.id,
    portalId,
    webhookId: webhook.id,
    webhookUpdated: webhook.updated,
    created,
    ...(webhook.secret ? { webhookSigningSecret: webhook.secret } : {}),
  };
}
