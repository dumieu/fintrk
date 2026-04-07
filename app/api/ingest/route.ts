import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { statements } from "@/lib/db/schema";
import { logServerError } from "@/lib/safe-error";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function getBaseUrl() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return "http://localhost:3004";
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json({ error: "AI service not configured — GOOGLE_API_KEY is missing" }, { status: 503, headers: NO_STORE });
    }

    const contentType = request.headers.get("content-type") ?? "";
    const submitted: { id: number; fileName: string }[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll("file") as File[];

      if (files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400, headers: NO_STORE });
      }

      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) continue;
        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString("base64");

        const [stmt] = await resilientQuery(() =>
          db.insert(statements).values({
            userId,
            fileName: file.name,
            fileSize: file.size,
            fileMimeType: file.type,
            status: "uploaded",
            fileData: JSON.stringify({ type: "binary", mimeType: file.type, base64 }),
          }).returning({ id: statements.id }),
        );
        submitted.push({ id: stmt.id, fileName: file.name });
      }
    } else {
      const body = await request.json();

      if (Array.isArray(body)) {
        for (const item of body) {
          const { data, headers: hdrs, fileName } = item;
          if (!Array.isArray(data) || data.length === 0 || !Array.isArray(hdrs)) continue;

          const [stmt] = await resilientQuery(() =>
            db.insert(statements).values({
              userId,
              fileName: fileName ?? "upload.csv",
              fileSize: JSON.stringify(data).length,
              fileMimeType: "text/csv",
              status: "uploaded",
              fileData: JSON.stringify({ type: "structured", headers: hdrs, data }),
            }).returning({ id: statements.id }),
          );
          submitted.push({ id: stmt.id, fileName: fileName ?? "upload.csv" });
        }
      } else {
        const { data, headers: hdrs, fileName } = body;
        if (!Array.isArray(data) || data.length === 0 || !Array.isArray(hdrs)) {
          return NextResponse.json({ error: "Invalid structured payload" }, { status: 400, headers: NO_STORE });
        }

        const [stmt] = await resilientQuery(() =>
          db.insert(statements).values({
            userId,
            fileName: fileName ?? "upload.csv",
            fileSize: JSON.stringify(data).length,
            fileMimeType: "text/csv",
            status: "uploaded",
            fileData: JSON.stringify({ type: "structured", headers: hdrs, data }),
          }).returning({ id: statements.id }),
        );
        submitted.push({ id: stmt.id, fileName: fileName ?? "upload.csv" });
      }
    }

    if (submitted.length === 0) {
      return NextResponse.json({ error: "No valid files to process" }, { status: 400, headers: NO_STORE });
    }

    const internalSecret = process.env.CRON_SECRET || "fintrk-internal";
    const baseUrl = getBaseUrl();

    for (const s of submitted) {
      await db.update(statements)
        .set({ status: "processing" })
        .where(eq(statements.id, s.id))
        .catch(() => {});

      fetch(`${baseUrl}/api/ingest/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": internalSecret,
        },
        body: JSON.stringify({ statementId: s.id }),
      }).catch((err) => logServerError(`fire-process/${s.id}`, err));
    }

    return NextResponse.json({
      success: true,
      queued: submitted.length,
      statementIds: submitted.map((s) => s.id),
      files: submitted.map((s) => s.fileName),
    }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/ingest", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to queue statements: ${message.slice(0, 200)}` }, { status: 500, headers: NO_STORE });
  }
}
