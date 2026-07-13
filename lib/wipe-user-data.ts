import "server-only";

import { eq, inArray } from "drizzle-orm";

import { db, resilientQuery } from "@/lib/db";
import {
  transactions,
  statements,
  fileUploadLog,
  accounts,
  recurringPatterns,
  categoryRules,
  aiInsights,
  aiCosts,
  budgets,
  goals,
  userCategories,
  merchants,
  merchantWarningRules,
  merchantLabelRules,
  transactionIgnores,
  doubleChargeWatchlistExclusions,
  netWorthItems,
  netWorthSettings,
  mcpTokensTable,
  mcpAuthCodesTable,
  users,
  feedbackSubmissions,
  contactSubmissions,
  userQuickNotes,
} from "@/lib/db/schema";

export type WipeCounts = Record<string, number>;

/**
 * Deletes all user-scoped financial / MCP data for a Clerk user id.
 * Order respects FK constraints. Does not delete the `users` row unless
 * `deleteUserRow` is true (account deletion webhook).
 */
export async function wipeUserData(
  clerkUserId: string,
  options: { deleteUserRow?: boolean; deleteSubmissions?: boolean } = {},
): Promise<WipeCounts> {
  const counts: WipeCounts = {};

  const del = async (label: string, table: Parameters<typeof db.delete>[0]) => {
    const t = table as typeof transactions;
    const rows = await resilientQuery(() =>
      db.delete(t).where(eq(t.userId, clerkUserId)).returning({ id: t.id }),
    );
    counts[label] = rows.length;
  };

  await del("transactions", transactions);
  await del("transactionIgnores", transactionIgnores);
  await del("doubleChargeWatchlistExclusions", doubleChargeWatchlistExclusions);
  await del("merchantWarningRules", merchantWarningRules);
  await del("merchantLabelRules", merchantLabelRules);
  await del("statements", statements);
  await del("fileUploadLog", fileUploadLog);
  await del("recurringPatterns", recurringPatterns);
  await del("aiInsights", aiInsights);
  await del("aiCosts", aiCosts);
  await del("budgets", budgets);
  await del("goals", goals);
  await del("netWorthItems", netWorthItems);
  await del("userQuickNotes", userQuickNotes);

  const nwSettings = await resilientQuery(() =>
    db
      .delete(netWorthSettings)
      .where(eq(netWorthSettings.userId, clerkUserId))
      .returning({ userId: netWorthSettings.userId }),
  );
  counts.netWorthSettings = nwSettings.length;

  const mcpTokens = await resilientQuery(() =>
    db
      .delete(mcpTokensTable)
      .where(eq(mcpTokensTable.clerkUserId, clerkUserId))
      .returning({ id: mcpTokensTable.id_token }),
  );
  counts.mcpTokens = mcpTokens.length;

  const mcpCodes = await resilientQuery(() =>
    db
      .delete(mcpAuthCodesTable)
      .where(eq(mcpAuthCodesTable.clerkUserId, clerkUserId))
      .returning({ id: mcpAuthCodesTable.id_code }),
  );
  counts.mcpAuthCodes = mcpCodes.length;

  const userCatIds = await resilientQuery(() =>
    db
      .select({ id: userCategories.id })
      .from(userCategories)
      .where(eq(userCategories.userId, clerkUserId)),
  );
  if (userCatIds.length > 0) {
    const ids = userCatIds.map((r) => r.id);
    // Drop rules that reference these categories (including null user_id /
    // global rows) so user_categories DELETE cannot FK-fail.
    const rulesByCat = await resilientQuery(() =>
      db
        .delete(categoryRules)
        .where(inArray(categoryRules.categoryId, ids))
        .returning({ id: categoryRules.id }),
    );
    counts.categoryRules = rulesByCat.length;
    await resilientQuery(() =>
      db.update(merchants).set({ categoryId: null }).where(inArray(merchants.categoryId, ids)),
    );
  }
  // Any remaining user-scoped rules (orphan category_id / data skew).
  const rulesByUser = await resilientQuery(() =>
    db
      .delete(categoryRules)
      .where(eq(categoryRules.userId, clerkUserId))
      .returning({ id: categoryRules.id }),
  );
  counts.categoryRules = (counts.categoryRules ?? 0) + rulesByUser.length;

  await del("userCategories", userCategories);
  await del("accounts", accounts);

  if (options.deleteSubmissions) {
    const feedback = await resilientQuery(() =>
      db
        .delete(feedbackSubmissions)
        .where(eq(feedbackSubmissions.clerkUserId, clerkUserId))
        .returning({ id: feedbackSubmissions.id }),
    );
    counts.feedbackSubmissions = feedback.length;

    const contact = await resilientQuery(() =>
      db
        .delete(contactSubmissions)
        .where(eq(contactSubmissions.clerkUserId, clerkUserId))
        .returning({ id: contactSubmissions.id }),
    );
    counts.contactSubmissions = contact.length;
  }

  if (options.deleteUserRow) {
    const userRows = await resilientQuery(() =>
      db.delete(users).where(eq(users.clerkUserId, clerkUserId)).returning({ id: users.id }),
    );
    counts.users = userRows.length;
  }

  return counts;
}
