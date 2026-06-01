import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { statements } from "@/lib/db/schema";
import { eq, and, inArray, gte, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const PROCESSING_MAX_AGE_MS = 30 * 60 * 1000;
const FINISHED_WINDOW_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const idsParam = request.nextUrl.searchParams.get("ids");
    const trackIds = (idsParam ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 100);

    const processingCutoff = new Date(Date.now() - PROCESSING_MAX_AGE_MS);

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
          gte(statements.createdAt, processingCutoff),
        ),
      ),
    );

    const finishedCutoff = new Date(Date.now() - FINISHED_WINDOW_MS);

    const recentlyFinished = await resilientQuery(() =>
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
          gte(
            statements.aiProcessedAt,
            finishedCutoff,
          ),
        ),
      ),
    );

    // Auto-expire statements stuck in processing for over 30 min
    const stale = await resilientQuery(() =>
      db.select({ id: statements.id }).from(statements).where(
        and(
          eq(statements.userId, userId),
          inArray(statements.status, ["uploaded", "processing"]),
          sql`${statements.createdAt} < ${processingCutoff}`,
        ),
      ),
    );
    if (stale.length > 0) {
      for (const s of stale) {
        await db.update(statements)
          .set({ status: "failed", aiError: "Processing timed out", aiProcessedAt: new Date() })
          .where(eq(statements.id, s.id))
          .catch(() => {});
      }
    }

    const tracked = trackIds.length > 0
      ? await resilientQuery(() =>
          db.select({
            id: statements.id,
            fileName: statements.fileName,
            status: statements.status,
            transactionsImported: statements.transactionsImported,
            transactionsDuplicate: statements.transactionsDuplicate,
            aiError: statements.aiError,
          }).from(statements).where(
            and(eq(statements.userId, userId), inArray(statements.id, trackIds)),
          ),
        )
      : [];

    return NextResponse.json({
      processing: active,
      recentlyFinished,
      tracked,
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ processing: [], recentlyFinished: [], tracked: [] }, { headers: NO_STORE });
  }
}
