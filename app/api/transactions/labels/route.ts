import { NextResponse } from "next/server";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Distinct non-empty labels for the signed-in user (for transaction label autocomplete). */
export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rows = await resilientQuery(() =>
      db
        .selectDistinct({ label: transactions.label })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            isNotNull(transactions.label),
            sql`trim(${transactions.label}) <> ''`,
          ),
        ),
    );

    const labels = rows
      .map((r) => (r.label ?? "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    const unique = [...new Set(labels)];

    return NextResponse.json({ labels: unique }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/transactions/labels/GET", err);
    return NextResponse.json(
      { error: "Failed to load labels", labels: [] },
      { status: 500, headers: NO_STORE },
    );
  }
}
