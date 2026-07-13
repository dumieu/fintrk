import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NeonDbError } from "@neondatabase/serverless";

import { requireAdmin } from "@/lib/auth-admin";
import { ADMIN_HARD_DELETE_USER_PHRASE } from "@/lib/admin-user-delete-phrase";
import { extractRequestMeta, logAdminAudit } from "@/lib/admin-audit";
import { df } from "@/lib/crypto/encryption";
import { sql } from "@/lib/db";
import {
  CLERK_API_BASE,
  pickClerkEmail,
  userAppClerkSecret,
  type ClerkListUser,
} from "@/lib/user-app-clerk";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  clerkUserId: z.string().min(1),
  confirmationPhrase: z.string(),
});

function isUndefinedTable(err: unknown): boolean {
  return err instanceof NeonDbError && err.code === "42P01";
}

async function safeExec(query: string, params: unknown[]): Promise<void> {
  try {
    await sql.query(query, params);
  } catch (err) {
    if (isUndefinedTable(err)) return;
    throw err;
  }
}

/** user_id-scoped tables (Clerk id). Children first for FK safety. */
const USER_ID_TABLES = [
  "transactions",
  "statements",
  "file_upload_log",
  "recurring_patterns",
  "category_rules",
  "ai_insights",
  "ai_costs",
  "budgets",
  "goals",
  "merchant_warning_rules",
  "merchant_label_rules",
  "transaction_ignores",
  "double_charge_watchlist_exclusions",
  "net_worth_items",
  "user_categories",
  "accounts",
];

const CLERK_ID_TABLES = [
  "error_logs",
  "feedback_submissions",
  "contact_submissions",
  "mcp_tokens",
  "mcp_auth_codes",
];

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { clerkUserId, confirmationPhrase } = parsed.data;
    if (
      confirmationPhrase.trim().toLowerCase() !==
      ADMIN_HARD_DELETE_USER_PHRASE.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "Confirmation phrase does not match" },
        { status: 400 },
      );
    }

    const clerkSecret = userAppClerkSecret();
    let ownerEmail: string | null = null;

    if (clerkSecret) {
      try {
        const res = await fetch(
          `${CLERK_API_BASE}/users/${encodeURIComponent(clerkUserId)}`,
          { headers: { Authorization: `Bearer ${clerkSecret}` }, cache: "no-store" },
        );
        if (res.ok) {
          const user = (await res.json()) as ClerkListUser;
          ownerEmail = pickClerkEmail(user)?.trim().toLowerCase() || null;
        }
      } catch {
        /* continue; fall back to Neon email below */
      }
    }

    // Fall back to Neon users.primary_email when Clerk lookup fails (already-deleted
    // Clerk user, missing secret, or transient API error). Decrypt when encrypted.
    if (!ownerEmail) {
      try {
        const [row] = await sql`
          SELECT primary_email FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
        `;
        const plain = df(row?.primary_email as string | null | undefined);
        if (plain && plain.includes("@")) {
          ownerEmail = plain.trim().toLowerCase();
        }
      } catch {
        /* continue with id-only purge */
      }
    }

    // Detach shared merchants from this user's categories before dropping them
    await safeExec(
      `UPDATE merchants SET category_id = NULL
       WHERE category_id IN (SELECT id FROM user_categories WHERE user_id = $1)`,
      [clerkUserId],
    );

    // Drop category_rules that reference this user's categories (including null
    // user_id / global rules) so user_categories DELETE cannot FK-fail.
    await safeExec(
      `DELETE FROM category_rules
       WHERE category_id IN (SELECT id FROM user_categories WHERE user_id = $1)`,
      [clerkUserId],
    );

    for (const table of USER_ID_TABLES) {
      await safeExec(`DELETE FROM "${table}" WHERE user_id = $1`, [clerkUserId]);
    }

    await safeExec(`DELETE FROM net_worth_settings WHERE user_id = $1`, [clerkUserId]);

    for (const table of CLERK_ID_TABLES) {
      await safeExec(`DELETE FROM "${table}" WHERE clerk_user_id = $1`, [clerkUserId]);
    }

    // Also purge contact/feedback rows that only stored email (no clerk id).
    if (ownerEmail) {
      await safeExec(
        `DELETE FROM contact_submissions
         WHERE lower(trim(email)) = lower(trim($1))`,
        [ownerEmail],
      );
      await safeExec(
        `DELETE FROM feedback_submissions
         WHERE lower(trim(email)) = lower(trim($1))`,
        [ownerEmail],
      );
    }

    await safeExec(`DELETE FROM users WHERE clerk_user_id = $1`, [clerkUserId]);

    const meta = extractRequestMeta(request);
    await logAdminAudit({
      adminIdentifier: gate.email || gate.userId,
      action: "user_hard_delete",
      resource: "user_full_purge",
      detail: {
        targetClerkUserId: clerkUserId,
        ownerEmail,
        ip: meta.ipAddress,
        ua: meta.userAgent,
      },
    });

    let clerkDeleted = false;
    if (clerkSecret) {
      try {
        const res = await fetch(
          `${CLERK_API_BASE}/users/${encodeURIComponent(clerkUserId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${clerkSecret}` },
          },
        );
        clerkDeleted = res.ok || res.status === 404;
        if (!clerkDeleted) {
          console.error("Clerk user delete failed:", res.status, await res.text());
        }
      } catch (e) {
        console.error("Clerk user delete request failed:", e);
      }
    } else {
      console.error(
        "USER_APP_CLERK_SECRET_KEY is not set - Neon rows purged but Clerk user remains.",
      );
    }

    return NextResponse.json(
      {
        success: true,
        clerkDeleted,
        clerkKeyMissing: !clerkSecret,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error(
      "Admin user purge failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
