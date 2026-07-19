import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
    process.env.CLERK_SECRET_KEY?.trim(),
);

export interface AdminGate {
  ok: true;
  userId: string;
  email: string;
}
export interface AdminDenied {
  ok: false;
  reason: "unauthenticated" | "not_admin";
}

/**
 * Resolve the current request's admin status.
 * Soft-skip (offline console) only when Clerk keys are missing AND not production.
 * Production without Clerk keys fails closed. With Clerk: ADMIN_EMAILS allow-list
 * (dev: any signed-in if empty; prod fail-closed when empty).
 */
export async function requireAdmin(): Promise<AdminGate | AdminDenied> {
  if (!clerkConfigured) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "unauthenticated" };
    }
    return { ok: true, userId: "offline-admin", email: "offline@fintrk.local" };
  }

  const { userId } = await auth();
  if (!userId) return { ok: false, reason: "unauthenticated" };

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ??
    "";

  if (ADMIN_EMAILS.length === 0) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "not_admin" };
    }
    return { ok: true, userId, email };
  }

  if (!email || !ADMIN_EMAILS.includes(email)) {
    return { ok: false, reason: "not_admin" };
  }
  return { ok: true, userId, email };
}

export const adminEmailsConfigured = ADMIN_EMAILS.length;
export const isClerkConfigured = clerkConfigured;
