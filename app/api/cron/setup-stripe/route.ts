import { NextRequest, NextResponse } from "next/server";

import { ensureStripeCatalog } from "@/lib/setup-stripe-catalog";
import { hasStripeKey } from "@/lib/stripe";
import { authorizeCron } from "@/lib/cron-auth";
import { logServerError } from "@/lib/safe-error";
import { recordCronFailure, recordCronRun } from "@/lib/cron-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRON_PATH = "/api/cron/setup-stripe";

/** One-time / repeatable Stripe catalog bootstrap (FinTRK Pro prices). */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  if (!hasStripeKey()) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not configured" }, { status: 503 });
  }

  try {
    const result = await ensureStripeCatalog();
    if (result.webhookSigningSecret) {
      logServerError(
        "stripe_webhook_secret_created",
        new Error(
          "A new Stripe webhook signing secret was created. Add it to STRIPE_WEBHOOK_SECRET. It was not recorded.",
        ),
      );
    }
    const { webhookSigningSecret: _secret, ...safe } = result;
    void _secret;
    const summary = { ok: true, ...safe };
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
