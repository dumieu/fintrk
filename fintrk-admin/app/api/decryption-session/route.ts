import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { hasEncryptionKey } from "@/lib/crypto/encryption";
import {
  createDecryptionSession,
  getActiveDecryptionSession,
  revokeActiveDecryptionSession,
  SESSION_HOURS,
} from "@/lib/decryption-session";

export const dynamic = "force-dynamic";

/** GET: current decryption-session status for this admin. */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  const session = await getActiveDecryptionSession({
    email: gate.email,
    userId: gate.userId,
  });
  return NextResponse.json({
    active: Boolean(session),
    keyConfigured: hasEncryptionKey(),
    session: session
      ? {
          reason: session.reason,
          admin: session.admin_email,
          startedAt: session.started_at,
          expiresAt: session.expires_at,
          accessCount: session.access_count,
        }
      : null,
    sessionHours: SESSION_HOURS,
  });
}

/** POST: start a decryption session (requires a written reason). */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  if (!hasEncryptionKey()) {
    return NextResponse.json(
      { error: "FINTRK_ENCRYPTION_KEY is not configured on the admin app" },
      { status: 400 },
    );
  }

  let reason = "";
  try {
    const body = (await request.json()) as { reason?: string };
    reason = (body.reason ?? "").trim();
  } catch {
    /* no body */
  }
  if (reason.length < 10) {
    return NextResponse.json(
      { error: "A reason of at least 10 characters is required" },
      { status: 400 },
    );
  }

  try {
    const session = await createDecryptionSession(gate.email, gate.userId, reason);
    return NextResponse.json({
      active: true,
      session: {
        reason: session.reason,
        admin: session.admin_email,
        startedAt: session.started_at,
        expiresAt: session.expires_at,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "decrypt_session_audit_failed") {
      return NextResponse.json(
        { error: "Decryption session could not be audited; not started" },
        { status: 500 },
      );
    }
    console.error("POST decryption-session failed:", err);
    return NextResponse.json({ error: "Failed to start decryption session" }, { status: 500 });
  }
}

/** DELETE: end this admin's active decryption session. */
export async function DELETE() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  const result = await revokeActiveDecryptionSession({
    email: gate.email,
    userId: gate.userId,
  });
  if (result.revoked && result.auditFailed) {
    return NextResponse.json(
      {
        error: "Decryption session ended but audit log failed to persist",
        active: false,
        auditFailed: true,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ active: false });
}
