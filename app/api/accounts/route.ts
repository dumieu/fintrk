import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createAccountSchema, updateAccountSchema } from "@/lib/validations/account";
import { logServerError } from "@/lib/safe-error";
import { z } from "zod";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rows = await resilientQuery(() =>
      db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.createdAt),
    );

    return NextResponse.json({ data: rows }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/accounts/GET", err);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400, headers: NO_STORE });
    }

    const [created] = await resilientQuery(() =>
      db.insert(accounts).values({ userId, ...parsed.data }).returning(),
    );

    return NextResponse.json({ data: created }, { status: 201, headers: NO_STORE });
  } catch (err) {
    logServerError("api/accounts/POST", err);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400, headers: NO_STORE });
    }

    const { id, ...updates } = parsed.data;
    const [updated] = await resilientQuery(() =>
      db.update(accounts).set({ ...updates, updatedAt: new Date() }).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).returning(),
    );

    if (!updated) {
      return NextResponse.json({ error: "Account not found" }, { status: 404, headers: NO_STORE });
    }

    return NextResponse.json({ data: updated }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/accounts/PUT", err);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = z.object({ id: z.string().uuid() }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400, headers: NO_STORE });
    }

    const [updated] = await resilientQuery(() =>
      db.update(accounts)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(accounts.id, parsed.data.id), eq(accounts.userId, userId)))
        .returning(),
    );

    if (!updated) {
      return NextResponse.json({ error: "Account not found" }, { status: 404, headers: NO_STORE });
    }

    return NextResponse.json({ data: updated }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/accounts/DELETE", err);
    return NextResponse.json({ error: "Failed to deactivate account" }, { status: 500, headers: NO_STORE });
  }
}
