import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { z } from "zod";
import { queryDistinctUserEmailsForTable } from "@/lib/query-distinct-user-emails-for-table";
import { USER_EMAIL_FILTER_TABLES } from "@/lib/user-email-filter-tables";
import { phiTextForAdminResponse } from "@/lib/crypto/phi-response";
import { getActiveDecryptionSession, trackSessionAccess } from "@/lib/decryption-session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  table: z.enum(USER_EMAIL_FILTER_TABLES),
});

/** Distinct users (clerk id + display email) who have at least one row in the given table. */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({ table: searchParams.get("table") ?? "" });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid or missing table" }, { status: 400 });
    }

    const session = await getActiveDecryptionSession({
      email: gate.email,
      userId: gate.userId,
    });
    const canDecrypt = Boolean(session);
    if (session) {
      await trackSessionAccess(session.id, "users");
      console.log(
        JSON.stringify({
          _type: "fintrk_admin_audit",
          action: "table_user_emails_decrypt",
          admin: gate.email,
          table: parsed.data.table,
          sessionId: session.id,
          at: new Date().toISOString(),
        }),
      );
    }

    const raw = await queryDistinctUserEmailsForTable(parsed.data.table);
    const emails = raw.map((r) => {
      const email =
        phiTextForAdminResponse(r.email, canDecrypt) ??
        (r.clerk_user_id || "n/a");
      return { email, clerk_user_id: r.clerk_user_id };
    });

    return NextResponse.json({ emails, decrypted: canDecrypt });
  } catch (error) {
    console.error("GET table-user-emails error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user emails" },
      { status: 500 }
    );
  }
}
