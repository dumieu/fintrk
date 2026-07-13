import { NextRequest, NextResponse } from "next/server";

import { ensureStripeCatalog } from "@/lib/setup-stripe-catalog";
import { hasStripeKey } from "@/lib/stripe";
import { logServerError } from "@/lib/safe-error";
import { recordCronFailure, recordCronRun } from "@/lib/cron-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRON_PATH = "/api/cron/setup-stripe";

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed in production; allow unauthenticated local runs when unset.
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** One-time / repeatable Stripe catalog bootstrap (FinTRK Pro prices). */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  if (!hasStripeKey()) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not configured" }, { status: 503 });
  }

  try {
    const result = await ensureStripeCatalog();
    const summary = { ok: true, ...result };
    await recordCronRun(CRON_PATH, Date.now() - started, summary as Record<string, unknown>);
    return NextResponse.json(summary);
  } catch (err) {
    logServerError("cron_setup_stripe", err);
    await recordCronFailure(CRON_PATH, Date.now() - started, {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
