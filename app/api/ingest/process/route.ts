import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { statements } from "@/lib/db/schema";
import { processStatement } from "@/lib/process-statement";
import { logServerError } from "@/lib/safe-error";
import { eq, and, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
// AI extraction on a dense PDF + categorisation + bulk DB inserts can take
// well over 2 minutes for big statements. Pro plan ceiling is 300s.
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;

    const { statementId } = await request.json();
    if (typeof statementId !== "number") {
      return NextResponse.json({ error: "Invalid statementId" }, { status: 400, headers: NO_STORE });
    }

    // Atomic claim: only uploaded/failed may enter processing. Parallel POSTs
    // while already processing must not both call Gemini.
    // Stamp aiProcessedAt as processing-started so status timeout uses wall
    // clock from claim, not statement createdAt (delayed process must not fail).
    const [row] = await resilientQuery(() =>
      db.update(statements)
        .set({ status: "processing", aiError: null, aiProcessedAt: new Date() })
        .where(
          and(
            eq(statements.id, statementId),
            eq(statements.userId, userId),
            inArray(statements.status, ["uploaded", "failed"]),
          ),
        )
        .returning({ id: statements.id }),
    );

    if (!row) {
      const [existing] = await resilientQuery(() =>
        db
          .select({ id: statements.id, status: statements.status })
          .from(statements)
          .where(and(eq(statements.id, statementId), eq(statements.userId, userId)))
          .limit(1),
      );
      if (!existing) {
        return NextResponse.json({ error: "Statement not found" }, { status: 404, headers: NO_STORE });
      }
      if (existing.status === "processing") {
        return NextResponse.json(
          { error: "Statement is already processing." },
          { status: 409, headers: NO_STORE },
        );
      }
      return NextResponse.json(
        { error: "Statement cannot be processed in its current state." },
        { status: 409, headers: NO_STORE },
      );
    }

    await processStatement(statementId);

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/ingest/process", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500, headers: NO_STORE });
  }
}
