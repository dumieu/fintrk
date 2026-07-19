import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/auth-resilient";
import { checkIngestDedupe } from "@/lib/ingest-dedupe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

interface FileCheck {
  hash: string;
  size: number;
  name: string;
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;

    const { files } = (await request.json()) as { files: FileCheck[] };
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "No files to check" }, { status: 400, headers: NO_STORE });
    }

    const results = await Promise.all(
      files.map(async (f) => {
        const { isDuplicate, reason } = await checkIngestDedupe(userId, f.name, f.size, f.hash);
        return {
          hash: f.hash,
          isDuplicate,
          reason,
          existingStatus: reason,
        };
      }),
    );

    return NextResponse.json({ results }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Failed to check duplicates" }, { status: 500, headers: NO_STORE });
  }
}
