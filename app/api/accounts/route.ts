import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createAccountSchema, updateAccountSchema } from "@/lib/validations/account";
import { logServerError } from "@/lib/safe-error";
import { ef, df } from "@/lib/crypto/encryption";
import { z } from "zod";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type AccountRow = typeof accounts.$inferSelect;

/** Decrypt the encrypted name columns on an account row before responding. */
function decryptAccount<T extends Partial<AccountRow>>(row: T): T {
  return {
    ...row,
    ...(row.institutionName !== undefined ? { institutionName: df(row.institutionName) } : {}),
    ...(row.accountName !== undefined ? { accountName: df(row.accountName) ?? "" } : {}),
  };
}

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rows = await resilientQuery(() =>
      db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.createdAt),
    );

    return NextResponse.json({ data: rows.map(decryptAccount) }, { headers: NO_STORE });
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

    const { institutionName, accountName, ...rest } = parsed.data;
    const [created] = await resilientQuery(() =>
      db.insert(accounts).values({
        userId,
        ...rest,
        accountName: ef(accountName) ?? accountName,
        ...(institutionName !== undefined ? { institutionName: ef(institutionName) } : {}),
      }).returning(),
    );

    return NextResponse.json({ data: decryptAccount(created) }, { status: 201, headers: NO_STORE });
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

    const { id, institutionName, accountName, ...updates } = parsed.data;
    const [updated] = await resilientQuery(() =>
      db.update(accounts).set({
        ...updates,
        ...(institutionName !== undefined ? { institutionName: ef(institutionName) } : {}),
        ...(accountName !== undefined ? { accountName: ef(accountName) ?? "" } : {}),
        updatedAt: new Date(),
      }).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).returning(),
    );

    if (!updated) {
      return NextResponse.json({ error: "Account not found" }, { status: 404, headers: NO_STORE });
    }

    return NextResponse.json({ data: decryptAccount(updated) }, { headers: NO_STORE });
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
