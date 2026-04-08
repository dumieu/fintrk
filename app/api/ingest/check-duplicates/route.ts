import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { fileUploadLog } from "@/lib/db/schema";
import { and, eq, or, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

interface FileCheck {
  hash: string;
  size: number;
  name: string;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const { files } = (await request.json()) as { files: FileCheck[] };
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "No files to check" }, { status: 400, headers: NO_STORE });
    }

    const hashes = files.map((f) => f.hash);
    const names = files.map((f) => f.name);

    const existing = await resilientQuery(() =>
      db
        .select({
          fileHash: fileUploadLog.fileHash,
          fileSize: fileUploadLog.fileSize,
          fileName: fileUploadLog.fileName,
          outcome: fileUploadLog.outcome,
        })
        .from(fileUploadLog)
        .where(
          and(
            eq(fileUploadLog.userId, userId),
            or(
              inArray(fileUploadLog.fileHash, hashes),
              inArray(fileUploadLog.fileName, names),
            ),
          ),
        ),
    );

    const hashMap = new Map<string, { size: number; outcome: string; fileName: string }>();
    const nameMap = new Map<string, { size: number; outcome: string }[]>();

    for (const r of existing) {
      if (r.fileHash) {
        hashMap.set(r.fileHash, { size: r.fileSize, outcome: r.outcome, fileName: r.fileName });
      }
      const list = nameMap.get(r.fileName) ?? [];
      list.push({ size: r.fileSize, outcome: r.outcome });
      nameMap.set(r.fileName, list);
    }

    const results = files.map((f) => {
      const hashMatch = hashMap.get(f.hash);
      if (hashMatch) {
        if (f.size > hashMatch.size) {
          return { hash: f.hash, isDuplicate: false, reason: "size_increased" };
        }
        return {
          hash: f.hash,
          isDuplicate: true,
          reason: hashMatch.outcome === "failed" ? "previously_failed" : "exact_duplicate",
          existingStatus: hashMatch.outcome,
        };
      }

      const nameMatches = nameMap.get(f.name);
      if (nameMatches) {
        const sameSize = nameMatches.find((m) => m.size === f.size);
        if (sameSize) {
          if (sameSize.outcome === "failed") {
            return { hash: f.hash, isDuplicate: true, reason: "previously_failed", existingStatus: "failed" };
          }
          return { hash: f.hash, isDuplicate: true, reason: "exact_duplicate", existingStatus: sameSize.outcome };
        }
        if (nameMatches.every((m) => f.size > m.size)) {
          return { hash: f.hash, isDuplicate: false, reason: "size_increased" };
        }
      }

      return { hash: f.hash, isDuplicate: false, reason: null };
    });

    return NextResponse.json({ results }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Failed to check duplicates" }, { status: 500, headers: NO_STORE });
  }
}
