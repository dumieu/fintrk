import { db, resilientQuery } from "@/lib/db";
import { statements, fileUploadLog } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";

export type IngestDedupeReason =
  | "exact_duplicate"
  | "previously_failed"
  | "previously_empty"
  | "in_progress"
  | null;

/** Reasons that should queue a new ingest attempt instead of skipping. */
export function allowsReingest(reason: string | null | undefined): boolean {
  return reason === "previously_failed" || reason === "previously_empty";
}

/**
 * File-level dedupe is content-hash only (SHA-256 of bytes / structured payload).
 *
 * Name and size are NEVER used to block a completed upload. Mid-month and
 * end-of-month exports of the "same" statement often share a filename (or even
 * a similar size) but contain new transactions — those must always be processed.
 * Transaction-level unique keys absorb overlap; this gate only saves AI cost
 * when the user re-submits the exact same bytes.
 */
export async function checkIngestDedupe(
  userId: string,
  _fileName: string,
  _fileSize: number,
  fileHash: string | null,
): Promise<{ isDuplicate: boolean; reason: IngestDedupeReason }> {
  if (!fileHash) {
    return { isDuplicate: false, reason: null };
  }

  const stmtRows = await resilientQuery(() =>
    db
      .select({
        status: statements.status,
        transactionsImported: statements.transactionsImported,
        transactionsDuplicate: statements.transactionsDuplicate,
      })
      .from(statements)
      .where(and(eq(statements.userId, userId), eq(statements.fileHash, fileHash)))
      .orderBy(desc(statements.createdAt))
      .limit(1),
  );

  if (stmtRows.length > 0) {
    const s = stmtRows[0];
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
      .select({ outcome: fileUploadLog.outcome })
      .from(fileUploadLog)
      .where(and(eq(fileUploadLog.userId, userId), eq(fileUploadLog.fileHash, fileHash)))
      .orderBy(desc(fileUploadLog.createdAt))
      .limit(1),
  );

  if (logRows.length === 0) {
    return { isDuplicate: false, reason: null };
  }

  const log = logRows[0];
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
