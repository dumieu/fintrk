import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export interface AdminGate {
  ok: true;
  userId: string;
  email: string;
}
export interface AdminDenied {
  ok: false;
  reason: "unauthenticated" | "not_admin";
}

/** Resolve the current request's admin status. Use in API routes. */
export async function requireAdmin(): Promise<AdminGate | AdminDenied> {
  const { userId } = await auth();
  if (!userId) return { ok: false, reason: "unauthenticated" };

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ??
    "";

  if (ADMIN_EMAILS.length === 0) {
    // Fail closed: never expose admin if the allow-list is empty in production.
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "not_admin" };
    }
    // Dev convenience: any signed-in Clerk user is admin when no list is set.
    return { ok: true, userId, email };
  }

  if (!email || !ADMIN_EMAILS.includes(email)) {
    return { ok: false, reason: "not_admin" };
  }
  return { ok: true, userId, email };
}

export const adminEmailsConfigured = ADMIN_EMAILS.length;
