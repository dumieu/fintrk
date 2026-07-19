import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/auth-resilient";
import { rawSql, resilientRawSql } from "@/lib/db";
import { unpackBlob } from "@/lib/crypto/encryption";
import { ensureStatementFileBlobColumns } from "@/lib/ensure-statement-file-blob";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * MIME types safe to render inline in the browser. Client-supplied upload types
 * (e.g. text/html, image/svg+xml) must never be served as navigable documents
 * under the app origin (CSP allows unsafe-inline scripts).
 */
const SAFE_INLINE_MIME = new Set([
  "application/pdf",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

function normalizeMime(raw: string | null | undefined): string {
  const base = (raw ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!base || base.length > 100 || !/^[a-z0-9.+/-]+$/.test(base)) {
    return "application/octet-stream";
  }
  return base;
}

/** Force a download filename with the correct extension for the stored mime. */
function safeFileName(name: string | null, mime: string): string {
  const base = (name?.trim() || "statement").replace(/[\r\n"]+/g, "_").slice(0, 200);
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
  const ext =
    mime === "text/csv"
      ? "csv"
      : mime === "application/pdf"
        ? "pdf"
        : mime.startsWith("image/")
          ? mime.split("/")[1] ?? "bin"
          : "bin";
  return `${base}.${ext}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;

    const { id: idRaw } = await context.params;
    const statementId = parseInt(idRaw, 10);
    if (!Number.isFinite(statementId) || statementId <= 0) {
      return NextResponse.json({ error: "Invalid statement id" }, { status: 400, headers: NO_STORE });
    }

    await ensureStatementFileBlobColumns();

    // Owner-scoped read; base64 keeps bytea safe over the Neon HTTP driver.
    const rows = (await resilientRawSql(() => rawSql`
      SELECT
        encode(file_blob, 'base64') AS blob_b64,
        file_name AS file_name,
        file_mime_type AS file_mime_type
      FROM statements
      WHERE id = ${statementId} AND user_id = ${userId}
      LIMIT 1
    `)) as { blob_b64: string | null; file_name: string | null; file_mime_type: string | null }[];

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Statement not found" }, { status: 404, headers: NO_STORE });
    }
    if (!row.blob_b64) {
      return NextResponse.json(
        { error: "No stored file for this statement" },
        { status: 404, headers: NO_STORE },
      );
    }

    let bytes: Buffer;
    try {
      bytes = unpackBlob(Buffer.from(row.blob_b64, "base64"));
    } catch (err) {
      logServerError("api/statements/file/unpack", err);
      return NextResponse.json(
        { error: "Stored file could not be decrypted" },
        { status: 500, headers: NO_STORE },
      );
    }

    const storedMime = normalizeMime(row.file_mime_type);
    const canInline = SAFE_INLINE_MIME.has(storedMime);
    const mime = canInline ? storedMime : "application/octet-stream";
    const wantsDownload = request.nextUrl.searchParams.get("download") === "1";
    // Never inline non-allowlisted types (HTML/SVG/etc. would be same-origin XSS).
    const disposition = wantsDownload || !canInline ? "attachment" : "inline";
    const fileName = safeFileName(row.file_name, canInline ? storedMime : mime);

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        // Private user data: never cache in shared/proxy caches.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    logServerError("api/statements/[id]/file/GET", err);
    return NextResponse.json({ error: "Failed to load statement file" }, { status: 500, headers: NO_STORE });
  }
}
