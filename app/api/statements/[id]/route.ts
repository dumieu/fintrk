import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { deleteUploadedStatement } from "@/lib/delete-uploaded-statement";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const { id: idRaw } = await context.params;
    const statementId = parseInt(idRaw, 10);
    if (!Number.isFinite(statementId) || statementId <= 0) {
      return NextResponse.json({ error: "Invalid statement id" }, { status: 400, headers: NO_STORE });
    }

    const result = await deleteUploadedStatement(userId, statementId);
    if (!result) {
      return NextResponse.json(
        { error: "Statement not found or cannot be deleted" },
        { status: 404, headers: NO_STORE },
      );
    }

    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/statements/[id]/DELETE", err);
    return NextResponse.json(
      { error: "Failed to delete statement" },
      { status: 500, headers: NO_STORE },
    );
  }
}
