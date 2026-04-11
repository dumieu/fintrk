import { z } from "zod";

export const transactionFiltersSchema = z.object({
  accountId: z.string().uuid().optional(),
  categoryId: z.coerce.number().int().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Credit card / debit card (checking + card network) / checking account (no card network). */
  accountKind: z.enum(["credit_card", "debit_card", "checking"]).optional(),
  /** Match digits against stored masked number (e.g. 4480). */
  accountNumber: z.string().max(32).optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  countryIso: z.string().length(2).optional(),
  isRecurring: z.enum(["true", "false"]).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["posted_date", "base_amount", "merchant_name", "category"]).default("posted_date"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  /** Filter by mind-map parent flow (inflow / savings / outflow / other). */
  flowTheme: z.enum(["inflow", "savings", "outflow", "unknown"]).optional(),
});

export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;

export const updateCategorySchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1),
  categoryId: z.number().int(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const deleteTransactionsSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(500),
});

export type DeleteTransactionsInput = z.infer<typeof deleteTransactionsSchema>;

/** PATCH body: update `note`, `label`, `merchantName`, and/or `categoryId`. */
export const patchTransactionSchema = z
  .object({
    transactionId: z.string().uuid(),
    /** Empty string clears the note (stored as null). */
    note: z.string().max(20000).optional(),
    /** Scope for note update: "this" (single) or "merchant" (all with same merchant). */
    noteApplyScope: z.enum(["this", "merchant"]).optional(),
    /** Merchant name for bulk note update when noteApplyScope is "merchant". */
    noteMerchantName: z.string().max(255).optional(),
    /** Max 20 characters; empty string clears (stored as null). */
    label: z.string().max(20).optional(),
    /** Scope for label update: "this" (single) or "merchant" (all with same merchant). */
    labelApplyScope: z.enum(["this", "merchant"]).optional(),
    /** Merchant name for bulk label update when labelApplyScope is "merchant". */
    labelMerchantName: z.string().max(255).optional(),
    /** Merchant name update; max 255 chars. */
    merchantName: z.string().max(255).optional(),
    /** When true, update merchantName for ALL transactions matching the old name for this user. */
    applyToAllMerchants: z.boolean().optional(),
    /** The original merchant name (needed for bulk rename when applyToAllMerchants is true). */
    oldMerchantName: z.string().max(255).optional(),
    /** Reassign category (subcategory id). */
    categoryId: z.number().int().optional(),
    /** Scope for category reassignment. */
    categoryApplyScope: z.enum(["this", "merchant", "label"]).optional(),
    /** Merchant name for bulk category reassignment by merchant. */
    categoryMerchantName: z.string().max(255).optional(),
    /** Label value for bulk category reassignment by label. */
    categoryLabel: z.string().max(20).optional(),
  })
  .refine(
    (d) =>
      d.note !== undefined ||
      d.label !== undefined ||
      d.merchantName !== undefined ||
      d.categoryId !== undefined,
    { message: "Provide note, label, merchantName, and/or categoryId" },
  );

export type PatchTransactionInput = z.infer<typeof patchTransactionSchema>;
