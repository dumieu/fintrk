import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  serial,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const accountTypeEnum = pgEnum("account_type", [
  "checking",
  "savings",
  "credit",
  "investment",
  "loan",
  "unknown",
]);

export const statementStatusEnum = pgEnum("statement_status", [
  "uploaded",
  "processing",
  "completed",
  "failed",
]);

export const subcategoryTypeEnum = pgEnum("subcategory_type", [
  "discretionary",
  "semi-discretionary",
  "non-discretionary",
]);

// ─── Accounts ────────────────────────────────────────────────────────────────

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    institutionName: varchar("institution_name", { length: 255 }),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    accountType: accountTypeEnum("account_type").default("unknown").notNull(),
    cardNetwork: varchar("card_network", { length: 20 }),
    maskedNumber: varchar("masked_number", { length: 20 }),
    primaryCurrency: varchar("primary_currency", { length: 3 }).notNull(),
    countryIso: varchar("country_iso", { length: 2 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_user_type_mask_currency_idx")
      .on(t.userId, t.accountType, t.maskedNumber, t.primaryCurrency),
  ],
);

// ─── Statements (uploaded files) ─────────────────────────────────────────────

export const statements = pgTable(
  "statements",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    accountId: uuid("account_id").references(() => accounts.id),
    fileName: varchar("file_name", { length: 512 }).notNull(),
    fileSize: integer("file_size").notNull(),
    fileMimeType: varchar("file_mime_type", { length: 128 }).notNull(),
    fileHash: varchar("file_hash", { length: 128 }),
    fileData: text("file_data"),
    status: statementStatusEnum("status").default("uploaded").notNull(),
    aiModel: varchar("ai_model", { length: 128 }),
    aiProcessedAt: timestamp("ai_processed_at", { withTimezone: true }),
    aiError: text("ai_error"),
    transactionsImported: integer("transactions_imported").default(0),
    transactionsDuplicate: integer("transactions_duplicate").default(0),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("statements_user_id_idx").on(t.userId),
    index("statements_file_hash_idx").on(t.userId, t.fileHash),
  ],
);

// ─── System Categories (admin-only template — the "original" hierarchy) ──────

export const systemCategories = pgTable("system_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  parentId: integer("parent_id"),
  icon: varchar("icon", { length: 64 }),
  color: varchar("color", { length: 7 }),
  sortOrder: integer("sort_order").default(0).notNull(),
  subcategoryType: subcategoryTypeEnum("subcategory_type"),
});

// ─── User Categories (per-user clone that can evolve independently) ──────────

export const userCategories = pgTable(
  "user_categories",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    parentId: integer("parent_id"),
    icon: varchar("icon", { length: 64 }),
    color: varchar("color", { length: 7 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    subcategoryType: subcategoryTypeEnum("subcategory_type"),
    systemCategoryId: integer("system_category_id").references(() => systemCategories.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("user_categories_user_idx").on(t.userId),
    uniqueIndex("user_categories_user_slug_idx").on(t.userId, t.slug),
  ],
);

/** @deprecated alias kept temporarily — all new code should use userCategories */
export const categories = userCategories;

// ─── Merchants (deduplicated registry) ───────────────────────────────────────

export const merchants = pgTable(
  "merchants",
  {
    id: serial("id").primaryKey(),
    canonicalName: varchar("canonical_name", { length: 255 }).notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    mccCode: integer("mcc_code"),
    countryIso: varchar("country_iso", { length: 2 }),
    logoUrl: text("logo_url"),
    transactionCount: integer("transaction_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("merchants_name_idx").on(t.canonicalName)],
);

// ─── Transactions (the core financial ledger) ────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    statementId: integer("statement_id").references(() => statements.id),
    postedDate: date("posted_date").notNull(),
    valueDate: date("value_date"),
    rawDescription: text("raw_description").notNull(),
    referenceId: varchar("reference_id", { length: 128 }),
    merchantId: integer("merchant_id").references(() => merchants.id),
    merchantName: varchar("merchant_name", { length: 255 }),
    mccCode: integer("mcc_code"),
    categoryId: integer("category_id").references(() => categories.id),
    categorySuggestion: varchar("category_suggestion", { length: 128 }),
    categoryConfidence: numeric("category_confidence", { precision: 3, scale: 2 }),
    baseAmount: numeric("base_amount", { precision: 15, scale: 4 }).notNull(),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    foreignAmount: numeric("foreign_amount", { precision: 15, scale: 4 }),
    foreignCurrency: varchar("foreign_currency", { length: 3 }),
    implicitFxRate: numeric("implicit_fx_rate", { precision: 12, scale: 6 }),
    implicitFxSpreadBps: numeric("implicit_fx_spread_bps", { precision: 8, scale: 2 }),
    countryIso: varchar("country_iso", { length: 2 }),
    isRecurring: boolean("is_recurring").default(false).notNull(),
    aiConfidence: numeric("ai_confidence", { precision: 3, scale: 2 }),
    balanceAfter: numeric("balance_after", { precision: 15, scale: 4 }),
    note: text("note"),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("txn_user_id_idx").on(t.userId),
    index("txn_account_date_idx").on(t.accountId, t.postedDate),
    index("txn_user_category_idx").on(t.userId, t.categoryId),
    index("txn_user_date_idx").on(t.userId, t.postedDate),
    uniqueIndex("txn_dedup_idx").on(
      t.accountId,
      t.postedDate,
      t.baseAmount,
      t.rawDescription,
    ),
  ],
);

// ─── Category Rules (AI-learned + user-defined merchant → category mapping) ──

export const categoryRules = pgTable(
  "category_rules",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }),
    merchantPattern: varchar("merchant_pattern", { length: 255 }).notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).default("1.00"),
    source: varchar("source", { length: 16 }).notNull().default("ai"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("cat_rules_user_idx").on(t.userId)],
);

