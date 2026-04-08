import { z } from "zod";

export const aiTransactionSchema = z.object({
  posted_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  raw_description: z.string().min(1),
  reference_id: z.string().nullable().optional(),
  merchant_name: z.string().nullable().optional(),
  base_amount: z.number(),
  base_currency: z.string().length(3),
  foreign_amount: z.number().nullable().optional(),
  foreign_currency: z.string().length(3).nullable().optional(),
  implicit_fx_rate: z.number().nullable().optional(),
  mcc_code: z.number().int().nullable().optional(),
  country_iso: z.string().length(2).nullable().optional(),
  category_suggestion: z.string().nullable().optional(),
  is_recurring: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const aiResponseSchema = z.object({
  account_metadata: z.object({
    institution_name: z.string().nullable().optional(),
    account_type: z.enum(["checking", "savings", "credit", "investment", "unknown"]).default("unknown"),
    primary_currency: z.string().length(3),
    country_iso: z.string().length(2).nullable().optional(),
    statement_period_start: z.string().nullable().optional(),
    statement_period_end: z.string().nullable().optional(),
    card_network: z.enum(["visa", "mastercard", "amex", "discover", "jcb", "unionpay", "diners", "unknown"]).nullable().optional(),
    masked_last_four: z.union([z.string(), z.number()]).nullable().optional(),
  }),
  transactions: z.array(aiTransactionSchema),
});

export type AiTransaction = z.infer<typeof aiTransactionSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;

export const structuredIngestSchema = z.object({
  accountId: z.string().uuid().optional(),
  data: z.array(z.record(z.string(), z.unknown())).min(1, "No data rows"),
  fileName: z.string(),
  headers: z.array(z.string()),
});

export type StructuredIngestInput = z.infer<typeof structuredIngestSchema>;
