import "server-only";

import { eq } from "drizzle-orm";

import { db, rawSql, resilientQuery } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { df } from "@/lib/crypto/encryption";

export type WipeCounts = Record<string, number>;

type SqlStep = { label: string; query: string; params: unknown[] };

/** user_id-scoped tables (Clerk id). Children first for FK safety. */
const USER_ID_TABLES = [
  "transactions",
  "transaction_ignores",
  "double_charge_watchlist_exclusions",
  "merchant_warning_rules",
  "merchant_label_rules",
  "statements",
  "file_upload_log",
  "recurring_patterns",
  "ai_insights",
  "ai_costs",
  "budgets",
  "goals",
  "net_worth_items",
  "user_quick_notes",
] as const;

const CLERK_ID_TABLES = ["mcp_tokens", "mcp_auth_codes"] as const;

/** Wiped only on full account delete (Clerk webhook), not on reset-data. */
const ACCOUNT_DELETE_CLERK_ID_TABLES = ["error_logs", "mcp_access_log"] as const;

const SUBMISSION_TABLES = ["feedback_submissions", "contact_submissions"] as const;

async function tablesThatExist(names: string[]): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  try {
    const rows = (await rawSql.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name = ANY($1::text[])`,
      [names],
    )) as { table_name: string }[];
    return new Set(rows.map((r) => r.table_name));
  } catch {
    return new Set();
  }
}

function buildWipeSteps(
  clerkUserId: string,
  ownerEmail: string | null,
  knownTables: Set<string>,
  options: { deleteUserRow?: boolean; deleteSubmissions?: boolean },
): SqlStep[] {
  const steps: SqlStep[] = [];

  if (knownTables.has("merchants") && knownTables.has("user_categories")) {
    steps.push({
      label: "merchantsCategoryNull",
      query: `UPDATE merchants SET category_id = NULL
              WHERE category_id IN (SELECT id FROM user_categories WHERE user_id = $1)`,
      params: [clerkUserId],
    });
  }

  // Drop category_rules that reference this user's categories (including null
  // user_id / global rules) so user_categories DELETE cannot FK-fail.
  if (knownTables.has("category_rules") && knownTables.has("user_categories")) {
    steps.push({
      label: "categoryRules",
      query: `DELETE FROM category_rules
              WHERE category_id IN (SELECT id FROM user_categories WHERE user_id = $1)
              RETURNING id`,
      params: [clerkUserId],
    });
  }

  for (const table of USER_ID_TABLES) {
    if (!knownTables.has(table)) continue;
    const camel = table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    steps.push({
      label: camel,
      query: `DELETE FROM "${table}" WHERE user_id = $1 RETURNING 1`,
      params: [clerkUserId],
    });
  }

  if (knownTables.has("net_worth_settings")) {
    steps.push({
      label: "netWorthSettings",
      query: `DELETE FROM net_worth_settings WHERE user_id = $1 RETURNING user_id`,
      params: [clerkUserId],
    });
  }

  // Remaining user-scoped rules (orphan category_id / data skew).
  if (knownTables.has("category_rules")) {
    steps.push({
      label: "categoryRulesByUser",
      query: `DELETE FROM category_rules WHERE user_id = $1 RETURNING id`,
      params: [clerkUserId],
    });
  }

  if (knownTables.has("user_categories")) {
    steps.push({
      label: "userCategories",
      query: `DELETE FROM user_categories WHERE user_id = $1 RETURNING id`,
      params: [clerkUserId],
    });
  }

  if (knownTables.has("accounts")) {
    steps.push({
      label: "accounts",
      query: `DELETE FROM accounts WHERE user_id = $1 RETURNING id`,
      params: [clerkUserId],
    });
  }

  for (const table of CLERK_ID_TABLES) {
    if (!knownTables.has(table)) continue;
    const camel = table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    steps.push({
      label: camel,
      query: `DELETE FROM "${table}" WHERE clerk_user_id = $1 RETURNING 1`,
      params: [clerkUserId],
    });
  }

  // Account deletion must clear error_logs + mcp_access_log (path/IP/UA PII).
  // Reset-data keeps the account, so leave ops logs for debugging.
  if (options.deleteUserRow) {
    for (const table of ACCOUNT_DELETE_CLERK_ID_TABLES) {
      if (!knownTables.has(table)) continue;
      const camel = table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      steps.push({
        label: camel,
        query: `DELETE FROM "${table}" WHERE clerk_user_id = $1 RETURNING 1`,
        params: [clerkUserId],
      });
    }
  }

  if (options.deleteSubmissions) {
    for (const table of SUBMISSION_TABLES) {
      if (!knownTables.has(table)) continue;
      const camel = table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      steps.push({
        label: camel,
        query: `DELETE FROM "${table}" WHERE clerk_user_id = $1 RETURNING id`,
        params: [clerkUserId],
      });
    }

    if (ownerEmail) {
      for (const table of SUBMISSION_TABLES) {
        if (!knownTables.has(table)) continue;
        const camel = table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        steps.push({
          label: `${camel}ByEmail`,
          query: `DELETE FROM "${table}"
                  WHERE lower(trim(email)) = $1
                  RETURNING id`,
          params: [ownerEmail],
        });
      }
    }
  }

  if (options.deleteUserRow && knownTables.has("users")) {
    steps.push({
      label: "users",
      query: `DELETE FROM users WHERE clerk_user_id = $1 RETURNING id`,
      params: [clerkUserId],
    });
  }

  return steps;
}

/**
 * Tables cleared for data-import `replace` mode. Must match what export/import
 * rebuilds (accounts, categories, ledger, merchant rules). Intentionally omits
 * net worth, budgets, goals, quick notes, MCP tokens, recurring, AI insights.
 * Statements are dropped because they FK accounts and are not in the export.
 * Double-charge exclusions are cleared too (not in export; stale keys would
 * suppress watchlist hits against the rebuilt ledger).
 */
const REPLACE_LEDGER_TABLES = [
  "transactions",
  "transaction_ignores",
  "double_charge_watchlist_exclusions",
  "merchant_warning_rules",
  "merchant_label_rules",
  "statements",
  "file_upload_log",
] as const;

/**
 * Narrow wipe for replace-import: only ledger tables the export restores.
 * Atomic via Neon HTTP transaction. Does not touch net worth / MCP / notes.
 */
export async function wipeLedgerForReplace(clerkUserId: string): Promise<WipeCounts> {
  const counts: WipeCounts = {};
  const candidateTables = [
    ...REPLACE_LEDGER_TABLES,
    "merchants",
    "category_rules",
    "user_categories",
    "accounts",
  ];
  const knownTables = await tablesThatExist(candidateTables);
  const steps: SqlStep[] = [];

  if (knownTables.has("merchants") && knownTables.has("user_categories")) {
    steps.push({
      label: "merchantsCategoryNull",
      query: `UPDATE merchants SET category_id = NULL
              WHERE category_id IN (SELECT id FROM user_categories WHERE user_id = $1)`,
      params: [clerkUserId],
    });
  }

  // Budgets / recurring are intentionally preserved on replace, but they FK
  // user_categories and accounts. Detach before deleting those ledger rows.
  if (knownTables.has("budgets") && knownTables.has("user_categories")) {
    steps.push({
      label: "budgetsCategoryNull",
      query: `UPDATE budgets SET category_id = NULL, updated_at = NOW()
              WHERE user_id = $1
                AND category_id IN (SELECT id FROM user_categories WHERE user_id = $1)`,
      params: [clerkUserId],
    });
  }
  if (knownTables.has("budgets") && knownTables.has("accounts")) {
    steps.push({
      label: "budgetsAccountNull",
      query: `UPDATE budgets SET account_id = NULL, updated_at = NOW()
              WHERE user_id = $1
                AND account_id IN (SELECT id FROM accounts WHERE user_id = $1)`,
      params: [clerkUserId],
    });
  }
  if (knownTables.has("recurring_patterns") && knownTables.has("user_categories")) {
    steps.push({
      label: "recurringCategoryNull",
      query: `UPDATE recurring_patterns SET category_id = NULL, updated_at = NOW()
              WHERE user_id = $1
                AND category_id IN (SELECT id FROM user_categories WHERE user_id = $1)`,
      params: [clerkUserId],
    });
  }

  if (knownTables.has("category_rules") && knownTables.has("user_categories")) {
    steps.push({
      label: "categoryRules",
      query: `DELETE FROM category_rules
              WHERE category_id IN (SELECT id FROM user_categories WHERE user_id = $1)
              RETURNING id`,
      params: [clerkUserId],
    });
  }

  for (const table of REPLACE_LEDGER_TABLES) {
    if (!knownTables.has(table)) continue;
    const camel = table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    steps.push({
      label: camel,
      query: `DELETE FROM "${table}" WHERE user_id = $1 RETURNING 1`,
      params: [clerkUserId],
    });
  }

  if (knownTables.has("category_rules")) {
    steps.push({
      label: "categoryRulesByUser",
      query: `DELETE FROM category_rules WHERE user_id = $1 RETURNING id`,
      params: [clerkUserId],
    });
  }

  if (knownTables.has("user_categories")) {
    steps.push({
      label: "userCategories",
      query: `DELETE FROM user_categories WHERE user_id = $1 RETURNING id`,
      params: [clerkUserId],
    });
  }

  if (knownTables.has("accounts")) {
    steps.push({
      label: "accounts",
      query: `DELETE FROM accounts WHERE user_id = $1 RETURNING id`,
      params: [clerkUserId],
    });
  }

  if (steps.length === 0) return counts;

  const results = (await rawSql.transaction((txn) =>
    steps.map((s) => txn.query(s.query, s.params)),
  )) as unknown[][];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const rows = results[i];
    const n = Array.isArray(rows) ? rows.length : 0;
    if (
      step.label === "merchantsCategoryNull" ||
      step.label === "budgetsCategoryNull" ||
      step.label === "budgetsAccountNull" ||
      step.label === "recurringCategoryNull"
    ) {
      continue;
    }
    if (step.label === "categoryRulesByUser") {
      counts.categoryRules = (counts.categoryRules ?? 0) + n;
      continue;
    }
    counts[step.label] = (counts[step.label] ?? 0) + n;
  }

  return counts;
}

/**
 * Deletes all user-scoped financial / MCP data for a Clerk user id.
 * Neon HTTP `rawSql.transaction` makes deletes atomic (all-or-nothing).
 * Does not delete the `users` row unless `deleteUserRow` is true
 * (account deletion webhook).
 */
export async function wipeUserData(
  clerkUserId: string,
  options: { deleteUserRow?: boolean; deleteSubmissions?: boolean } = {},
): Promise<WipeCounts> {
  const counts: WipeCounts = {};

  let ownerEmail: string | null = null;
  if (options.deleteSubmissions) {
    try {
      const [row] = await resilientQuery(() =>
        db
          .select({ primaryEmail: users.primaryEmail })
          .from(users)
          .where(eq(users.clerkUserId, clerkUserId))
          .limit(1),
      );
      const plain = df(row?.primaryEmail ?? null);
      if (plain && plain.includes("@")) {
        ownerEmail = plain.trim().toLowerCase();
      }
    } catch {
      /* continue with id-only purge */
    }
  }

  const candidateTables = [
    ...USER_ID_TABLES,
    ...CLERK_ID_TABLES,
    ...ACCOUNT_DELETE_CLERK_ID_TABLES,
    ...SUBMISSION_TABLES,
    "merchants",
    "category_rules",
    "net_worth_settings",
    "user_categories",
    "accounts",
    "users",
  ];
  const knownTables = await tablesThatExist(candidateTables);
  const steps = buildWipeSteps(clerkUserId, ownerEmail, knownTables, options);

  if (steps.length === 0) return counts;

  const results = (await rawSql.transaction((txn) =>
    steps.map((s) => txn.query(s.query, s.params)),
  )) as unknown[][];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const rows = results[i];
    const n = Array.isArray(rows) ? rows.length : 0;

    if (step.label === "merchantsCategoryNull") {
      // UPDATE without RETURNING; count not material for callers.
      continue;
    }
    if (step.label === "categoryRulesByUser") {
      counts.categoryRules = (counts.categoryRules ?? 0) + n;
      continue;
    }
    if (step.label.endsWith("ByEmail")) {
      const base = step.label.replace(/ByEmail$/, "");
      counts[base] = (counts[base] ?? 0) + n;
      continue;
    }
    counts[step.label] = (counts[step.label] ?? 0) + n;
  }

  return counts;
}
