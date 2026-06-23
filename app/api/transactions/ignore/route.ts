import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactionIgnores, transactions } from "@/lib/db/schema";
import { ignoreNameKey } from "@/lib/db/excluded-transactions";
import { ensureTransactionIgnoresTable } from "@/lib/ensure-transaction-ignores";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** List all of the user's ignore rules, with how many transactions each hides. */
export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();
    await ensureTransactionIgnoresTable();

    const rules = await resilientQuery(() =>
      db
        .select({
          id: transactionIgnores.id,
          scope: transactionIgnores.scope,
          transactionId: transactionIgnores.transactionId,
          nameKey: transactionIgnores.nameKey,
          displayName: transactionIgnores.displayName,
          createdAt: transactionIgnores.createdAt,
        })
        .from(transactionIgnores)
        .where(eq(transactionIgnores.userId, userId))
        .orderBy(sql`${transactionIgnores.createdAt} DESC`),
    );

    const nameKeys = rules
      .filter((r) => r.scope === "name" && r.nameKey)
      .map((r) => r.nameKey as string);

    const countByKey = new Map<string, number>();
    if (nameKeys.length > 0) {
      const rows = await resilientQuery(() =>
        db
          .select({
            key: sql<string>`lower(btrim(coalesce(${transactions.merchantName}, ${transactions.rawDescription})))`.as(
              "key",
            ),
            n: sql<number>`count(*)::int`.as("n"),
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              sql`lower(btrim(coalesce(${transactions.merchantName}, ${transactions.rawDescription}))) IN (${sql.join(
                nameKeys.map((k) => sql`${k}`),
                sql`, `,
              )})`,
            ),
          )
          .groupBy(sql`lower(btrim(coalesce(${transactions.merchantName}, ${transactions.rawDescription})))`),
      );
      for (const row of rows) countByKey.set(row.key, Number(row.n));
    }

    return NextResponse.json(
      {
        ignores: rules.map((r) => ({
          id: r.id,
          scope: r.scope,
          displayName: r.displayName,
          createdAt: r.createdAt,
          affectedCount:
            r.scope === "name" ? (r.nameKey ? countByKey.get(r.nameKey) ?? 0 : 0) : 1,
        })),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    logServerError("api/transactions/ignore/GET", err);
    return NextResponse.json({ error: "Failed to load ignored items" }, { status: 500, headers: NO_STORE });
  }
}

/** Create an ignore rule from a transaction (scope 'item' or 'name'). */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();
    await ensureTransactionIgnoresTable();

    const body = await request.json().catch(() => ({}));
    const transactionId = typeof body?.transactionId === "string" ? body.transactionId : null;
    const scope = body?.scope === "item" ? "item" : "name";
    if (!transactionId) {
      return NextResponse.json({ error: "transactionId is required" }, { status: 400, headers: NO_STORE });
    }

    const [txn] = await resilientQuery(() =>
      db
        .select({
          id: transactions.id,
          merchantName: transactions.merchantName,
          rawDescription: transactions.rawDescription,
        })
        .from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
        .limit(1),
    );
    if (!txn) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404, headers: NO_STORE });
    }

    const displayName =
      (txn.merchantName?.trim() || txn.rawDescription?.trim() || "Unnamed").slice(0, 255);

    if (scope === "name") {
      const nameKey = ignoreNameKey(txn.merchantName, txn.rawDescription);
      if (!nameKey) {
        return NextResponse.json({ error: "Transaction has no name to ignore" }, { status: 400, headers: NO_STORE });
      }
      await resilientQuery(() =>
        db
          .insert(transactionIgnores)
          .values({ userId, scope: "name", transactionId: null, nameKey, displayName })
          .onConflictDoNothing({
            target: [transactionIgnores.userId, transactionIgnores.nameKey],
          }),
      );
    } else {
      await resilientQuery(() =>
        db
          .insert(transactionIgnores)
          .values({ userId, scope: "item", transactionId, nameKey: null, displayName })
          .onConflictDoNothing({
            target: [transactionIgnores.userId, transactionIgnores.transactionId],
          }),
      );
    }

    return NextResponse.json({ success: true, scope, displayName }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/transactions/ignore/POST", err);
    return NextResponse.json({ error: "Failed to ignore transaction" }, { status: 500, headers: NO_STORE });
  }
}

/** Remove ignore rule(s) by id, restoring the matching transactions everywhere. */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();
    await ensureTransactionIgnoresTable();

    const body = await request.json().catch(() => ({}));
    const idParam = request.nextUrl.searchParams.get("id");
    const ids: number[] = [];
    if (idParam && Number.isFinite(Number(idParam))) ids.push(Number(idParam));
    if (Array.isArray(body?.ids)) {
      for (const v of body.ids) if (Number.isFinite(Number(v))) ids.push(Number(v));
    } else if (Number.isFinite(Number(body?.id))) {
      ids.push(Number(body.id));
    }
    if (ids.length === 0) {
      return NextResponse.json({ error: "id is required" }, { status: 400, headers: NO_STORE });
    }

    const removed = await resilientQuery(() =>
      db
        .delete(transactionIgnores)
        .where(and(eq(transactionIgnores.userId, userId), inArray(transactionIgnores.id, ids)))
        .returning({ id: transactionIgnores.id }),
    );

    return NextResponse.json({ deleted: removed.length }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/transactions/ignore/DELETE", err);
    return NextResponse.json({ error: "Failed to restore ignored item" }, { status: 500, headers: NO_STORE });
  }
}
