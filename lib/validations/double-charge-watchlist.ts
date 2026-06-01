import { z } from "zod";

export const doubleChargeWatchlistExcludeSchema = z.object({
  merchantKey: z.string().min(1).max(96),
  displayName: z.string().min(1).max(255),
});

export type DoubleChargeWatchlistExcludeInput = z.infer<typeof doubleChargeWatchlistExcludeSchema>;
