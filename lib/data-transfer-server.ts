import "server-only";

import { asc, eq, inArray, sql } from "drizzle-orm";

import { db, resilientQuery } from "@/lib/db";
import {
  accounts,
  merchants,
  merchantLabelRules,
  merchantWarningRules,
  transactionIgnores,
  transactions,
  userCategories,
  users,
} from "@/lib/db/schema";
import { df, ef } from "@/lib/crypto/encryption";
import { ensureUserCategories } from "@/lib/ensure-user-categories";
import { wipeLedgerForReplace } from "@/lib/wipe-user-data";
import { buildDedupeSignature } from "@/lib/txn-dedupe";
import {
  FINTRK_DATA_EXPORT_FORMAT,
  FINTRK_DATA_EXPORT_VERSION,
  type FintrkDataExport,
  type FintrkExportCategory,
  type FintrkExportTransaction,
  type FintrkImportMode,
  isFintrkDataExport,
  sanitizeExportUserLabel,
} from "@/lib/data-transfer";

const TXN_PAGE = 2_000;
const INSERT_BATCH = 200;

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  try {
    return d.toISOString();
  } catch {
    return null;
  }
}

function dateOnly(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export async function buildUserDataExport(
  userId: string,
  exportUserLabel: string,
): Promise<FintrkDataExport> {
  const [accountRows, categoryRows, userRows, warnRows, labelRows, ignoreRows] =
    await Promise.all([
      resilientQuery(() =>
        db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(asc(accounts.createdAt)),
      ),
      resilientQuery(() =>
        db
          .select()
          .from(userCategories)
          .where(eq(userCategories.userId, userId))
          .orderBy(asc(userCategories.sortOrder), asc(userCategories.id)),
      ),
      resilientQuery(() =>
        db
          .select({ detectTravel: users.detectTravel })
          .from(users)
          .where(eq(users.clerkUserId, userId))
          .limit(1),
      ),
      resilientQuery(() =>
        db
          .select({ merchantName: merchantWarningRules.merchantName })
          .from(merchantWarningRules)
          .where(eq(merchantWarningRules.userId, userId)),
      ),
      resilientQuery(() =>
        db
          .select({
            merchantName: merchantLabelRules.merchantName,
            label: merchantLabelRules.label,
          })
          .from(merchantLabelRules)
          .where(eq(merchantLabelRules.userId, userId)),
      ),
      resilientQuery(() =>
        db.select().from(transactionIgnores).where(eq(transactionIgnores.userId, userId)),
      ),
    ]);

  const catById = new Map(categoryRows.map((c) => [c.id, c]));

  const exportCategories: FintrkExportCategory[] = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    parentSlug: c.parentId != null ? (catById.get(c.parentId)?.slug ?? null) : null,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sortOrder,
    subcategoryType: c.subcategoryType,
    flowType: c.flowType,
    systemCategoryId: c.systemCategoryId,
  }));

  const exportAccounts = accountRows.map((a) => ({
    id: a.id,
    institutionName: df(a.institutionName),
    accountName: df(a.accountName) ?? a.accountName,
    accountType: a.accountType,
    cardNetwork: a.cardNetwork,
    maskedNumber: a.maskedNumber,
    primaryCurrency: a.primaryCurrency,
    countryIso: a.countryIso,
    isActive: a.isActive,
  }));

  const exportTransactions: FintrkExportTransaction[] = [];
  let offset = 0;
  for (;;) {
    const page = await resilientQuery(() =>
      db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, userId))
        .orderBy(asc(transactions.postedDate), asc(transactions.id))
        .limit(TXN_PAGE)
        .offset(offset),
    );
    if (page.length === 0) break;

    for (const t of page) {
      const postedDate = dateOnly(t.postedDate);
      const rawDescription = t.rawDescription;
      const baseAmount = String(t.baseAmount);
      const dedupeSignature =
        t.dedupeSignature?.trim() ||
        buildDedupeSignature(postedDate, baseAmount, rawDescription);
      const catSlug =
        t.categoryId != null ? (catById.get(t.categoryId)?.slug ?? null) : null;

      exportTransactions.push({
        id: t.id,
        accountId: t.accountId,
        postedDate,
        rawDescription,
        dedupeSignature,
        occurrenceIndex: t.occurrenceIndex ?? 0,
        referenceId: t.referenceId,
        merchantName: t.merchantName,
        categorySlug: catSlug,
        categoryConfidence: t.categoryConfidence != null ? String(t.categoryConfidence) : null,
        baseAmount,
        baseCurrency: t.baseCurrency,
        foreignAmount: t.foreignAmount != null ? String(t.foreignAmount) : null,
        foreignCurrency: t.foreignCurrency,
        implicitFxRate: t.implicitFxRate != null ? String(t.implicitFxRate) : null,
        implicitFxSpreadBps:
          t.implicitFxSpreadBps != null ? String(t.implicitFxSpreadBps) : null,
        countryIso: t.countryIso,
        isRecurring: t.isRecurring,
        warningFlag: t.warningFlag,
        aiConfidence: t.aiConfidence != null ? String(t.aiConfidence) : null,
        balanceAfter: t.balanceAfter != null ? String(t.balanceAfter) : null,
        note: df(t.note),
        label: t.label,
        createdAt: iso(t.createdAt),
        updatedAt: iso(t.updatedAt),
      });
    }

    offset += page.length;
    if (page.length < TXN_PAGE) break;
  }

  // Guard: page walk must match live COUNT(*) so we never ship a partial dump.
  const [{ count: liveCount }] = await resilientQuery(() =>
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.userId, userId)),
  );
  if (Number(liveCount) !== exportTransactions.length) {
    throw new Error(
      `Export incomplete: expected ${liveCount} transactions, got ${exportTransactions.length}. Retry.`,
    );
  }

  return {
    format: FINTRK_DATA_EXPORT_FORMAT,
    version: FINTRK_DATA_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    exportUserLabel: sanitizeExportUserLabel(exportUserLabel),
    counts: {
      accounts: exportAccounts.length,
      categories: exportCategories.length,
      transactions: exportTransactions.length,
      transactionIgnores: ignoreRows.length,
      merchantWarningRules: warnRows.length,
      merchantLabelRules: labelRows.length,
    },
    settings: {
      detectTravel: userRows[0]?.detectTravel === "No" ? "No" : "Yes",
    },
    accounts: exportAccounts,
    categories: exportCategories,
    transactions: exportTransactions,
    transactionIgnores: ignoreRows.map((r) => ({
      scope: r.scope,
      transactionId: r.transactionId,
      nameKey: r.nameKey,
      displayName: r.displayName,
    })),
    merchantWarningRules: warnRows.map((r) => ({ merchantName: r.merchantName })),
    merchantLabelRules: labelRows.map((r) => ({
      merchantName: r.merchantName,
      label: r.label,
    })),
  };
}

