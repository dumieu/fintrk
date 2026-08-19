import "server-only";
import { and, eq, sql } from "drizzle-orm";

import { db, resilientQuery } from "@/lib/db";
import { finAiChatUsage } from "@/lib/db/schema";
import { ensureFinAiTables } from "@/lib/fin-ai/db-bootstrap";
import {
  FIN_AI_DAILY_BUDGET_MICRO_USD,
  currentDayKey,
  turnCostMicroUsd,
  usagePct,
  type FinAiUsageSnapshot,
} from "@/lib/fin-ai/constants";

function toSnapshot(
  row:
    | {
        day: string;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        requestCount: number;
        costMicroUsd: number;
      }
    | undefined,
): FinAiUsageSnapshot {
  const costMicroUsd = row?.costMicroUsd ?? 0;
  return {
    day: row?.day ?? currentDayKey(),
    inputTokens: row?.inputTokens ?? 0,
    cachedInputTokens: row?.cachedInputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
    requestCount: row?.requestCount ?? 0,
    costMicroUsd,
    budgetMicroUsd: FIN_AI_DAILY_BUDGET_MICRO_USD,
    pct: usagePct(costMicroUsd),
  };
}

/** Current-day usage for a user (zeros when there is no row yet). */
export async function getDayUsage(userId: string): Promise<FinAiUsageSnapshot> {
  await ensureFinAiTables();
  const day = currentDayKey();
  const [row] = await resilientQuery(() =>
    db
      .select()
      .from(finAiChatUsage)
      .where(and(eq(finAiChatUsage.userId, userId), eq(finAiChatUsage.day, day)))
      .limit(1),
  );
  return toSnapshot(row ? { ...row, day } : undefined);
}

export interface TurnTokens {
  /** Ordinary uncached prompt tokens (neither cache-read nor cache-write). */
  inputTokens: number;
  cachedInputTokens: number;
  /** Tokens written to the prompt cache this turn, billed at 1.25x. */
  cacheWriteTokens?: number;
  /** Visible completion tokens. Reasoning is pinned to none. */
  outputTokens: number;
}

/**
 * Record one chat turn's token spend, upserting the per-day row, and return the
 * fresh snapshot so the client allowance bar can move immediately.
 */
export async function recordTurnUsage(
  userId: string,
  tokens: TurnTokens,
): Promise<FinAiUsageSnapshot> {
  await ensureFinAiTables();
  const day = currentDayKey();
  const cacheWriteTokens = tokens.cacheWriteTokens ?? 0;
  const cost = turnCostMicroUsd(
    tokens.inputTokens,
    tokens.cachedInputTokens,
    tokens.outputTokens,
    cacheWriteTokens,
  );
  await resilientQuery(() =>
    db
      .insert(finAiChatUsage)
      .values({
        userId,
        day,
        inputTokens: tokens.inputTokens + cacheWriteTokens,
        cachedInputTokens: tokens.cachedInputTokens,
        outputTokens: tokens.outputTokens,
        requestCount: 1,
        costMicroUsd: cost,
      })
      .onConflictDoUpdate({
        target: [finAiChatUsage.userId, finAiChatUsage.day],
        set: {
          inputTokens: sql`${finAiChatUsage.inputTokens} + ${tokens.inputTokens + cacheWriteTokens}`,
          cachedInputTokens: sql`${finAiChatUsage.cachedInputTokens} + ${tokens.cachedInputTokens}`,
          outputTokens: sql`${finAiChatUsage.outputTokens} + ${tokens.outputTokens}`,
          requestCount: sql`${finAiChatUsage.requestCount} + 1`,
          costMicroUsd: sql`${finAiChatUsage.costMicroUsd} + ${cost}`,
          updatedAt: new Date(),
        },
      }),
  );
  return getDayUsage(userId);
}
