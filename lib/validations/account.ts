import { z } from "zod";

export const createAccountSchema = z.object({
  accountName: z.string().min(1, "Account name is required").max(255),
  accountType: z.enum(["checking", "savings", "credit", "investment", "loan", "unknown"]).default("unknown"),
  primaryCurrency: z.string().length(3, "Currency must be ISO 4217 (3 chars)"),
  countryIso: z.string().length(2).optional(),
  institutionName: z.string().max(255).optional(),
  maskedNumber: z.string().max(20).optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = createAccountSchema.partial().extend({
  id: z.string().uuid(),
  isActive: z.boolean().optional(),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
