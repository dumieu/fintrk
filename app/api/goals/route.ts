import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createGoalSchema } from "@/lib/validations/budget";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const data = await resilientQuery(() =>
      db.select().from(goals).where(eq(goals.userId, userId)).orderBy(goals.createdAt),
    );

    return NextResponse.json({ data }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/goals/GET", err);
    return NextResponse.json({ error: "Failed to load goals" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = createGoalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400, headers: NO_STORE });
    }

    const [created] = await resilientQuery(() =>
      db.insert(goals).values({
        userId,
        name: parsed.data.name,
        targetAmount: parsed.data.targetAmount.toString(),
        currency: parsed.data.currency,
        targetDate: parsed.data.targetDate ?? null,
      }).returning(),
    );

    return NextResponse.json({ data: created }, { status: 201, headers: NO_STORE });
  } catch (err) {
    logServerError("api/goals/POST", err);
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500, headers: NO_STORE });
  }
}
