import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { statements } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const active = await resilientQuery(() =>
      db.select({
        id: statements.id,
        fileName: statements.fileName,
        status: statements.status,
        transactionsImported: statements.transactionsImported,
        transactionsDuplicate: statements.transactionsDuplicate,
        aiError: statements.aiError,
        createdAt: statements.createdAt,
      }).from(statements).where(
        and(
          eq(statements.userId, userId),
          inArray(statements.status, ["uploaded", "processing"]),
        ),
      ),
    );

    const recent = await resilientQuery(() =>
      db.select({
        id: statements.id,
        fileName: statements.fileName,
        status: statements.status,
        transactionsImported: statements.transactionsImported,
        transactionsDuplicate: statements.transactionsDuplicate,
        aiError: statements.aiError,
        createdAt: statements.createdAt,
      }).from(statements).where(
        and(
          eq(statements.userId, userId),
          inArray(statements.status, ["completed", "failed"]),
        ),
      ),
    );

    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentlyFinished = recent.filter(
      (s) => s.createdAt && new Date(s.createdAt).getTime() > fiveMinAgo,
    );

    return NextResponse.json({
      processing: active,
      recentlyFinished,
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ processing: [], recentlyFinished: [] }, { headers: NO_STORE });
  }
}
