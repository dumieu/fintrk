import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireAppAuth } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { statements, fileUploadLog } from "@/lib/db/schema";
import { logServerError } from "@/lib/safe-error";
import { blocksIngestUpload } from "@/lib/ingest-dedupe";
import { ef, packBlob } from "@/lib/crypto/encryption";
import { ensureStatementFileBlobColumns } from "@/lib/ensure-statement-file-blob";
import { rawSql, resilientRawSql } from "@/lib/db";

/** Deterministic RFC-4180-ish CSV from parsed rows, so structured uploads keep a
 *  real, downloadable source file (we only receive parsed data, not raw bytes). */
function dataToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) lines.push(headers.map((h) => esc(row[h])).join(","));
  return lines.join("\r\n");
}

/** Compress + encrypt the original bytes and persist them to statements.file_blob. */
async function persistStatementBlob(statementId: number, raw: Buffer): Promise<void> {
  const packed = packBlob(raw);
  const b64 = packed.toString("base64");
  await resilientRawSql(() => rawSql`
    UPDATE statements
    SET file_blob = decode(${b64}, 'base64'), stored_size = ${packed.length}
    WHERE id = ${statementId}
  `);
}

export const dynamic = "force-dynamic";
// Receiving up to 100 PDFs in one multipart request + per-file dedupe checks
// + DB inserts can easily exceed the default 10s. Pro plan ceiling is 300s.
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" } as const;
const SERVER_BATCH_LIMIT = 100;
/** Bank PDFs / Excel exports routinely exceed 1MB; keep a hard ceiling for abuse. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Persist only preview-safe MIME labels; never trust client HTML/SVG types. */
const ALLOWED_UPLOAD_MIME = new Set([
  "application/pdf",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function sanitizeUploadMime(raw: string | undefined | null): string {
  const base = (raw ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (ALLOWED_UPLOAD_MIME.has(base)) return base === "image/jpg" ? "image/jpeg" : base;
  return "application/octet-stream";
}

function sha256Hex(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function logUpload(
  userId: string,
  fileName: string,
  fileSize: number,
  fileHash: string | null,
  outcome: string,
) {
  await resilientQuery(() =>
    db.insert(fileUploadLog).values({ userId, fileName, fileSize, fileHash, outcome }),
  ).catch(() => {});
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;

    await ensureStatementFileBlobColumns();

    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json({ error: "AI service not configured — GOOGLE_API_KEY is missing" }, { status: 503, headers: NO_STORE });
    }

    const contentType = request.headers.get("content-type") ?? "";
    const submitted: { id: number; fileName: string; fileSize: number; fileHash: string | null }[] = [];
    const skippedDuplicates: string[] = [];
    const skippedTooLarge: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll("file") as File[];

      if (files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400, headers: NO_STORE });
      }

      for (const file of files) {
        if (submitted.length >= SERVER_BATCH_LIMIT) break;
        if (file.size > MAX_UPLOAD_BYTES) {
          skippedTooLarge.push(file.name);
          continue;
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        // Always hash server-side so dedupe is content-true (not name/size/mtime).
        const hash = sha256Hex(bytes);

        if (await blocksIngestUpload(userId, file.name, file.size, hash)) {
          skippedDuplicates.push(file.name);
          continue;
        }

        const base64 = bytes.toString("base64");
        const mimeType = sanitizeUploadMime(file.type);

        const [stmt] = await resilientQuery(() =>
          db.insert(statements).values({
            userId,
            fileName: file.name,
            fileSize: file.size,
            fileMimeType: mimeType,
            fileHash: hash,
            status: "uploaded",
            fileData: ef(JSON.stringify({ type: "binary", mimeType, base64 })),
          }).returning({ id: statements.id }),
        );
        // Durable retained copy (original PDF/image bytes), minimal footprint.
        await persistStatementBlob(stmt.id, bytes).catch((err) =>
          logServerError("api/ingest/blob", err),
        );
        submitted.push({ id: stmt.id, fileName: file.name, fileSize: file.size, fileHash: hash });
      }
    } else {
      const body = await request.json();
      const items = Array.isArray(body) ? body : [body];

      for (const item of items) {
        if (submitted.length >= SERVER_BATCH_LIMIT) break;
        const { data, headers: hdrs, fileName, fileHash: clientHash } = item;
        if (!Array.isArray(data) || data.length === 0 || !Array.isArray(hdrs)) continue;

        const name = fileName ?? "upload.csv";
        const payload = JSON.stringify({ type: "structured", headers: hdrs, data });
        const size = Buffer.byteLength(payload, "utf8");
        if (size > MAX_UPLOAD_BYTES) {
          skippedTooLarge.push(name);
          continue;
        }
        // Prefer hashing the canonical stored payload so re-exports of the same
        // rows collide; fall back to client hash only if payload hash somehow empty.
        const hash = sha256Hex(payload) || (typeof clientHash === "string" ? clientHash : null);

        if (await blocksIngestUpload(userId, name, size, hash)) {
          skippedDuplicates.push(name);
          continue;
        }

        const [stmt] = await resilientQuery(() =>
          db.insert(statements).values({
            userId,
            fileName: name,
            fileSize: size,
            fileMimeType: "text/csv",
            fileHash: hash,
            status: "uploaded",
            fileData: ef(payload),
          }).returning({ id: statements.id }),
        );
        // Durable retained copy as a real CSV regenerated from parsed rows.
        await persistStatementBlob(
          stmt.id,
          Buffer.from(dataToCsv(hdrs, data as Record<string, unknown>[]), "utf8"),
        ).catch((err) => logServerError("api/ingest/blob", err));
        submitted.push({ id: stmt.id, fileName: name, fileSize: size, fileHash: hash });
      }
    }

    if (submitted.length === 0 && skippedDuplicates.length === 0 && skippedTooLarge.length === 0) {
      return NextResponse.json({ error: "No valid files to process" }, { status: 400, headers: NO_STORE });
    }

    if (submitted.length === 0 && (skippedDuplicates.length > 0 || skippedTooLarge.length > 0)) {
      return NextResponse.json({
        success: true,
        queued: 0,
        statementIds: [],
        files: [],
        duplicatesSkipped: skippedDuplicates,
        tooLargeSkipped: skippedTooLarge,
      }, { headers: NO_STORE });
    }

    // Log uploads (processing is triggered per-statement by the client)
    await Promise.all(
      submitted.map((s) =>
        logUpload(userId, s.fileName, s.fileSize, s.fileHash, "processed"),
      ),
    );

    return NextResponse.json({
      success: true,
      queued: submitted.length,
      statementIds: submitted.map((s) => s.id),
      files: submitted.map((s) => s.fileName),
      duplicatesSkipped: skippedDuplicates,
      tooLargeSkipped: skippedTooLarge,
    }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/ingest", err);
    return NextResponse.json(
      { error: "Failed to queue statements. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
}
