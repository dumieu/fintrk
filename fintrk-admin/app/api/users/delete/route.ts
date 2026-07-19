import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-admin";
import { ADMIN_HARD_DELETE_USER_PHRASE } from "@/lib/admin-user-delete-phrase";
import { extractRequestMeta, logAdminAudit } from "@/lib/admin-audit";
import { df, hasEncryptionKey, isEncrypted } from "@/lib/crypto/encryption";
import { sql } from "@/lib/db";
import {
  CLERK_API_BASE,
  clerkEmailsFromUser,
  userAppClerkSecret,
  type ClerkListUser,
} from "@/lib/user-app-clerk";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  clerkUserId: z.string().min(1),
  confirmationPhrase: z.string(),
});

type SqlStep = { query: string; params: unknown[] };

/**
 * Run core wipe steps in one Neon HTTP transaction (all-or-nothing).
 * No sequential safeExec fallback - missing tables are filtered via
 * information_schema before the TX so a mid-sequence hard error cannot
 * leave a partial Neon purge.
 */
async function runTransaction(steps: SqlStep[]): Promise<void> {
  if (steps.length === 0) return;
  await sql.transaction((txn) => steps.map((s) => txn.query(s.query, s.params)));
}

async function listPublicTables(): Promise<Set<string>> {
  const rows = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  return new Set(rows.map((r) => String(r.table_name)));
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
  "user_quick_notes",
  "user_categories",
  "accounts",
];

const CLERK_ID_TABLES = [
  "error_logs",
  "mcp_access_log",
  "feedback_submissions",
  "contact_submissions",
  "mcp_tokens",
  "mcp_auth_codes",
];

