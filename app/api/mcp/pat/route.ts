import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { DEFAULT_SCOPE } from "@/lib/mcp/config";
import { createPat, listPats, revokeAllForUser, revokePat } from "@/lib/mcp/tokens";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const createSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
});

const deleteSchema = z.union([
  z.object({ id: z.number().int().positive() }),
  z.object({ all: z.literal(true) }),
]);

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();
    const tokens = await listPats(userId);
    return NextResponse.json({ tokens }, { headers: NO_STORE });
  } catch (error) {
    logServerError("GET /api/mcp/pat", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();
    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
    }
    const existing = await listPats(userId);
    if (existing.length >= 20) {
      return NextResponse.json(
        { error: "Token limit reached. Revoke an existing token first." },
        { status: 409, headers: NO_STORE },
      );
    }
    const label = parsed.data.label?.trim() || "AI connection";
    const { token, summary } = await createPat({ clerkUserId: userId, label, scope: DEFAULT_SCOPE });
    return NextResponse.json({ token, summary }, { headers: NO_STORE });
  } catch (error) {
    logServerError("POST /api/mcp/pat", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();
    const body = await request.json().catch(() => ({}));
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
    }
    if ("all" in parsed.data) {
      const revoked = await revokeAllForUser(userId);
      return NextResponse.json({ success: true, revoked }, { headers: NO_STORE });
    }
    const ok = await revokePat(userId, parsed.data.id);
    return NextResponse.json({ success: ok }, { status: ok ? 200 : 404, headers: NO_STORE });
  } catch (error) {
    logServerError("DELETE /api/mcp/pat", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}
