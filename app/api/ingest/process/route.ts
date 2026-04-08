import { NextRequest, NextResponse } from "next/server";
import { processStatement } from "@/lib/process-statement";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");
  if (secret !== (process.env.CRON_SECRET || "fintrk-internal")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  try {
    const { statementId } = await request.json();
    if (typeof statementId !== "number") {
      return NextResponse.json({ error: "Invalid statementId" }, { status: 400, headers: NO_STORE });
    }

    await processStatement(statementId);

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/ingest/process", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500, headers: NO_STORE });
  }
}
