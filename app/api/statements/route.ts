import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAppAuth } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { accounts, statements, transactions } from "@/lib/db/schema";
import { excludeIgnoredSql } from "@/lib/db/excluded-transactions";
import { df } from "@/lib/crypto/encryption";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;

    const rows = await resilientQuery(() =>
      db
        .select({
          id: statements.id,
          fileName: statements.fileName,
          fileMimeType: statements.fileMimeType,
          fileSize: statements.fileSize,
          storedSize: statements.storedSize,
          hasFile: sql<boolean>`(${statements.fileBlob} IS NOT NULL)`,
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
        .leftJoin(accounts, and(eq(statements.accountId, accounts.id), eq(accounts.userId, userId)))
        .leftJoin(
          transactions,
          and(
            eq(transactions.statementId, statements.id),
            eq(transactions.userId, userId),
            excludeIgnoredSql(),
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
        .orderBy(
          desc(sql`COALESCE(MAX(${transactions.postedDate}), ${statements.periodEnd})`),
          desc(sql`COALESCE(MIN(${transactions.postedDate}), ${statements.periodStart})`),
          desc(statements.id),
        )
        .limit(100),
    );

    return NextResponse.json({
      statements: rows.map((row) => ({
        id: row.id,
        name: row.fileName,
        mimeType: row.fileMimeType,
        sizeBytes: row.fileSize ?? null,
        storedSize: row.storedSize ?? null,
        hasFile: Boolean(row.hasFile),
        account: row.accountName
          ? {
              name: df(row.accountName),
              institutionName: df(row.institutionName),
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
