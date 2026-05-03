import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { accounts, transactions, fxRates } from "@/lib/db/schema";
import { excludeCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { eq, and, sql, desc } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const [userAccounts, accountBalances, latestRates] = await Promise.all([
      resilientQuery(() =>
        db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isActive, true))),
      ),
      resilientQuery(() =>
        db.select({
          accountId: transactions.accountId,
          baseCurrency: transactions.baseCurrency,
          balance: sql<string>`SUM(CAST(${transactions.baseAmount} AS numeric))`,
          txnCount: sql<number>`COUNT(*)::int`,
          lastTxn: sql<string>`MAX(${transactions.postedDate})`,
        }).from(transactions)
          .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql()))
          .groupBy(transactions.accountId, transactions.baseCurrency),
      ),
      resilientQuery(() =>
        db.selectDistinctOn([fxRates.baseCurrency, fxRates.quoteCurrency], {
          base: fxRates.baseCurrency,
          quote: fxRates.quoteCurrency,
          rate: fxRates.midRate,
        }).from(fxRates)
          .orderBy(fxRates.baseCurrency, fxRates.quoteCurrency, desc(fxRates.rateDate)),
      ),
    ]);

    const rateMap = new Map<string, number>();
    for (const r of latestRates) {
      rateMap.set(`${r.base}_${r.quote}`, parseFloat(r.rate));
    }

    function convertToHome(amount: number, fromCurrency: string, homeCurrency: string): number {
      if (fromCurrency === homeCurrency) return amount;

      const directKey = `${fromCurrency}_${homeCurrency}`;
      if (rateMap.has(directKey)) return amount * rateMap.get(directKey)!;

      const inverseKey = `${homeCurrency}_${fromCurrency}`;
      if (rateMap.has(inverseKey)) return amount / rateMap.get(inverseKey)!;

      const usdFrom = `USD_${fromCurrency}`;
      const usdTo = `USD_${homeCurrency}`;
      if (rateMap.has(usdFrom) && rateMap.has(usdTo)) {
        const inUsd = amount / rateMap.get(usdFrom)!;
        return inUsd * rateMap.get(usdTo)!;
      }

      return amount;
    }

    const homeCurrency = userAccounts[0]?.primaryCurrency ?? "USD";

    const balanceMap = new Map<string, { balance: number; currency: string; txnCount: number; lastTxn: string }>();
    for (const row of accountBalances) {
      balanceMap.set(row.accountId, {
        balance: parseFloat(row.balance),
        currency: row.baseCurrency,
        txnCount: row.txnCount,
        lastTxn: row.lastTxn,
      });
    }

    let totalHomeBalance = 0;
    const consolidatedAccounts = userAccounts.map((acct) => {
      const data = balanceMap.get(acct.id);
      const nativeBalance = data?.balance ?? 0;
      const currency = data?.currency ?? acct.primaryCurrency;
      const homeBalance = convertToHome(nativeBalance, currency, homeCurrency);
      totalHomeBalance += homeBalance;

      return {
        id: acct.id,
        name: acct.accountName,
        institution: acct.institutionName,
        type: acct.accountType,
        nativeBalance,
        nativeCurrency: currency,
        homeBalance,
        homeCurrency,
        txnCount: data?.txnCount ?? 0,
        lastTransaction: data?.lastTxn ?? null,
      };
    });

    const currencyBreakdown = new Map<string, number>();
    for (const acct of consolidatedAccounts) {
      const prev = currencyBreakdown.get(acct.nativeCurrency) ?? 0;
      currencyBreakdown.set(acct.nativeCurrency, prev + acct.nativeBalance);
    }

    return NextResponse.json({
      totalBalance: totalHomeBalance,
      homeCurrency,
      accounts: consolidatedAccounts,
      currencyBreakdown: Array.from(currencyBreakdown.entries()).map(([currency, balance]) => ({
        currency,
        nativeBalance: balance,
        homeBalance: convertToHome(balance, currency, homeCurrency),
      })),
    }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/consolidation", err);
    return NextResponse.json({ error: "Failed to consolidate" }, { status: 500, headers: NO_STORE });
  }
}
