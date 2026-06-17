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

/** GET: current decryption-session status. */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  const session = await getActiveDecryptionSession();
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
}

/** DELETE: end the active decryption session. */
export async function DELETE() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  await revokeActiveDecryptionSession(gate.email);
  return NextResponse.json({ active: false });
}