// ─── Recurring Patterns ──────────────────────────────────────────────────────

export const recurringPatterns = pgTable(
  "recurring_patterns",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    merchantName: varchar("merchant_name", { length: 255 }).notNull(),
    merchantId: integer("merchant_id").references(() => merchants.id),
    categoryId: integer("category_id").references(() => categories.id),
    intervalDays: integer("interval_days").notNull(),
    intervalLabel: varchar("interval_label", { length: 32 }).notNull(),
    expectedAmount: numeric("expected_amount", { precision: 15, scale: 4 }).notNull(),
    amountVariance: numeric("amount_variance", { precision: 15, scale: 4 }),
    currency: varchar("currency", { length: 3 }).notNull(),
    nextExpectedDate: date("next_expected_date"),
    lastSeenDate: date("last_seen_date"),
    occurrenceCount: integer("occurrence_count").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("recurring_user_idx").on(t.userId),
    uniqueIndex("recurring_user_merchant_idx").on(
      t.userId,
      t.merchantName,
      t.intervalLabel,
    ),
  ],
);

// ─── FX Rates (cached market mid rates) ──────────────────────────────────────

export const fxRates = pgTable(
  "fx_rates",
  {
    id: serial("id").primaryKey(),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
    rateDate: date("rate_date").notNull(),
    midRate: numeric("mid_rate", { precision: 14, scale: 8 }).notNull(),
    source: varchar("source", { length: 64 }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("fx_rate_pair_date_idx").on(
      t.baseCurrency,
      t.quoteCurrency,
      t.rateDate,
    ),
  ],
);

// ─── Budgets ─────────────────────────────────────────────────────────────────

export const budgets = pgTable(
  "budgets",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    accountId: uuid("account_id").references(() => accounts.id),
    name: varchar("name", { length: 128 }).notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    period: varchar("period", { length: 16 }).notNull().default("monthly"),
    rollover: boolean("rollover").default(false).notNull(),
    alertThreshold: numeric("alert_threshold", { precision: 3, scale: 2 }).default("0.80"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("budgets_user_idx").on(t.userId)],
);

// ─── Goals ───────────────────────────────────────────────────────────────────

export const goals = pgTable(
  "goals",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    targetAmount: numeric("target_amount", { precision: 15, scale: 2 }).notNull(),
    currentAmount: numeric("current_amount", { precision: 15, scale: 2 })
      .default("0")
      .notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    targetDate: date("target_date"),
    linkedAccountIds: jsonb("linked_account_ids").$type<string[]>(),
    isCompleted: boolean("is_completed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

// ─── AI Insights ─────────────────────────────────────────────────────────────

export const aiInsights = pgTable(
  "ai_insights",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    insightType: varchar("insight_type", { length: 64 }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    severity: varchar("severity", { length: 16 }).default("info"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    isRead: boolean("is_read").default(false).notNull(),
    isDismissed: boolean("is_dismissed").default(false).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("insights_user_idx").on(t.userId),
    index("insights_user_type_idx").on(t.userId, t.insightType),
  ],
);

// ─── AI Cost Tracking ────────────────────────────────────────────────────────

export const aiTokenCosts = pgTable("ai_token_costs", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  modelId: varchar("model_id", { length: 128 }).notNull().unique(),
  modelName: varchar("model_name", { length: 128 }).notNull(),
  inputCostPerMtok: numeric("input_cost_per_mtok").notNull(),
  outputCostPerMtok: numeric("output_cost_per_mtok").notNull(),
  contextWindow: integer("context_window"),
  isActive: boolean("is_active").default(true).notNull(),
  effectiveDate: date("effective_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiCosts = pgTable(
  "ai_costs",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    aiModelId: varchar("ai_model_id", { length: 128 }).notNull(),
    aiQuery: varchar("ai_query", { length: 64 }).notNull(),
    inputTokens: integer("input_tokens"),
    inputCost: numeric("input_cost", { precision: 10, scale: 6 }),
    outputTokens: integer("output_tokens"),
    outputCost: numeric("output_cost", { precision: 10, scale: 6 }),
    totalCost: numeric("total_cost", { precision: 10, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ai_costs_user_idx").on(t.userId)],
);

// ─── File Upload Log (append-only, survives statement deletion) ─────────────

export const fileUploadLog = pgTable(
  "file_upload_log",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    fileName: varchar("file_name", { length: 512 }).notNull(),
    fileSize: integer("file_size").notNull(),
    fileHash: varchar("file_hash", { length: 128 }),
    outcome: varchar("outcome", { length: 16 }).notNull().default("processed"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("file_log_user_hash_idx").on(t.userId, t.fileHash),
    index("file_log_user_name_size_idx").on(t.userId, t.fileName, t.fileSize),
  ],
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
  statements: many(statements),
}));

export const statementsRelations = relations(statements, ({ one, many }) => ({
  account: one(accounts, {
    fields: [statements.accountId],
    references: [accounts.id],
  }),
  transactions: many(transactions),
}));

export const systemCategoriesRelations = relations(systemCategories, ({ one, many }) => ({
  parent: one(systemCategories, {
    fields: [systemCategories.parentId],
    references: [systemCategories.id],
    relationName: "sysCatHierarchy",
  }),
  children: many(systemCategories, { relationName: "sysCatHierarchy" }),
}));

export const userCategoriesRelations = relations(userCategories, ({ one, many }) => ({
  parent: one(userCategories, {
    fields: [userCategories.parentId],
    references: [userCategories.id],
    relationName: "userCatHierarchy",
  }),
  children: many(userCategories, { relationName: "userCatHierarchy" }),
  systemCategory: one(systemCategories, {
    fields: [userCategories.systemCategoryId],
    references: [systemCategories.id],
  }),
  transactions: many(transactions),
}));

export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  category: one(userCategories, {
    fields: [merchants.categoryId],
    references: [userCategories.id],
  }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(userCategories, {
    fields: [transactions.categoryId],
    references: [userCategories.id],
  }),
  merchant: one(merchants, {
    fields: [transactions.merchantId],
    references: [merchants.id],
  }),
  statement: one(statements, {
    fields: [transactions.statementId],
    references: [statements.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  category: one(userCategories, {
    fields: [budgets.categoryId],
    references: [userCategories.id],
  }),
  account: one(accounts, {
    fields: [budgets.accountId],
    references: [accounts.id],
  }),
}));

export const recurringPatternsRelations = relations(recurringPatterns, ({ one }) => ({
  merchant: one(merchants, {
    fields: [recurringPatterns.merchantId],
    references: [merchants.id],
  }),
  category: one(userCategories, {
    fields: [recurringPatterns.categoryId],
    references: [userCategories.id],
  }),
}));

export const goalsRelations = relations(goals, ({ many }) => ({
  accounts: many(accounts),
}));

export const aiInsightsRelations = relations(aiInsights, ({}) => ({}));

export const aiCostsRelations = relations(aiCosts, ({}) => ({}));
