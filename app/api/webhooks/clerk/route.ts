import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextResponse, type NextRequest } from "next/server";

import { deleteUserByClerkId, upsertUserFromUserJson } from "@/lib/clerk-user-sync";
import { logServerError } from "@/lib/safe-error";
import { reportXtrkConversion } from "@/lib/xtrk-mtk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let evt: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    // Bad signature / missing secret: do not retry.
    logServerError("clerk_webhook_verify", err);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    if (evt.type === "user.created" || evt.type === "user.updated") {
      await upsertUserFromUserJson(evt.data);
      if (evt.type === "user.created") {
        const data = evt.data as {
          id: string;
          primary_email_address_id?: string | null;
          email_addresses?: Array<{ id: string; email_address: string }>;
        };
        const email =
          data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address ||
          data.email_addresses?.[0]?.email_address ||
          "";
        if (email) {
          void reportXtrkConversion({
            type: "signup",
            appKey: "fintrk",
            email,
            clerkUserId: data.id,
          });
        }
      }
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
    // Handler / wipe failure: 500 so Clerk retries and purge completes.
    logServerError("clerk_webhook_handle", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
