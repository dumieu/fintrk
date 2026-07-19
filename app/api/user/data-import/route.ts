import { NextRequest, NextResponse } from "next/server";

import { requireAppAuth } from "@/lib/auth-resilient";
import { importUserDataExport } from "@/lib/data-transfer-server";
import { isFintrkDataExport, type FintrkImportMode } from "@/lib/data-transfer";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" } as const;

async function parseImportBody(
  request: NextRequest,
): Promise<{ mode: FintrkImportMode; data: unknown }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const modeRaw = String(form.get("mode") ?? "merge");
    const mode: FintrkImportMode = modeRaw === "replace" ? "replace" : "merge";
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("Expected a JSON file under `file`.");
    }
    const text = await file.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("That file is not valid JSON.");
    }
    return { mode, data };
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new Error("Expected JSON body or multipart form upload.");
  }
  const modeRaw = (body as { mode?: string }).mode;
  const mode: FintrkImportMode = modeRaw === "replace" ? "replace" : "merge";
  const data = (body as { data?: unknown }).data ?? body;

  if (
    data &&
    typeof data === "object" &&
    "format" in (data as object) === false &&
    "data" in (body as object)
  ) {
    throw new Error("Missing export payload under `data`.");
  }

  return { mode, data };
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;

    const { mode, data } = await parseImportBody(request);
    if (!isFintrkDataExport(data)) {
      return NextResponse.json(
        { error: "Not a FinTRK export file (missing format or transactions)." },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await importUserDataExport(userId, data, mode);
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/user/data-import", err);
    const message = err instanceof Error ? err.message : "Failed to import data.";
    const status = /invalid|newer format|not valid json|expected|missing|not a fintrk/i.test(
      message,
    )
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
