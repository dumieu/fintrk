import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type DetectTravel = "Yes" | "No";

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rows = await resilientQuery(() =>
      db
        .select({ detectTravel: users.detectTravel })
        .from(users)
        .where(eq(users.clerkUserId, userId))
        .limit(1),
    );

    const detectTravel: DetectTravel = rows[0]?.detectTravel === "No" ? "No" : "Yes";

    if (rows.length === 0) {
      await resilientQuery(() =>
        db
          .insert(users)
          .values({ clerkUserId: userId, detectTravel, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: users.clerkUserId,
            set: { detectTravel, updatedAt: new Date() },
          }),
      );
    }

    return NextResponse.json({ detectTravel }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/user/profile/GET", err);
    return NextResponse.json({ error: "Failed to load profile settings." }, { status: 500, headers: NO_STORE });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const incoming = body?.detectTravel;
    if (incoming !== "Yes" && incoming !== "No") {
      return NextResponse.json({ error: "Invalid detectTravel value." }, { status: 400, headers: NO_STORE });
    }

    await resilientQuery(() =>
      db
        .insert(users)
        .values({ clerkUserId: userId, detectTravel: incoming, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: { detectTravel: incoming, updatedAt: new Date() },
        }),
    );

    return NextResponse.json({ ok: true, detectTravel: incoming }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/user/profile/PATCH", err);
    return NextResponse.json({ error: "Failed to update profile settings." }, { status: 500, headers: NO_STORE });
  }
}
