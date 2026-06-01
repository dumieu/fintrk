import { db, resilientQuery } from "@/lib/db";
import { fileUploadLog, statements, transactions } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";

export interface DeleteUploadedStatementResult {
  statementId: number;
  fileName: string;
  transactionsDeleted: number;
  uploadLogsDeleted: number;
}

/**
 * Permanently remove one completed statement, its transactions, and upload-log
 * rows so the same file can be ingested again from scratch.
 */
export async function deleteUploadedStatement(
  userId: string,
  statementId: number,
): Promise<DeleteUploadedStatementResult | null> {
  const [stmt] = await resilientQuery(() =>
    db
      .select({
        id: statements.id,
        fileName: statements.fileName,
        fileSize: statements.fileSize,
        fileHash: statements.fileHash,
        status: statements.status,
      })
      .from(statements)
      .where(and(eq(statements.id, statementId), eq(statements.userId, userId)))
      .limit(1),
  );

  if (!stmt || stmt.status !== "completed") return null;

  const txnRows = await resilientQuery(() =>
    db
      .delete(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.statementId, statementId)))
      .returning({ id: transactions.id }),
  );

  await resilientQuery(() =>
    db
      .delete(statements)
      .where(and(eq(statements.id, statementId), eq(statements.userId, userId))),
  );

  const nameSize = and(
    eq(fileUploadLog.fileName, stmt.fileName),
    eq(fileUploadLog.fileSize, stmt.fileSize),
  );
  const logMatch = and(
    eq(fileUploadLog.userId, userId),
    stmt.fileHash ? or(eq(fileUploadLog.fileHash, stmt.fileHash), nameSize) : nameSize,
  );

  const logRows = await resilientQuery(() =>
    db.delete(fileUploadLog).where(logMatch).returning({ id: fileUploadLog.id }),
  );

  return {
    statementId: stmt.id,
    fileName: stmt.fileName,
    transactionsDeleted: txnRows.length,
    uploadLogsDeleted: logRows.length,
  };
}
