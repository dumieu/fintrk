/**
 * Pure, runtime-agnostic plan interpretation (safe to import in edge middleware
 * and node server code alike - no server-only or node imports here).
 *
 * Entitlement is stored on the Clerk user and read in two places:
 *   - Edge middleware: from the session token claim (fast, no network).
 *   - Node server (layout, API, MCP): from `user.publicMetadata` directly.
 *
 * A user is "Pro" while their Stripe subscription is trialing, active, or in
 * the short past_due grace window. Canceled/unpaid/incomplete => not Pro.
 */

export const PRO_STATUSES = new Set(["trialing", "active", "past_due"]);

export interface PlanMetadata {
  plan?: string;
  planStatus?: string;
  planRenewsAt?: number;
}

/** Narrow an unknown metadata bag (Clerk publicMetadata / session claim) to plan fields. */
export function readPlanMetadata(meta: unknown): PlanMetadata {
  if (!meta || typeof meta !== "object") return {};
  const m = meta as Record<string, unknown>;
  return {
    plan: typeof m.plan === "string" ? m.plan : undefined,
    planStatus: typeof m.planStatus === "string" ? m.planStatus : undefined,
    planRenewsAt: typeof m.planRenewsAt === "number" ? m.planRenewsAt : undefined,
  };
}

export function isProMetadata(meta: unknown): boolean {
  const m = readPlanMetadata(meta);
  if (m.plan === "pro") return true;
  if (m.planStatus && PRO_STATUSES.has(m.planStatus)) return true;
  return false;
}

/** True only when the metadata bag actually carries plan info (claim is configured). */
export function hasPlanClaim(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  return "plan" in m || "planStatus" in m;
}

/** Session claim may be full metadata blob or individual plan fields. */
export function planFromSessionClaims(claims: unknown): PlanMetadata {
  if (!claims || typeof claims !== "object") return {};
  const c = claims as Record<string, unknown>;
  const nested = readPlanMetadata(c.metadata ?? c.publicMetadata);
  if (nested.plan || nested.planStatus) return nested;
  return readPlanMetadata(c);
}

export function isProFromSessionClaims(claims: unknown): boolean {
  return isProMetadata(planFromSessionClaims(claims));
}

/** True when the session carries plan info (claim is configured in Clerk). */
export function hasPlanSessionClaim(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const c = claims as Record<string, unknown>;
  if (hasPlanClaim(c.metadata) || hasPlanClaim(c.publicMetadata)) return true;
  return hasPlanClaim(c);
}
