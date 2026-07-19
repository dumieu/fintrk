import { rawSql } from "@/lib/db";

export interface DeleteUploadedStatementResult {
  statementId: number;
  fileName: string;
  transactionsDeleted: number;
  uploadLogsDeleted: number;
}

/**
 * Permanently remove one completed statement, its transactions, item-scoped
 * ignore rules for those txns, and upload-log rows so the same file can be
 * ingested again from scratch.
 * All deletes run in one Neon transaction so a mid-flight failure cannot leave
 * a statement without txns or a deleted statement with a stuck upload-log.
 */
export async function deleteUploadedStatement(
  userId: string,
  statementId: number,
): Promise<DeleteUploadedStatementResult | null> {
  const owned = (await rawSql.query(
    `SELECT id, file_name AS "fileName", file_size AS "fileSize", file_hash AS "fileHash", status
     FROM statements
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [statementId, userId],
  )) as {
    id: number;
    fileName: string;
    fileSize: number;
    fileHash: string | null;
    status: string;
  }[];

  const stmt = owned[0];
  if (!stmt || stmt.status !== "completed") return null;

  const results = (await rawSql.transaction((txn) => {
    const steps = [
      // Item-scoped ignores reference txn ids with no FK; clear before txn delete.
      txn.query(
        `DELETE FROM transaction_ignores
         WHERE user_id = $1
           AND transaction_id IN (
             SELECT id FROM transactions WHERE user_id = $1 AND statement_id = $2
           )
         RETURNING id`,
        [userId, statementId],
      ),
      txn.query(
        `DELETE FROM transactions
         WHERE user_id = $1 AND statement_id = $2
         RETURNING id`,
        [userId, statementId],
      ),
      txn.query(
        `DELETE FROM statements
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [statementId, userId],
      ),
    ];

    // Hash-only when present. OR name+size previously wiped logs for other
    // uploads that shared a filename/size but had a different content hash.
    if (stmt.fileHash) {
      steps.push(
        txn.query(
          `DELETE FROM file_upload_log
           WHERE user_id = $1 AND file_hash = $2
           RETURNING id`,
          [userId, stmt.fileHash],
        ),
      );
    } else {
      steps.push(
        txn.query(
          `DELETE FROM file_upload_log
           WHERE user_id = $1 AND file_name = $2 AND file_size = $3
             AND file_hash IS NULL
           RETURNING id`,
          [userId, stmt.fileName, stmt.fileSize],
        ),
      );
    }

    return steps;
  })) as unknown[][];

  const txnRows = Array.isArray(results[1]) ? results[1] : [];
  const stmtRows = Array.isArray(results[2]) ? results[2] : [];
  const logRows = Array.isArray(results[3]) ? results[3] : [];

  if (stmtRows.length === 0) return null;

  return {
    statementId: stmt.id,
    fileName: stmt.fileName,
    transactionsDeleted: txnRows.length,
    uploadLogsDeleted: logRows.length,
  };
}
