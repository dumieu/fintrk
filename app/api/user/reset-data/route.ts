import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { wipeUserData } from "@/lib/wipe-user-data";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Deletes ALL user data so statements/transactions can be re-uploaded
 * from scratch without duplicate detection blocking them.
 *
 * Keeps the Clerk account and `users` row; use the Clerk deletion webhook
 * for full account purge.
 */
export async function DELETE() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const counts = await wipeUserData(userId);

    return NextResponse.json({ ok: true, deleted: counts }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/user/reset-data/DELETE", err);
    return NextResponse.json(
      { error: "Failed to reset data. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
}
