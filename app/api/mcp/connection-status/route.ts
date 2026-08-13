import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { isMcpConnected } from "@/lib/mcp/tokens";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Lightweight "is this user already connected to an AI over MCP?" probe.
 * Powers the in-app Connect-AI orb, which hides itself once connected.
 * Fails open (connected: false) so the prompt still shows on transient errors.
 */
export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();
    const connected = await isMcpConnected(userId);
    return NextResponse.json({ connected }, { headers: NO_STORE });
  } catch (error) {
    logServerError("GET /api/mcp/connection-status", error);
    return NextResponse.json({ connected: false }, { headers: NO_STORE });
  }
}
