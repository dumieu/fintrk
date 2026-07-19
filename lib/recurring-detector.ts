import "server-only";
import { db, resilientQuery } from "@/lib/db";
import { transactions, recurringPatterns } from "@/lib/db/schema";
import { excludeCardPaymentsSql, excludeIgnoredSql } from "@/lib/db/excluded-transactions";
import { and, eq, inArray, sql } from "drizzle-orm";

interface MerchantGroup {
  /** Lowercased canonical key used for uniqueness / conflict. */
  merchantKey: string;
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
    const d1 = new Date(sorted[i - 1]!);
    const d2 = new Date(sorted[i]!);
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
  return d.toISOString().split("T")[0]!;
}

function patternKey(merchantKey: string, intervalLabel: string): string {
  return `${merchantKey}\0${intervalLabel}`;
}

/**
 * Analyze all transactions for a user and detect/update recurring patterns.
 * Stores merchant names lowercased so case variants share one unique row.
 * Deactivates patterns that no longer meet detection thresholds.
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
      .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), excludeIgnoredSql()))
      .orderBy(transactions.merchantName, transactions.postedDate),
  );

  const groups = new Map<string, MerchantGroup>();
  for (const row of rows) {
    if (!row.merchantName) continue;
    const key = row.merchantName.trim().toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, {
        merchantKey: key,
        dates: [],
        amounts: [],
        currency: row.baseCurrency,
      });
    }
    const g = groups.get(key)!;
    g.dates.push(row.postedDate);
    g.amounts.push(parseFloat(row.baseAmount));
  }

  const foundKeys = new Set<string>();
  let patternsFound = 0;

  for (const group of groups.values()) {
    const interval = detectInterval(group.dates);
    if (!interval) continue;

    const avgAmount = group.amounts.reduce((a, b) => a + b, 0) / group.amounts.length;
    const amountVariance =
      Math.max(...group.amounts.map(Math.abs)) - Math.min(...group.amounts.map(Math.abs));
    const lastDate = [...group.dates].sort().pop()!;
    const merchantName = group.merchantKey;

    // Collapse case-variant siblings that predate lowercase canonical storage.
    const caseVariants = await resilientQuery(() =>
      db
        .select({
          id: recurringPatterns.id,
          merchantName: recurringPatterns.merchantName,
        })
        .from(recurringPatterns)
        .where(
          and(
            eq(recurringPatterns.userId, userId),
            eq(recurringPatterns.intervalLabel, interval.label),
            sql`lower(btrim(${recurringPatterns.merchantName})) = ${merchantName}`,
          ),
        ),
    );
    const keep =
      caseVariants.find((r) => r.merchantName === merchantName) ?? caseVariants[0] ?? null;
    const dropIds = caseVariants.filter((r) => r.id !== keep?.id).map((r) => r.id);
    if (dropIds.length > 0) {
      await resilientQuery(() =>
        db.delete(recurringPatterns).where(inArray(recurringPatterns.id, dropIds)),
      );
    }
    if (keep && keep.merchantName !== merchantName) {
      await resilientQuery(() =>
        db
          .update(recurringPatterns)
          .set({ merchantName, updatedAt: new Date() })
          .where(eq(recurringPatterns.id, keep.id)),
      );
    }

    await resilientQuery(() =>
      db
        .insert(recurringPatterns)
        .values({
          userId,
          merchantName,
          intervalDays: interval.days,
          intervalLabel: interval.label,
          expectedAmount: avgAmount.toFixed(4),
          amountVariance: amountVariance.toFixed(4),
          currency: group.currency,
          nextExpectedDate: nextExpectedDate(lastDate, interval.days),
          lastSeenDate: lastDate,
          occurrenceCount: group.dates.length,
          isActive: true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            recurringPatterns.userId,
            recurringPatterns.merchantName,
            recurringPatterns.intervalLabel,
          ],
          set: {
            intervalDays: interval.days,
            expectedAmount: avgAmount.toFixed(4),
            amountVariance: amountVariance.toFixed(4),
            currency: group.currency,
            nextExpectedDate: nextExpectedDate(lastDate, interval.days),
            lastSeenDate: lastDate,
            occurrenceCount: group.dates.length,
            isActive: true,
            updatedAt: new Date(),
          },
        }),
    );

    foundKeys.add(patternKey(merchantName, interval.label));
    patternsFound++;
  }

  // Deactivate patterns that no longer qualify (ledger wipe/replace, deleted txns).
  const existing = await resilientQuery(() =>
    db
      .select({
        id: recurringPatterns.id,
        merchantName: recurringPatterns.merchantName,
        intervalLabel: recurringPatterns.intervalLabel,
        isActive: recurringPatterns.isActive,
      })
      .from(recurringPatterns)
      .where(and(eq(recurringPatterns.userId, userId), eq(recurringPatterns.isActive, true))),
  );

  const staleIds = existing
    .filter(
      (r) => !foundKeys.has(patternKey(r.merchantName.trim().toLowerCase(), r.intervalLabel)),
    )
    .map((r) => r.id);

  if (staleIds.length > 0) {
    await resilientQuery(() =>
      db
        .update(recurringPatterns)
        .set({ isActive: false, updatedAt: new Date() })
        .where(inArray(recurringPatterns.id, staleIds)),
    );
  }

  return patternsFound;
}
