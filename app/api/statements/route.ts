import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { accounts, statements, transactions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const rows = await resilientQuery(() =>
      db
        .select({
          id: statements.id,
          fileName: statements.fileName,
          accountName: accounts.accountName,
          institutionName: accounts.institutionName,
          accountType: accounts.accountType,
          periodStart: statements.periodStart,
          periodEnd: statements.periodEnd,
          transactionStart: sql<string | null>`min(${transactions.postedDate})`,
          transactionEnd: sql<string | null>`max(${transactions.postedDate})`,
          transactionsImported: statements.transactionsImported,
          transactionsDuplicate: statements.transactionsDuplicate,
          aiProcessedAt: statements.aiProcessedAt,
          createdAt: statements.createdAt,
        })
        .from(statements)
        .leftJoin(accounts, eq(statements.accountId, accounts.id))
        .leftJoin(
          transactions,
          and(
            eq(transactions.statementId, statements.id),
            eq(transactions.userId, userId),
          ),
        )
        .where(and(eq(statements.userId, userId), eq(statements.status, "completed")))
        .groupBy(
          statements.id,
          accounts.id,
          accounts.accountName,
          accounts.institutionName,
          accounts.accountType,
        )
        .orderBy(desc(statements.aiProcessedAt), desc(statements.createdAt))
        .limit(100),
    );

    return NextResponse.json({
      statements: rows.map((row) => ({
        id: row.id,
        name: row.fileName,
        account: row.accountName
          ? {
              name: row.accountName,
              institutionName: row.institutionName,
              type: row.accountType,
            }
          : null,
        transactionStart: row.transactionStart ?? row.periodStart,
        transactionEnd: row.transactionEnd ?? row.periodEnd,
        transactionsImported: row.transactionsImported ?? 0,
        transactionsDuplicate: row.transactionsDuplicate ?? 0,
        processedAt: row.aiProcessedAt ?? row.createdAt,
      })),
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ statements: [] }, { headers: NO_STORE });
  }
}
