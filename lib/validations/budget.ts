import { z } from "zod";

export const createBudgetSchema = z.object({
  name: z.string().min(1).max(128),
  amount: z.number().positive("Budget amount must be positive"),
  currency: z.string().length(3),
  categoryId: z.number().int().optional(),
  accountId: z.string().uuid().optional(),
  period: z.enum(["weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
  rollover: z.boolean().default(false),
  alertThreshold: z.number().min(0).max(1).default(0.8),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = createBudgetSchema.partial().extend({
  id: z.number().int(),
  isActive: z.boolean().optional(),
});

export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

export const createGoalSchema = z.object({
  name: z.string().min(1).max(255),
  targetAmount: z.number().positive(),
  currency: z.string().length(3),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  linkedAccountIds: z.array(z.string().uuid()).optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
