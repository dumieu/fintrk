import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextResponse, type NextRequest } from "next/server";

import { deleteUserByClerkId, upsertUserFromUserJson } from "@/lib/clerk-user-sync";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);

    if (evt.type === "user.created" || evt.type === "user.updated") {
      await upsertUserFromUserJson(evt.data);
    } else if (evt.type === "user.deleted") {
      const id = evt.data.id;
      if (!id) {
        logServerError("clerk_webhook_user_deleted_missing_id", new Error("evt.data.id missing"));
        return NextResponse.json({ ok: false }, { status: 400 });
      }
      await deleteUserByClerkId(id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logServerError("clerk_webhook", err);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
