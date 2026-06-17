/**
 * xTRK Referral (xref) integration for FinTRK.
 *
 * Best-effort, fire-and-forget calls to the xref referral engine
 * (referral.xtrk.ai). Every function swallows its own errors so referral
 * tracking can NEVER break a core FinTRK flow (signup, billing, webhooks),
 * but it now logs loud warnings when it is misconfigured so attribution
 * failures are never silent.
 *
 * No financial data is ever sent - only sign-in identity (Clerk user id, email,
 * first/last name), the referral code, the app slug, and money amounts.
 *
 * Env:
 *   XREF_INGEST_URL    e.g. https://referral.xtrk.ai
 *                      (optional in production - defaults to the live engine)
 *   XREF_INGEST_SECRET shared secret (must match xref XREF_INGEST_SECRET)
 */

const APP_SLUG = "fintrk";
const DEFAULT_PROD_BASE = "https://referral.xtrk.ai";

function baseUrl(): string | null {
  const explicit = process.env.XREF_INGEST_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  // In production, default to the live engine so a forgotten env var cannot
  // silently disable attribution. In dev/preview stay a no-op so local tests
  // never pollute production referral data.
  if (process.env.NODE_ENV === "production") return DEFAULT_PROD_BASE;
  return null;
}

let warnedSecret = false;

export interface XrefResult {
  ok: boolean;
  status?: number;
  skipped?: boolean;
  reason?: string;
}

async function post(
  path: string,
  payload: Record<string, unknown>,
  opts: { timeoutMs?: number } = {}
): Promise<XrefResult> {
  const base = baseUrl();
  if (!base) return { ok: false, skipped: true, reason: "no_base" };

  const secret = process.env.XREF_INGEST_SECRET;
  if (!secret) {
    if (!warnedSecret) {
      console.warn(
        "[xref] XREF_INGEST_SECRET is not set - referral attribution will NOT be recorded. Set the same secret on this app and on the xref engine."
      );
      warnedSecret = true;
    }
    return { ok: false, skipped: true, reason: "no_secret" };
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-xref-secret": secret },
      body: JSON.stringify({ app: APP_SLUG, ...payload }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 4000),
    });
    if (!res.ok) {
      console.warn(`[xref] POST ${path} -> ${res.status}`);
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.warn(`[xref] POST ${path} failed:`, err instanceof Error ? err.message : err);
    return { ok: false, reason: "network" };
  }
}

export interface XrefProfile {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/** First-touch attribution of a signed-up user to a seller referral code. */
export async function xrefAttribute(
  code: string,
  clerkUserId: string,
  profile: XrefProfile = {}
): Promise<XrefResult> {
  if (!code || !clerkUserId) return { ok: false, skipped: true, reason: "missing_args" };
  return post("/api/ingest/attribution", {
    code,
    clerkUserId,
    email: profile.email ?? undefined,
    firstName: profile.firstName ?? undefined,
    lastName: profile.lastName ?? undefined,
  });
}

/**
 * Logs a click for a branded referral link landing (https://fintrk.io/?xref=).
 * Branded links bypass the legacy referral.xtrk.ai/r/<code> redirect that used
 * to count clicks, so middleware reports the landing here. Uses a short timeout
 * because it is awaited on the visitor's first-landing redirect hop.
 */
export async function xrefClick(
  code: string,
  signal: { ip?: string | null; ua?: string | null; referrer?: string | null; country?: string | null } = {}
): Promise<void> {
  if (!code) return;
  await post(
    "/api/ingest/click",
    {
      code,
      ip: signal.ip ?? undefined,
      ua: signal.ua ?? undefined,
      referrer: signal.referrer ?? undefined,
      country: signal.country ?? undefined,
    },
    { timeoutMs: 1200 }
  );
}

/** Map a Stripe customer id to a Clerk user so xref's Stripe webhooks resolve. */
export async function xrefCustomerMap(
  clerkUserId: string,
  stripeCustomerId: string
): Promise<void> {
  if (!clerkUserId || !stripeCustomerId) return;
  await post("/api/ingest/customer-map", { clerkUserId, stripeCustomerId });
}

/** Forward a normalized mobile (RevenueCat) revenue event to xref. */
export async function xrefRevenueCat(input: {
  clerkUserId: string;
  type: "payment" | "refund" | "chargeback";
  eventId: string;
  grossAmountCents: number;
  currency?: string;
  occurredAt?: string;
}): Promise<void> {
  if (!input.clerkUserId || !input.eventId || !input.grossAmountCents) return;
  await post("/api/ingest/revenuecat", {
    clerkUserId: input.clerkUserId,
    type: input.type,
    eventId: input.eventId,
    grossAmountCents: input.grossAmountCents,
    currency: input.currency ?? "usd",
    occurredAt: input.occurredAt,
  });
}
