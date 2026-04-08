import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { statements, fileUploadLog } from "@/lib/db/schema";
import { logServerError } from "@/lib/safe-error";
import { processStatement } from "@/lib/process-statement";
import { eq, and, or } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_STORE = { "Cache-Control": "no-store" } as const;

async function isDuplicate(
  userId: string,
  fileName: string,
  fileSize: number,
  fileHash: string | null,
): Promise<boolean> {
  const nameSizeMatch = and(
    eq(fileUploadLog.fileName, fileName),
    eq(fileUploadLog.fileSize, fileSize),
  );
  const orCondition = fileHash
    ? or(eq(fileUploadLog.fileHash, fileHash), nameSizeMatch)
    : nameSizeMatch;

  const existing = await resilientQuery(() =>
    db.select({ id: fileUploadLog.id, fileSize: fileUploadLog.fileSize, outcome: fileUploadLog.outcome })
      .from(fileUploadLog)
      .where(and(eq(fileUploadLog.userId, userId), orCondition))
      .limit(1),
  );

  if (existing.length === 0) return false;

  const match = existing[0];
  if (match.outcome === "failed") return false;
  if (fileSize > match.fileSize) return false;

  return true;
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
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json({ error: "AI service not configured — GOOGLE_API_KEY is missing" }, { status: 503, headers: NO_STORE });
    }

    const contentType = request.headers.get("content-type") ?? "";
    const submitted: { id: number; fileName: string; fileSize: number; fileHash: string | null }[] = [];
    const skippedDuplicates: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll("file") as File[];
      const hashesRaw = formData.get("fileHashes") as string | null;
      const hashMap: Record<string, string> = hashesRaw ? JSON.parse(hashesRaw) : {};

      if (files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400, headers: NO_STORE });
      }

      for (const file of files) {
        if (file.size > 1 * 1024 * 1024) continue;

        const hash = hashMap[file.name] ?? null;
        if (await isDuplicate(userId, file.name, file.size, hash)) {
          skippedDuplicates.push(file.name);
          continue;
        }

        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString("base64");

        const [stmt] = await resilientQuery(() =>
          db.insert(statements).values({
            userId,
            fileName: file.name,
            fileSize: file.size,
            fileMimeType: file.type,
            fileHash: hash,
            status: "uploaded",
            fileData: JSON.stringify({ type: "binary", mimeType: file.type, base64 }),
          }).returning({ id: statements.id }),
        );
        submitted.push({ id: stmt.id, fileName: file.name, fileSize: file.size, fileHash: hash });
      }
    } else {
      const body = await request.json();
      const items = Array.isArray(body) ? body : [body];

      for (const item of items) {
        const { data, headers: hdrs, fileName, fileHash } = item;
        if (!Array.isArray(data) || data.length === 0 || !Array.isArray(hdrs)) continue;

        const name = fileName ?? "upload.csv";
        const size = JSON.stringify(data).length;
        const hash = fileHash ?? null;

        if (await isDuplicate(userId, name, size, hash)) {
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
            fileData: JSON.stringify({ type: "structured", headers: hdrs, data }),
          }).returning({ id: statements.id }),
        );
        submitted.push({ id: stmt.id, fileName: name, fileSize: size, fileHash: hash });
      }
    }

    if (submitted.length === 0 && skippedDuplicates.length === 0) {
      return NextResponse.json({ error: "No valid files to process" }, { status: 400, headers: NO_STORE });
    }

    if (submitted.length === 0 && skippedDuplicates.length > 0) {
      return NextResponse.json({
        success: true,
        queued: 0,
        statementIds: [],
        files: [],
        duplicatesSkipped: skippedDuplicates,
      }, { headers: NO_STORE });
    }

    // Mark processing + log uploads
    await Promise.all(
      submitted.map((s) =>
        Promise.all([
          logUpload(userId, s.fileName, s.fileSize, s.fileHash, "processed"),
          db.update(statements).set({ status: "processing" }).where(eq(statements.id, s.id)).catch(() => {}),
        ]),
      ),
    );

    // Schedule AI processing to run after the response is sent.
    // Process sequentially to avoid race conditions when multiple files
    // from the same bank create accounts concurrently.
    after(async () => {
      for (const s of submitted) {
        await processStatement(s.id).catch((err) => logServerError(`process/${s.id}`, err));
      }
    });

    return NextResponse.json({
      success: true,
      queued: submitted.length,
      statementIds: submitted.map((s) => s.id),
      files: submitted.map((s) => s.fileName),
      duplicatesSkipped: skippedDuplicates,
    }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/ingest", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to queue statements: ${message.slice(0, 200)}` }, { status: 500, headers: NO_STORE });
  }
}
