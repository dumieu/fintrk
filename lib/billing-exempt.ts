/**
 * Hard-coded billing bypass for exactly one FinTRK operator account.
 * Resolved from Clerk: dumieu@gmail.com -> user_3ByRytaG0lqkggny8spfV8yCpXF
 *
 * NEVER widen: no env vars, no lists, no domain wildcards, no role checks.
 */

export const BILLING_EXEMPT_USER_ID = "user_3ByRytaG0lqkggny8spfV8yCpXF" as const;
export const BILLING_EXEMPT_EMAIL = "dumieu@gmail.com" as const;

/** Edge-safe gate: Clerk user ids are unforgeable and identify one account. */
export function isBillingExemptUserId(
  userId: string | null | undefined,
): userId is typeof BILLING_EXEMPT_USER_ID {
  return userId === BILLING_EXEMPT_USER_ID;
}

/**
 * Strict server gate: BOTH the Clerk user id and primary email must match.
 * Fails closed if email is missing or different (including email changes).
 */
export function isBillingExemptAccount(
  userId: string | null | undefined,
  primaryEmail: string | null | undefined,
): boolean {
  if (!isBillingExemptUserId(userId)) return false;
  if (!primaryEmail) return false;
  return primaryEmail.trim().toLowerCase() === BILLING_EXEMPT_EMAIL;
}
