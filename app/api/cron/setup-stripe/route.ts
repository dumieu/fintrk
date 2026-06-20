import { NextRequest, NextResponse } from "next/server";

import { ensureStripeCatalog } from "@/lib/setup-stripe-catalog";
import { hasStripeKey } from "@/lib/stripe";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** One-time / repeatable Stripe catalog bootstrap (FinTRK Pro prices). */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasStripeKey()) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not configured" }, { status: 503 });
  }

  try {
    const result = await ensureStripeCatalog();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron_setup_stripe", err);
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
