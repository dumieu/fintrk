/**
 * Tables that expose the Admin "By user email" filter.
 * FinTRK scopes most domain tables by `user_id` (Clerk user id).
 * The `users` table is keyed by `clerk_user_id` with `primary_email`.
 */
export const USER_EMAIL_FILTER_TABLES = [
  "users",
  "transactions",
  "statements",
  "accounts",
  "ai_costs",
  "ai_insights",
  "recurring_patterns",
  "budgets",
  "goals",
  "user_categories",
  "file_upload_log",
  "net_worth_items",
  "net_worth_settings",
  "category_rules",
  "merchant_warning_rules",
  "merchant_label_rules",
  "transaction_ignores",
  "double_charge_watchlist_exclusions",
] as const;

export type UserEmailFilterTable = (typeof USER_EMAIL_FILTER_TABLES)[number];

export const userEmailFilterTableSet = new Set<string>(USER_EMAIL_FILTER_TABLES);

/** Tables keyed by clerk_user_id (email from users.primary_email or own primary_email). */
export const CLERK_USER_ID_EMAIL_TABLES = new Set<string>(["users"]);

/** Filter column used by the "By user email" dropdown. */
export function emailFilterColumnForTable(
  table: string,
): "clerk_user_id" | "user_id" | null {
  if (table === "users") return "clerk_user_id";
  if (userEmailFilterTableSet.has(table)) return "user_id";
  return null;
}

export function isUserEmailFilterTable(name: string): name is UserEmailFilterTable {
  return userEmailFilterTableSet.has(name);
}
