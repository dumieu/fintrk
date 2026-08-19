import { NextResponse } from "next/server";

import { requireAppAuth } from "@/lib/auth-resilient";
import { logServerError } from "@/lib/safe-error";
import { toPublicUsage } from "@/lib/fin-ai/constants";
import { getDayUsage } from "@/lib/fin-ai/usage";

/**
 * Today's chat allowance for the signed-in user, as a percentage only.
 * Token counts, dollar costs, and the model name stay server-side.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;

    const usage = await getDayUsage(gate.userId);
    return NextResponse.json({ usage: toPublicUsage(usage) }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/ai/chat/usage/GET", err);
    return NextResponse.json(
      { usage: { day: "", pct: 0 } },
      { status: 200, headers: NO_STORE },
    );
  }
}