export type ImportResult = {
  mode: FintrkImportMode;
  accountsCreated: number;
  accountsReused: number;
  categoriesCreated: number;
  categoriesReused: number;
  transactionsImported: number;
  transactionsSkipped: number;
  ignoresImported: number;
  warningRulesImported: number;
  labelRulesImported: number;
};

/**
 * Reuse key for import account matching. Only masked accounts can safely merge:
 * Postgres UNIQUE treats NULL masks as distinct, so collapsing empty masks onto
 * one live account would merge unrelated banks/cards.
 */
function accountReuseKey(a: {
  accountType: string;
  maskedNumber: string | null;
  primaryCurrency: string;
}): string | null {
  const masked = a.maskedNumber?.trim();
  if (!masked) return null;
  return `${a.accountType}|${masked}|${a.primaryCurrency}`;
}

export async function importUserDataExport(
  userId: string,
  payload: unknown,
  mode: FintrkImportMode,
): Promise<ImportResult> {
  if (!isFintrkDataExport(payload)) {
    throw new Error("Invalid FinTRK export file.");
  }
  if (payload.version > FINTRK_DATA_EXPORT_VERSION) {
    throw new Error(
      `This export file uses a newer format (v${payload.version}). Update FinTRK and try again.`,
    );
  }

  if (mode === "replace") {
    // Only clear tables the export rebuilds. Full wipeUserData would destroy
    // net worth, budgets, goals, quick notes, and MCP tokens that are not exported.
    await wipeLedgerForReplace(userId);
  }

  await ensureUserCategories(userId);

  const result: ImportResult = {
    mode,
    accountsCreated: 0,
    accountsReused: 0,
    categoriesCreated: 0,
    categoriesReused: 0,
    transactionsImported: 0,
    transactionsSkipped: 0,
    ignoresImported: 0,
    warningRulesImported: 0,
    labelRulesImported: 0,
  };

  // ── Accounts ──────────────────────────────────────────────────────────────
  const existingAccounts = await resilientQuery(() =>
    db.select().from(accounts).where(eq(accounts.userId, userId)),
  );
  const accountIdMap = new Map<string, string>(); // export id → live id
  const existingByKey = new Map<string, string>();
  for (const a of existingAccounts) {
    const key = accountReuseKey(a);
    if (key && !existingByKey.has(key)) existingByKey.set(key, a.id);
  }

  for (const a of payload.accounts) {
    const key = accountReuseKey(a);
    const reused = key ? existingByKey.get(key) : undefined;
    if (reused) {
      accountIdMap.set(a.id, reused);
      result.accountsReused++;
      continue;
    }
    const [created] = await resilientQuery(() =>
      db
        .insert(accounts)
        .values({
          userId,
          institutionName: ef(a.institutionName) ?? undefined,
          accountName: ef(a.accountName) ?? a.accountName,
          accountType: a.accountType as
            | "checking"
            | "savings"
            | "credit"
            | "investment"
            | "unknown",
          cardNetwork: a.cardNetwork ?? undefined,
          maskedNumber: (() => {
            const m = a.maskedNumber?.trim();
            // Empty string collides on UNIQUE(user, type, mask, currency); NULL does not.
            return m ? m : undefined;
          })(),
          primaryCurrency: a.primaryCurrency,
          countryIso: a.countryIso ?? undefined,
          isActive: a.isActive ?? true,
        })
        .returning({ id: accounts.id }),
    );
    accountIdMap.set(a.id, created.id);
    if (key) existingByKey.set(key, created.id);
    result.accountsCreated++;
  }

  // ── Categories (parents then children by slug) ────────────────────────────
  const existingCats = await resilientQuery(() =>
    db.select().from(userCategories).where(eq(userCategories.userId, userId)),
  );
  const catIdBySlug = new Map(existingCats.map((c) => [c.slug, c.id] as const));

  const sortedCats = [...payload.categories].sort((a, b) => {
    const ap = a.parentSlug ? 1 : 0;
    const bp = b.parentSlug ? 1 : 0;
    return ap - bp || a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug);
  });

  for (const c of sortedCats) {
    const existing = catIdBySlug.get(c.slug);
    if (existing) {
      result.categoriesReused++;
      continue;
    }
    const parentId = c.parentSlug ? (catIdBySlug.get(c.parentSlug) ?? null) : null;
    const [created] = await resilientQuery(() =>
      db
        .insert(userCategories)
        .values({
          userId,
          name: c.name,
          slug: c.slug,
          parentId: parentId ?? undefined,
          icon: c.icon ?? undefined,
          color: c.color ?? undefined,
          sortOrder: c.sortOrder ?? 0,
          subcategoryType: (c.subcategoryType as
            | "discretionary"
            | "semi-discretionary"
            | "non-discretionary"
            | null) ?? undefined,
          flowType: (["inflow", "outflow", "misc", "savings"].includes(c.flowType)
            ? c.flowType
            : "outflow") as "inflow" | "outflow" | "misc" | "savings",
          systemCategoryId: c.systemCategoryId ?? undefined,
        })
        .returning({ id: userCategories.id }),
    );
    catIdBySlug.set(c.slug, created.id);
    result.categoriesCreated++;
  }

  // ── Merchants ─────────────────────────────────────────────────────────────
  const merchantNames = [
    ...new Set(
      payload.transactions
        .map((t) => t.merchantName?.trim().toLowerCase())
        .filter((n): n is string => Boolean(n)),
    ),
  ];
  if (merchantNames.length > 0) {
    await resilientQuery(() =>
      db
        .insert(merchants)
        .values(merchantNames.map((canonicalName) => ({ canonicalName, transactionCount: 1 })))
        .onConflictDoNothing(),
    );
  }
  const merchantRows =
    merchantNames.length > 0
      ? await resilientQuery(() =>
          db
            .select({ id: merchants.id, canonicalName: merchants.canonicalName })
            .from(merchants)
            .where(inArray(merchants.canonicalName, merchantNames)),
        )
      : [];
  const merchantIdByName = new Map(
    merchantRows.map((m) => [m.canonicalName.toLowerCase(), m.id] as const),
  );

  // ── Transactions (every row) ──────────────────────────────────────────────
  const txnIdMap = new Map<string, string>(); // export id → live id (for ignores)
  const rows: {
    exportId: string;
    values: typeof transactions.$inferInsert;
  }[] = [];

  for (const t of payload.transactions) {
    const liveAccountId = accountIdMap.get(t.accountId);
    if (!liveAccountId) {
      result.transactionsSkipped++;
      continue;
    }
    const postedDate = String(t.postedDate).slice(0, 10);
    const rawDescription = String(t.rawDescription ?? "").trim();
    if (!rawDescription) {
      result.transactionsSkipped++;
      continue;
    }
    const baseAmount = String(t.baseAmount);
    const dedupeSignature =
      (t.dedupeSignature && t.dedupeSignature.trim()) ||
      buildDedupeSignature(postedDate, baseAmount, rawDescription);
    const occurrenceIndex =
      typeof t.occurrenceIndex === "number" && Number.isFinite(t.occurrenceIndex)
        ? Math.max(0, Math.floor(t.occurrenceIndex))
        : 0;
    const categoryId = t.categorySlug ? (catIdBySlug.get(t.categorySlug) ?? undefined) : undefined;
    const merchantKey = t.merchantName?.trim().toLowerCase() ?? "";
    const merchantId = merchantKey ? merchantIdByName.get(merchantKey) : undefined;

    rows.push({
      exportId: t.id,
      values: {
        userId,
        accountId: liveAccountId,
        statementId: undefined,
        postedDate,
        rawDescription,
        dedupeSignature,
        occurrenceIndex,
        referenceId: t.referenceId ?? undefined,
        merchantName: t.merchantName ?? undefined,
        merchantId: merchantId ?? undefined,
        categoryId,
        categoryConfidence: t.categoryConfidence ?? undefined,
        baseAmount,
        baseCurrency: t.baseCurrency,
        foreignAmount: t.foreignAmount ?? undefined,
        foreignCurrency: t.foreignCurrency ?? undefined,
        implicitFxRate: t.implicitFxRate ?? undefined,
        implicitFxSpreadBps: t.implicitFxSpreadBps ?? undefined,
        countryIso: t.countryIso ?? undefined,
        isRecurring: Boolean(t.isRecurring),
        warningFlag: Boolean(t.warningFlag),
        aiConfidence: t.aiConfidence ?? undefined,
        balanceAfter: t.balanceAfter ?? undefined,
        note: ef(t.note) ?? undefined,
        label: t.label ?? undefined,
      },
    });
  }

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const inserted = await resilientQuery(() =>
      db
        .insert(transactions)
        .values(batch.map((b) => b.values))
        .onConflictDoNothing({
          target: [
            transactions.accountId,
            transactions.dedupeSignature,
            transactions.occurrenceIndex,
          ],
        })
        .returning({
          id: transactions.id,
          accountId: transactions.accountId,
          dedupeSignature: transactions.dedupeSignature,
          occurrenceIndex: transactions.occurrenceIndex,
        }),
    );

    // Map export ids for rows that landed. Conflict skips don't return.
    const insertedKeys = new Set(
      inserted.map(
        (r) => `${r.accountId}|${r.dedupeSignature}|${r.occurrenceIndex}`,
      ),
    );
    for (const b of batch) {
      const key = `${b.values.accountId}|${b.values.dedupeSignature}|${b.values.occurrenceIndex}`;
      if (insertedKeys.has(key)) {
        const match = inserted.find(
          (r) =>
            r.accountId === b.values.accountId &&
            r.dedupeSignature === b.values.dedupeSignature &&
            r.occurrenceIndex === b.values.occurrenceIndex,
        );
        if (match) txnIdMap.set(b.exportId, match.id);
        result.transactionsImported++;
      } else {
        result.transactionsSkipped++;
      }
    }
  }

  // ── Ignores / merchant rules ──────────────────────────────────────────────
  for (const ig of payload.transactionIgnores ?? []) {
    try {
      if (ig.scope === "name" && ig.nameKey) {
        await resilientQuery(() =>
          db
            .insert(transactionIgnores)
            .values({
              userId,
              scope: "name",
              nameKey: ig.nameKey!,
              displayName: ig.displayName,
            })
            .onConflictDoNothing(),
        );
        result.ignoresImported++;
      } else if (ig.scope === "item" && ig.transactionId) {
        const liveTxnId = txnIdMap.get(ig.transactionId);
        if (!liveTxnId) continue;
        await resilientQuery(() =>
          db
            .insert(transactionIgnores)
            .values({
              userId,
              scope: "item",
              transactionId: liveTxnId,
              displayName: ig.displayName,
            })
            .onConflictDoNothing(),
        );
        result.ignoresImported++;
      }
    } catch {
      /* skip bad ignore rows */
    }
  }

  for (const w of payload.merchantWarningRules ?? []) {
    if (!w.merchantName?.trim()) continue;
    await resilientQuery(() =>
      db
        .insert(merchantWarningRules)
        .values({ userId, merchantName: w.merchantName.trim() })
        .onConflictDoNothing(),
    );
    result.warningRulesImported++;
  }

  for (const l of payload.merchantLabelRules ?? []) {
    if (!l.merchantName?.trim() || !l.label?.trim()) continue;
    await resilientQuery(() =>
      db
        .insert(merchantLabelRules)
        .values({
          userId,
          merchantName: l.merchantName.trim(),
          label: l.label.trim().slice(0, 20),
        })
        .onConflictDoNothing(),
    );
    result.labelRulesImported++;
  }

  // Settings
  if (payload.settings?.detectTravel === "Yes" || payload.settings?.detectTravel === "No") {
    await resilientQuery(() =>
      db
        .insert(users)
        .values({
          clerkUserId: userId,
          detectTravel: payload.settings.detectTravel,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: { detectTravel: payload.settings.detectTravel, updatedAt: new Date() },
        }),
    );
  }

  return result;
}
