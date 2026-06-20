import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { billingEnforced, hasProAccess } from "@/lib/plan";

const EXEMPT_PREFIXES = ["/dashboard/upgrade", "/dashboard/contact", "/dashboard/faq"];

/**
 * Server-side trial wall when the Clerk session claim is not configured yet.
 * Middleware skips gating until plan claims exist on the session token; this
 * reads live publicMetadata so new subscribers are not blocked after checkout.
 */
export async function DashboardProGate() {
  if (!billingEnforced()) return null;

  const h = await headers();
  const path = h.get("x-fintrk-path") ?? "";
  if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return null;

  if (!(await hasProAccess())) {
    redirect("/dashboard/upgrade");
  }

  return null;
}
