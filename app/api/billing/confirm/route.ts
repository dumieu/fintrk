import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { confirmCheckoutSession } from "@/lib/billing-confirm";
import { hasStripeKey } from "@/lib/stripe";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sync a completed Checkout session onto the signed-in user before the webhook. */
export async function POST(req: NextRequest) {
  if (!hasStripeKey()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionId = "";
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.sessionId === "string") sessionId = body.sessionId.trim();
  } catch {
    sessionId = "";
  }
  if (!sessionId) {
    return NextResponse.json({ error: "Missing checkout session." }, { status: 400 });
  }

  try {
    const result = await confirmCheckoutSession(sessionId, userId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Could not confirm checkout.", status: result.status },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    logServerError("billing_confirm", err);
    return NextResponse.json({ error: "Could not confirm checkout." }, { status: 500 });
  }
}
