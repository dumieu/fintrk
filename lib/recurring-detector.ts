import "server-only";
import { db, resilientQuery } from "@/lib/db";
import { transactions, recurringPatterns } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";

interface MerchantGroup {
  merchantName: string;
  dates: string[];
  amounts: number[];
  currency: string;
}

const INTERVAL_THRESHOLDS = [
  { label: "weekly", days: 7, variance: 0.25 },
  { label: "biweekly", days: 14, variance: 0.2 },
  { label: "monthly", days: 30, variance: 0.2 },
  { label: "quarterly", days: 91, variance: 0.15 },
  { label: "annual", days: 365, variance: 0.15 },
] as const;

function detectInterval(dates: string[]): { label: string; days: number } | null {
  if (dates.length < 3) return null;

  const sorted = [...dates].sort();
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d1 = new Date(sorted[i - 1]);
    const d2 = new Date(sorted[i]);
    intervals.push((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  for (const threshold of INTERVAL_THRESHOLDS) {
    const allowedVariance = threshold.days * threshold.variance;
    if (Math.abs(avgInterval - threshold.days) <= allowedVariance) {
      return { label: threshold.label, days: threshold.days };
    }
  }

  return null;
}

function nextExpectedDate(lastDate: string, intervalDays: number): string {
  const d = new Date(lastDate);
  d.setDate(d.getDate() + intervalDays);
  return d.toISOString().split("T")[0];
}

/**
 * Analyze all transactions for a user and detect/update recurring patterns.
 */
export async function detectRecurringPatterns(userId: string): Promise<number> {
  const rows = await resilientQuery(() =>
    db
      .select({
        merchantName: transactions.merchantName,
        postedDate: transactions.postedDate,
        baseAmount: transactions.baseAmount,
        baseCurrency: transactions.baseCurrency,
      })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(transactions.merchantName, transactions.postedDate),
  );

  const groups = new Map<string, MerchantGroup>();
  for (const row of rows) {
    if (!row.merchantName) continue;
    const key = row.merchantName.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        merchantName: row.merchantName,
        dates: [],
        amounts: [],
        currency: row.baseCurrency,
      });
    }
    const g = groups.get(key)!;
    g.dates.push(row.postedDate);
    g.amounts.push(parseFloat(row.baseAmount));
  }

  let patternsFound = 0;

  for (const group of groups.values()) {
    const interval = detectInterval(group.dates);
    if (!interval) continue;

    const avgAmount = group.amounts.reduce((a, b) => a + b, 0) / group.amounts.length;
    const amountVariance =
      Math.max(...group.amounts.map(Math.abs)) - Math.min(...group.amounts.map(Math.abs));
    const lastDate = [...group.dates].sort().pop()!;

    await resilientQuery(() =>
      db
        .insert(recurringPatterns)
        .values({
          userId,
          merchantName: group.merchantName,
          intervalDays: interval.days,
          intervalLabel: interval.label,
          expectedAmount: avgAmount.toFixed(4),
          amountVariance: amountVariance.toFixed(4),
          currency: group.currency,
          nextExpectedDate: nextExpectedDate(lastDate, interval.days),
          lastSeenDate: lastDate,
          occurrenceCount: group.dates.length,
          isActive: true,
        })
        .onConflictDoNothing(),
    );

    patternsFound++;
  }

  return patternsFound;
}
