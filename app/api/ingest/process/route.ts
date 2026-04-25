import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { statements } from "@/lib/db/schema";
import { processStatement } from "@/lib/process-statement";
import { logServerError } from "@/lib/safe-error";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";
// AI extraction on a dense PDF + categorisation + bulk DB inserts can take
// well over 2 minutes for big statements. Pro plan ceiling is 300s.
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const { statementId } = await request.json();
    if (typeof statementId !== "number") {
      return NextResponse.json({ error: "Invalid statementId" }, { status: 400, headers: NO_STORE });
    }

    // Mark as "processing" so processStatement accepts it
    const [row] = await resilientQuery(() =>
      db.update(statements)
        .set({ status: "processing" })
        .where(and(eq(statements.id, statementId), eq(statements.userId, userId)))
        .returning({ id: statements.id }),
    );

    if (!row) {
      return NextResponse.json({ error: "Statement not found" }, { status: 404, headers: NO_STORE });
    }

    await processStatement(statementId);

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/ingest/process", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500, headers: NO_STORE });
  }
}
