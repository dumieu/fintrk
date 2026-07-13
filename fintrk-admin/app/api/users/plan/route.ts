import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-admin";
import { extractRequestMeta, logAdminAudit } from "@/lib/admin-audit";
import {
  CLERK_API_BASE,
  userAppClerkSecret,
  type ClerkListUser,
} from "@/lib/user-app-clerk";

export const dynamic = "force-dynamic";

const PRO_PLAN = "pro";

const bodySchema = z.object({
  clerkUserId: z.string().min(1),
  action: z.enum(["grant_pro", "revoke_pro"]),
});

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  const clerkSecret = userAppClerkSecret();
  if (!clerkSecret) {
    return NextResponse.json(
      { error: "USER_APP_CLERK_SECRET_KEY (or CLERK_SECRET_KEY) is not configured" },
      { status: 503 },
    );
  }

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { clerkUserId, action } = parsed.data;

    const getRes = await fetch(
      `${CLERK_API_BASE}/users/${encodeURIComponent(clerkUserId)}`,
      { headers: { Authorization: `Bearer ${clerkSecret}` }, cache: "no-store" },
    );
    if (!getRes.ok) {
      return NextResponse.json(
        { error: `Clerk user not found (${getRes.status})` },
        { status: getRes.status === 404 ? 404 : 502 },
      );
    }

    const existing = (await getRes.json()) as ClerkListUser;
    const prevMeta = { ...(existing.public_metadata ?? {}) };

    const nextMeta =
      action === "grant_pro"
        ? {
            ...prevMeta,
            plan: PRO_PLAN,
            planStatus: "active",
          }
        : {
            ...prevMeta,
            plan: "free",
            planStatus: "canceled",
          };

    const patchRes = await fetch(
      `${CLERK_API_BASE}/users/${encodeURIComponent(clerkUserId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${clerkSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ public_metadata: nextMeta }),
      },
    );

    if (!patchRes.ok) {
      const text = await patchRes.text();
      console.error("Clerk plan patch failed:", patchRes.status, text);
      return NextResponse.json({ error: "Failed to update Clerk plan" }, { status: 502 });
    }

    const updated = (await patchRes.json()) as ClerkListUser;
    const meta = extractRequestMeta(request);
    await logAdminAudit({
      adminIdentifier: gate.email || gate.userId,
      action: action === "grant_pro" ? "plan_grant_pro" : "plan_revoke_pro",
      resource: "clerk_public_metadata",
      detail: {
        targetClerkUserId: clerkUserId,
        plan: nextMeta.plan,
        planStatus: nextMeta.planStatus,
        ip: meta.ipAddress,
        ua: meta.userAgent,
      },
    });

    return NextResponse.json({
      success: true,
      plan: (updated.public_metadata?.plan as string) ?? nextMeta.plan,
      planStatus: (updated.public_metadata?.planStatus as string) ?? nextMeta.planStatus,
    });
  } catch (err) {
    console.error("PATCH /api/users/plan failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
