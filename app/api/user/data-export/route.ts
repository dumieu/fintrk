import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { buildUserDataExport } from "@/lib/data-transfer-server";
import { formatExportFilename, sanitizeExportUserLabel } from "@/lib/data-transfer";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const clerk = await currentUser().catch(() => null);
    const label =
      sanitizeExportUserLabel(
        [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ") ||
          clerk?.username ||
          clerk?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
          userId,
      ) || "user";

    const payload = await buildUserDataExport(userId, label);
    const filename = formatExportFilename(label);

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-FinTRK-Export-Transactions": String(payload.counts.transactions),
      },
    });
  } catch (err) {
    logServerError("api/user/data-export", err);
    return NextResponse.json(
      { error: "Failed to export data. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
}