function buildCoreWipeSteps(
  clerkUserId: string,
  ownerEmails: string[],
  knownTables: Set<string>,
): SqlStep[] {
  const steps: SqlStep[] = [];

  if (knownTables.has("merchants") && knownTables.has("user_categories")) {
    steps.push({
      query: `UPDATE merchants SET category_id = NULL
              WHERE category_id IN (SELECT id FROM user_categories WHERE user_id = $1)`,
      params: [clerkUserId],
    });
  }

  // Drop category_rules that reference this user's categories (including null
  // user_id / global rules) so user_categories DELETE cannot FK-fail.
  if (knownTables.has("category_rules") && knownTables.has("user_categories")) {
    steps.push({
      query: `DELETE FROM category_rules
              WHERE category_id IN (SELECT id FROM user_categories WHERE user_id = $1)`,
      params: [clerkUserId],
    });
  }

  for (const table of USER_ID_TABLES) {
    if (!knownTables.has(table)) continue;
    steps.push({
      query: `DELETE FROM "${table}" WHERE user_id = $1`,
      params: [clerkUserId],
    });
  }

  if (knownTables.has("net_worth_settings")) {
    steps.push({
      query: `DELETE FROM net_worth_settings WHERE user_id = $1`,
      params: [clerkUserId],
    });
  }

  for (const table of CLERK_ID_TABLES) {
    if (!knownTables.has(table)) continue;
    steps.push({
      query: `DELETE FROM "${table}" WHERE clerk_user_id = $1`,
      params: [clerkUserId],
    });
  }

  // Purge contact/feedback rows that only stored email (no clerk id).
  // Use the union of Clerk + Neon emails so a stale Clerk address cannot
  // leave submissions keyed to the Neon primary_email.
  const uniqueEmails = [...new Set(ownerEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  for (const ownerEmail of uniqueEmails) {
    if (knownTables.has("contact_submissions")) {
      steps.push({
        query: `DELETE FROM contact_submissions
                WHERE lower(trim(email)) = lower(trim($1))`,
        params: [ownerEmail],
      });
    }
    if (knownTables.has("feedback_submissions")) {
      steps.push({
        query: `DELETE FROM feedback_submissions
                WHERE lower(trim(email)) = lower(trim($1))`,
        params: [ownerEmail],
      });
    }
  }

  if (knownTables.has("users")) {
    steps.push({
      query: `DELETE FROM users WHERE clerk_user_id = $1`,
      params: [clerkUserId],
    });
  }

  return steps;
}

/** Resolve Neon primary_email (decrypt when needed). Fail closed on ciphertext. */
async function resolveNeonOwnerEmail(
  clerkUserId: string,
): Promise<{ ok: true; email: string | null } | { ok: false; response: NextResponse }> {
  try {
    const [row] = await sql`
      SELECT primary_email FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `;
    const raw = row?.primary_email as string | null | undefined;
    if (!raw) return { ok: true, email: null };

    if (isEncrypted(raw)) {
      if (!hasEncryptionKey()) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error:
                "FINTRK_ENCRYPTION_KEY is required to purge encrypted contact/feedback email rows",
            },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          ),
        };
      }
      const plain = df(raw);
      if (!plain || !plain.includes("@")) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Failed to decrypt user primary_email for email purge" },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          ),
        };
      }
      return { ok: true, email: plain.trim().toLowerCase() };
    }

    const plain = df(raw);
    if (plain && plain.includes("@")) {
      return { ok: true, email: plain.trim().toLowerCase() };
    }
    return { ok: true, email: null };
  } catch {
    // Transient DB failure: do not claim a complete wipe when email purge may be skipped.
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Failed to load user primary_email for email purge" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
}

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
    // Match plan PATCH: never wipe Neon when the user-app Clerk secret is
    // missing (would leave the Clerk user; email purge would miss Clerk
    // addresses). Fail closed before the transaction.
    if (!clerkSecret) {
      return NextResponse.json(
        { error: "USER_APP_CLERK_SECRET_KEY is not configured" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const ownerEmails: string[] = [];

    try {
      const res = await fetch(
        `${CLERK_API_BASE}/users/${encodeURIComponent(clerkUserId)}`,
        {
          headers: { Authorization: `Bearer ${clerkSecret}` },
          cache: "no-store",
          // redirect: "manual" so a 3xx cannot forward the Clerk secret off-origin.
          redirect: "manual",
        },
      );
      if (res.ok) {
        const user = (await res.json()) as ClerkListUser;
        ownerEmails.push(...clerkEmailsFromUser(user));
      }
    } catch {
      /* continue; Neon email below still required for completeness */
    }

    // Always resolve Neon primary_email (decrypt when encrypted). Clerk alone is
    // not enough: contact/feedback may be keyed to a different Neon address.
    const neon = await resolveNeonOwnerEmail(clerkUserId);
    if (!neon.ok) return neon.response;
    if (neon.email) ownerEmails.push(neon.email);

    const knownTables = await listPublicTables();
    const coreSteps = buildCoreWipeSteps(clerkUserId, ownerEmails, knownTables);
    await runTransaction(coreSteps);

    const meta = extractRequestMeta(request);
    const audited = await logAdminAudit({
      adminIdentifier: gate.email || gate.userId,
      action: "user_hard_delete",
      resource: "user_full_purge",
      detail: {
        targetClerkUserId: clerkUserId,
        ownerEmails: [...new Set(ownerEmails)],
        ip: meta.ipAddress,
        ua: meta.userAgent,
      },
    });

    let clerkDeleted = false;
    try {
      const res = await fetch(
        `${CLERK_API_BASE}/users/${encodeURIComponent(clerkUserId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${clerkSecret}` },
          redirect: "manual",
        },
      );
      clerkDeleted = res.ok || res.status === 404;
      if (!clerkDeleted) {
        console.error("Clerk user delete failed:", res.status, await res.text());
      }
    } catch (e) {
      console.error("Clerk user delete request failed:", e);
    }

    if (!audited) {
      // Neon (+ best-effort Clerk) already applied; do not claim a clean audit trail.
      return NextResponse.json(
        {
          error: "User purged but audit log failed to persist",
          success: true,
          clerkDeleted,
          clerkKeyMissing: !clerkSecret,
          auditFailed: true,
        },
        { status: 500, headers: { "Cache-Control": "no-store" } },
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
