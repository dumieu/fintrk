import { NextResponse } from "next/server";

import { requireAppAuth } from "@/lib/auth-resilient";
import {
  clearUserQuickNote,
  getUserQuickNote,
  QuickNoteError,
  upsertUserQuickNote,
} from "@/lib/quick-note/quick-note-service";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function statusFor(e: unknown): number {
  if (e instanceof QuickNoteError) return e.status;
  return 500;
}

export async function GET() {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;
    const note = await getUserQuickNote(userId);
    return NextResponse.json({ note }, { headers: NO_STORE });
  } catch (e) {
    logServerError("api/quick-note GET", e);
    const message = e instanceof Error ? e.message : "Failed to load note";
    return NextResponse.json({ error: message }, { status: statusFor(e), headers: NO_STORE });
  }
}

export async function PUT(request: Request) {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      body?: string;
    };
    const note = await upsertUserQuickNote(userId, body.title ?? "", body.body ?? "");
    return NextResponse.json({ note }, { headers: NO_STORE });
  } catch (e) {
    logServerError("api/quick-note PUT", e);
    const message = e instanceof Error ? e.message : "Failed to save note";
    return NextResponse.json({ error: message }, { status: statusFor(e), headers: NO_STORE });
  }
}

export async function DELETE() {
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    const { userId } = gate;
    await clearUserQuickNote(userId);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    logServerError("api/quick-note DELETE", e);
    const message = e instanceof Error ? e.message : "Failed to clear note";
    return NextResponse.json({ error: message }, { status: statusFor(e), headers: NO_STORE });
  }
}
