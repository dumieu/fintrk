import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { z } from "zod";
import { queryDistinctUserEmailsForTable } from "@/lib/query-distinct-user-emails-for-table";
import { USER_EMAIL_FILTER_TABLES } from "@/lib/user-email-filter-tables";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  table: z.enum(USER_EMAIL_FILTER_TABLES),
});

/** Distinct users (clerk id + display email) who have at least one row in the given table. */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({ table: searchParams.get("table") ?? "" });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid or missing table" }, { status: 400 });
    }
    const emails = await queryDistinctUserEmailsForTable(parsed.data.table);
    return NextResponse.json({ emails });
  } catch (error) {
    console.error("GET table-user-emails error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user emails" },
      { status: 500 }
    );
  }
}
