import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import {
  transactions,
  statements,
  fileUploadLog,
  accounts,
  recurringPatterns,
  categoryRules,
  aiInsights,
  aiCosts,
  budgets,
  goals,
  userCategories,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Deletes ALL user data so statements/transactions can be re-uploaded
 * from scratch without duplicate detection blocking them.
 *
 * Deletion order respects FK constraints:
 *   transactions → statements → file_upload_log → accounts → everything else
 */
export async function DELETE() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const counts: Record<string, number> = {};

    const del = async (label: string, table: Parameters<typeof db.delete>[0]) => {
      const rows = await resilientQuery(() =>
        db.delete(table).where(eq((table as any).userId, userId)).returning({ id: (table as any).id }),
      );
      counts[label] = rows.length;
    };

    // FK-safe order: children first, parents last
    await del("transactions", transactions);
    await del("statements", statements);
    await del("fileUploadLog", fileUploadLog);
    await del("recurringPatterns", recurringPatterns);
    await del("categoryRules", categoryRules);
    await del("aiInsights", aiInsights);
    await del("aiCosts", aiCosts);
    await del("budgets", budgets);
    await del("goals", goals);
    await del("userCategories", userCategories);
    await del("accounts", accounts);

    return NextResponse.json({ ok: true, deleted: counts }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/user/reset-data/DELETE", err);
    return NextResponse.json(
      { error: "Failed to reset data. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
}
