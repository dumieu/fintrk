import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ ok: false, reason: gate.reason }, { status: 401 });
  return NextResponse.json({ ok: true, email: gate.email });
}
