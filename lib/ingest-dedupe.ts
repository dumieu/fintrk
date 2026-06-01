import { db, resilientQuery } from "@/lib/db";
import { statements, fileUploadLog } from "@/lib/db/schema";
import { and, eq, or, desc } from "drizzle-orm";

export type IngestDedupeReason =
  | "exact_duplicate"
  | "previously_failed"
  | "previously_empty"
  | "in_progress"
  | "size_increased"
  | null;

/** Reasons that should queue a new ingest attempt instead of skipping. */
export function allowsReingest(reason: string | null | undefined): boolean {
  return reason === "previously_failed" || reason === "previously_empty";
}

function statementMatch(
  userId: string,
  fileName: string,
  fileSize: number,
  fileHash: string | null,
) {
  const nameSize = and(eq(statements.fileName, fileName), eq(statements.fileSize, fileSize));
  return and(
    eq(statements.userId, userId),
    fileHash ? or(eq(statements.fileHash, fileHash), nameSize) : nameSize,
  );
}

function uploadLogMatch(
  userId: string,
  fileName: string,
  fileSize: number,
  fileHash: string | null,
) {
  const nameSize = and(eq(fileUploadLog.fileName, fileName), eq(fileUploadLog.fileSize, fileSize));
  return and(
    eq(fileUploadLog.userId, userId),
    fileHash ? or(eq(fileUploadLog.fileHash, fileHash), nameSize) : nameSize,
  );
}

/**
 * Decide whether an incoming file matches a prior upload that should block re-ingest.
 * `isDuplicate: true` with `previously_*` reasons still allows the client to queue a retry.
 */
export async function checkIngestDedupe(
  userId: string,
  fileName: string,
  fileSize: number,
  fileHash: string | null,
): Promise<{ isDuplicate: boolean; reason: IngestDedupeReason }> {
  const stmtRows = await resilientQuery(() =>
    db
      .select({
        status: statements.status,
        transactionsImported: statements.transactionsImported,
        transactionsDuplicate: statements.transactionsDuplicate,
        fileSize: statements.fileSize,
      })
      .from(statements)
      .where(statementMatch(userId, fileName, fileSize, fileHash))
      .orderBy(desc(statements.createdAt))
      .limit(1),
  );

  if (stmtRows.length > 0) {
    const s = stmtRows[0];
    if (fileSize > s.fileSize) {
      return { isDuplicate: false, reason: "size_increased" };
    }
    if (s.status === "failed") {
      return { isDuplicate: true, reason: "previously_failed" };
    }
    if (s.status === "uploaded" || s.status === "processing") {
      return { isDuplicate: true, reason: "in_progress" };
    }
    if (s.status === "completed") {
      const imported = s.transactionsImported ?? 0;
      const dupes = s.transactionsDuplicate ?? 0;
      if (imported === 0 && dupes === 0) {
        return { isDuplicate: true, reason: "previously_empty" };
      }
      return { isDuplicate: true, reason: "exact_duplicate" };
    }
  }

  const logRows = await resilientQuery(() =>
    db
      .select({ fileSize: fileUploadLog.fileSize, outcome: fileUploadLog.outcome })
      .from(fileUploadLog)
      .where(uploadLogMatch(userId, fileName, fileSize, fileHash))
      .orderBy(desc(fileUploadLog.createdAt))
      .limit(1),
  );

  if (logRows.length === 0) {
    return { isDuplicate: false, reason: null };
  }

  const log = logRows[0];
  if (fileSize > log.fileSize) {
    return { isDuplicate: false, reason: "size_increased" };
  }
  if (log.outcome === "failed") {
    return { isDuplicate: true, reason: "previously_failed" };
  }

  return { isDuplicate: true, reason: "exact_duplicate" };
}

/** True when ingest POST should reject this file as an already-processed duplicate. */
export async function blocksIngestUpload(
  userId: string,
  fileName: string,
  fileSize: number,
  fileHash: string | null,
): Promise<boolean> {
  const { isDuplicate, reason } = await checkIngestDedupe(userId, fileName, fileSize, fileHash);
  if (!isDuplicate) return false;
  return !allowsReingest(reason);
}
