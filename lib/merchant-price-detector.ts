import "server-only";
import { db, resilientQuery } from "@/lib/db";
import { transactions, recurringPatterns, aiInsights } from "@/lib/db/schema";
import { excludeCardPaymentsSql, excludeRecurringCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { eq, and, desc } from "drizzle-orm";

interface PriceChange {
  merchantName: string;
  previousAmount: number;
  currentAmount: number;
  changePct: number;
  currency: string;
}

export async function detectPriceChanges(userId: string): Promise<PriceChange[]> {
  const recurring = await resilientQuery(() =>
    db.select().from(recurringPatterns).where(
      and(
        eq(recurringPatterns.userId, userId),
        excludeRecurringCardPaymentsSql(),
        eq(recurringPatterns.isActive, true),
      ),
    ),
  );

  const changes: PriceChange[] = [];

  for (const pattern of recurring) {
    const recentTxns = await resilientQuery(() =>
      db.select({
        baseAmount: transactions.baseAmount,
        baseCurrency: transactions.baseCurrency,
        postedDate: transactions.postedDate,
      })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(),
            eq(transactions.merchantName, pattern.merchantName),
          ),
        )
        .orderBy(desc(transactions.postedDate))
        .limit(3),
    );

    if (recentTxns.length < 2) continue;

    const latest = Math.abs(parseFloat(recentTxns[0].baseAmount));
    const previous = Math.abs(parseFloat(recentTxns[1].baseAmount));

    if (previous === 0) continue;
    const changePct = ((latest - previous) / previous) * 100;

    if (Math.abs(changePct) >= 5) {
      changes.push({
        merchantName: pattern.merchantName,
        previousAmount: previous,
        currentAmount: latest,
        changePct,
        currency: recentTxns[0].baseCurrency,
      });

      await resilientQuery(() =>
        db.insert(aiInsights).values({
          userId,
          insightType: "price_change",
          title: `${pattern.merchantName} price ${changePct > 0 ? "increased" : "decreased"}`,
          body: `${pattern.merchantName} changed from ${previous.toFixed(2)} to ${latest.toFixed(2)} ${recentTxns[0].baseCurrency} (${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%)`,
          severity: Math.abs(changePct) > 20 ? "warning" : "info",
          metadata: { previousAmount: previous, currentAmount: latest, changePct },
        }).onConflictDoNothing(),
      );
    }
  }

  return changes;
}
