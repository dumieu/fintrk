import "server-only";
import { db, resilientQuery } from "@/lib/db";
import { fxRates } from "@/lib/db/schema";
import { eq, and, lte, desc } from "drizzle-orm";

export interface FxSpreadResult {
  bankRate: number;
  marketMidRate: number;
  spreadBps: number;
}

/**
 * Calculate the implicit FX spread a bank charged vs. the market mid-rate.
 * Returns null if no market rate data is available for that pair/date.
 */
export async function calculateFxSpread(
  baseAmount: number,
  baseCurrency: string,
  foreignAmount: number,
  foreignCurrency: string,
  postedDate: string,
): Promise<FxSpreadResult | null> {
  if (foreignAmount === 0) return null;

  const bankRate = Math.abs(baseAmount / foreignAmount);

  const rates = await resilientQuery(() =>
    db
      .select({ midRate: fxRates.midRate })
      .from(fxRates)
      .where(
        and(
          eq(fxRates.baseCurrency, baseCurrency.toUpperCase()),
          eq(fxRates.quoteCurrency, foreignCurrency.toUpperCase()),
          lte(fxRates.rateDate, postedDate),
        ),
      )
      .orderBy(desc(fxRates.rateDate))
      .limit(1),
  );

  if (rates.length === 0) {
    const inverse = await resilientQuery(() =>
      db
        .select({ midRate: fxRates.midRate })
        .from(fxRates)
        .where(
          and(
            eq(fxRates.baseCurrency, foreignCurrency.toUpperCase()),
            eq(fxRates.quoteCurrency, baseCurrency.toUpperCase()),
            lte(fxRates.rateDate, postedDate),
          ),
        )
        .orderBy(desc(fxRates.rateDate))
        .limit(1),
    );

    if (inverse.length === 0) return null;

    const invMidRate = parseFloat(inverse[0].midRate);
    if (invMidRate === 0) return null;
    const marketMidRate = 1 / invMidRate;
    const spreadBps = ((bankRate / marketMidRate) - 1) * 10_000;

    return { bankRate, marketMidRate, spreadBps: Math.round(spreadBps * 100) / 100 };
  }

  const marketMidRate = parseFloat(rates[0].midRate);
  if (marketMidRate === 0) return null;
  const spreadBps = ((bankRate / marketMidRate) - 1) * 10_000;

  return { bankRate, marketMidRate, spreadBps: Math.round(spreadBps * 100) / 100 };
}
