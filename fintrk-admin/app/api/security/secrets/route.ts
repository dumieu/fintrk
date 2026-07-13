import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

const SECRET_CHECKS: Array<{ key: string; label: string; group: string }> = [
  { key: "DATABASE_URL", label: "DATABASE_URL", group: "Neon" },
  {
    key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    label: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    group: "Clerk (Admin)",
  },
  { key: "CLERK_SECRET_KEY", label: "CLERK_SECRET_KEY", group: "Clerk (Admin)" },
  {
    key: "USER_APP_CLERK_SECRET_KEY",
    label: "USER_APP_CLERK_SECRET_KEY",
    group: "Clerk (User App)",
  },
  { key: "STRIPE_SECRET_KEY", label: "STRIPE_SECRET_KEY", group: "Stripe" },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    label: "STRIPE_WEBHOOK_SECRET",
    group: "Stripe",
  },
  {
    key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    label: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    group: "Stripe",
  },
  {
    key: "FINTRK_ENCRYPTION_KEY",
    label: "FINTRK_ENCRYPTION_KEY",
    group: "Encryption",
  },
  { key: "GOOGLE_API_KEY", label: "GOOGLE_API_KEY", group: "Google AI" },
  { key: "CRON_SECRET", label: "CRON_SECRET", group: "Crons" },
  { key: "USER_APP_URL", label: "USER_APP_URL", group: "Crons" },
  { key: "ADMIN_EMAILS", label: "ADMIN_EMAILS", group: "Admin" },
  { key: "VERCEL_API_TOKEN", label: "VERCEL_API_TOKEN", group: "Vercel" },
];

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });

  try {
    const secrets = SECRET_CHECKS.map(({ key, label, group }) => {
      const raw = process.env[key];
      const present = Boolean(raw && String(raw).trim());
      return {
        key,
        label,
        group,
        present,
        lengthHint: present ? String(raw).trim().length : 0,
      };
    });

    return NextResponse.json(
      { secrets },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[security/secrets] GET failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
